import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';
import { runTradingEngine } from '@/lib/engine';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.subscription_status !== 'active') {
      return NextResponse.json({ error: 'Aktiv abunəlik tələb olunur' }, { status: 403 });
    }

    const now = Date.now();
    const cooldownMs = 15 * 60 * 1000; // 15 minutes
    const timeSinceLastRun = now - (user.last_force_run || 0);

    if (timeSinceLastRun < cooldownMs) {
      const remainingMs = cooldownMs - timeSinceLastRun;
      return NextResponse.json({ 
        error: 'Cooldown active', 
        remainingMs 
      }, { status: 429 });
    }

    // Update the DB immediately to prevent double-clicks
    await dbRun('UPDATE users SET last_force_run = ? WHERE id = ?', [now, session.id]);

    // Run the engine specifically for this user without blocking the response
    // (We start it asynchronously so the frontend gets a quick response)
    runTradingEngine(session.id).catch(err => {
      console.error('Force run engine error:', err);
    });

    return NextResponse.json({ success: true, message: 'Trading engine started' });

  } catch (err: any) {
    console.error('Force run error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
