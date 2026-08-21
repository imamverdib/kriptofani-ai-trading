import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let config = await dbGet('SELECT * FROM futures_risk_configs WHERE user_id = ?', [session.id]);
    if (!config) {
      await dbRun(
        'INSERT INTO futures_risk_configs (user_id) VALUES (?)',
        [session.id]
      );
      config = await dbGet('SELECT * FROM futures_risk_configs WHERE user_id = ?', [session.id]);
    }

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { maxRiskPct, minConfidence, targetCoins, leverage, isFuturesActive, blacklistCoins, autoCoinCount } = body;

    // Ensure config exists
    const existing = await dbGet('SELECT * FROM futures_risk_configs WHERE user_id = ?', [session.id]);
    if (!existing) {
      await dbRun('INSERT INTO futures_risk_configs (user_id) VALUES (?)', [session.id]);
    }

    if (maxRiskPct !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET max_risk_pct = ? WHERE user_id = ?', [maxRiskPct, session.id]);
    }
    if (minConfidence !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET min_confidence = ? WHERE user_id = ?', [minConfidence, session.id]);
    }
    if (targetCoins !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET target_coins = ? WHERE user_id = ?', [targetCoins, session.id]);
    }
    if (leverage !== undefined) {
      const clampedLeverage = Math.max(1, Math.min(125, leverage));
      await dbRun('UPDATE futures_risk_configs SET leverage = ? WHERE user_id = ?', [clampedLeverage, session.id]);
    }
    if (isFuturesActive !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET is_futures_active = ? WHERE user_id = ?', [isFuturesActive ? 1 : 0, session.id]);
    }
    if (blacklistCoins !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET blacklist_coins = ? WHERE user_id = ?', [blacklistCoins, session.id]);
    }
    if (autoCoinCount !== undefined) {
      const clampedCount = Math.max(3, Math.min(15, autoCoinCount));
      await dbRun('UPDATE futures_risk_configs SET auto_coin_count = ? WHERE user_id = ?', [clampedCount, session.id]);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
