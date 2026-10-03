import {assertLegacyArchivable} from '../src/lib/legacy-review';
import type {FillRow} from '../src/lib/trading-rows';
import type {ExchangePosition,ExchangeOrder} from '../src/lib/exchange-types';
import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const userId=Number(process.argv[2]),action=process.argv[3]||'inspect';
 if(!Number.isInteger(userId)||userId<=0||!['inspect','archive-flat-legacy','value-fees','reset-risk-when-flat'].includes(action))throw new Error('Usage: npm run trading:review -- USER_ID [inspect|archive-flat-legacy|value-fees|reset-risk-when-flat]');
 const {read,transaction}=await import('../src/lib/trading-store');
 const {accountOwner,positions}=await import('../src/lib/execution');
 const {credentials}=await import('../src/lib/trading-service');
 const {exchange}=await import('../src/lib/exchange-client');
 const result=await accountOwner(userId,async()=>{
  const user=await read(sql=>sql.get('SELECT id,username,futures_api_key,binance_api_key FROM users WHERE id=?',[userId]));if(!user)throw new Error('Unknown user');
  const managed=await positions(userId),legacy=await read(sql=>sql.all("SELECT id,symbol,side,remaining_qty,stop_loss_price FROM futures_positions WHERE user_id=? AND status='OPEN'",[userId]));
  const unknown=await read(sql=>sql.all("SELECT id,position_id,state FROM order_intents WHERE user_id=? AND state IN ('SUBMITTING','UNKNOWN')",[userId]));
  const missing=await read(sql=>sql.all<FillRow>('SELECT * FROM execution_fills WHERE user_id=? AND fee_usdt IS NULL',[userId]));
  let exchangePositions:ExchangePosition[]=[];
  if(user.futures_api_key)exchangePositions=(await exchange<ExchangePosition[]>('futures','/fapi/v2/positionRisk',{},await credentials(userId,'futures'),'GET',{priority:true})).filter(p=>Number(p.positionAmt)!==0);
  let regularOrderCount=0,algoOrderCount=0,spotOrderCount=0;
  if(['archive-flat-legacy','reset-risk-when-flat'].includes(action)){
   if(user.futures_api_key){const c=await credentials(userId,'futures');const [orders,algos]=await Promise.all([exchange<ExchangeOrder[]>('futures','/fapi/v1/openOrders',{},c),exchange<{orders:ExchangeOrder[]}|ExchangeOrder[]>('futures','/fapi/v1/openAlgoOrders',{},c)]);regularOrderCount=orders.length;algoOrderCount=Array.isArray(algos)?algos.length:algos.orders?.length; if(!Number.isInteger(algoOrderCount))throw new Error('Invalid algo order response');if(regularOrderCount||algoOrderCount)throw new Error('Open orders must be reviewed on exchange before archiving');}
   if(user.binance_api_key){const orders=await exchange<ExchangeOrder[]>('spot','/api/v3/openOrders',{},await credentials(userId,'spot'));spotOrderCount=orders.length;if(spotOrderCount)throw new Error('Spot open orders require review');}
  }
  if(action==='archive-flat-legacy'){
   assertLegacyArchivable({legacyCount:legacy.length,futuresVerified:!!user.futures_api_key,exchangePositionCount:exchangePositions.length,managedCount:managed.length,unresolvedCount:unknown.length,regularOrderCount,algoOrderCount,spotOrderCount});
   await transaction(sql=>sql.run("UPDATE futures_positions SET status='LEGACY_UNVERIFIED' WHERE user_id=? AND status='OPEN'",[userId]));
  }
  if(action==='value-fees'){
   for(const f of missing){
    if(!/^[A-Z0-9]+$/.test(f.commission_asset))throw new Error('Unsupported fee asset');
    let marks:{T:number;p:string;a:number}[]=[];
    for(const duration of [1000,10000,60000]){
     marks=await exchange<{T:number;p:string;a:number}[]>('spot','/api/v3/aggTrades',{symbol:`${f.commission_asset}USDT`,startTime:f.time-duration,endTime:f.time,limit:1000},undefined,'GET',{weight:20});
     if(marks.length&&marks.length<1000)break;
    }
    if(!marks.length||marks.length>=1000)throw new Error('Historical fee mark is ambiguous or unavailable');
    const mark=marks.at(-1)!;if(Number(mark.T)>f.time||f.time-Number(mark.T)>60000)throw new Error('Stale fee mark');
    const usd=f.commission*Number(mark.p);if(!Number.isFinite(usd)||usd<0)throw new Error('Invalid historical fee value');
    await transaction(async sql=>{
     await sql.run('UPDATE execution_fills SET fee_usdt=? WHERE user_id=? AND market=? AND symbol=? AND trade_id=? AND fee_usdt IS NULL',[usd,userId,f.market,f.symbol,f.trade_id]);
     await sql.run('INSERT INTO fee_valuations VALUES (?,?,?,?,?,?,?)',[userId,f.market,f.symbol,f.trade_id,Number(mark.p),Number(mark.T),String(mark.a)]);
    });
   }
  }
  if(action==='reset-risk-when-flat'){
   if(managed.length||legacy.length||unknown.length||missing.length||exchangePositions.length)throw new Error('Resolve positions, legacy records, UNKNOWN orders and unvalued fees before risk reset');
   // Explicit operator review: this action does not erase high-water marks or trade history.
   await transaction(sql=>sql.run('UPDATE risk_state SET frozen_reason=NULL WHERE user_id=?',[userId]));
  }
  console.log(JSON.stringify({userId,action,managed:managed.map(p=>({id:p.id,symbol:p.symbol,state:p.state,quantity:p.remaining_qty})),legacy,unknown,unvaluedFees:missing.length,exchangePositions:exchangePositions.map(p=>({symbol:p.symbol,quantity:p.positionAmt,liquidationPrice:p.liquidationPrice,marginType:p.marginType})),note:'No exchange orders are created/canceled by this tool. Fee conversions, if requested, are historical market marks, not USDT cash debits.'},null,2));
  return true;
 });
 if(!result)throw new Error('Account is busy');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Review failed');process.exitCode=1});
