import type {Setting} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { dbGet } from '@/lib/db';

export async function GET() {
  try {
    const ipRow = await dbGet<Setting>("SELECT value FROM system_settings WHERE key = 'server_ip'");
    const walletRow = await dbGet<Setting>("SELECT value FROM system_settings WHERE key = 'trc20_wallet_address'");
    
    return NextResponse.json({ 
      success: true, 
      server_ip: ipRow ? ipRow.value : '',
      trc20_wallet_address: walletRow ? walletRow.value : ''
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
