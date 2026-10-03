import {mkdtemp,cp,symlink,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import {SignJWT} from 'jose';
const root=process.cwd(),scratch=await mkdtemp(join(tmpdir(),'kripto-http-two-'));
const env={...process.env,DB_PATH:join(scratch,'acceptance.db'),JWT_SECRET:'offline-two-account-secret-1234567890',ENCRYPTION_KEY:'offline-fixture-key-not-production',TRADING_ENABLED:'false',TRADING_USER_IDS:'1,2',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of ['CRON_SECRET','REGISTRATION_SECRET','TELEGRAM_WEBHOOK_SECRET','TELEGRAM_BOT_TOKEN','GEMINI_API_KEY','TYPESAFE_API_KEY'])delete env[key];
let server;
try{
 for(const name of await readdir(root)){
  if(name.startsWith('.')||['node_modules','data','keys','backups'].includes(name)||name.includes('.db')||/\.(log|tsbuildinfo)$/.test(name))continue;
  await cp(join(root,name),join(scratch,name),{recursive:(await stat(join(root,name))).isDirectory(),filter:source=>!/(?:^|\/)\.env(?:\.|$)|\.(?:db|pem|key)(?:-|$)/.test(source)});
 }
 await symlink(join(root,'node_modules'),join(scratch,'node_modules'),'dir');
 const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{cwd:scratch,env,stdio:'inherit'});assert.equal(await new Promise((r,j)=>{build.on('exit',r);build.on('error',j)}),0,'Isolated build failed');
 const port=await new Promise((r,j)=>{const s=net.createServer();s.on('error',j);s.listen(0,'127.0.0.1',()=>{const address=s.address();s.close(()=>r(address.port))})});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:scratch,env,stdio:['ignore','ignore','pipe']});let errorLog='';server.stderr.on('data',d=>{errorLog+=d});
 const request=async(path,{id,body,method='GET'}={})=>{const headers={'Content-Type':'application/json'};if(id){const token=await new SignJWT({id,username:`fixture-${id}`}).setProtectedHeader({alg:'HS256'}).setExpirationTime('10m').sign(new TextEncoder().encode(env.JWT_SECRET));headers.Cookie=`session=${token}`;}const response=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const raw=await response.text();return {status:response.status,data:raw.startsWith('{')?JSON.parse(raw):null}};
 let ready=false;for(let i=0;i<50;i++){try{await request('/login');ready=true;break}catch{await new Promise(r=>setTimeout(r,200))}}assert(ready,errorLog);
 assert.equal((await request('/api/health')).status,503);
 const db=new sqlite3.Database(env.DB_PATH);const run=(sql,args=[])=>new Promise((r,j)=>db.run(sql,args,e=>e?j(e):r()));
 try{await run('PRAGMA foreign_keys=ON');for(const id of [1,2,3])await run("INSERT INTO users(id,username,password_hash,is_active,subscription_status) VALUES (?,?,?,1,'active')",[id,`fixture-${id}`,'not-a-password']);
  for(const id of [1,2]){
   await run('INSERT INTO risk_configs(user_id,max_risk_pct) VALUES (?,?)',[id,id===1?2:7]);
   await run("INSERT INTO trading_jobs(id,kind,user_id,state,created_at) VALUES (?,'spot',?,'QUEUED',?)",[`job-${id}`,id,Date.now()]);
   await run('INSERT INTO risk_state(user_id,high_water,day_start,day,equity,updated_at) VALUES (?,?,?,?,?,?)',[id,id*1000,id*1000,'2026-10-03',id*1000,Date.now()]);
   const symbol=id===1?'AAAUSDT':'BBBUSDT';await run("INSERT INTO managed_positions(id,user_id,market,symbol,side,state,entry_price,quantity,remaining_qty,stop_price,tp1,tp2,tp3,leverage,risk_reserved,notional_reserved,created_at,reason) VALUES (?,?,'spot',?,'LONG','CLOSED',100,1,0,99,102,103,104,1,1,100,?,'fixture')",[`p-${id}`,id,symbol,Date.now()]);
   await run('INSERT INTO execution_fills VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,'spot',symbol,'same-trade-id',`p-${id}`,`order-${id}`,'SELL',1,100,0,'USDT',0,id*10,Date.now()]);
  }
  await run("INSERT INTO notifications(user_id,title,message) VALUES (2,'Friend only','Private fixture')");
 }finally{await new Promise((r,j)=>db.close(e=>e?j(e):r()))}
 for(const id of [1,2]){
  const other=id===1?2:1;
  const jobs=await request(`/api/jobs?user_id=${other}`,{id});assert.deepEqual(jobs.data.jobs.map(j=>j.id),[`job-${id}`]);
  const trades=await request(`/api/trades?user_id=${other}`,{id});assert.deepEqual(trades.data.trades.map(t=>t.symbol),[id===1?'AAAUSDT':'BBBUSDT']);
  const dashboard=await request('/api/dashboard',{id});assert.equal(dashboard.data.stats.balance,id*1000);assert.equal(dashboard.data.stats.totalProfit,id*10);
 }
 assert.equal((await request('/api/settings',{id:1,method:'POST',body:{maxRiskPct:3,user_id:2}})).status,200);
 assert.equal((await request('/api/settings',{id:1})).data.config.max_risk_pct,3);assert.equal((await request('/api/settings',{id:2})).data.config.max_risk_pct,7);
 for(let i=0;i<2;i++)assert.equal((await request('/api/auth/toggle-bot',{id:1,method:'POST',body:{active:false,user_id:2}})).data.is_active,0);
 assert.equal((await request('/api/auth/me',{id:2})).data.user.is_active,1);
 assert.equal((await request('/api/force-run',{id:1,method:'POST',body:{}})).status,409);
 assert.equal((await request('/api/force-run',{id:2,method:'POST',body:{}})).status,202);
 assert.equal((await request('/api/force-run',{id:3,method:'POST',body:{}})).status,409);
 assert.equal((await request('/api/setup',{id:3,method:'POST',body:{binanceApiKey:'fixture-long-key',binanceApiSecret:'fixture-long-secret'}})).status,400);
 assert.equal((await request('/api/notifications',{id:1})).data.notifications.length,0);assert.equal((await request('/api/notifications',{id:2})).data.notifications.length,1);
 assert.equal((await request('/api/admin',{id:2})).status,403);
 assert.equal((await request('/api/auth/register',{method:'POST',body:{username:'outsider',password:'long-enough-fixture'}})).status,403);
 assert.equal((await request('/api/jobs')).status,401);
 console.log('Two-account HTTP acceptance passed: balances, PnL, history, jobs, settings, pause, alerts, admission and private registration. No exchange request or order was made.');
}finally{
 if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>{server.once('exit',r);setTimeout(()=>{server.kill('SIGKILL');r()},5000).unref()})}
 await rm(scratch,{recursive:true,force:true});
}
