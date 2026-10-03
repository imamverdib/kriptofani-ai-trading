import type {AppUser,Setting} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await dbGet<AppUser>("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await dbGet<AppUser>("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (body.server_ip !== undefined) {
      const existing = await dbGet<Setting>("SELECT * FROM system_settings WHERE key = 'server_ip'");
      if (existing) {
        await dbRun("UPDATE system_settings SET value = ? WHERE key = 'server_ip'", [body.server_ip]);
      } else {
        await dbRun("INSERT INTO system_settings (key, value) VALUES ('server_ip', ?)", [body.server_ip]);
      }
    }

    if (body.trc20_wallet_address !== undefined) {
      const existing = await dbGet<Setting>("SELECT * FROM system_settings WHERE key = 'trc20_wallet_address'");
      if (existing) {
        await dbRun("UPDATE system_settings SET value = ? WHERE key = 'trc20_wallet_address'", [body.trc20_wallet_address]);
      } else {
        await dbRun("INSERT INTO system_settings (key, value) VALUES ('trc20_wallet_address', ?)", [body.trc20_wallet_address]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
