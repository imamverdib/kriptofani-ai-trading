import {assertTradingUser} from '@/lib/deployment-policy';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSession } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { transaction, withOwner, type Market } from '@/lib/trading-store';
import { accountUid } from '@/lib/exchange-client';
export async function POST(req:Request){
 const session=await getSession();if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  assertTradingUser(session.id);
  const body=await req.json();const market:Market=body.futuresApiKey!==undefined?'futures':'spot';
  const key=market==='spot'?body.binanceApiKey:body.futuresApiKey,secret=market==='spot'?body.binanceApiSecret:body.futuresApiSecret;
  if(typeof key!=='string'||typeof secret!=='string'||key.length<16||secret.length<16)throw new Error('Valid API credentials required');
  const result=await withOwner(`account:${session.id}`,async()=>{
   const uid=await accountUid({key,secret});
   return transaction(async sql=>{
    const other=await sql.get('SELECT uid FROM account_keys WHERE user_id=? AND market<>?',[session.id,market]);
    if(other&&other.uid!==uid)throw new Error('Spot and futures must belong to the same dedicated exchange account');
    const current=await sql.get('SELECT * FROM account_keys WHERE user_id=? AND market=?',[session.id,market]);
    const baseline=await sql.get('SELECT day FROM risk_state WHERE user_id=?',[session.id]);
    if(current&&current.uid!==uid&&baseline?.day)throw new Error('Account identity cannot change after risk tracking starts; use a separate user account');
    const open=await sql.get("SELECT id FROM managed_positions WHERE user_id=? AND market=? AND state NOT IN ('CLOSED','REJECTED','DUST') LIMIT 1",[session.id,market]);
    if(open&&(!current||current.uid!==uid))throw new Error('Cannot change exchange account while positions are open');
    const owner=await sql.get('SELECT user_id FROM exchange_accounts WHERE uid=?',[uid]);if(owner&&owner.user_id!==session.id)throw new Error('Exchange account already registered');
    await sql.run('INSERT OR IGNORE INTO exchange_accounts VALUES (?,?)',[uid,session.id]);
    await sql.run('INSERT INTO account_keys VALUES (?,?,?,?) ON CONFLICT(user_id,market) DO UPDATE SET uid=excluded.uid,fingerprint=excluded.fingerprint',[session.id,market,uid,createHash('sha256').update(key).digest('hex')]);
    const prefix=market==='spot'?'binance':'futures';
    await sql.run(`UPDATE users SET ${prefix}_api_key=?,${prefix}_api_secret=? WHERE id=?`,[encrypt(key,`${session.id}:${market}:key`),encrypt(secret,`${session.id}:${market}:secret`),session.id]);
    return true;
   });
  });
  if(!result)return NextResponse.json({error:'Account busy; retry after reconciliation'},{status:409});
  return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?errorMessage(e):'Setup failed'},{status:400})}
}
