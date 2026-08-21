import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';
import { runFuturesAnalysis } from '@/lib/futures-engine';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (user.subscription_status !== 'active') {
      return NextResponse.json({ error: 'Aktiv abunəlik tələb olunur' }, { status: 403 });
    }

    const now = Date.now();
    const cooldownMs = 10 * 60 * 1000; // 10 minutes
    const timeSinceLastRun = now - (user.last_futures_force_run || 0);

    if (timeSinceLastRun < cooldownMs) {
      const remainingMs = cooldownMs - timeSinceLastRun;
      return NextResponse.json({ error: 'Cooldown active', remainingMs }, { status: 429 });
    }

    await dbRun('UPDATE users SET last_futures_force_run = ? WHERE id = ?', [now, session.id]);

    runFuturesAnalysis(session.id).catch(err => {
      console.error('Futures force run error:', err);
    });

    return NextResponse.json({ success: true, message: 'Futures analysis started' });
  } catch (err: any) {
    console.error('Futures force run error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
