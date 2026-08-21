import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let config = await dbGet('SELECT * FROM risk_configs WHERE user_id = ?', [session.id]);
    if (!config) {
      await dbRun('INSERT INTO risk_configs (user_id) VALUES (?)', [session.id]);
      config = await dbGet('SELECT * FROM risk_configs WHERE user_id = ?', [session.id]);
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

    if (body.language) {
      await dbRun('UPDATE users SET language = ? WHERE id = ?', [body.language, session.id]);
    }

    const { maxRiskPct, minConfidence, targetCoins } = body;
    
    // Check if config exists
    const existing = await dbGet('SELECT * FROM risk_configs WHERE user_id = ?', [session.id]);
    if (!existing) {
      await dbRun('INSERT INTO risk_configs (user_id) VALUES (?)', [session.id]);
    }

    if (maxRiskPct !== undefined) {
      await dbRun('UPDATE risk_configs SET max_risk_pct = ? WHERE user_id = ?', [maxRiskPct, session.id]);
    }
    if (minConfidence !== undefined) {
      await dbRun('UPDATE risk_configs SET min_confidence = ? WHERE user_id = ?', [minConfidence, session.id]);
    }
    if (targetCoins !== undefined) {
      await dbRun('UPDATE risk_configs SET target_coins = ? WHERE user_id = ?', [targetCoins, session.id]);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
