import {reconcileCapital,type Inventory} from './capital-reconciliation';
import {errorMessage} from '@/lib/errors';
import {walletTransfers} from './wallet-flows';
import type {RiskRow,UserTradingRow,RiskConfigRow} from './trading-rows';
import type {SpotAccount,FuturesAccount,ExchangePosition,Ticker,Bracket,Cashflow,Income,Commission} from './exchange-types';
import { equityRisk } from './risk-policy';
import { createHash, randomUUID } from 'node:crypto';
import { rsi, sma } from 'technicalindicators';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { decrypt } from './encryption';
import { read, transaction, type Market } from './trading-store';
import { exchange, exchangeInfo, klines, price, depthQuote, ExchangeError, type Credentials } from './exchange-client';
import { accountOwner, assertEntryEnabled, freeze, gateway, monitorPosition, positions, reserve, openPosition } from './execution';
import { computeQuantPlan } from './quant-math';
import { grid, normalizeSymbols, positive, sizePosition, validatePlan, utcTime } from './trading-math';
import { evaluateWithJev, isTypeSafeConfigured } from './typesafe';

export async function credentials(userId:number,market:Market):Promise<Credentials>{
 const u=await read(sql=>sql.get<UserTradingRow>('SELECT * FROM users WHERE id=?',[userId]));if(!u)throw new Error('Unknown user');
 const prefix=market==='spot'?'binance':'futures';
 const key=decrypt(u[`${prefix}_api_key`],`${userId}:${market}:key`),secret=decrypt(u[`${prefix}_api_secret`],`${userId}:${market}:secret`);
 if(!key||!secret)throw new Error('Trading credentials unavailable');
 const r=await read(sql=>sql.get('SELECT fingerprint FROM account_keys WHERE user_id=? AND market=?',[userId,market]));
 if(r&&r.fingerprint!==createHash('sha256').update(key).digest('hex'))throw new Error('Credential identity mismatch');
 return {key,secret};
}
export async function accountSnapshot(userId:number){
 const keys=await read(sql=>sql.all<{market:Market;uid:string}>('SELECT market,uid FROM account_keys WHERE user_id=?',[userId]));
 if(!keys.length)throw new Error('Verify exchange account in settings');
 if(new Set(keys.map(k=>k.uid)).size!==1)throw new Error('Spot/futures account identity differs');
 if(keys.some(k=>k.market==='futures')&&!keys.some(k=>k.market==='spot'))throw new Error('Register the same account Spot API to include both wallets in equity');
 const inventory:Inventory={};
 let equity=0;const available:Partial<Record<Market,number>>={};
 for(const row of keys){
  const m=row.market as Market,c=await credentials(userId,m);
  if(m==='futures'){
   const a=await exchange<FuturesAccount>(m,'/fapi/v2/account',{},c,'GET',{priority:true});
   if(a.multiAssetsMargin)throw new Error('Multi-assets margin is not supported');
   const owned=await positions(userId,'futures');
   if(a.positions.some(p=>Number(p.positionAmt)!==0&&!owned.some(o=>o.symbol===p.symbol)))throw new Error('Unmanaged futures exposure requires operator reconciliation');
   const value=Number(a.totalMarginBalance);if(!Number.isFinite(value)||value<0)throw new Error('Invalid futures equity');
   const wallet=Number(a.totalWalletBalance);if(!Number.isFinite(wallet))throw new Error('Futures wallet balance unavailable');inventory.USDT=(inventory.USDT||0)+wallet;
   equity+=value;available[m]=Number(a.availableBalance);
   await syncIncome(userId,c);
  }else{
   const a=await exchange<SpotAccount>(m,'/api/v3/account',{},c,'GET',{priority:true});
   for(const b of a.balances){const qty=Number(b.free)+Number(b.locked);if(!Number.isFinite(qty)||qty<0)throw new Error('Invalid spot inventory');if(qty<=0)continue;inventory[b.asset]=(inventory[b.asset]||0)+qty;
    if(b.asset==='USDT'){equity+=qty;available.spot=Number(b.free)}
    else {equity+=qty*await price('spot',`${b.asset}USDT`)}
   }
  }
 }
 positive(equity,'account equity');
 const uidSet=new Set<string>();
 for(const row of keys){if(uidSet.has(row.uid))continue;uidSet.add(row.uid);await syncExternalFlows(userId,row.uid,await credentials(userId,row.market),keys.some(k=>k.market==='futures'));}
 await reconcileCapital(userId,inventory);
 const flows=await read(sql=>sql.get('SELECT COALESCE(SUM(amount),0) total FROM external_flows WHERE user_id=?',[userId]));
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 const risk=await transaction(async sql=>{
  const old=await sql.get<RiskRow>('SELECT * FROM risk_state WHERE user_id=?',[userId]);
  const result=equityRisk(old?.day?{highWater:old.high_water,dayStart:old.day_start,day:old.day,flowTotal:old.flow_total}:undefined,equity,Number(flows?.total??0),day);
  const reason=old?.frozen_reason||result.reason;
  await sql.run(`INSERT INTO risk_state(user_id,high_water,day_start,day,equity,frozen_reason,updated_at,flow_total) VALUES (?,?,?,?,?,?,?,?)
   ON CONFLICT(user_id) DO UPDATE SET high_water=excluded.high_water,day_start=excluded.day_start,day=excluded.day,equity=excluded.equity,frozen_reason=excluded.frozen_reason,updated_at=excluded.updated_at,flow_total=excluded.flow_total`,
   [userId,result.highWater,result.dayStart,day,equity,reason,now,Number(flows?.total??0)]);
  await sql.run('INSERT OR REPLACE INTO equity_snapshots VALUES (?,?,?)',[userId,now,equity]);return {equity,highWater:result.highWater,drawdown:result.drawdown,frozenReason:reason};
 });
 return {...risk,available};
}
async function syncExternalFlows(userId:number,uid:string,c:Credentials,includeFutures:boolean){
 const now=Date.now();const cursor=await read(sql=>sql.get<{start_time:number;synced_until:number}>('SELECT * FROM flow_cursors WHERE uid=? AND user_id=?',[uid,userId]));
 if(!cursor){await transaction(sql=>sql.run('INSERT INTO flow_cursors VALUES (?,?,?,?)',[uid,userId,now,now]));return;}
 // Overlap the complete last 90 days: deposits can become credited after their insert timestamp.
 const startTime=Math.max(cursor.start_time,now-89*86400000);
 if(now-cursor.synced_until>89*86400000)throw new Error('External flow history requires reviewed backfill');
 for(const kind of ['deposit','withdraw']){
  for(let offset=0;offset<100000;offset+=1000){
   const rows=await exchange<Cashflow[]>('spot',`/sapi/v1/capital/${kind}/hisrec`,{startTime,endTime:now,limit:1000,offset,status:kind==='deposit'?1:6},c,'GET',{priority:true,weight:10});
   await transaction(async sql=>{for(const r of rows){
    if(r.coin!=='USDT')throw new Error('Non-USDT external cashflow requires historical valuation');
    const time=kind==='deposit'?Number(r.insertTime):utcTime(r.applyTime);const value=positive(r.amount,'cashflow');
    const fee=kind==='withdraw'?Number(r.transactionFee||0):0;
    if(!Number.isFinite(time)||!Number.isFinite(fee))throw new Error('Invalid cashflow record');
    // Network fees remain a conservative equity expense; never add an ambiguous fee to credited flow.
    const ref=String(r.id||r.txId||'');if(!ref)throw new Error('Cashflow identity missing');
    await sql.run('INSERT OR IGNORE INTO external_flows VALUES (?,?,?,?,?,?)',[uid,userId,kind,ref,time,kind==='deposit'?value:-value]);
   }});
   if(rows.length<1000)break;if(offset===99000)throw new Error('Cashflow pagination incomplete');
  }
 }
 const transfers=await walletTransfers(c,startTime,now,includeFutures);
 await transaction(async sql=>{for(const row of transfers)await sql.run('INSERT OR IGNORE INTO external_flows VALUES (?,?,?,?,?,?)',[uid,userId,'wallet-transfer',row.ref,row.time,row.amount])});
 await transaction(sql=>sql.run('UPDATE flow_cursors SET synced_until=? WHERE uid=? AND user_id=?',[now,uid,userId]));
}
async function syncIncome(userId:number,c:Credentials){
 const start=await read(sql=>sql.get<{start:number|null}>('SELECT MIN(created_at) start FROM managed_positions WHERE user_id=? AND market=?',[userId,'futures']));if(!start?.start)return;
 const latest=await read(sql=>sql.get<{time:number|null}>('SELECT MAX(time) time FROM income_ledger WHERE user_id=?',[userId]));
 let from=latest?.time?Math.max(start.start,latest.time-60000):start.start;
 const now=Date.now();
 for(let window=0;from<=now&&window<60;window++){
  const end=Math.min(now,from+6*86400000);
  for(let page=1;page<=100;page++){
   const rows=await exchange<Income[]>('futures','/fapi/v1/income',{startTime:from,endTime:end,limit:1000,page},c,'GET',{priority:true,weight:30});
   await transaction(async sql=>{for(const r of rows)await sql.run('INSERT OR IGNORE INTO income_ledger VALUES (?,?,?,?,?,?)',[userId,r.incomeType,String(r.tranId),r.asset,Number(r.income),Number(r.time)])});
   if(rows.length<1000)break;if(page===100)throw new Error('Income history pagination incomplete');
  }
  from=end+1;
 }
 if(from<=now)throw new Error('Income history requires explicit backfill');
}
async function targets(m:Market,config:{target_coins:string;blacklist_coins?:string;auto_coin_count?:number}){
 if(config.target_coins!=='AUTO')return normalizeSymbols(config.target_coins).split(',');
 const rows=await exchange<Ticker[]>(m,m==='spot'?'/api/v3/ticker/24hr':'/fapi/v1/ticker/24hr',{},undefined,'GET',{cacheMs:60000,weight:80});
 const blacklist=new Set(normalizeSymbols(config.blacklist_coins||'',false).split(','));
 return rows.filter(r=>/^[A-Z0-9]+USDT$/.test(r.symbol)&&!blacklist.has(r.symbol)&&!['USDCUSDT','FDUSDUSDT','TUSDUSDT'].includes(r.symbol)&&Number(r.quoteVolume)>50000000&&Math.abs(Number(r.priceChangePercent))<15)
  .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume)).slice(0,config.auto_coin_count||5).map(r=>r.symbol);
}
async function decide(m:Market,symbol:string,userId:number){
 const bars=await klines(m,symbol,m==='futures'?'15m':'1h',100),higher=await klines(m,symbol,'4h',210);
 if(bars.length<60||higher.length<200)throw new Error('Not enough closed candles');
 const closes=bars.map(b=>b.close),hc=higher.map(b=>b.close);
 const a=sma({values:hc,period:20}).at(-1)!,b=sma({values:hc,period:50}).at(-1)!;
 const trend=a>b?'LONG':a<b?'SHORT':'WAIT';
 const oscillator=rsi({values:closes,period:14}).at(-1)!;
 const snapshot={symbol,market:m,asOf:Date.now(),barClose:bars.at(-1)!.closeTime,trend,rsi:oscillator,bars,higher};
 let action='WAIT',confidence=0,provider='none';
 // AI proposes direction only. Sizing, stop placement and validation are deterministic.
 if(isTypeSafeConfigured()){
  const d=await evaluateWithJev(JSON.stringify(snapshot));if(!d)throw new Error('Primary model unavailable; fallback disabled');
  if(!d.isHighRisk){action=d.action;confidence=d.confidence}provider=process.env.TYPESAFE_MODEL||'jev-latest';
 }else if(process.env.GEMINI_API_KEY){
  const model=new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({model:process.env.GEMINI_MODEL||'gemini-2.5-flash',generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:{type:SchemaType.OBJECT,properties:{action:{type:SchemaType.STRING,format:'enum',enum:['LONG','SHORT','WAIT']},confidence:{type:SchemaType.INTEGER}},required:['action','confidence']}}});
  const result=await model.generateContent(`Choose LONG, SHORT or WAIT using only this closed-candle snapshot. Confidence is model confidence, not probability of profit. Only trade aligned with the higher timeframe. ${JSON.stringify(snapshot)}`,{timeout:10000});
  const d=JSON.parse(result.response.text());action=d.action;confidence=d.confidence;provider=process.env.GEMINI_MODEL||'gemini-2.5-flash';
 }else throw new Error('Decision provider not configured');
 if(!['LONG','SHORT','WAIT'].includes(action)||!Number.isInteger(confidence)||confidence<0||confidence>100)throw new Error('Invalid model response');
 if(action!==trend||(action==='LONG'&&oscillator>65)||(action==='SHORT'&&oscillator<35)||(m==='spot'&&action==='SHORT'))action='WAIT';
 const id=randomUUID();
 await transaction(sql=>sql.run('INSERT INTO decision_snapshots VALUES (?,?,?,?,?,?,?,?)',[id,userId,m,symbol,`risk-v2:${provider}`,Date.now(),JSON.stringify(snapshot),JSON.stringify({action,confidence})]));
 return {id,action,confidence,bars,time:snapshot.asOf,reference:bars.at(-1)!.close};
}
async function feeRate(m:Market,symbol:string,c:Credentials){
 if(m==='futures'){const d=await exchange(m,'/fapi/v1/commissionRate',{symbol},c);const rate=Number(d.takerCommissionRate);if(!Number.isFinite(rate)||rate<0)throw new Error('Invalid taker rate');return rate}
 const d=await exchange<Commission>(m,'/api/v3/account/commission',{symbol},c);
 const rate=(['standardCommission','taxCommission','specialCommission'] as const).reduce((s,k)=>s+Number(d[k]?.taker||0)+Math.max(Number(d[k]?.buyer||0),Number(d[k]?.seller||0)),0);
 if(!Number.isFinite(rate)||rate<0)throw new Error('Invalid spot commission');return rate;
}
async function futuresPreflight(symbol:string,c:Credentials,leverage:number,notional:number,entry:number,stop:number){
 const mode=await exchange('futures','/fapi/v1/positionSide/dual',{},c);
 if(mode.dualSidePosition)throw new Error('Use a dedicated One-way futures account');
 const positions=await exchange<ExchangePosition[]>('futures','/fapi/v2/positionRisk',{},c);
 // New entry may not merge with external/manual positions on this symbol.
 if(positions.some(p=>p.symbol===symbol&&Number(p.positionAmt)!==0))throw new Error('Exchange symbol already has exposure');
 const brackets=await exchange<{brackets:Bracket[]}[]>('futures','/fapi/v1/leverageBracket',{symbol},c);
 const bracket=brackets[0]?.brackets?.find(b=>notional>=Number(b.notionalFloor)&&notional<Number(b.notionalCap));
 if(!bracket||leverage>Number(bracket.initialLeverage))throw new Error('Notional/leverage bracket mismatch');
 const mmr=Number(bracket.maintMarginRatio),liquidationDistance=1/leverage-mmr;
 if(Math.abs(entry-stop)/entry+0.02>=liquidationDistance)throw new Error('Stop too close to estimated liquidation boundary');
 try{await exchange('futures','/fapi/v1/marginType',{symbol,marginType:'ISOLATED'},c,'POST')}catch(e){if(!(e instanceof ExchangeError&&e.code===-4046))throw e}
 const l=await exchange('futures','/fapi/v1/leverage',{symbol,leverage},c,'POST');if(Number(l.leverage)!==leverage)throw new Error('Leverage not confirmed');
 const verified=await exchange<ExchangePosition[]>('futures','/fapi/v2/positionRisk',{symbol},c);
 if(!verified.every(p=>p.marginType==='isolated'||p.isolated===true||p.isolated==='true'))throw new Error('ISOLATED margin not confirmed');
}
export async function runAnalysis(m:Market,targetUserId?:number){
 const users=await read(sql=>sql.all<{id:number}>('SELECT id FROM users WHERE '+(targetUserId?'id=?':'is_active=1'),targetUserId?[targetUserId]:[]));
 for(const u of users){
  try{
   await accountOwner(u.id,()=>monitorAccountUnlocked(u.id));await assertEntryEnabled(u.id,m);
   const config=await read(sql=>sql.get<RiskConfigRow>(`SELECT * FROM ${m==='spot'?'risk_configs':'futures_risk_configs'} WHERE user_id=?`,[u.id]));
   if(!config||config.max_risk_pct<=0||config.risk_per_trade_pct<=0)continue;
   const c=await credentials(u.id,m);
   for(const symbol of await targets(m,config)){
    try{
     if((await positions(u.id)).some(p=>p.symbol===symbol))continue;
     await assertEntryEnabled(u.id,m);
     const d=await decide(m,symbol,u.id);if(d.action==='WAIT'||d.confidence<config.min_confidence)continue;
     await accountOwner(u.id,async()=>{
     await monitorAccountUnlocked(u.id);await assertEntryEnabled(u.id,m);
     if(Date.now()-d.time>15000)throw new Error('Decision expired');
     const info=await exchangeInfo(m,symbol),lot=info.filters.find(f=>f.filterType==='LOT_SIZE'),marketLot=info.filters.find(f=>f.filterType==='MARKET_LOT_SIZE'),tick=info.filters.find(f=>f.filterType==='PRICE_FILTER');
     if(!lot||!tick)throw new Error('Required symbol filters missing');
     const quote=await depthQuote(m,symbol,d.action==='LONG'?'BUY':'SELL',0);
     if(Math.abs(quote.price-d.reference)/d.reference>0.005)throw new Error('Entry drift exceeds 0.5%');
     const plan=computeQuantPlan(d.action as 'LONG'|'SHORT',quote.price,d.bars);
     const stop=grid(plan.stopLossPrice,tick.tickSize,d.action==='LONG'?'ceil':'floor');
     const tp=[plan.takeProfit1,plan.takeProfit2,plan.takeProfit3].map(v=>grid(v,tick.tickSize,d.action==='LONG'?'ceil':'floor'));
     validatePlan(d.action,quote.price,stop,tp);
     const account=await accountSnapshot(u.id);await assertEntryEnabled(u.id,m);
     const leverage=m==='spot'?1:config.leverage;
     if(!Number.isInteger(leverage)||leverage<1||leverage>5)throw new Error('Leverage must be 1–5 after risk migration');
     const fee=await feeRate(m,symbol,c);
     const q=sizePosition({equity:account.equity,available:account.available[m]||0,entry:quote.price,stop,leverage,riskPct:Math.min(config.risk_per_trade_pct,2),allocationPct:Math.min(config.max_risk_pct,20),feeRate:fee,slippage:0.005,step:lot.stepSize});
     for(const filter of [lot,...(marketLot?[marketLot]:[])])if(q<Number(filter.minQty)||q>Number(filter.maxQty)||Number(filter.stepSize)>0&&Math.abs(grid(q,filter.stepSize)-q)>1e-10)throw new Error('Quantity outside symbol filters');
     const min=info.filters.find(f=>['MIN_NOTIONAL','NOTIONAL'].includes(f.filterType));
     if(!min||q*quote.price<Number(min.minNotional||min.notional)||min.maxNotional&&q*quote.price>Number(min.maxNotional))throw new Error('Notional outside symbol filters');
     const depth=await depthQuote(m,symbol,d.action==='LONG'?'BUY':'SELL',q);
     if(Math.abs(depth.price-quote.price)/quote.price>0.001)throw new Error('Price changed during preflight');
     if(m==='futures')await futuresPreflight(symbol,c,leverage,q*quote.price,quote.price,stop);
     else {
      const account=await exchange<SpotAccount>('spot','/api/v3/account',{},c);const b=account.balances.find(b=>b.asset===symbol.slice(0,-4));
      if(b&&Number(b.free)+Number(b.locked)>=Number(lot.minQty))throw new Error('Existing/manual spot inventory cannot be adopted');
     }
     // Check again after slow preflight. No stale AI plan may become a live order.
     if(Date.now()-d.time>30000)throw new Error('Preflight exceeded signal lifetime');
     const latest=await depthQuote(m,symbol,d.action==='LONG'?'BUY':'SELL',q);
     validatePlan(d.action,latest.price,stop,tp);
     if(Math.abs(latest.price-quote.price)/quote.price>0.001)throw new Error('Entry moved during preflight');
     const minute=await klines(m,symbol,'1m',2);
     const capacity=(minute.at(-1)?.volume||0)*latest.price*0.01;
     if(!Number.isFinite(capacity)||capacity<=0)throw new Error('Participation capacity unavailable');
     await transaction(async sql=>{
      const used=await sql.get<{n:number}>('SELECT COALESCE(SUM(notional),0) n FROM liquidity_reservations WHERE market=? AND symbol=? AND time>?',[m,symbol,Date.now()-60000]);
      if((used?.n??0)+q*latest.price>capacity)throw new Error('Shared symbol participation exceeds 1% of last closed minute volume');
      await sql.run('INSERT INTO liquidity_reservations VALUES (?,?,?,?,?)',[d.id,m,symbol,Date.now(),q*latest.price]);
     });
     const p=await reserve({user_id:u.id,market:m,symbol,side:d.action as 'LONG'|'SHORT',stop_price:stop,tp1:tp[0],tp2:tp[1],tp3:tp[2],leverage,risk_reserved:q*(Math.abs(latest.price-stop)+latest.price*(2*fee+0.005)),notional_reserved:q*latest.price,reason:`snapshot:${d.id}`},config.max_open_positions,account.equity);
     await openPosition(p,q,gateway(c));
     });
    }catch(e){console.error(`[analysis:${u.id}:${symbol}]`,e instanceof Error?errorMessage(e):'failure')}
   }
  }catch(e){console.error(`[analysis:${u.id}]`,e instanceof Error?errorMessage(e):'failure');throw e}
 }
}
export async function monitorAccountUnlocked(userId:number){
 for(const p of await positions(userId)){
  try{await monitorPosition(p,gateway(await credentials(userId,p.market)),await price(p.market,p.symbol))}
  catch(e){await freeze(userId,`${p.symbol}: ${e instanceof Error?errorMessage(e):'reconciliation failed'}`)}
 }
 // Existing legacy positions remain visible, but are never silently sold/adopted by a new strategy.
}
export async function monitorAll(targetUserId?:number){
 const rows=await read(sql=>sql.all<{user_id:number}>('SELECT DISTINCT user_id FROM account_keys'+(targetUserId?' WHERE user_id=?':''),targetUserId?[targetUserId]:[]));
 for(const u of rows)await accountOwner(u.user_id,async()=>{await monitorAccountUnlocked(u.user_id);const risk=await read(sql=>sql.get<{updated_at:number}>('SELECT updated_at FROM risk_state WHERE user_id=?',[u.user_id]));if(!risk||Date.now()-risk.updated_at>60000){try{await accountSnapshot(u.user_id)}catch(e){await freeze(u.user_id,e instanceof Error?errorMessage(e):'Account reconciliation failed')}}});
}
