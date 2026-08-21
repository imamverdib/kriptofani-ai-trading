import { NextResponse } from 'next/server';
import { dbGet } from '@/lib/db';

export async function GET() {
  try {
    const ipRow: any = await dbGet("SELECT value FROM system_settings WHERE key = 'server_ip'");
    const walletRow: any = await dbGet("SELECT value FROM system_settings WHERE key = 'trc20_wallet_address'");
    
    return NextResponse.json({ 
      success: true, 
      server_ip: ipRow ? ipRow.value : '',
      trc20_wallet_address: walletRow ? walletRow.value : ''
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
