import {heartbeatHealthy} from '@/lib/watchdog';
import { NextResponse } from 'next/server';
import { read } from '@/lib/trading-store';
export async function GET(){
 try{const row=await read(sql=>sql.get("SELECT value FROM system_settings WHERE key='worker_heartbeat'"));const healthy=heartbeatHealthy(row?.value);const backup=await read(sql=>sql.get<{value:string}>("SELECT value FROM system_settings WHERE key='backup_last_success'"));return NextResponse.json({web:true,worker:healthy,backupLastSuccessAt:Number(backup?.value)||null},{status:healthy?200:503})}
 catch{return NextResponse.json({web:true,worker:false},{status:503})}
}
