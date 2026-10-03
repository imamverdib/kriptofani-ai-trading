import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sqlite3 from 'sqlite3';
import {backupDatabase,restoreDatabase,verifyDatabase} from '../src/lib/database-backup';
let capital:typeof import('../src/lib/capital-reconciliation');
import type {FillRow} from '../src/lib/trading-rows';
let directory:string;
before(async()=>{directory=await mkdtemp(join(tmpdir(),'kripto-operations-'));process.env.DB_PATH=join(directory,'operations.db');capital=await import('../src/lib/capital-reconciliation')});
after(async()=>{await rm(directory,{recursive:true,force:true})});
function child(mode:string){return new Promise<{code:number|null;signal:string|null;output:string}>((resolve,reject)=>{const p=spawn(process.execPath,['--import','tsx','tests/fixtures/crash-worker.ts',mode],{env:{...process.env,DB_PATH:join(directory,'crash.db'),FIXTURE_EXCHANGE_PATH:join(directory,'exchange.json'),TRADING_ENABLED:'true',TRADING_ACCOUNT_IS_DEDICATED:'true'},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',d=>{output+=d});p.stderr.on('data',d=>{output+=d});const timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('Fixture timeout'))},15000);p.on('error',reject);p.on('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal,output})})})}
test('SIGKILL after exchange acceptance recovers durable intent and dead-process locks without duplicate entry',async()=>{
 const crash=await child('crash');assert.equal(crash.signal,'SIGKILL',crash.output);
 for(let i=0;i<2;i++){const recovery=await child('recover');assert.equal(recovery.code,0,recovery.output);const p=JSON.parse(recovery.output.trim());assert.equal(p.remaining_qty,10);assert.equal(p.state,'OPEN')}
 const exchange=JSON.parse(await readFile(join(directory,'exchange.json'),'utf8'));assert.equal(exchange.submissions.filter((v:string)=>v==='ENTRY').length,1);assert.equal(exchange.submissions.length,2);
});
test('WAL backup restores committed data and refuses overwrite/corrupt source',async()=>{
 const source=join(directory,'wal.db'),backup=join(directory,'backup.db'),restored=join(directory,'restored.db');
 const db=new sqlite3.Database(source);const run=(sql:string)=>new Promise<void>((r,j)=>db.run(sql,e=>e?j(e):r()));
 await run('PRAGMA journal_mode=WAL');await run('CREATE TABLE evidence(id INTEGER PRIMARY KEY,value TEXT)');await run("INSERT INTO evidence VALUES (1,'committed in WAL')");
 try{await backupDatabase(source,backup);await run("INSERT INTO evidence VALUES (2,'after snapshot')");await restoreDatabase(backup,restored);await verifyDatabase(restored);await assert.rejects(backupDatabase(source,backup));const copy=new sqlite3.Database(restored);const rows=await new Promise<{value:string}[]>((r,j)=>copy.all('SELECT value FROM evidence',(e,rows:{value:string}[])=>e?j(e):r(rows)));assert.deepEqual(rows,[{value:'committed in WAL'}]);await new Promise<void>((r,j)=>copy.close(e=>e?j(e):r()));await assert.rejects(verifyDatabase(join(directory,'missing.db')))}finally{await new Promise<void>((r,j)=>db.close(e=>e?j(e):r()))}
});
test('untracked Earn/subaccount movements cannot masquerade as trading performance',()=>{
 assert.throws(()=>capital.assertInventory({USDT:1000},{USDT:1200}),/Unexplained/);assert.throws(()=>capital.assertInventory({USDT:1000},{USDT:900}),/Unexplained/);assert.throws(()=>capital.assertInventory({USDT:1000},{USDT:1000,BTC:0.01}),/Unexplained/);
 const fill={market:'spot',symbol:'BTCUSDT',side:'BUY',quantity:1,price:100,commission:0.001,commission_asset:'BTC',realized_pnl:0} as FillRow;
 const expected=capital.expectedInventory({USDT:1000},[fill],[],[{amount:50}]);capital.assertInventory(expected,{USDT:950,BTC:0.999});
});
test('missing Telegram token keeps alert pending; failed delivery retries and watchdog deduplicates incidents',async()=>{
 const {transaction,read}=await import('../src/lib/trading-store');const {deliverNotifications}=await import('../src/lib/outbox');const {checkWorker,heartbeatHealthy}=await import('../src/lib/watchdog');
 assert.equal(heartbeatHealthy(Date.now()+100000),false);
 await transaction(async sql=>{await sql.run("INSERT INTO users(id,username,password_hash,telegram_chat_id) VALUES (1,'alert-fixture','fixture','123')");await sql.run("INSERT INTO exchange_accounts VALUES ('alert-uid',1)");await sql.run("INSERT INTO account_keys VALUES (1,'spot','alert-uid','alert-key')")});
 delete process.env.TELEGRAM_BOT_TOKEN;await checkWorker();await checkWorker();let calls=0;await deliverNotifications(async()=>{calls++;return Response.json({ok:true})});assert.equal(calls,0);
 let rows=await read(sql=>sql.all<{attempts:number;delivered_at:number|null;last_error:string}>('SELECT * FROM notification_outbox'));assert.equal(rows.length,1);assert.equal(rows[0].delivered_at,null);assert.equal(rows[0].attempts,1);
 process.env.TELEGRAM_BOT_TOKEN='fixture';await transaction(sql=>sql.run('UPDATE notification_outbox SET next_attempt=0'));await deliverNotifications(async()=>Response.json({ok:false},{status:503}));rows=await read(sql=>sql.all('SELECT * FROM notification_outbox'));assert.equal(rows[0].attempts,2);assert.equal(rows[0].delivered_at,null);
 await transaction(sql=>sql.run('UPDATE notification_outbox SET next_attempt=0'));await deliverNotifications(async()=>Response.json({ok:true}));rows=await read(sql=>sql.all('SELECT * FROM notification_outbox'));assert(rows[0].delivered_at);
 await transaction(sql=>sql.run("INSERT INTO system_settings VALUES ('worker_heartbeat',?)",[String(Date.now())]));await checkWorker();rows=await read(sql=>sql.all('SELECT * FROM notification_outbox'));assert.equal(rows.length,2);
});
test('legacy database backup migrates twice without rewriting risk preferences or inventing closed fills',async()=>{
 const source=join(directory,'legacy.db'),restored=join(directory,'legacy-restored.db');
 const invoke=(db:string,mode:string)=>new Promise<string>((r,j)=>{const p=spawn(process.execPath,['--import','tsx','tests/fixtures/migrate-db.ts',mode],{env:{...process.env,DB_PATH:db},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',d=>{output+=d});p.stderr.on('data',d=>{output+=d});p.on('error',j);p.on('exit',code=>code===0?r(output):j(new Error(output)))});
 await invoke(source,'seed');await backupDatabase(source,restored);
 for(let i=0;i<2;i++){const value=JSON.parse(await invoke(restored,'upgrade'));assert.deepEqual(value.config,{min_confidence:91,max_risk_pct:3,risk_per_trade_pct:0.25});assert.deepEqual(value.position,{status:'OPEN',remaining_qty:1})}
 await verifyDatabase(restored);
});
test('repeated pause requests remain paused and never toggle back on',async()=>{
 const {setBotActive}=await import('../src/lib/bot-control');const {read}=await import('../src/lib/trading-store');await setBotActive(1,false);await setBotActive(1,false);const u=await read(sql=>sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=1'));assert.equal(u?.is_active,0);
});
test('unexplained cashflow does not overwrite the last verified capital checkpoint',async()=>{
 await capital.reconcileCapital(1,{USDT:1000});const before=await capital.capitalCheckpoint(1);await assert.rejects(capital.reconcileCapital(1,{USDT:1500}),/Unexplained/);assert.deepEqual(await capital.capitalCheckpoint(1),before);
});
test('supervisor restarts a failed worker and shuts down its process groups', {skip:process.platform==='win32'}, async()=>{
 const {mkdir,writeFile,chmod}=await import('node:fs/promises');const bin=join(directory,'fake-bin'),events=join(directory,'supervisor-events');await mkdir(bin);
 const executable=join(bin,'npm');await writeFile(executable,`#!/usr/bin/env node\nconst fs=require('node:fs');const role=process.argv[3],log=process.env.FIXTURE_EVENTS;fs.appendFileSync(log,role+':start\\n');if(role==='worker'&&!fs.existsSync(log+'.failed')){fs.writeFileSync(log+'.failed','1');process.exit(1)}process.on('SIGTERM',()=>{fs.appendFileSync(log,role+':stop\\n');process.exit(0)});setInterval(()=>{},1000);\n`);await chmod(executable,0o700);
 const p=spawn(process.execPath,['scripts/supervisor.mjs'],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,FIXTURE_EVENTS:events},stdio:'ignore'});const exited=new Promise<number|null>((r,j)=>{p.on('error',j);p.on('exit',r)});
 try{const deadline=Date.now()+12000;let data='';while(Date.now()<deadline){data=await readFile(events,'utf8').catch(()=>'');if(data.split('worker:start').length-1>=2)break;await new Promise(r=>setTimeout(r,100))}assert.equal(data.split('worker:start').length-1,2,data);p.kill('SIGTERM');assert.equal(await exited,0);const final=await readFile(events,'utf8');for(const role of ['web','worker','watchdog'])assert(final.includes(`${role}:stop`),final)}finally{p.kill('SIGTERM')}
});
