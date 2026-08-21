import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await dbGet('SELECT id, username, telegram_username, telegram_chat_id, binance_api_key, futures_api_key, is_active, last_force_run, last_futures_force_run, role, subscription_status, subscription_expires_at, language FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

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
        telegram_chat_id: user.telegram_chat_id,
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
