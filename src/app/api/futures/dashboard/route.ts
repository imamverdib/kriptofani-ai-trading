import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tradingReport } from '@/lib/reporting';
export async function GET(){
 const s=await getSession();if(!s)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const r=await tradingReport(s.id,'futures');return NextResponse.json({success:true,stats:r.stats,openPositions:r.openPositions,recentClosed:r.recentClosed,warnings:r.warnings})}
 catch{return NextResponse.json({error:'Trading report unavailable'},{status:503})}
}
