import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const {initTradingStore,transaction,read,withOwner}=await import('../src/lib/trading-store');
 const {enqueue,processOneJob}=await import('../src/lib/jobs');
 const {runAnalysis,monitorAll}=await import('../src/lib/trading-service');
 const {tradingUserIds}=await import('../src/lib/deployment-policy');
 const {scheduleAccounts}=await import('../src/lib/account-scheduler');
 const {freeze}=await import('../src/lib/execution');
 let admitted:number[]=[];try{admitted=tradingUserIds()}catch(e){console.error('New analysis disabled: invalid admission configuration',e instanceof Error?e.message:'failure')}
 await initTradingStore();let stopping=false;const monitors=new Map<number,Promise<void>>(),analyses=new Map<number,Promise<void>>();let lastSpot=-1,lastFutures=-1;
 process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
 const ownership=await withOwner('worker-singleton',async()=>{
  while(!stopping){
   const start=Date.now();
   await transaction(sql=>sql.run("INSERT INTO system_settings VALUES ('worker_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[String(start)]));
   // Native stops remain active even if this process fails. Monitoring is independent of analysis.
   const owners=await read(sql=>sql.all<{user_id:number}>("SELECT DISTINCT k.user_id FROM account_keys k WHERE k.user_id IN ("+(admitted.map(()=>'?').join(',')||'NULL')+") OR EXISTS (SELECT 1 FROM managed_positions p WHERE p.user_id=k.user_id AND p.state NOT IN ('CLOSED','REJECTED','DUST'))",admitted));
   scheduleAccounts(owners.map(u=>u.user_id),monitors,id=>monitorAll(id),async(id,e)=>{await freeze(id,e instanceof Error?e.message:'Monitor failed')});
   const hour=Math.floor(start/3600000),half=Math.floor(start/1800000);
   if(lastSpot!==hour){lastSpot=hour;await enqueue('spot')}
   if(lastFutures!==half){lastFutures=half;await enqueue('futures')}
   scheduleAccounts([0,...admitted],analyses,id=>processOneJob(async(kind,userId)=>{if(kind==='monitor')await monitorAll(userId);else await runAnalysis(kind,userId)},id),async(id,e)=>{console.error(`Job lane ${id} failed`,e instanceof Error?e.message:'failure')});
   // Billing only prevents new entries. It never disables exposure protection.
   await transaction(sql=>sql.run("UPDATE users SET subscription_status='unpaid',is_active=0 WHERE subscription_status='active' AND subscription_expires_at IS NOT NULL AND datetime(subscription_expires_at)<=datetime('now')"));
   await new Promise(r=>setTimeout(r,Math.max(1000,5000-(Date.now()-start))));
  }
  await Promise.allSettled([...monitors.values(),...analyses.values()]);
  await read(sql=>sql.get('SELECT 1'));return true;
 });
 if(!ownership)throw new Error('Another worker owns this database; multi-host SQLite execution is unsupported');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Worker startup failed');process.exitCode=1});
