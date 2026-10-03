import type {FillRow} from '@/lib/trading-rows';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tradingReport } from '@/lib/reporting';
import { read } from '@/lib/trading-store';
export async function GET(){
 const s=await getSession();if(!s)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const r=await tradingReport(s.id,'spot');
  const fills=await read(sql=>sql.all<FillRow>('SELECT * FROM execution_fills WHERE user_id=? AND market=? ORDER BY time DESC LIMIT 10',[s.id,'spot']));
  return NextResponse.json({success:true,stats:{balance:r.stats.balance,openPositions:r.stats.openPositionCount,totalProfit:r.stats.totalPnl,todaysProfit:r.stats.todaysPnl,pnlComplete:r.stats.pnlComplete,balanceUpdatedAt:r.stats.balanceUpdatedAt},assets:r.openPositions.map(p=>({asset:p.symbol.slice(0,-4),amount:p.remaining_qty,valueUsd:p.currentPrice===null?null:p.currentPrice*p.remaining_qty})),recentTrades:fills.map(f=>({id:f.trade_id,symbol:f.symbol,action:f.side,price:f.price,amount:f.quantity,status:'FILLED',date:new Date(f.time).toISOString()})),warnings:r.warnings});
 }catch{return NextResponse.json({error:'Trading report unavailable'},{status:503})}
}
