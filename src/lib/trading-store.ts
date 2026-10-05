import sqlite3 from 'sqlite3';
import { dbPath, dbRun } from './db';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

export type Market = 'spot' | 'futures';
export interface SQL {
  run(sql: string, args?: unknown[]): Promise<sqlite3.RunResult>;
  get<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
}
function connection(): Promise<{db:sqlite3.Database; sql:SQL}> {
  return new Promise((resolve,reject)=>{
    const db=new sqlite3.Database(dbPath,err=>{
      if(err)return reject(err);
      db.configure('busyTimeout',10000);
      const sql:SQL={
        run:(q,a=[])=>new Promise((r,j)=>db.run(q,a,function(e){if(e)j(e);else r(this)})),
        get:<T,>(q:string,a:unknown[]=[])=>new Promise<T|undefined>((r,j)=>db.get<T>(q,a,(e,row)=>e?j(e):r(row))),
        all:<T,>(q:string,a:unknown[]=[])=>new Promise<T[]>((r,j)=>db.all<T>(q,a,(e,rows)=>e?j(e):r(rows)))
      };
      sql.run('PRAGMA foreign_keys=ON').then(()=>resolve({db,sql}),reject);
    });
  });
}
let ready:Promise<void>|undefined;
export function initTradingStore() {
  if(!ready) ready=(async()=>{
    await dbRun('SELECT 1'); // Existing schema creation is queued before this barrier.
    const {db,sql}=await connection();
    try {
      await sql.run('BEGIN IMMEDIATE');
      for(const q of schema)await sql.run(q);
      // Versioned, additive migrations. Never change an existing user's risk preferences.
      for(const table of ['risk_configs','futures_risk_configs']) {
        const cols=await sql.all<{name:string}>(`PRAGMA table_info(${table})`);
        if(!cols.some(c=>c.name==='risk_per_trade_pct'))await sql.run(`ALTER TABLE ${table} ADD COLUMN risk_per_trade_pct REAL NOT NULL DEFAULT 0.25`);
      }
      const spotCols=await sql.all<{name:string}>('PRAGMA table_info(risk_configs)');
      if(!spotCols.some(c=>c.name==='is_spot_active'))await sql.run('ALTER TABLE risk_configs ADD COLUMN is_spot_active INTEGER NOT NULL DEFAULT 1');
      const intentCols=await sql.all<{name:string}>('PRAGMA table_info(order_intents)');
      if(!intentCols.some(c=>c.name==='reconciled'))await sql.run('ALTER TABLE order_intents ADD COLUMN reconciled INTEGER NOT NULL DEFAULT 0');
      const riskCols=await sql.all<{name:string}>('PRAGMA table_info(risk_state)');
      if(!riskCols.some(c=>c.name==='flow_total'))await sql.run('ALTER TABLE risk_state ADD COLUMN flow_total REAL NOT NULL DEFAULT 0');
      if(!riskCols.some(c=>c.name==='spot_equity'))await sql.run('ALTER TABLE risk_state ADD COLUMN spot_equity REAL NOT NULL DEFAULT 0');
      if(!riskCols.some(c=>c.name==='futures_equity'))await sql.run('ALTER TABLE risk_state ADD COLUMN futures_equity REAL NOT NULL DEFAULT 0');
      const outboxCols=await sql.all<{name:string}>('PRAGMA table_info(notification_outbox)');
      if(!outboxCols.some(c=>c.name==='last_error'))await sql.run('ALTER TABLE notification_outbox ADD COLUMN last_error TEXT');
      await sql.run('UPDATE futures_risk_configs SET min_confidence = 70 WHERE min_confidence = 75');
      await sql.run('COMMIT');
    } catch(e){await sql.run('ROLLBACK');throw e} finally {db.close()}
  })();
  return ready;
}
let writeTail: Promise<unknown> = Promise.resolve();
export function transaction<T>(fn:(sql:SQL)=>Promise<T>):Promise<T> {
  // Avoid exhausting SQLite's libuv pool with writers waiting for the same lock.
  const work=writeTail.then(async()=>{
    await initTradingStore(); const {db,sql}=await connection();let begun=false;
    try{await sql.run('BEGIN IMMEDIATE');begun=true;const result=await fn(sql);await sql.run('COMMIT');return result}
    catch(e){if(begun)try{await sql.run('ROLLBACK')}catch{}throw e}finally{db.close()}
  });
  writeTail=work.catch(()=>{});return work;
}
export async function read<T>(fn:(sql:SQL)=>Promise<T>):Promise<T>{await initTradingStore();const {db,sql}=await connection();try{return await fn(sql)}finally{db.close()}}

/** Single-host durable ownership. No TTL stealing from a paused/live process. */
export async function withOwner<T>(resource:string, fn:()=>Promise<T>):Promise<T|undefined> {
  const token=randomUUID(), host=hostname(), pid=process.pid;
  const acquired=await transaction(async sql=>{
    const old=await sql.get<{host:string;pid:number;token:string}>('SELECT * FROM execution_locks WHERE resource=?',[resource]);
    if(old){
      if(old.host!==host)return false; // Multi-host SQLite execution deliberately fails closed.
      try{process.kill(old.pid,0);return false}catch(e){if(!(e instanceof Error)||!('code' in e)||e.code!=='ESRCH')return false}
      await sql.run('DELETE FROM execution_locks WHERE resource=? AND token=?',[resource,old.token]);
    }
    await sql.run('INSERT INTO execution_locks VALUES (?,?,?,?,?)',[resource,token,host,pid,Date.now()]);return true;
  });
  if(!acquired)return undefined;
  try{return await fn()}finally{await transaction(sql=>sql.run('DELETE FROM execution_locks WHERE resource=? AND token=?',[resource,token]))}
}
const schema=[
`CREATE TABLE IF NOT EXISTS account_health (user_id INTEGER PRIMARY KEY REFERENCES users(id),created_at INTEGER NOT NULL,last_started INTEGER,last_success INTEGER,last_error TEXT,reported_state TEXT NOT NULL DEFAULT 'unknown')`,
`CREATE TABLE IF NOT EXISTS capital_checkpoints (user_id INTEGER PRIMARY KEY REFERENCES users(id),inventory TEXT NOT NULL,fill_cursor INTEGER NOT NULL,income_cursor INTEGER NOT NULL,flow_cursor INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS fee_valuations (user_id INTEGER NOT NULL,market TEXT NOT NULL,symbol TEXT NOT NULL,trade_id TEXT NOT NULL,price REAL NOT NULL,time INTEGER NOT NULL,source_trade_id TEXT NOT NULL,PRIMARY KEY(user_id,market,symbol,trade_id),FOREIGN KEY(user_id,market,symbol,trade_id) REFERENCES execution_fills(user_id,market,symbol,trade_id))`,
`CREATE TABLE IF NOT EXISTS external_flows (uid TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,ref TEXT NOT NULL,time INTEGER NOT NULL,amount REAL NOT NULL,PRIMARY KEY(uid,kind,ref))`,
`CREATE TABLE IF NOT EXISTS flow_cursors (uid TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),start_time INTEGER NOT NULL,synced_until INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS liquidity_reservations (id TEXT PRIMARY KEY,market TEXT NOT NULL,symbol TEXT NOT NULL,time INTEGER NOT NULL,notional REAL NOT NULL)`,
`CREATE INDEX IF NOT EXISTS liquidity_window ON liquidity_reservations(market,symbol,time)`,
`CREATE TABLE IF NOT EXISTS trading_schema (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
`INSERT OR IGNORE INTO trading_schema VALUES (1, strftime('%s','now')*1000)`,
`CREATE TABLE IF NOT EXISTS execution_locks (resource TEXT PRIMARY KEY, token TEXT NOT NULL, host TEXT NOT NULL, pid INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS exchange_accounts (uid TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), UNIQUE(uid,user_id))`,
`CREATE TABLE IF NOT EXISTS account_keys (user_id INTEGER NOT NULL REFERENCES users(id), market TEXT NOT NULL, uid TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE, PRIMARY KEY(user_id,market), FOREIGN KEY(uid,user_id) REFERENCES exchange_accounts(uid,user_id))`,
`CREATE TABLE IF NOT EXISTS managed_positions (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), market TEXT NOT NULL CHECK(market IN ('spot','futures')), symbol TEXT NOT NULL,
 side TEXT NOT NULL, state TEXT NOT NULL, entry_price REAL NOT NULL DEFAULT 0, quantity REAL NOT NULL DEFAULT 0, remaining_qty REAL NOT NULL DEFAULT 0,
 stop_price REAL NOT NULL, tp1 REAL NOT NULL, tp2 REAL NOT NULL, tp3 REAL NOT NULL, leverage INTEGER NOT NULL,
 risk_reserved REAL NOT NULL, notional_reserved REAL NOT NULL, stage INTEGER NOT NULL DEFAULT 0, high_water REAL NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, closed_at INTEGER, reason TEXT NOT NULL, error TEXT, UNIQUE(id,user_id))`,
`CREATE UNIQUE INDEX IF NOT EXISTS managed_open_symbol ON managed_positions(user_id,market,symbol) WHERE state NOT IN ('CLOSED','REJECTED','DUST')`,
`CREATE INDEX IF NOT EXISTS managed_tenant_state ON managed_positions(user_id,market,state)`,
`CREATE TABLE IF NOT EXISTS order_intents (
 id TEXT PRIMARY KEY, position_id TEXT NOT NULL, user_id INTEGER NOT NULL, purpose TEXT NOT NULL, kind TEXT NOT NULL,
 side TEXT NOT NULL, quantity REAL NOT NULL, price REAL, state TEXT NOT NULL DEFAULT 'PREPARED', exchange_id TEXT,
 response TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(position_id,user_id) REFERENCES managed_positions(id,user_id))`,
`CREATE INDEX IF NOT EXISTS intent_position ON order_intents(position_id,user_id,created_at)`,
`CREATE TABLE IF NOT EXISTS execution_fills (
 user_id INTEGER NOT NULL, market TEXT NOT NULL, symbol TEXT NOT NULL, trade_id TEXT NOT NULL, position_id TEXT NOT NULL,
 order_id TEXT NOT NULL, side TEXT NOT NULL, quantity REAL NOT NULL, price REAL NOT NULL, commission REAL NOT NULL,
 commission_asset TEXT NOT NULL, fee_usdt REAL, realized_pnl REAL NOT NULL, time INTEGER NOT NULL,
 PRIMARY KEY(user_id,market,symbol,trade_id), FOREIGN KEY(position_id,user_id) REFERENCES managed_positions(id,user_id))`,
`CREATE TABLE IF NOT EXISTS income_ledger (user_id INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL, id TEXT NOT NULL, asset TEXT NOT NULL, amount REAL NOT NULL, time INTEGER NOT NULL, PRIMARY KEY(user_id,type,id,asset))`,
`CREATE TABLE IF NOT EXISTS risk_state (user_id INTEGER PRIMARY KEY REFERENCES users(id), high_water REAL NOT NULL, day_start REAL NOT NULL, day TEXT NOT NULL, equity REAL NOT NULL, frozen_reason TEXT, updated_at INTEGER NOT NULL, flow_total REAL NOT NULL DEFAULT 0, spot_equity REAL NOT NULL DEFAULT 0, futures_equity REAL NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS equity_snapshots (user_id INTEGER NOT NULL REFERENCES users(id), time INTEGER NOT NULL, equity REAL NOT NULL, PRIMARY KEY(user_id,time))`,
`CREATE TABLE IF NOT EXISTS decision_snapshots (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), market TEXT NOT NULL, symbol TEXT NOT NULL, version TEXT NOT NULL, time INTEGER NOT NULL, snapshot TEXT NOT NULL, decision TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS trading_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, error TEXT)`,
`CREATE UNIQUE INDEX IF NOT EXISTS active_trading_job ON trading_jobs(kind,user_id) WHERE state IN ('QUEUED','RUNNING')`,
`CREATE TABLE IF NOT EXISTS notification_outbox (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), chat_id TEXT, text TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, delivered_at INTEGER)`,
`CREATE TABLE IF NOT EXISTS telegram_links (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS telegram_identities (telegram_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id))`,
`CREATE TABLE IF NOT EXISTS telegram_updates (id INTEGER PRIMARY KEY, processed_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS shadow_positions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  market TEXT NOT NULL CHECK(market IN ('spot','futures')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price REAL NOT NULL,
  stop_price REAL NOT NULL,
  tp1 REAL NOT NULL,
  tp2 REAL NOT NULL,
  tp3 REAL NOT NULL,
  confidence INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'OPEN',
  stage INTEGER NOT NULL DEFAULT 0,
  remaining_ratio REAL NOT NULL DEFAULT 1.0,
  trailing_stop REAL NOT NULL DEFAULT 0,
  max_bars INTEGER NOT NULL DEFAULT 16,
  bars_held INTEGER NOT NULL DEFAULT 0,
  last_candle_time BIGINT NOT NULL DEFAULT 0,
  high_water REAL NOT NULL DEFAULT 0,
  simulated_pnl REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  reason TEXT
)`,
`CREATE INDEX IF NOT EXISTS shadow_state_idx ON shadow_positions(market,state)`,
`CREATE INDEX IF NOT EXISTS shadow_user_time ON shadow_positions(user_id,created_at)`
];
