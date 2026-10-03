import type {FillRow} from '@/lib/trading-rows';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tradingReport } from '@/lib/reporting';
import { read } from '@/lib/trading-store';
export async function GET(){
 const s=await getSession();if(!s)return NextResponse.json({error:'Unauthorized'},{status:401});
 const r=await tradingReport(s.id,'futures');
 const fills=await read(sql=>sql.all<FillRow>('SELECT * FROM execution_fills WHERE user_id=? AND market=? ORDER BY time',[s.id,'futures']));
 return NextResponse.json({success:true,warnings:r.warnings,trades:r.rows.map(p=>({id:p.id,symbol:p.symbol,side:p.side,entryPrice:p.entry_price,quantity:p.quantity,leverage:p.leverage,stopLoss:p.stop_price,tp1:p.tp1,tp2:p.tp2,tp3:p.tp3,tp1Filled:p.stage>=1,tp2Filled:p.stage>=2,tp3Filled:p.stage>=3,status:p.state,totalPnl:p.total_pnl,entryReason:p.reason,createdAt:new Date(p.created_at).toISOString(),closedAt:p.closed_at?new Date(p.closed_at).toISOString():null,partialFills:fills.filter(f=>f.position_id===p.id).map(f=>({quantity:f.quantity,exit_price:f.price,pnl:f.realized_pnl-(f.fee_usdt||0),created_at:new Date(f.time).toISOString(),tp_level:0}))}))});
}
