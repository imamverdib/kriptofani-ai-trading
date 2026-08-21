import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbAll } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { getFuturesBalance, getFuturesPositions, getFuturesPrice } from '@/lib/binance-futures';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let balance = 0;
    let binancePositions: any[] = [];

    if (user.futures_api_key && user.futures_api_secret) {
      try {
        const apiKey = decrypt(user.futures_api_key);
        const apiSecret = decrypt(user.futures_api_secret);
        balance = await getFuturesBalance(apiKey, apiSecret);
        binancePositions = await getFuturesPositions(apiKey, apiSecret);
      } catch (err) {
        console.error('Failed to fetch futures data', err);
      }
    }

    // Get open positions from DB
    const openPositions = await dbAll<any>(
      `SELECT * FROM futures_positions WHERE user_id = ? AND status = 'OPEN' ORDER BY created_at DESC`,
      [session.id]
    );

    // Enrich with current price
    const enrichedPositions = await Promise.all(
      openPositions.map(async (pos: any) => {
        try {
          const currentPrice = await getFuturesPrice(pos.symbol);
          const isLong = pos.side === 'LONG';
          const unrealizedPnl = isLong
            ? (currentPrice - pos.entry_price) * pos.remaining_qty * pos.leverage
            : (pos.entry_price - currentPrice) * pos.remaining_qty * pos.leverage;
          return { ...pos, currentPrice, unrealizedPnl };
        } catch {
          return { ...pos, currentPrice: 0, unrealizedPnl: 0 };
        }
      })
    );

    // Get closed positions for PnL calculation
    const closedPositions = await dbAll<any>(
      `SELECT * FROM futures_positions WHERE user_id = ? AND status = 'CLOSED' ORDER BY closed_at DESC`,
      [session.id]
    );

    let totalPnl = 0;
    let todaysPnl = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const pos of closedPositions) {
      totalPnl += pos.total_pnl || 0;
      if (pos.closed_at && new Date(pos.closed_at).getTime() >= startOfToday) {
        todaysPnl += pos.total_pnl || 0;
      }
    }

    // Recent closed for table
    const recentClosed = closedPositions.slice(0, 10).map((p: any) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      entryPrice: p.entry_price,
      leverage: p.leverage,
      totalPnl: p.total_pnl,
      createdAt: p.created_at,
      closedAt: p.closed_at,
    }));

    return NextResponse.json({
      success: true,
      stats: {
        balance,
        openPositionCount: enrichedPositions.length,
        totalPnl,
        todaysPnl,
      },
      openPositions: enrichedPositions,
      recentClosed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
