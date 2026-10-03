import {assertTradingUser} from './deployment-policy';
import {heartbeatHealthy} from './watchdog';
import {errorMessage} from '@/lib/errors';
import type {FillRow,RiskRow,UserTradingRow} from './trading-rows';
import type {ExchangeOrder,ExchangeFill,SpotAccount,ExchangePosition} from './exchange-types';
import { createHash, randomUUID } from 'node:crypto';
import { read, transaction, withOwner, type Market } from './trading-store';
import { exchange, ExchangeError, exchangeInfo, type Credentials } from './exchange-client';
import { grid, positive, grossPnl, validatePlan } from './trading-math';

export interface Position {
 id:string; user_id:number; market:Market; symbol:string; side:'LONG'|'SHORT'; state:string;
 entry_price:number; quantity:number; remaining_qty:number; stop_price:number;
 tp1:number; tp2:number; tp3:number; leverage:number; stage:number; high_water:number;
 risk_reserved:number; notional_reserved:number; created_at:number; closed_at?:number; reason:string; error?:string;
}
export interface Intent {id:string; position_id:string; user_id:number; purpose:string; kind:'MARKET'|'STOP'|'OCO'; side:string; quantity:number; price:number; state:string; reconciled?:number; exchange_id?:string; response?:string; created_at:number}
export interface Gateway {
 submit(p:Position,i:Intent):Promise<ExchangeOrder>;
 query(p:Position,i:Intent):Promise<ExchangeOrder>;
 fills(p:Position,orderId:string):Promise<ExchangeFill[]>;
 order?(p:Position,orderId:string):Promise<ExchangeOrder>;
 exposure(p:Position):Promise<number>;
 liquidation?(p:Position):Promise<number>;
 cancel(p:Position,i:Intent):Promise<void>;
 step(p:Position):Promise<string>;
}
const terminal=new Set(['FILLED','CANCELED','EXPIRED','EXPIRED_IN_MATCH','REJECTED','FINISHED','ALL_DONE']);
export function gateway(c:Credentials):Gateway {
 const call=<T=ExchangeOrder>(p:Position,path:string,params:Record<string,string|number|boolean>,method='GET')=>exchange<T>(p.market,path,params,c,method,{priority:true});
 return {
  async submit(p,i){
   if(i.kind==='MARKET')return call(p,p.market==='spot'?'/api/v3/order':'/fapi/v1/order',{
    symbol:p.symbol,side:i.side,type:'MARKET',quantity:i.quantity,newClientOrderId:i.id,newOrderRespType:p.market==='spot'?'FULL':'RESULT',
    ...(p.market==='futures'&&i.purpose!=='ENTRY'?{reduceOnly:true}:{})
   },'POST');
   if(i.kind==='STOP')return call(p,'/fapi/v1/algoOrder',{symbol:p.symbol,algoType:'CONDITIONAL',side:i.side,type:'STOP_MARKET',triggerPrice:i.price,workingType:'MARK_PRICE',closePosition:true,clientAlgoId:i.id},'POST');
   // Modern spot OCO: market stop, no unfillable stop-limit leg during a gap.
   return call(p,'/api/v3/orderList/oco',{symbol:p.symbol,side:'SELL',quantity:i.quantity,listClientOrderId:i.id,aboveType:'LIMIT_MAKER',abovePrice:p.tp1,belowType:'STOP_LOSS',belowStopPrice:i.price,newOrderRespType:'FULL'},'POST');
  },
  async query(p,i){
   if(i.kind==='MARKET')return call(p,p.market==='spot'?'/api/v3/order':'/fapi/v1/order',{symbol:p.symbol,origClientOrderId:i.id});
   return call(p,i.kind==='STOP'?'/fapi/v1/algoOrder':'/api/v3/orderList',i.kind==='STOP'?{clientAlgoId:i.id}:{origClientOrderId:i.id});
  },
  async order(p,orderId){return call(p,p.market==='spot'?'/api/v3/order':'/fapi/v1/order',{symbol:p.symbol,orderId})},
  async fills(p,orderId){
   const output:ExchangeFill[]=[];let fromId:number|undefined;
   for(let page=0;page<100;page++){
    const rows=await call<ExchangeFill[]>(p,p.market==='spot'?'/api/v3/myTrades':'/fapi/v1/userTrades',{symbol:p.symbol,orderId,limit:1000,...(fromId!==undefined?{fromId}:{})});
    output.push(...rows.filter(r=>String(r.orderId)===String(orderId)));
    if(rows.length<1000)return output;
    const next=Number(rows.at(-1)!.id)+1;if(fromId!==undefined&&next<=fromId)throw new Error('Trade pagination made no progress');fromId=next;
   }throw new Error('Trade pagination exceeded safety bound');
  },
  async exposure(p){
   if(p.market==='spot'){
    const d=await call<SpotAccount>(p,'/api/v3/account',{});const a=d.balances.find(b=>b.asset===p.symbol.slice(0,-4));return a?Number(a.free)+Number(a.locked):0;
   }
   const d=await call<ExchangePosition[]>(p,'/fapi/v2/positionRisk',{symbol:p.symbol});
   if(d.some(r=>r.positionSide!=='BOTH'))throw new Error('Hedge mode is not supported');
   const actual=d.find(r=>r.symbol===p.symbol);const amount=Number(actual?.positionAmt||0);
   if(amount!==0&&(amount>0)!==(p.side==='LONG'))throw new Error('Position ownership/direction mismatch');
   return Math.abs(amount);
  },
  async liquidation(p){
   const rows=await call<ExchangePosition[]>(p,'/fapi/v2/positionRisk',{symbol:p.symbol});
   const row=rows.find(r=>r.symbol===p.symbol&&Number(r.positionAmt)!==0);
   const value=Number(row?.liquidationPrice);if(!Number.isFinite(value)||value<0)throw new Error('Liquidation price unavailable');return value;
  },
  async cancel(p,i){
   if(i.kind==='STOP')await call(p,'/fapi/v1/algoOrder',{clientAlgoId:i.id},'DELETE');
   else if(i.kind==='OCO')await call(p,'/api/v3/orderList',{symbol:p.symbol,listClientOrderId:i.id},'DELETE');
   else await call(p,p.market==='spot'?'/api/v3/order':'/fapi/v1/order',{symbol:p.symbol,origClientOrderId:i.id},'DELETE');
  },
  async step(p){const info=await exchangeInfo(p.market,p.symbol);const lot=info.filters.find(f=>f.filterType==='LOT_SIZE');if(!lot)throw new Error('LOT_SIZE missing');return lot.stepSize}
 };
}
export async function freeze(userId:number,reason:string){
 await transaction(async sql=>{
  const old=await sql.get<Pick<RiskRow,'frozen_reason'|'updated_at'>>('SELECT frozen_reason,updated_at FROM risk_state WHERE user_id=?',[userId]);
  const alert=!old?.frozen_reason||Date.now()-old.updated_at>300000;
  await sql.run(`INSERT INTO risk_state(user_id,high_water,day_start,day,equity,frozen_reason,updated_at) VALUES (?,0,0,'',0,?,?)
   ON CONFLICT(user_id) DO UPDATE SET frozen_reason=excluded.frozen_reason,updated_at=excluded.updated_at`,[userId,reason.slice(0,500),Date.now()]);
  if(alert){await sql.run('INSERT INTO notifications(user_id,title,message) VALUES (?,?,?)',[userId,'Trading paused',reason]);const user=await sql.get('SELECT telegram_chat_id FROM users WHERE id=?',[userId]);await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[userId,user?.telegram_chat_id||null,reason]);}
 });
}
export async function notify(userId:number,text:string){
 await transaction(async sql=>{
  const u=await sql.get('SELECT telegram_chat_id FROM users WHERE id=?',[userId]);
  await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[userId,u?.telegram_chat_id||null,text]);
 });
}
export async function positions(userId:number,market?:Market):Promise<Position[]>{
 return read(sql=>sql.all<Position>(`SELECT * FROM managed_positions WHERE user_id=? AND state NOT IN ('CLOSED','REJECTED','DUST') ${market?'AND market=?':''} ORDER BY created_at`,market?[userId,market]:[userId]));
}
export async function intents(p:Position):Promise<Intent[]>{return read(sql=>sql.all<Intent>('SELECT * FROM order_intents WHERE position_id=? AND user_id=? ORDER BY created_at,id',[p.id,p.user_id]))}
export async function getPosition(id:string,userId:number):Promise<Position>{const p=await read(sql=>sql.get<Position>('SELECT * FROM managed_positions WHERE id=? AND user_id=?',[id,userId]));if(!p)throw new Error('Position ownership mismatch');return p}
export async function prepare(p:Position,purpose:string,kind:Intent['kind'],quantity:number,trigger?:number):Promise<Intent>{
 const id='kf'+createHash('sha256').update(`${p.user_id}:${p.id}:${purpose}`).digest('hex').slice(0,30);
 const side=purpose==='ENTRY'?(p.side==='LONG'?'BUY':'SELL'):(p.side==='LONG'?'SELL':'BUY');
 await transaction(sql=>sql.run(`INSERT OR IGNORE INTO order_intents(id,position_id,user_id,purpose,kind,side,quantity,price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,[id,p.id,p.user_id,purpose,kind,side,quantity,trigger||null,Date.now(),Date.now()]));
 const i=await read(sql=>sql.get<Intent>('SELECT * FROM order_intents WHERE id=? AND user_id=?',[id,p.user_id]));if(!i)throw new Error('Intent missing');return i;
}
async function recordResponse(p:Position,i:Intent,r:ExchangeOrder){
 const state=String(r.status||r.algoStatus||r.listOrderStatus||'ACKNOWLEDGED');
 const id=String(r.orderId||r.algoId||r.orderListId||'');
 await transaction(sql=>sql.run('UPDATE order_intents SET state=?,exchange_id=?,response=?,updated_at=? WHERE id=? AND user_id=?',[state,id,JSON.stringify(r),Date.now(),i.id,p.user_id]));
 i.state=state;i.exchange_id=id;i.response=JSON.stringify(r);
}
/** PREPARED may be submitted once. SUBMITTING/UNKNOWN may only be queried. */
export async function execute(p:Position,i:Intent,g:Gateway){
 if(i.state!=='PREPARED')return syncIntent(p,i,g);
 if(i.purpose==='ENTRY')await assertEntryEnabled(p.user_id,p.market);
 const claim=await transaction(sql=>sql.run("UPDATE order_intents SET state='SUBMITTING',updated_at=? WHERE id=? AND user_id=? AND state='PREPARED'",[Date.now(),i.id,p.user_id]));
 if(claim.changes!==1)throw new Error('Intent submission already owned');
 try { const result=await g.submit(p,i);await recordResponse(p,i,result);return result; }
 catch(e){
  const known=e instanceof ExchangeError&&!e.unknown;
  await transaction(sql=>sql.run('UPDATE order_intents SET state=?,updated_at=? WHERE id=? AND user_id=?',[known?'REJECTED':'UNKNOWN',Date.now(),i.id,p.user_id]));
  if(!known)await freeze(p.user_id,`Order ${i.id} execution unknown; reconciliation required`);
  throw e;
 }
}
export async function syncIntent(p:Position,i:Intent,g:Gateway):Promise<ExchangeOrder|null>{
 if(i.state==='PREPARED'||i.state==='REJECTED')return i.response?JSON.parse(i.response):null;
 try{const r=await g.query(p,i);await recordResponse(p,i,r);return r}catch(e){
  // An order-not-found result after a transport failure is NOT proof that resubmission is safe.
  await freeze(p.user_id,`Cannot reconcile order ${i.id}; no automatic resubmission`);throw e;
 }
}
async function importFills(p:Position,rows:ExchangeFill[],orderId:string){
 await transaction(async sql=>{
  for(const f of rows){
   const qty=positive(f.qty,'fill quantity'), fillPrice=positive(f.price,'fill price');
   const fee=Number(f.commission);if(!Number.isFinite(fee)||fee<0)throw new Error('Invalid commission');
   const asset=String(f.commissionAsset||'');
   const feeUsd=fee===0?0:asset==='USDT'?fee:asset===p.symbol.slice(0,-4)?fee*fillPrice:null;
   const side=f.side||(f.isBuyer?'BUY':'SELL');
   const gross=p.market==='futures'?Number(f.realizedPnl):side==='SELL'?grossPnl('LONG',p.entry_price,fillPrice,qty):0;
   if(!Number.isFinite(gross)||f.id===undefined||!Number.isFinite(Number(f.time)))throw new Error('Invalid exchange fill');
   await sql.run(`INSERT OR IGNORE INTO execution_fills VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[p.user_id,p.market,p.symbol,String(f.id),p.id,orderId,side,qty,fillPrice,fee,asset,feeUsd,gross,Number(f.time)]);
  }
 });
}
export async function reconcilePosition(p:Position,g:Gateway):Promise<Position>{
 const all=await intents(p);
 // Entry first: price/quantity must be restored before calculating spot exit cost basis.
 for(const i of all.sort((a,b)=>Number(b.purpose==='ENTRY')-Number(a.purpose==='ENTRY'))){
  if(i.state==='PREPARED'||i.state==='REJECTED')continue;
  let r:ExchangeOrder|null=i.reconciled&&i.response?JSON.parse(i.response):await syncIntent(p,i,g);if(!r)continue;
  if(i.kind==='MARKET'&&!terminal.has(String(r.status))){
   // Do not leave an entry expanding while protection is sized from a partial fill.
   await g.cancel(p,i);r=await syncIntent(p,i,g);
   if(!r||!terminal.has(String(r.status)))throw new Error('Market order is still nonterminal');
  }
  const orderIds:string[]=i.kind==='MARKET'?[String(r.orderId)]:i.kind==='STOP'?(r.actualOrderId&&Number(r.actualOrderId)>0?[String(r.actualOrderId)]:[]):(r.orders||r.orderReports||[]).map(o=>String(o.orderId));
  let childrenSettled=true;
  for(const id of i.reconciled?[]:[...new Set(orderIds)]){
   const rows=await g.fills(p,id);await importFills(p,rows,id);
   if(i.kind!=='MARKET'){
    if(g.order){const child=await g.order(p,id);if(!terminal.has(String(child.status))||Math.abs(Number(child.executedQty)-rows.reduce((sum,f)=>sum+Number(f.qty),0))>1e-9)childrenSettled=false;}
    else childrenSettled=false;
   }
   if(i.kind==='MARKET'&&Number(r.executedQty)>rows.reduce((sum,f)=>sum+Number(f.qty),0)+1e-9)throw new Error('Fill history not yet complete');
  }
  if(!i.reconciled&&terminal.has(i.state)&&childrenSettled)await transaction(sql=>sql.run('UPDATE order_intents SET reconciled=1 WHERE id=? AND user_id=?',[i.id,p.user_id]));
  if(i.purpose==='ENTRY'){
   const entry=await read(sql=>sql.get<{q:number|null;price:number}>('SELECT SUM(quantity) q,SUM(price*quantity)/SUM(quantity) price FROM execution_fills WHERE position_id=? AND user_id=? AND order_id=?',[p.id,p.user_id,String(r.orderId)]));
   if(entry?.q){p.entry_price=entry.price;p.quantity=entry.q;}
  }
 }
 const fills=await read(sql=>sql.all<FillRow>('SELECT * FROM execution_fills WHERE position_id=? AND user_id=?',[p.id,p.user_id]));
 const entrySide=p.side==='LONG'?'BUY':'SELL';
 const entries=fills.filter(f=>f.side===entrySide),exits=fills.filter(f=>f.side!==entrySide);
 const quantity=entries.reduce((s,f)=>s+f.quantity,0);
 const cost=entries.reduce((s,f)=>s+f.quantity*f.price,0);
 const baseFees=p.market==='spot'?fills.filter(f=>f.commission_asset===p.symbol.slice(0,-4)).reduce((s,f)=>s+f.commission,0):0;
 const remaining=Math.max(0,quantity-exits.reduce((s,f)=>s+f.quantity,0)-baseFees);
 p.quantity=quantity;p.entry_price=quantity?cost/quantity:0;p.remaining_qty=remaining;
 const unresolved=(await intents(p)).some(i=>i.kind==='MARKET'&&i.state!=='PREPARED'&&!terminal.has(i.state));
 const entryIntent=(await intents(p)).find(i=>i.purpose==='ENTRY');
 if(!entryIntent||entryIntent.state==='PREPARED'){
  // No POST was attempted: abandon stale plans after a crash instead of trading old signals.
  await transaction(async sql=>{if(entryIntent)await sql.run("UPDATE order_intents SET state='REJECTED' WHERE id=? AND user_id=? AND state='PREPARED'",[entryIntent.id,p.user_id]);await sql.run("UPDATE managed_positions SET state='REJECTED' WHERE id=? AND user_id=?",[p.id,p.user_id])});
  p.state='REJECTED';return p;
 }
 let state=quantity===0?(terminal.has(entryIntent.state)?'REJECTED':'OPENING'):remaining<=1e-10&&!unresolved?'CLOSED':'OPEN';
 const actual=await g.exposure(p);
 const step=Number(await g.step(p));
 if(quantity>0&&remaining>0&&remaining<step&&!unresolved)state='DUST';
 if(Math.abs(actual-remaining)>Math.max(1e-9,step/2)){
  state='RECONCILING';await freeze(p.user_id,`${p.symbol}: exchange exposure differs from owned fills (${actual}/${remaining}); manual/external trade requires review`);
 }
 if(fills.some(f=>f.fee_usdt===null))await freeze(p.user_id,'Commission conversion missing; net PnL is incomplete');
 await transaction(sql=>sql.run('UPDATE managed_positions SET entry_price=?,quantity=?,remaining_qty=?,state=?,closed_at=? WHERE id=? AND user_id=?',[p.entry_price,quantity,remaining,state,['CLOSED','DUST'].includes(state)?Date.now():null,p.id,p.user_id]));
 p.state=state;
 if(['CLOSED','REJECTED','DUST'].includes(state)){
  for(const i of await intents(p))if(i.kind!=='MARKET'&&!terminal.has(i.state)&&i.state!=='PREPARED'){await cancelOwned(p,i,g);}
 }
 return p;
}
async function cancelOwned(p:Position,i:Intent,g:Gateway){
 await g.cancel(p,i);
 const confirmed=await syncIntent(p,i,g);
 const status=String(confirmed?.status||confirmed?.algoStatus||confirmed?.listOrderStatus);
 if(!terminal.has(status))throw new Error('Cancellation not confirmed');
}
export async function ensureProtection(p:Position,g:Gateway){
 if(p.remaining_qty<=0)return;
 const current=await intents(p);
 const active=current.find(i=>i.kind!=='MARKET'&&!terminal.has(i.state)&&i.state!=='PREPARED');
 if(active){
  const r=await syncIntent(p,active,g);
  const state=String(r?.status||r?.algoStatus||r?.listOrderStatus);
  if(['NEW','WORKING','EXECUTING'].includes(state)){
   // Dedicated One-way symbol uses native closePosition, so partial exits cannot undersize/oversize the stop.
   if(!r)throw new Error('Protection response missing');
   const qty=Number(r.quantity||r.origQty||active.quantity);
   const trigger=Number(r.triggerPrice||r.stopPrice||active.price);
   if((r.closePosition===true||r.closePosition==='true'||qty+1e-9>=grid(p.remaining_qty,await g.step(p)))&&Math.abs(trigger-p.stop_price)<=p.stop_price*1e-8)return;
  }
  throw new Error('Existing protection is not confirmed active; reconcile before replacement');
 }
 const quantity=grid(p.remaining_qty,await g.step(p));
 if(quantity<=0)throw new Error('Residual quantity below exchange grid');
 const i=await prepare(p,'PROTECT_INITIAL',p.market==='futures'?'STOP':'OCO',quantity,p.stop_price);
 if(i.state==='REJECTED')throw new Error('Protective order rejected');
 await execute(p,i,g);
 const r=await syncIntent(p,i,g);
 if(!['NEW','WORKING','EXECUTING'].includes(String(r?.status||r?.algoStatus||r?.listOrderStatus)))throw new Error('Stop not confirmed active');
 await notify(p.user_id,`${p.symbol}: ${quantity} quantity protected at ${p.stop_price}.`);
}
export async function exitPosition(p:Position,g:Gateway,purpose:string,fraction=1){
 p=await reconcilePosition(p,g);
 if(['CLOSED','DUST','RECONCILING'].includes(p.state))return;
 const pending=(await intents(p)).find(i=>i.kind==='MARKET'&&i.purpose!=='ENTRY'&&!terminal.has(i.state));
 if(pending){if(pending.state==='PREPARED')await execute(p,pending,g);return reconcilePosition(p,g)}
 const closed=p.quantity-p.remaining_qty;
 const quantity=grid(Math.min(p.remaining_qty,Math.max(0,p.quantity*fraction-closed)),await g.step(p));
 if(quantity<=0)return; // Dust is visible; never mark nonexistent fills as complete.
 if(p.market==='spot'){
  // OCO reserves base assets. Cancel only our list, then reconcile a possible concurrent fill.
  for(const i of await intents(p))if(i.kind==='OCO'&&!terminal.has(i.state)&&i.state!=='PREPARED')await cancelOwned(p,i,g);
  p=await reconcilePosition(p,g);if(p.state!=='OPEN')return;
 }
 const q=grid(Math.min(quantity,p.remaining_qty,await g.exposure(p)),await g.step(p));
 if(q<=0)return;
 const previous=(await intents(p)).filter(i=>i.purpose.startsWith(purpose+':'));
 if(previous.length>=3){await freeze(p.user_id,'Exit retry limit reached; exchange review required');throw new Error('Exit retry limit reached')}
 const i=await prepare(p,`${purpose}:${previous.length}`,'MARKET',q);
 await execute(p,i,g);return reconcilePosition(p,g);
}
export async function monitorPosition(p:Position,g:Gateway,currentPrice:number){
 p=await reconcilePosition(p,g);
 if(p.state==='RECONCILING'||p.state==='CLOSED'||p.state==='REJECTED'||p.state==='DUST')return;
 const unfinished=(await intents(p)).find(i=>i.kind==='MARKET'&&i.state==='PREPARED'&&i.purpose!=='ENTRY');
 if(unfinished){await execute(p,unfinished,g);return reconcilePosition(p,g)}
 if(p.remaining_qty<=0)return;
 try{await ensureProtection(p,g);
    if(p.market==='futures'&&g.liquidation){const liquidation=await g.liquidation(p);if(liquidation>0&&(p.side==='LONG'?p.stop_price-liquidation:liquidation-p.stop_price)<p.entry_price*0.02)throw new Error('Actual liquidation buffer below 2%');}
   }catch(e){
  await freeze(p.user_id,`${p.symbol}: exchange protection unconfirmed`);
  // Unknown protective order may already be executing: reconcile first, then reduce-only exit.
  if(p.market==='futures')await exitPosition(p,g,'EMERGENCY');
  throw e;
 }
 const long=p.side==='LONG';
 const hit=(v:number)=>long?currentPrice>=v:currentPrice<=v;
 if((long&&currentPrice<=p.stop_price)||(!long&&currentPrice>=p.stop_price))return exitPosition(p,g,'STOP');
 if(p.market==='spot')return; // Both exits reside on exchange; only reconciliation is local.
 const reached=hit(p.tp3)?3:hit(p.tp2)?2:hit(p.tp1)?1:0;
 if(reached>p.stage){
  const updated=await exitPosition(p,g,`TP${reached}`,[0,0.5,0.75,1][reached]);
  if(updated){
   const actualClosed=updated.quantity-updated.remaining_qty;
   const targetClosed=grid(updated.quantity*[0,0.5,0.75,1][reached],await g.step(updated));
   if(actualClosed+1e-8>=targetClosed)await transaction(sql=>sql.run('UPDATE managed_positions SET stage=?,high_water=? WHERE id=? AND user_id=?',[reached,currentPrice,p.id,p.user_id]));
  }
  return;
 }
 // Original exchange stop is NEVER canceled for local breakeven/trailing adjustments.
 if(p.stage>=1){
  const high=long?Math.max(p.high_water,currentPrice):Math.min(p.high_water||currentPrice,currentPrice);
  const trail=p.stage>=2?(long?Math.max(p.entry_price,high*0.985):Math.min(p.entry_price,high*1.015)):p.entry_price;
  await transaction(sql=>sql.run('UPDATE managed_positions SET high_water=? WHERE id=? AND user_id=?',[high,p.id,p.user_id]));
  if(long?currentPrice<=trail:currentPrice>=trail)return exitPosition(p,g,'TRAILING');
 }
}
export async function assertEntryEnabled(userId:number,market:Market){
 assertTradingUser(userId);
 const heartbeat=await read(sql=>sql.get<{value:string}>("SELECT value FROM system_settings WHERE key='worker_heartbeat'"));
 if(!heartbeatHealthy(heartbeat?.value))throw new Error('Worker heartbeat missing/stale; new entries disabled');
 if(process.env.TRADING_ENABLED!=='true')throw new Error('New entries disabled (TRADING_ENABLED)');
 if(process.env.TRADING_ACCOUNT_IS_DEDICATED!=='true')throw new Error('Dedicated trading account required');
 const u=await read(sql=>sql.get<UserTradingRow>('SELECT * FROM users WHERE id=?',[userId]));
 if(!u||!u.is_active||u.subscription_status!=='active')throw new Error('Account paused or subscription inactive');
 if(u.subscription_expires_at&&Date.parse(u.subscription_expires_at.replace(' ','T')+(/Z$/.test(u.subscription_expires_at)?'':'Z'))<=Date.now())throw new Error('Subscription expired');
 if(market==='futures'){const r=await read(sql=>sql.get('SELECT is_futures_active FROM futures_risk_configs WHERE user_id=?',[userId]));if(!r?.is_futures_active)throw new Error('Futures paused')}
 const risk=await read(sql=>sql.get<Pick<RiskRow,'frozen_reason'>>('SELECT frozen_reason FROM risk_state WHERE user_id=?',[userId]));if(risk?.frozen_reason)throw new Error(risk.frozen_reason);
 const registry=await read(sql=>sql.get('SELECT uid FROM account_keys WHERE user_id=? AND market=?',[userId,market]));if(!registry)throw new Error('API keys must be re-verified in settings');
 // Old rows cannot be reinterpreted as verified fills. Explicit reconciliation is required.
 const legacy=await read(sql=>sql.get("SELECT id FROM futures_positions WHERE user_id=? AND status='OPEN' LIMIT 1",[userId]));
 if(legacy)throw new Error('Legacy open futures position requires exchange reconciliation before new entries');
}
export async function reserve(input:Omit<Position,'id'|'state'|'entry_price'|'quantity'|'remaining_qty'|'stage'|'high_water'|'created_at'>,maxPositions:number,equity:number):Promise<Position>{
 await assertEntryEnabled(input.user_id,input.market);
 return transaction(async sql=>{
  const rows=await sql.all<Position>("SELECT * FROM managed_positions WHERE user_id=? AND state NOT IN ('CLOSED','REJECTED','DUST')",[input.user_id]);
  if(rows.filter(p=>p.market===input.market).length>=maxPositions)throw new Error('Position limit reached');
  if(rows.some(p=>p.symbol===input.symbol))throw new Error('Symbol already reserved across spot/futures');
  if(rows.reduce((s,p)=>s+p.risk_reserved,0)+input.risk_reserved>equity*0.02)throw new Error('Portfolio stress risk exceeds 2%');
  if(rows.reduce((s,p)=>s+p.notional_reserved,0)+input.notional_reserved>equity)throw new Error('Gross notional exceeds equity');
  const p:Position={...input,id:randomUUID(),state:'OPENING',entry_price:0,quantity:0,remaining_qty:0,stage:0,high_water:0,created_at:Date.now()};
  await sql.run(`INSERT INTO managed_positions(id,user_id,market,symbol,side,state,stop_price,tp1,tp2,tp3,leverage,risk_reserved,notional_reserved,created_at,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[p.id,p.user_id,p.market,p.symbol,p.side,p.state,p.stop_price,p.tp1,p.tp2,p.tp3,p.leverage,p.risk_reserved,p.notional_reserved,p.created_at,p.reason]);return p;
 });
}
export async function openPosition(p:Position,quantity:number,g:Gateway){
 const i=await prepare(p,'ENTRY','MARKET',quantity);
 try {
  await execute(p,i,g);p=await reconcilePosition(p,g);
  if(p.state==='RECONCILING')return p;
  if(p.remaining_qty>0){
   try{validatePlan(p.side,p.entry_price,p.stop_price,[p.tp1,p.tp2,p.tp3]);await ensureProtection(p,g);
    if(p.market==='futures'&&g.liquidation){const liquidation=await g.liquidation(p);if(liquidation>0&&(p.side==='LONG'?p.stop_price-liquidation:liquidation-p.stop_price)<p.entry_price*0.02)throw new Error('Actual liquidation buffer below 2%');}
   }
   catch(e){await freeze(p.user_id,`${p.symbol}: entry filled but risk/protection check failed`);await exitPosition(p,g,'EMERGENCY');throw e}
  }
  return p;
 }catch(e){await transaction(sql=>sql.run('UPDATE managed_positions SET error=? WHERE id=? AND user_id=?',[e instanceof Error?errorMessage(e):'Execution failure',p.id,p.user_id]));throw e}
}
export async function accountOwner<T>(userId:number,fn:()=>Promise<T>){return withOwner(`account:${userId}`,fn)}
