import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scheduleAccounts} from '../src/lib/account-scheduler';
import {tradingUserIds,assertTradingUser} from '../src/lib/deployment-policy';
import type {Gateway,Position,Intent} from '../src/lib/execution';
import type {ExchangeOrder,ExchangeFill} from '../src/lib/exchange-types';
let directory:string,store:typeof import('../src/lib/trading-store'),ex:typeof import('../src/lib/execution');
before(async()=>{directory=await mkdtemp(join(tmpdir(),'kripto-two-'));process.env.DB_PATH=join(directory,'two.db');process.env.TRADING_USER_IDS='1,2';process.env.TRADING_ENABLED='true';process.env.TRADING_ACCOUNT_IS_DEDICATED='true';store=await import('../src/lib/trading-store');ex=await import('../src/lib/execution')});
after(async()=>{await rm(directory,{recursive:true,force:true})});
class AccountExchange implements Gateway{
 actual=0;price=100;orders=new Map<string,ExchangeOrder>();trades=new Map<string,ExchangeFill[]>();
 async submit(p:Position,i:Intent){const order:ExchangeOrder=i.kind==='STOP'?{algoId:i.id,algoStatus:'NEW',closePosition:true,triggerPrice:i.price}:{orderId:i.id,status:'FILLED',executedQty:i.quantity};this.orders.set(i.id,order);if(i.kind==='MARKET'){this.actual+=i.purpose==='ENTRY'?i.quantity:-i.quantity;this.trades.set(i.id,[{id:this.trades.size+1,orderId:i.id,qty:i.quantity,price:this.price,commission:0,commissionAsset:'USDT',realizedPnl:i.purpose==='ENTRY'?0:(this.price-p.entry_price)*i.quantity,side:i.side,time:Date.now()}])}return order}
 async query(_p:Position,i:Intent){const r=this.orders.get(i.id);if(!r)throw new Error('Missing exchange order');return r}
 async fills(_p:Position,id:string){return this.trades.get(id)||[]}async exposure(){return this.actual}async step(){return '0.001'}async cancel(_p:Position,i:Intent){this.orders.set(i.id,{...this.orders.get(i.id),algoStatus:'CANCELED'})}
}
test('only two explicit IDs are admitted; no configuration means no trading',()=>{assert.deepEqual(tradingUserIds('1,2'),[1,2]);assert.deepEqual(tradingUserIds(''),[]);for(const v of ['1,2,3','1,NaN','-1','0','1e3'])assert.throws(()=>tradingUserIds(v));assert.throws(()=>assertTradingUser(3))});
test('private account provisioning is atomic, capped at two, and starts paused',async()=>{
 const {createPrivateUser}=await import('../src/lib/private-accounts');assert.equal(await createPrivateUser('owner','fixture-password-owner',true),1);assert.equal(await createPrivateUser('friend','fixture-password-friend'),2);await assert.rejects(createPrivateUser('third','fixture-password-third'),/capacity/);
 const rows=await store.read(sql=>sql.all<{is_active:number}>('SELECT is_active FROM users'));assert.deepEqual(rows.map(r=>r.is_active),[0,0]);
 await store.transaction(async sql=>{await sql.run("UPDATE users SET is_active=1");await sql.run('UPDATE futures_risk_configs SET is_futures_active=1');await sql.run("INSERT INTO system_settings VALUES ('worker_heartbeat',?)",[String(Date.now())]);for(const id of [1,2]){await sql.run('INSERT INTO exchange_accounts VALUES (?,?)',[`uid-${id}`,id]);await sql.run('INSERT INTO account_keys VALUES (?,?,?,?)',[id,'futures',`uid-${id}`,`key-${id}`])}});
});
test('same signal respects independent balances and exits continue while the other account is stalled',async()=>{
 const {sizePosition}=await import('../src/lib/trading-math');const exchanges=[new AccountExchange(),new AccountExchange()];const positions:Position[]=[];
 for(const id of [1,2]){const equity=id===1?10000:1000,q=sizePosition({equity,available:equity,entry:100,stop:99,leverage:2,riskPct:id===1?0.25:0.1,allocationPct:2,feeRate:0.001,slippage:0.005,step:'0.001'});const p=await ex.reserve({user_id:id,market:'futures',symbol:'BTCUSDT',side:'LONG',stop_price:99,tp1:102,tp2:103,tp3:104,leverage:2,risk_reserved:q*1.7,notional_reserved:q*100,reason:'same-signal'},3,equity);positions.push(await ex.openPosition(p,q,exchanges[id-1]))}
 assert(positions[0].quantity>positions[1].quantity);assert.notEqual((await ex.intents(positions[0]))[0].id,(await ex.intents(positions[1]))[0].id);
 let rejectA!:(e:Error)=>void;const hung=new Promise<ExchangeOrder>((_,reject)=>{rejectA=reject});exchanges[0].query=()=>hung;
 const pending=new Map<number,Promise<void>>();const run=(id:number)=>ex.accountOwner(id,()=>ex.monitorPosition(positions[id-1],exchanges[id-1],exchanges[id-1].price));const failed=(id:number,e:unknown)=>ex.freeze(id,e instanceof Error?e.message:'failure');
 exchanges[1].price=102;scheduleAccounts([1,2],pending,run,failed);await pending.get(2);assert(pending.has(1));const afterFirst=exchanges[1].actual;assert(afterFirst<positions[1].quantity);
 exchanges[1].price=103;scheduleAccounts([1,2],pending,run,failed);await pending.get(2);assert(exchanges[1].actual<afterFirst);assert(pending.has(1));rejectA(new Error('Account A transport failure'));await pending.get(1);
 const risk=await store.read(sql=>sql.all<{user_id:number}>('SELECT user_id FROM risk_state WHERE frozen_reason IS NOT NULL'));assert.deepEqual(risk.map(r=>r.user_id),[1]);await ex.assertEntryEnabled(2,'futures');await assert.rejects(ex.getPosition(positions[0].id,2),/ownership/);
});
test('analysis lanes neither block the second user nor requeue the other running job',async()=>{
 const {enqueue,processOneJob,jobStatus}=await import('../src/lib/jobs');await enqueue('spot',1);await enqueue('spot',2);let release!:()=>void;const hung=new Promise<void>(r=>{release=r});let started!:()=>void;const began=new Promise<void>(r=>{started=r});
 const a=processOneJob(async()=>{started();await hung},1);await began;await processOneJob(async()=>{},2);const one=await jobStatus(1),two=await jobStatus(2);assert.equal(one[0].state,'RUNNING');assert.equal(two[0].state,'COMPLETED');assert.notEqual(one[0].id,two[0].id);release();await a;
});
test('stale-account alerts are addressed only to the affected user',async()=>{
 const {checkAccountHealth}=await import('../src/lib/watchdog');const now=Date.now();await store.transaction(async sql=>{for(const id of [1,2])await sql.run('INSERT INTO account_health(user_id,created_at,last_success) VALUES (?,?,?)',[id,now-120000,id===1?now-120000:now])});await checkAccountHealth(now);await checkAccountHealth(now);const alerts=await store.read(sql=>sql.all<{user_id:number}>("SELECT user_id FROM notifications WHERE title='Account monitor'"));assert.deepEqual(alerts.map(a=>a.user_id),[1]);
});
