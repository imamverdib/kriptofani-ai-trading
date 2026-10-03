import type {ExchangeOrder,ExchangeFill} from '../src/lib/exchange-types';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Gateway, Position, Intent } from '../src/lib/execution';
let ex:typeof import('../src/lib/execution'),store:typeof import('../src/lib/trading-store'),directory:string;
let counter=0;
before(async()=>{
 directory=await mkdtemp(join(tmpdir(),'kripto-safe-test-'));process.env.DB_PATH=join(directory,'test.db');process.env.TRADING_ENABLED='true';process.env.TRADING_ACCOUNT_IS_DEDICATED='true';
 store=await import('../src/lib/trading-store');ex=await import('../src/lib/execution');await store.initTradingStore();await store.transaction(sql=>sql.run("INSERT OR REPLACE INTO system_settings VALUES ('worker_heartbeat',?)",[String(Date.now())]));
});
after(async()=>{await rm(directory,{recursive:true,force:true})});
async function user(){
 const id=++counter;await store.transaction(async sql=>{await sql.run("INSERT INTO users(id,username,password_hash,is_active,subscription_status) VALUES (?,?,?,1,'active')",[id,`test${id}`,'not-a-password']);await sql.run('INSERT INTO futures_risk_configs(user_id,is_futures_active) VALUES (?,1)',[id]);await sql.run('INSERT INTO risk_configs(user_id) VALUES (?)',[id]);await sql.run('INSERT INTO exchange_accounts VALUES (?,?)',[`uid${id}`,id]);for(const m of ['spot','futures'])await sql.run('INSERT INTO account_keys VALUES (?,?,?,?)',[id,m,`uid${id}`,`${id}-${m}`])});return id;
}
async function position(m:'spot'|'futures'='futures',id?:number,symbol='BTCUSDT',max=3){
 const uid=id||await user();return ex.reserve({user_id:uid,market:m,symbol,side:'LONG',stop_price:99,tp1:102,tp2:103,tp3:104,leverage:m==='spot'?1:5,risk_reserved:10,notional_reserved:1000,reason:'fixture'},max,10000);
}
class FakeExchange implements Gateway {
 orders=new Map<string,ExchangeOrder>();trades=new Map<string,ExchangeFill[]>();calls:{purpose:string;kind:string;qty:number}[]=[];
 actual=0;failStop=false;loseEntryResponse=false;failFillsOnce=false;baseFee=false;stepSize='0.1';fillPrice=100;partial=false;
 async submit(p:Position,i:Intent){
  this.calls.push({purpose:i.purpose,kind:i.kind,qty:i.quantity});
  if(i.kind!=='MARKET'){
   if(this.failStop)throw new Error('Stop transport unavailable');
   const result=i.kind==='STOP'?{algoId:i.id,algoStatus:'NEW',quantity:i.quantity,triggerPrice:i.price}:{orderListId:i.id,listOrderStatus:'EXECUTING',orders:[]};this.orders.set(i.id,result);return result;
  }
  const q=i.purpose==='ENTRY'&&this.partial?i.quantity*0.4:Math.min(i.quantity,i.purpose==='ENTRY'?Infinity:this.actual);
  if(i.purpose!=='ENTRY'&&this.actual===0)throw new Error('reduceOnly rejected');
  const fee=this.baseFee&&i.purpose==='ENTRY'?q*0.001:0;
  this.actual+=i.purpose==='ENTRY'?q-fee:-q;
  const result={orderId:i.id,status:this.partial&&i.purpose==='ENTRY'?'PARTIALLY_FILLED':'FILLED',executedQty:String(q),avgPrice:String(this.fillPrice)};this.orders.set(i.id,result);
  this.trades.set(i.id,[{id:i.id,orderId:i.id,side:i.side,isBuyer:i.side==='BUY',qty:q,price:this.fillPrice,commission:fee,commissionAsset:fee?'BTC':'USDT',realizedPnl:i.purpose==='ENTRY'?0:(this.fillPrice-p.entry_price)*q,time:Date.now()}]);
  if(i.purpose==='ENTRY'&&this.loseEntryResponse){this.loseEntryResponse=false;throw new Error('Response lost after exchange fill')}
  return result;
 }
 async query(_p:Position,i:Intent){const r=this.orders.get(i.id);if(!r)throw new Error('Order not found');return r}
 async fills(_p:Position,id:string){if(this.failFillsOnce){this.failFillsOnce=false;throw new Error('Read unavailable')}return this.trades.get(id)||[]}
 async exposure(){return this.actual}
 async cancel(_p:Position,i:Intent){const r=this.orders.get(i.id);if(!r)throw new Error('Cannot cancel unknown');if(i.kind==='STOP')r.algoStatus='CANCELED';else if(i.kind==='OCO')r.listOrderStatus='ALL_DONE';else r.status='CANCELED'}
 async step(){return this.stepSize}
}
test('linear PnL, grid and stop-risk sizing use correct units',async()=>{
 const {grid,grossPnl,sizePosition}=await import('../src/lib/trading-math');assert.equal(grid(1.25,0.25),1.25);assert.equal(grid(1.249,0.25),1);assert.equal(grid(0.3,0.1),0.3);assert.equal(grossPnl('LONG',100,104,5),20);assert.equal(grossPnl('SHORT',104,100,5),20);
 const q=sizePosition({equity:1000,available:1000,entry:100,stop:99,leverage:5,riskPct:0.25,allocationPct:2,feeRate:0.001,slippage:0.005,step:0.001});assert(q*1.7<=2.5);assert(q*100<=100);
});
test('actual fills, not requested quantity or leverage, determine PnL',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);g.fillPrice=102;
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,102);
 const row=await store.read(sql=>sql.get('SELECT SUM(realized_pnl) pnl FROM execution_fills WHERE position_id=?',[p.id]));assert.equal(row?.pnl,10);
});
test('TP2 retains confirmed exchange stop and never cancel-all',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);g.fillPrice=103;
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,103);
 assert.equal(g.actual,2.5);assert.equal(g.calls.filter(c=>c.kind==='STOP').length,1);
 const stop=[...g.orders.values()].find(r=>r.algoId);assert.equal(stop?.algoStatus,'NEW');
});
test('concurrent account monitors cannot duplicate a take-profit',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);g.fillPrice=102;
 await Promise.all([ex.accountOwner(p.user_id,()=>ex.monitorPosition(p,g,102)),ex.accountOwner(p.user_id,()=>ex.monitorPosition(p,g,102))]);
 assert.equal(g.calls.filter(c=>c.purpose.startsWith('TP1:')).length,1);assert.equal(g.actual,5);
});
test('response lost after accepted entry is reconciled without second submission',async()=>{
 const p=await position(),g=new FakeExchange();g.loseEntryResponse=true;
 await assert.rejects(ex.openPosition(p,10,g));await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,100);
 assert.equal(g.calls.filter(c=>c.purpose==='ENTRY').length,1);assert.equal((await ex.getPosition(p.id,p.user_id)).remaining_qty,10);
 assert.equal(g.calls.filter(c=>c.kind==='STOP').length,1);
});
test('fill read failure after exchange acceptance survives recovery without duplicate order',async()=>{
 const p=await position(),g=new FakeExchange();g.failFillsOnce=true;await assert.rejects(ex.openPosition(p,10,g));
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,100);assert.equal(g.calls.filter(c=>c.purpose==='ENTRY').length,1);
});
test('one slot cannot be reserved twice even with concurrent signals',async()=>{
 const id=await user();const results=await Promise.allSettled([position('futures',id,'BTCUSDT',1),position('futures',id,'ETHUSDT',1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('spot protection accounts for base-asset commission and rounds down',async()=>{
 const p=await position('spot'),g=new FakeExchange();g.baseFee=true;g.stepSize='0.001';await ex.openPosition(p,0.2,g);
 const oco=g.calls.find(c=>c.kind==='OCO');assert.equal(oco?.qty,0.199);assert.equal(g.actual,0.1998);
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,100);assert.equal(g.calls.length,2);
});
test('price through TP3 executes cumulative 100% target in one monitor',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);g.fillPrice=104;
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,104);assert.equal(g.actual,0);assert.equal((await ex.getPosition(p.id,p.user_id)).state,'CLOSED');
});
test('external/manual exposure change freezes new risk instead of fabricating fills',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);g.actual=0;
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,98);
 assert.equal(g.calls.filter(c=>c.kind==='MARKET').length,1);assert.equal((await ex.getPosition(p.id,p.user_id)).state,'RECONCILING');
 await assert.rejects(ex.assertEntryEnabled(p.user_id,'futures'));
});
test('pause blocks new entries but owned exits remain available',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);
 await store.transaction(sql=>sql.run('UPDATE users SET is_active=0 WHERE id=?',[p.user_id]));await assert.rejects(ex.assertEntryEnabled(p.user_id,'futures'));
 g.fillPrice=104;await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,104);assert.equal(g.actual,0);
});
test('tenant cannot query or attach fills/intents to another tenant position',async()=>{
 const p=await position(),other=await user();await assert.rejects(ex.getPosition(p.id,other));
 await assert.rejects(store.transaction(sql=>sql.run("INSERT INTO order_intents(id,position_id,user_id,purpose,kind,side,quantity,state,created_at,updated_at) VALUES ('attack',?,?,'ENTRY','MARKET','BUY',1,'PREPARED',0,0)",[p.id,other])));
});
test('settings validation rejects dangerous values and canonicalizes symbols',async()=>{
 const {validateSettings}=await import('../src/lib/trading-math');for(const body of [{maxRiskPct:101},{leverage:125},{leverage:1.5},{minConfidence:'99'},{targetCoins:'BTCUSDT&side=SELL'}])assert.throws(()=>validateSettings(body));
 assert.equal(validateSettings({targetCoins:' btcusdt, BTCUSDT, ethusdt '}).targetCoins,'BTCUSDT,ETHUSDT');assert.equal(validateSettings({maxRiskPct:0}).maxRiskPct,0);
});
test('secrets fail closed and encrypted credentials bind to tenant context',async()=>{
 const {secretMatches}=await import('../src/lib/service-auth');assert.equal(secretMatches('anything',undefined),false);assert.equal(secretMatches('abcdefghijklmnop','abcdefghijklmnop'),true);
 process.env.ENCRYPTION_KEY='unit-test-key-not-a-live-secret';const {encrypt,decrypt}=await import('../src/lib/encryption');const value=encrypt('credential','1:spot:key');assert.equal(decrypt(value,'1:spot:key'),'credential');assert.equal(decrypt(value,'2:spot:key'),'');assert.equal(decrypt('plaintext-api-key'),'');
});
test('manual job cooldown and active-job dedupe are atomic',async()=>{
 const id=await user(),{enqueueManual}=await import('../src/lib/jobs');const jobs=await Promise.all(Array.from({length:10},()=>enqueueManual('spot',id)));assert.equal(new Set(jobs.map(j=>j.id)).size,1);
});
test('partial entry remainder is canceled and only actual fill is protected',async()=>{
 const p=await position(),g=new FakeExchange();g.partial=true;await ex.openPosition(p,10,g);
 const entry=[...g.orders.values()].find(o=>o.orderId);assert.equal(entry?.status,'CANCELED');
 assert.equal((await ex.getPosition(p.id,p.user_id)).quantity,4);assert.equal(g.calls.find(c=>c.kind==='STOP')?.qty,4);
});
test('never-submitted stale intent is abandoned after recovery',async()=>{
 const p=await position(),g=new FakeExchange();await ex.prepare(p,'ENTRY','MARKET',10);
 await ex.monitorPosition(p,g,100);assert.equal(g.calls.length,0);assert.equal((await ex.getPosition(p.id,p.user_id)).state,'REJECTED');
});
test('100 tenant reservations remain isolated with bounded SQLite writers',async()=>{
 const ids=[];for(let n=0;n<100;n++)ids.push(await user());
 const begin=Date.now();const p=await Promise.all(ids.map(id=>position('futures',id)));
 assert.equal(new Set(p.map(row=>row.id)).size,100);
 for(let n=0;n<100;n++)assert.equal((await ex.positions(ids[n])).length,1);
 console.log(`100-tenant isolated SQLite reservation check: ${Date.now()-begin} ms (not an exchange latency benchmark)`);
});
test('exchange-side stop fill closes ledger without a second market exit',async()=>{
 const p=await position(),g=new FakeExchange();await ex.openPosition(p,10,g);
 const stop=(await ex.intents(p)).find(i=>i.kind==='STOP')!;
 g.orders.set(stop.id,{algoId:stop.id,algoStatus:'FINISHED',actualOrderId:'98765',quantity:10,triggerPrice:99});
 g.trades.set('98765',[{id:'stop-fill',orderId:'98765',side:'SELL',qty:10,price:98.8,commission:0.2,commissionAsset:'USDT',realizedPnl:-12,time:Date.now()}]);g.actual=0;
 await ex.monitorPosition(await ex.getPosition(p.id,p.user_id),g,98.8);
 assert.equal((await ex.getPosition(p.id,p.user_id)).state,'CLOSED');assert.equal(g.calls.filter(c=>c.kind==='MARKET').length,1);
});
test('actual liquidation near stop closes filled entry with owned emergency exit',async()=>{
 const p=await position(),g=new FakeExchange();
 const guarded:Gateway=Object.assign(g,{liquidation:async()=>98.5});
 await assert.rejects(ex.openPosition(p,10,guarded),/liquidation buffer/);
 assert.equal(g.actual,0);assert.equal((await ex.getPosition(p.id,p.user_id)).state,'CLOSED');
 assert.equal(g.calls.filter(c=>c.purpose.startsWith('EMERGENCY:')).length,1);
});
test('definitively rejected protection triggers emergency close instead of an unprotected open position',async()=>{
 const p=await position(),g=new FakeExchange(),submit=g.submit.bind(g);
 const {ExchangeError}=await import('../src/lib/exchange-client');
 g.submit=async(p,i)=>{if(i.kind==='STOP')throw new ExchangeError('Rejected stop',-2021,false);return submit(p,i)};
 await assert.rejects(ex.openPosition(p,10,g));assert.equal(g.actual,0);
 assert.equal((await ex.getPosition(p.id,p.user_id)).state,'CLOSED');
});
