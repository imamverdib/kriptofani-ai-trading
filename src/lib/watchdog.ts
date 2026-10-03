import {transaction,withOwner} from './trading-store';
export function heartbeatHealthy(value:unknown,now=Date.now()){const timestamp=Number(value);return Number.isFinite(timestamp)&&timestamp>0&&timestamp<=now+5000&&now-timestamp<60000}
/** Independent watchdog process records one alert per incident, then an explicit recovery. */
export async function checkWorker(now=Date.now()){
 return withOwner('watchdog-check',()=>transaction(async sql=>{
  const heartbeat=await sql.get<{value:string}>("SELECT value FROM system_settings WHERE key='worker_heartbeat'");
  const healthy=heartbeatHealthy(heartbeat?.value,now);
  const old=await sql.get<{value:string}>("SELECT value FROM system_settings WHERE key='worker_health_state'");
  const state=healthy?'healthy':'stale';if(old?.value===state)return healthy;
  await sql.run("INSERT INTO system_settings VALUES ('worker_health_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[state]);
  const text=healthy?'Worker heartbeat recovered; review outstanding risk alerts.':'Worker heartbeat missing/stale. New entries are blocked; verify native exchange stops.';
  const users=await sql.all<{id:number;telegram_chat_id:string|null}>('SELECT DISTINCT u.id,u.telegram_chat_id FROM users u JOIN account_keys k ON k.user_id=u.id');
  for(const u of users){await sql.run('INSERT INTO notifications(user_id,title,message) VALUES (?,?,?)',[u.id,'Worker health',text]);await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[u.id,u.telegram_chat_id,text]);}
  return healthy;
 }));
}
export async function checkAccountHealth(now=Date.now()){
 return withOwner('account-health-watchdog',()=>transaction(async sql=>{
  const users=await sql.all<{id:number;telegram_chat_id:string|null}>('SELECT DISTINCT u.id,u.telegram_chat_id FROM users u JOIN account_keys k ON k.user_id=u.id');
  for(const user of users){
   await sql.run('INSERT OR IGNORE INTO account_health(user_id,created_at) VALUES (?,?)',[user.id,now]);
   const health=await sql.get<{created_at:number;last_success:number|null;reported_state:string}>('SELECT * FROM account_health WHERE user_id=?',[user.id]);if(!health)continue;
   const stale=now-(health.last_success||health.created_at)>60000,state=stale?'stale':'healthy';if(health.reported_state===state)continue;
   await sql.run('UPDATE account_health SET reported_state=? WHERE user_id=?',[state,user.id]);
   if(!stale&&health.reported_state==='unknown')continue;
   const text=stale?'Your account monitor is stale; verify exchange protection. Other account monitoring continues independently.':'Your account monitor recovered; review any frozen risk state.';
   await sql.run('INSERT INTO notifications(user_id,title,message) VALUES (?,?,?)',[user.id,'Account monitor',text]);await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[user.id,user.telegram_chat_id,text]);
  }
 }));
}
