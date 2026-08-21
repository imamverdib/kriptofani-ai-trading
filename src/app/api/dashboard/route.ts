import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbAll } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

async function fetchBinanceTotalValue(apiKey: string, apiSecret: string): Promise<{totalValue: number, assets: any[]}> {
  const endpoint = 'https://api.binance.com/api/v3/account';
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}&recvWindow=10000`;
  const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
  
  const res = await fetch(`${endpoint}?${queryString}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  
  if (!res.ok) {
    throw new Error('Binance API xətası');
  }
  
  const data = await res.json();
  const balances = data.balances.filter((b: any) => parseFloat(b.free) + parseFloat(b.locked) > 0);
  
  let totalValue = 0;
  const assets: any[] = [];
  
  // Get all prices
  const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
  if (pricesRes.ok) {
    const pricesData = await pricesRes.json();
    const priceMap: Record<string, number> = {};
    pricesData.forEach((p: any) => { priceMap[p.symbol] = parseFloat(p.price); });
    
    for (const b of balances) {
      const amount = parseFloat(b.free) + parseFloat(b.locked);
      let valueUsd = 0;
      if (b.asset === 'USDT') {
        valueUsd = amount;
      } else {
        const symbol = `${b.asset}USDT`;
        if (priceMap[symbol]) {
          valueUsd = amount * priceMap[symbol];
        }
      }
      totalValue += valueUsd;
      assets.push({
        asset: b.asset,
        amount: amount,
        valueUsd: valueUsd
      });
    }
  }
  
  // Sort assets by value descending
  assets.sort((a, b) => b.valueUsd - a.valueUsd);
  
  return { totalValue, assets };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let balance = 0;
    let assets: any[] = [];
    if (user.binance_api_key && user.binance_api_secret) {
      try {
        const apiKey = decrypt(user.binance_api_key);
        const apiSecret = decrypt(user.binance_api_secret);
        const binanceData = await fetchBinanceTotalValue(apiKey, apiSecret);
        balance = binanceData.totalValue;
        assets = binanceData.assets;
      } catch (err) {
        console.error('Failed to fetch binance balance', err);
      }
    }

    // Fetch total trades/positions from DB
    const trades = await dbAll<any>('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC', [session.id]);
    
    let totalProfit = 0;
    let todaysProfit = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const t of trades) {
      if (t.profit) {
        totalProfit += t.profit;
        const tradeDate = new Date(t.created_at).getTime();
        if (tradeDate >= startOfToday) {
          todaysProfit += t.profit;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        balance: balance,
        openPositions: trades.filter(t => t.action === 'BUY' && t.status === 'EXECUTED').length, 
        totalProfit: totalProfit,
        todaysProfit: todaysProfit
      },
      assets: assets,
      recentTrades: trades.slice(0, 5).map(t => ({
        id: t.id,
        symbol: t.symbol,
        action: t.action,
        price: t.price,
        amount: t.amount,
        status: t.status,
        date: t.created_at
      }))
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
