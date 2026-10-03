import {errorMessage} from '@/lib/errors';
import { validateSettings } from '@/lib/trading-math';
import { initTradingStore } from '@/lib/trading-store';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await initTradingStore();
    let config = await dbGet('SELECT * FROM futures_risk_configs WHERE user_id = ?', [session.id]);
    if (!config) {
      await dbRun(
        'INSERT INTO futures_risk_configs (user_id) VALUES (?)',
        [session.id]
      );
      config = await dbGet('SELECT * FROM futures_risk_configs WHERE user_id = ?', [session.id]);
    }

    return NextResponse.json({ success: true, config });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await initTradingStore();
    let body;
    try { body = validateSettings(await req.json()); } catch(e) { return NextResponse.json({error: e instanceof Error ? errorMessage(e) : 'Invalid settings'}, {status:400}); }
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
      const clampedLeverage = Number(leverage);
      await dbRun('UPDATE futures_risk_configs SET leverage = ? WHERE user_id = ?', [clampedLeverage, session.id]);
    }
    if (isFuturesActive !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET is_futures_active = ? WHERE user_id = ?', [isFuturesActive ? 1 : 0, session.id]);
    }
    if (blacklistCoins !== undefined) {
      await dbRun('UPDATE futures_risk_configs SET blacklist_coins = ? WHERE user_id = ?', [blacklistCoins, session.id]);
    }
    if (autoCoinCount !== undefined) {
      const clampedCount = Number(autoCoinCount);
      await dbRun('UPDATE futures_risk_configs SET auto_coin_count = ? WHERE user_id = ?', [clampedCount, session.id]);
    }

    if (body.riskPerTradePct !== undefined) await dbRun('UPDATE futures_risk_configs SET risk_per_trade_pct=? WHERE user_id=?', [body.riskPerTradePct,session.id]);
    if (body.maxOpenPositions !== undefined) await dbRun('UPDATE futures_risk_configs SET max_open_positions=? WHERE user_id=?', [body.maxOpenPositions,session.id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
