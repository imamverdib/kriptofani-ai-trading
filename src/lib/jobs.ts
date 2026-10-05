import {assertTradingUser,tradingUserIds} from './deployment-policy';
import {errorMessage} from '@/lib/errors';
import type {JobRow} from './trading-rows';
import { randomUUID } from 'node:crypto';
import { read, transaction, withOwner } from './trading-store';
export type JobKind='spot'|'futures'|'monitor';
export async function enqueue(kind:JobKind,userId=0){
 return transaction(async sql=>{
  const existing=await sql.get("SELECT id,state FROM trading_jobs WHERE kind=? AND user_id=? AND state IN ('QUEUED','RUNNING')",[kind,userId]);if(existing)return existing;
  const id=randomUUID();await sql.run("INSERT INTO trading_jobs(id,kind,user_id,state,created_at) VALUES (?,?,?,'QUEUED',?)",[id,kind,userId,Date.now()]);return {id,state:'QUEUED'};
 });
}
export async function enqueueManual(kind:'spot'|'futures',userId:number){
 assertTradingUser(userId);
 return transaction(async sql=>{
  const field=kind==='spot'?'last_force_run':'last_futures_force_run',cooldown=kind==='spot'?900000:600000;
  const user=await sql.get('SELECT * FROM users WHERE id=?',[userId]);
  if(!user||user.subscription_status!=='active')throw new Error('Active, unpaused subscription required');
  if(kind==='spot') {const cfg=await sql.get<{is_spot_active:number}>('SELECT is_spot_active FROM risk_configs WHERE user_id=?',[userId]);if(!cfg?.is_spot_active)throw new Error('Spot is paused');}
  if(kind==='futures') {const cfg=await sql.get<{is_futures_active:number}>('SELECT is_futures_active FROM futures_risk_configs WHERE user_id=?',[userId]);if(!cfg?.is_futures_active)throw new Error('Futures is paused');}
  const existing=await sql.get("SELECT id,state FROM trading_jobs WHERE kind=? AND user_id=? AND state IN ('QUEUED','RUNNING')",[kind,userId]);if(existing)return existing;
  const now=Date.now();if(now-Number(user[field]||0)<cooldown)throw new Error('Cooldown active');
  await sql.run(`UPDATE users SET ${field}=? WHERE id=?`,[now,userId]);
  const id=randomUUID();await sql.run("INSERT INTO trading_jobs(id,kind,user_id,state,created_at) VALUES (?,?,?,'QUEUED',?)",[id,kind,userId,now]);return {id,state:'QUEUED'};
 });
}
export async function processOneJob(run:(kind:JobKind,userId?:number)=>Promise<void>,laneUserId=0){
 return withOwner(`analysis-worker:${laneUserId}`,async()=>{
  // Ownership may only be recovered after the old local process is dead.
  await transaction(sql=>sql.run("UPDATE trading_jobs SET state='QUEUED' WHERE state='RUNNING' AND user_id=?",[laneUserId]));
  const job=await transaction(async sql=>{
   const row=await sql.get<JobRow>("SELECT * FROM trading_jobs WHERE state='QUEUED' AND user_id=? ORDER BY CASE WHEN kind='monitor' THEN 0 ELSE 1 END,created_at LIMIT 1",[laneUserId]);
   if(row)await sql.run("UPDATE trading_jobs SET state='RUNNING',started_at=? WHERE id=?",[Date.now(),row.id]);return row;
  });
  if(!job)return false;
  try{
   if(job.user_id===0&&job.kind!=='monitor'){
    let users:{id:number}[]=[];
    if(job.kind==='futures'){
     users=await read(sql=>sql.all<{id:number}>("SELECT u.id FROM users u JOIN futures_risk_configs f ON f.user_id=u.id WHERE f.is_futures_active=1 AND u.subscription_status='active' ORDER BY u.id"));
    }else if(job.kind==='spot'){
     users=await read(sql=>sql.all<{id:number}>("SELECT u.id FROM users u JOIN risk_configs r ON r.user_id=u.id WHERE r.is_spot_active=1 AND u.subscription_status='active' ORDER BY u.id"));
    }else{
     users=await read(sql=>sql.all<{id:number}>("SELECT id FROM users WHERE is_active=1 AND subscription_status='active' ORDER BY id"));
    }
    // Rotate the initial account every schedule window; no permanent first-user priority.
    const admitted=users.filter(u=>tradingUserIds().includes(u.id));
    const shift=admitted.length?Math.floor(Date.now()/1800000)%admitted.length:0;
    for(const u of [...admitted.slice(shift),...admitted.slice(0,shift)])await enqueue(job.kind,u.id);
   }else await run(job.kind,job.user_id||undefined);await transaction(sql=>sql.run("UPDATE trading_jobs SET state='COMPLETED',finished_at=? WHERE id=?",[Date.now(),job.id]))}
  catch(e){await transaction(sql=>sql.run("UPDATE trading_jobs SET state='FAILED',finished_at=?,error=? WHERE id=?",[Date.now(),e instanceof Error?errorMessage(e):'Job failed',job.id]))}
  return true;
 });
}
export async function jobStatus(userId:number){return read(sql=>sql.all('SELECT id,kind,state,created_at,started_at,finished_at,error FROM trading_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 20',[userId]))}
