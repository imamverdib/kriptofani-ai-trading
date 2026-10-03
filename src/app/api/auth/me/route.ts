import type {AppUser} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { read } from '@/lib/trading-store';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await dbGet<AppUser>('SELECT id, username, telegram_username, telegram_chat_id, binance_api_key, futures_api_key, is_active, last_force_run, last_futures_force_run, role, subscription_status, subscription_expires_at, language FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const telegramIdentity=await read(sql=>sql.get('SELECT telegram_id FROM telegram_identities WHERE user_id=?',[session.id]));
    let status = user.subscription_status;
    if (status === 'active' && user.subscription_expires_at) {
      const expiry = new Date(user.subscription_expires_at).getTime();
      if (Date.now() > expiry) {
        status = 'expired';
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        telegram_username: user.telegram_username,
        telegram_chat_id: telegramIdentity?.telegram_id || null,
        has_binance_keys: !!user.binance_api_key,
        futures_api_key: !!user.futures_api_key,
        is_active: user.is_active,
        last_force_run: user.last_force_run || 0,
        last_futures_force_run: user.last_futures_force_run || 0,
        role: user.role,
        subscription_status: status,
        subscription_expires_at: user.subscription_expires_at,
        language: user.language || 'az'
      }
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
