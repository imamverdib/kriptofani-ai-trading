import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbAll } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const positions = await dbAll<any>(
      `SELECT fp.*, GROUP_CONCAT(
        json_object('tp_level', pf.tp_level, 'quantity', pf.quantity, 'exit_price', pf.exit_price, 'pnl', pf.pnl, 'created_at', pf.created_at)
       ) as partial_fills_json
       FROM futures_positions fp
       LEFT JOIN futures_partial_fills pf ON fp.id = pf.position_id
       WHERE fp.user_id = ?
       GROUP BY fp.id
       ORDER BY fp.created_at DESC
       LIMIT 100`,
      [session.id]
    );

    const trades = positions.map((p: any) => {
      let partialFills: any[] = [];
      if (p.partial_fills_json) {
        try {
          partialFills = p.partial_fills_json.split(',{').map((s: string, i: number) => {
            if (i > 0) s = '{' + s;
            try { return JSON.parse(s); } catch { return null; }
          }).filter(Boolean);
        } catch {
          partialFills = [];
        }
      }

      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entry_price,
        quantity: p.quantity,
        leverage: p.leverage,
        stopLoss: p.stop_loss_price,
        tp1: p.take_profit_1,
        tp2: p.take_profit_2,
        tp3: p.take_profit_3,
        tp1Filled: p.tp1_filled,
        tp2Filled: p.tp2_filled,
        tp3Filled: p.tp3_filled,
        status: p.status,
        totalPnl: p.total_pnl,
        trendDirection: p.trend_direction,
        entryReason: p.entry_reason,
        createdAt: p.created_at,
        closedAt: p.closed_at,
        partialFills,
      };
    });

    return NextResponse.json({ success: true, trades });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
