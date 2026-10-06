import { rsi, sma, bollingerbands, atr } from 'technicalindicators';
import { grossPnl } from '../src/lib/trading-math';

interface RawKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

async function fetchKlines(symbol: string, interval: string, start: number, end: number): Promise<RawKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${end}&limit=1000`;
  const res = await fetch(url);
  const data = await res.json() as (string | number)[][];
  return data.map(k => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6])
  }));
}

// Model A: Donchian 20-period Breakout with Trailing Stop (Classic Trend Following)
function testDonchian(klines: RawKline[]) {
  let balance = 100.0;
  let trades = 0;
  let wins = 0;
  let pos: { side: 'LONG' | 'SHORT'; entry: number; stop: number; qty: number } | null = null;
  const feeRate = 0.0005;

  for (let i = 30; i < klines.length; i++) {
    const bar = klines[i];
    const prev20 = klines.slice(i - 20, i);
    const highest = Math.max(...prev20.map(b => b.high));
    const lowest = Math.min(...prev20.map(b => b.low));
    const mid = (highest + lowest) / 2;

    if (pos) {
      const isLong = pos.side === 'LONG';
      const stopHit = isLong ? bar.low <= pos.stop : bar.high >= pos.stop;
      // Also exit if crosses mid line
      const exitCross = isLong ? bar.close < mid : bar.close > mid;

      if (stopHit || exitCross) {
        const exitPrice = stopHit ? pos.stop : bar.close;
        const fee = pos.qty * exitPrice * feeRate;
        const pnl = grossPnl(pos.side, pos.entry, exitPrice, pos.qty) - fee;
        balance += pnl;
        trades++;
        if (pnl > 0) wins++;
        pos = null;
      } else {
        // Trail stop
        if (isLong) pos.stop = Math.max(pos.stop, mid);
        else pos.stop = Math.min(pos.stop, mid);
      }
    }

    if (!pos) {
      if (bar.close > highest) {
        // Long breakout
        const stop = mid;
        const riskDist = bar.close - stop;
        if (riskDist > 0) {
          const qty = (100 * 0.005) / riskDist; // $0.50 risk
          if (qty * bar.close <= 40) { // max 2x leverage on $20 margin
            const fee = qty * bar.close * feeRate;
            balance -= fee;
            pos = { side: 'LONG', entry: bar.close, stop, qty };
          }
        }
      } else if (bar.close < lowest) {
        // Short breakout
        const stop = mid;
        const riskDist = stop - bar.close;
        if (riskDist > 0) {
          const qty = (100 * 0.005) / riskDist;
          if (qty * bar.close <= 40) {
            const fee = qty * bar.close * feeRate;
            balance -= fee;
            pos = { side: 'SHORT', entry: bar.close, stop, qty };
          }
        }
      }
    }
  }

  return { balance, trades, wins, winRate: trades ? (wins / trades * 100).toFixed(1) : '0' };
}

// Model B: Extreme Mean Reversion (RSI < 25 / > 75 on 1H with tight Bollinger Band bounce)
function testMeanReversion(klines: RawKline[]) {
  let balance = 100.0;
  let trades = 0;
  let wins = 0;
  let pos: { side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number; qty: number } | null = null;
  const feeRate = 0.0005;

  const closes = klines.map(b => b.close);
  const rsiVals = rsi({ values: closes, period: 14 });
  const bbVals = bollingerbands({ values: closes, period: 20, stdDev: 2 });

  for (let i = 30; i < klines.length; i++) {
    const bar = klines[i];
    const r = rsiVals[i - 14];
    const bb = bbVals[i - 20];
    if (!r || !bb) continue;

    if (pos) {
      const isLong = pos.side === 'LONG';
      const stopHit = isLong ? bar.low <= pos.stop : bar.high >= pos.stop;
      const targetHit = isLong ? bar.high >= pos.target : bar.low <= pos.target;

      if (stopHit || targetHit) {
        const exitPrice = stopHit ? pos.stop : pos.target;
        const fee = pos.qty * exitPrice * feeRate;
        const pnl = grossPnl(pos.side, pos.entry, exitPrice, pos.qty) - fee;
        balance += pnl;
        trades++;
        if (pnl > 0) wins++;
        pos = null;
      }
    }

    if (!pos) {
      // Long: RSI < 25 and close <= lower band
      if (r < 25 && bar.close <= bb.lower) {
        const stop = bar.close * 0.985; // 1.5% stop
        const target = bb.middle; // exit at middle band
        const riskDist = bar.close - stop;
        const qty = (100 * 0.005) / riskDist; // $0.50 risk
        if (qty * bar.close <= 40) {
          const fee = qty * bar.close * feeRate;
          balance -= fee;
          pos = { side: 'LONG', entry: bar.close, stop, target, qty };
        }
      }
      // Short: RSI > 75 and close >= upper band
      else if (r > 75 && bar.close >= bb.upper) {
        const stop = bar.close * 1.015;
        const target = bb.middle;
        const riskDist = stop - bar.close;
        const qty = (100 * 0.005) / riskDist;
        if (qty * bar.close <= 40) {
          const fee = qty * bar.close * feeRate;
          balance -= fee;
          pos = { side: 'SHORT', entry: bar.close, stop, target, qty };
        }
      }
    }
  }

  return { balance, trades, wins, winRate: trades ? (wins / trades * 100).toFixed(1) : '0' };
}

// Model C: High R:R Asymmetric Trend Pullback (1:3 Risk Reward - Risk $0.50 to make $1.50)
function testAsymmetricTrend(klines: RawKline[]) {
  let balance = 100.0;
  let trades = 0;
  let wins = 0;
  let pos: { side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number; qty: number; maxBars: number } | null = null;
  const feeRate = 0.0005;

  const closes = klines.map(b => b.close);
  const sma50Vals = sma({ values: closes, period: 50 });
  const sma200Vals = sma({ values: closes, period: 100 });
  const rsiVals = rsi({ values: closes, period: 14 });

  for (let i = 100; i < klines.length; i++) {
    const bar = klines[i];
    const s50 = sma50Vals[i - 50];
    const s200 = sma200Vals[i - 100];
    const r = rsiVals[i - 14];
    if (!s50 || !s200 || !r) continue;

    if (pos) {
      pos.maxBars--;
      const isLong = pos.side === 'LONG';
      const stopHit = isLong ? bar.low <= pos.stop : bar.high >= pos.stop;
      const targetHit = isLong ? bar.high >= pos.target : bar.low <= pos.target;
      const timeExit = pos.maxBars <= 0;

      if (stopHit || targetHit || timeExit) {
        const exitPrice = stopHit ? pos.stop : targetHit ? pos.target : bar.close;
        const fee = pos.qty * exitPrice * feeRate;
        const pnl = grossPnl(pos.side, pos.entry, exitPrice, pos.qty) - fee;
        balance += pnl;
        trades++;
        if (pnl > 0) wins++;
        pos = null;
      }
    }

    if (!pos) {
      // Long trend: 50 > 100, RSI pulls back to 40-48
      if (s50 > s200 && r >= 38 && r <= 48) {
        const stop = bar.close * 0.988; // 1.2% stop
        const target = bar.close * (1 + 0.012 * 2.8); // 1:2.8 R:R (+3.36% gain)
        const riskDist = bar.close - stop;
        const qty = (100 * 0.005) / riskDist;
        if (qty * bar.close <= 40) {
          const fee = qty * bar.close * feeRate;
          balance -= fee;
          pos = { side: 'LONG', entry: bar.close, stop, target, qty, maxBars: 36 };
        }
      }
      // Short trend: 50 < 100, RSI pulls back to 52-62
      else if (s50 < s200 && r >= 52 && r <= 62) {
        const stop = bar.close * 1.012; // 1.2% stop
        const target = bar.close * (1 - 0.012 * 2.8); // 1:2.8 R:R
        const riskDist = stop - bar.close;
        const qty = (100 * 0.005) / riskDist;
        if (qty * bar.close <= 40) {
          const fee = qty * bar.close * feeRate;
          balance -= fee;
          pos = { side: 'SHORT', entry: bar.close, stop, target, qty, maxBars: 36 };
        }
      }
    }
  }

  return { balance, trades, wins, winRate: trades ? (wins / trades * 100).toFixed(1) : '0' };
}

async function main() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT'];

  // Test across 3 months: June 1, 2026 to August 1, 2026
  const start = new Date('2026-06-01T00:00:00Z').getTime();
  const end = new Date('2026-08-01T00:00:00Z').getTime();

  console.log(`\n=== REAL RESEARCH: 3 STRATEGIES TESTED ACROSS JUNE & JULY 2026 (61 DAYS) ===\n`);

  for (const sym of symbols) {
    const klines = await fetchKlines(sym, '1h', start, end);
    const donchian = testDonchian(klines);
    const meanRev = testMeanReversion(klines);
    const asym = testAsymmetricTrend(klines);

    console.log(`[${sym}]`);
    console.log(`  1. Donchian Breakout:  Balans: ${donchian.balance.toFixed(2)}$ | Əməliyyat: ${donchian.trades} | Win%: ${donchian.winRate}%`);
    console.log(`  2. Mean Reversion:     Balans: ${meanRev.balance.toFixed(2)}$ | Əməliyyat: ${meanRev.trades} | Win%: ${meanRev.winRate}%`);
    console.log(`  3. Asymmetric 1:3 R:R: Balans: ${asym.balance.toFixed(2)}$ | Əməliyyat: ${asym.trades} | Win%: ${asym.winRate}%`);
    console.log('');
  }
}

main().catch(console.error);
