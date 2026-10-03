import type {RiskRow} from './trading-rows';
import type {Position} from './execution';
import { read,type Market } from './trading-store';
import { price } from './exchange-client';
import { grossPnl } from './trading-math';
export async function tradingReport(userId:number,market:Market){
 const rows=await read(sql=>sql.all<Position & {total_pnl:number;missing_fees:number}>(`SELECT p.*,COALESCE(SUM(f.realized_pnl-COALESCE(f.fee_usdt,0)),0) AS total_pnl,
 SUM(CASE WHEN f.fee_usdt IS NULL AND f.trade_id IS NOT NULL THEN 1 ELSE 0 END) AS missing_fees
 FROM managed_positions p LEFT JOIN execution_fills f ON f.position_id=p.id AND f.user_id=p.user_id
 WHERE p.user_id=? AND p.market=? GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`,[userId,market]));
 const midnight=new Date().setUTCHours(0,0,0,0);
 const totals=await read(sql=>sql.get(`SELECT COALESCE(SUM(realized_pnl-COALESCE(fee_usdt,0)),0) total,
 COALESCE(SUM(CASE WHEN time>=? THEN realized_pnl-COALESCE(fee_usdt,0) ELSE 0 END),0) today,
 SUM(CASE WHEN fee_usdt IS NULL THEN 1 ELSE 0 END) missing FROM execution_fills WHERE user_id=? AND market=?`,[midnight,userId,market]));
 const funding=market==='futures'?await read(sql=>sql.get(`SELECT COALESCE(SUM(amount),0) total,COALESCE(SUM(CASE WHEN time>=? THEN amount ELSE 0 END),0) today FROM income_ledger WHERE user_id=? AND type='FUNDING_FEE' AND asset='USDT'`,[midnight,userId])):{total:0,today:0};
 const risk=await read(sql=>sql.get<RiskRow>('SELECT * FROM risk_state WHERE user_id=?',[userId]));
 const warnings:string[]=[];
 const health=await read(sql=>sql.get<{created_at:number;last_success:number|null;last_error:string|null}>('SELECT created_at,last_success,last_error FROM account_health WHERE user_id=?',[userId]));
 if(health&&(health.last_error||Date.now()-(health.last_success||health.created_at)>60000))warnings.push('Your account monitoring requires attention; check the latest risk alert.');
 const marks=await read(sql=>sql.get('SELECT COUNT(*) count FROM fee_valuations WHERE user_id=? AND market=?',[userId,market]));
 if(marks?.count)warnings.push('Non-USDT fees use documented historical market marks.');
 if(totals?.missing)warnings.push('Some commission assets require historical conversion; PnL is incomplete.');
 if(risk?.frozen_reason)warnings.push(risk.frozen_reason);
 if(process.env.TRADING_ENABLED!=='true')warnings.push('New live entries are disabled. Monitoring remains active.');
 const legacy=await read(sql=>sql.get(market==='futures'?"SELECT COUNT(*) count FROM futures_positions WHERE user_id=?":"SELECT COUNT(*) count FROM trades WHERE user_id=?",[userId]));
 if(legacy?.count)warnings.push('Legacy trades are preserved separately and excluded from verified PnL.');
 const openPositions=await Promise.all(rows.filter(p=>!['CLOSED','REJECTED','DUST'].includes(p.state)).map(async p=>{
  let currentPrice:number|null=null;try{currentPrice=await price(market,p.symbol)}catch{warnings.push(`${p.symbol}: live mark unavailable`)}
  return {...p,entry_reason:p.reason,trailing_stop_price:p.stage>=2?(p.side==='LONG'?Math.max(p.entry_price,p.high_water*0.985):Math.min(p.entry_price,p.high_water*1.015)):p.entry_price,status:p.state,stop_loss_price:p.stop_price,take_profit_1:p.tp1,take_profit_2:p.tp2,take_profit_3:p.tp3,tp1_filled:Number(p.stage>=1),tp2_filled:Number(p.stage>=2),tp3_filled:Number(p.stage>=3),trailing_active:Number(p.stage>=2),highest_price:p.high_water,lowest_price:p.high_water,currentPrice,unrealizedPnl:currentPrice===null?null:grossPnl(p.side,p.entry_price,currentPrice,p.remaining_qty),created_at:new Date(p.created_at).toISOString()};
 }));
 return {rows,openPositions,warnings:[...new Set(warnings)],risk,stats:{balance:risk?.equity??null,openPositionCount:openPositions.length,totalPnl:Number(totals?.total||0)+Number(funding?.total||0),todaysPnl:Number(totals?.today||0)+Number(funding?.today||0),pnlComplete:!totals?.missing,balanceUpdatedAt:risk?.updated_at||null},recentClosed:rows.filter(p=>['CLOSED','DUST'].includes(p.state)).slice(0,10).map(p=>({id:p.id,symbol:p.symbol,side:p.side,entryPrice:p.entry_price,leverage:p.leverage,totalPnl:p.total_pnl,createdAt:new Date(p.created_at).toISOString(),closedAt:p.closed_at?new Date(p.closed_at).toISOString():null}))};
}
