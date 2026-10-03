import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const {initTradingStore,transaction,read,withOwner}=await import('../src/lib/trading-store');
 const {enqueue,processOneJob}=await import('../src/lib/jobs');
 const {runAnalysis,monitorAll}=await import('../src/lib/trading-service');
 const {deliverNotifications}=await import('../src/lib/outbox');
 await initTradingStore();let stopping=false,analysisBusy=false;let lastSpot=-1,lastFutures=-1;
 process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
 const ownership=await withOwner('worker-singleton',async()=>{
  while(!stopping){
   const start=Date.now();
   await transaction(sql=>sql.run("INSERT INTO system_settings VALUES ('worker_heartbeat',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[String(start)]));
   // Native stops remain active even if this process fails. Monitoring is independent of analysis.
   try{await monitorAll();await deliverNotifications()}catch(e){console.error('Monitor/outbox failure:',e instanceof Error?e.message:'failure')}
   const hour=Math.floor(start/3600000),half=Math.floor(start/1800000);
   if(lastSpot!==hour){lastSpot=hour;await enqueue('spot')}
   if(lastFutures!==half){lastFutures=half;await enqueue('futures')}
   if(!analysisBusy){analysisBusy=true;void processOneJob(async(kind,userId)=>{if(kind==='monitor')await monitorAll(userId);else await runAnalysis(kind,userId)}).catch(e=>console.error('Job failure',e instanceof Error?e.message:'failure')).finally(()=>{analysisBusy=false})}
   // Billing only prevents new entries. It never disables exposure protection.
   await transaction(sql=>sql.run("UPDATE users SET subscription_status='unpaid',is_active=0 WHERE subscription_status='active' AND subscription_expires_at IS NOT NULL AND datetime(subscription_expires_at)<=datetime('now')"));
   await new Promise(r=>setTimeout(r,Math.max(1000,5000-(Date.now()-start))));
  }
  while(analysisBusy)await new Promise(r=>setTimeout(r,100));
  await read(sql=>sql.get('SELECT 1'));return true;
 });
 if(!ownership)throw new Error('Another worker owns this database; multi-host SQLite execution is unsupported');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Worker startup failed');process.exitCode=1});
