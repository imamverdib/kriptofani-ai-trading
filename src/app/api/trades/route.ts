import type {FillRow} from '@/lib/trading-rows';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { read } from '@/lib/trading-store';
export async function GET(){
 const s=await getSession();if(!s)return NextResponse.json({error:'Unauthorized'},{status:401});
 const fills=await read(sql=>sql.all<FillRow>('SELECT * FROM execution_fills WHERE user_id=? AND market=? ORDER BY time DESC LIMIT 500',[s.id,'spot']));
 return NextResponse.json({success:true,trades:fills.map(f=>({id:f.trade_id,symbol:f.symbol,action:f.side,price:f.price,amount:f.quantity,status:'FILLED',profit:f.realized_pnl-(f.fee_usdt||0),created_at:new Date(f.time).toISOString()}))});
}
