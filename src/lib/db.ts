import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'kripto.db');

let db: sqlite3.Database | null = null;

export function getDb(): sqlite3.Database {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database', err.message);
      }
    });

    db.serialize(() => {
      db!.run('PRAGMA journal_mode=WAL');
      db!.run('PRAGMA synchronous=NORMAL');
      db!.run('PRAGMA foreign_keys=ON');
      // Users table
      db!.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          telegram_username TEXT,
          telegram_chat_id TEXT,
          binance_api_key TEXT,
          binance_api_secret TEXT,
          role TEXT DEFAULT 'user',
          subscription_status TEXT DEFAULT 'pending',
          subscription_expires_at DATETIME,
          is_active INTEGER DEFAULT 1,
          warning_7d_sent INTEGER DEFAULT 0,
          warning_3d_sent INTEGER DEFAULT 0,
          language TEXT DEFAULT 'az',
          last_force_run INTEGER DEFAULT 0,
          last_reminder_sent_date TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Trades table
      db!.run(`
        CREATE TABLE IF NOT EXISTS trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          symbol TEXT,
          action TEXT,
          price REAL,
          amount REAL,
          status TEXT,
          dedupe_key TEXT UNIQUE,
          profit REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Settings/Risk Config table
      db!.run(`
        CREATE TABLE IF NOT EXISTS risk_configs (
          user_id INTEGER PRIMARY KEY,
          max_risk_pct REAL DEFAULT 2,
          max_open_positions INTEGER DEFAULT 5,
          max_leverage INTEGER DEFAULT 1,
          min_confidence INTEGER DEFAULT 75,
          target_coins TEXT DEFAULT 'AUTO',
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Bot Messages table
      db!.run(`
        CREATE TABLE IF NOT EXISTS bot_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          telegram_chat_id TEXT,
          sender TEXT,
          text TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Notifications table
      db!.run(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT,
          message TEXT,
          is_read INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Payments table
      db!.run(`
        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          txid TEXT UNIQUE NOT NULL,
          amount REAL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Support Tickets table
      db!.run(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          phone TEXT,
          email TEXT,
          message TEXT,
          admin_reply TEXT,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // System Settings table
      db!.run(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Auto-migrate missing columns
      db!.run(`ALTER TABLE users ADD COLUMN last_force_run INTEGER DEFAULT 0`, (err) => {
        // Ignore error if column exists
      });
      db!.run(`ALTER TABLE users ADD COLUMN last_reminder_sent_date TEXT`, (err) => {
        // Ignore error if column exists
      });

      // Futures tables
      db!.run(`
        CREATE TABLE IF NOT EXISTS futures_positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          symbol TEXT,
          side TEXT,
          entry_price REAL,
          quantity REAL,
          remaining_qty REAL,
          leverage INTEGER DEFAULT 5,
          margin_mode TEXT DEFAULT 'ISOLATED',
          stop_loss_price REAL,
          take_profit_1 REAL,
          take_profit_2 REAL,
          take_profit_3 REAL,
          trailing_active INTEGER DEFAULT 0,
          trailing_stop_price REAL,
          highest_price REAL,
          lowest_price REAL,
          tp1_filled INTEGER DEFAULT 0,
          tp2_filled INTEGER DEFAULT 0,
          tp3_filled INTEGER DEFAULT 0,
          entry_timeframe TEXT,
          trend_direction TEXT,
          entry_reason TEXT,
          status TEXT DEFAULT 'OPEN',
          total_pnl REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      db!.run(`
        CREATE TABLE IF NOT EXISTS futures_partial_fills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          position_id INTEGER,
          user_id INTEGER,
          tp_level INTEGER,
          quantity REAL,
          exit_price REAL,
          pnl REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (position_id) REFERENCES futures_positions (id)
        )
      `);

      db!.run(`
        CREATE TABLE IF NOT EXISTS futures_risk_configs (
          user_id INTEGER PRIMARY KEY,
          max_risk_pct REAL DEFAULT 2,
          max_open_positions INTEGER DEFAULT 3,
          leverage INTEGER DEFAULT 5,
          min_confidence INTEGER DEFAULT 75,
          target_coins TEXT DEFAULT 'AUTO',
          blacklist_coins TEXT DEFAULT '',
          auto_coin_count INTEGER DEFAULT 7,
          is_futures_active INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // Auto-migrate futures_risk_configs columns
      db!.run(`ALTER TABLE futures_risk_configs ADD COLUMN blacklist_coins TEXT DEFAULT ''`, (err) => {});
      db!.run(`ALTER TABLE futures_risk_configs ADD COLUMN auto_coin_count INTEGER DEFAULT 7`, (err) => {});
      // Lower default min_confidence from 80 to 75 for existing configs
      db!.run(`UPDATE futures_risk_configs SET min_confidence = 75 WHERE min_confidence = 80`, (err) => {});

      // Futures columns on users
      db!.run(`ALTER TABLE users ADD COLUMN futures_api_key TEXT`, (err) => {});
      db!.run(`ALTER TABLE users ADD COLUMN futures_api_secret TEXT`, (err) => {});
      db!.run(`ALTER TABLE users ADD COLUMN last_futures_force_run INTEGER DEFAULT 0`, (err) => {});
    });
  }
  return db;
}

// Helper to run query with Promise
export function dbRun(query: string, params: any[] = []): Promise<sqlite3.RunResult> {
  const database = getDb();
  return new Promise((resolve, reject) => {
    database.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper to get multiple rows
export function dbAll<T>(query: string, params: any[] = []): Promise<T[]> {
  const database = getDb();
  return new Promise((resolve, reject) => {
    database.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

// Helper to get single row
export function dbGet<T>(query: string, params: any[] = []): Promise<T | undefined> {
  const database = getDb();
  return new Promise((resolve, reject) => {
    database.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}
