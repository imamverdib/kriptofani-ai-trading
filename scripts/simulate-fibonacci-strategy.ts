import { evaluateFibonacciSetup } from '../src/lib/quant-fibonacci';
import { grid, sizePosition, grossPnl } from '../src/lib/trading-math';

interface RawKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface SymbolRules {
  step: string;
  minQty: number;
  maxQty: number;
  tick: string;
  minNotional: number;
}

interface ActiveTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  maxTime: number;
  entryPrice: number;
  stopPrice: number;
  targets: number[];
  qty: number;
  remainingQty: number;
  stage: number;
  highWaterMark: number;
  realizedPnl: number;
  fees: number;
  exitReason?: string;
  exitTime?: number;
}

async function fetchKlinesRange(symbol: string, interval: string, start: number, end: number): Promise<RawKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${end}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error for ${symbol}: ${res.statusText}`);
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

async function fetchExchangeRules(symbols: string[]): Promise<Map<string, SymbolRules>> {
  const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  const res = await fetch(url);
  const data = await res.json() as { symbols: { symbol: string; filters: { filterType: string; stepSize: string; minQty: string; maxQty: string; tickSize: string; notional: string; minNotional: string }[] }[] };
  const map = new Map<string, SymbolRules>();
  for (const sym of symbols) {
    const info = data.symbols.find(s => s.symbol === sym);
    if (!info) continue;
    const lot = info.filters.find(f => f.filterType === 'LOT_SIZE')!;
    const tick = info.filters.find(f => f.filterType === 'PRICE_FILTER')!;
    const notional = info.filters.find(f => ['MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType))!;
    map.set(sym, {
      step: lot.stepSize,
      minQty: Number(lot.minQty),
      maxQty: Number(lot.maxQty),
      tick: tick.tickSize,
      minNotional: Number(notional.notional || notional.minNotional)
    });
  }
  return map;
}

export async function runFibonacciSimulation(
  periodName: string,
  startTime: number,
  endTime: number,
  symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT']
) {
  const rules = await fetchExchangeRules(symbols);
  const warmupStart1h = startTime - 15 * 24 * 3600 * 1000;
  const warmupStart4h = startTime - 50 * 24 * 3600 * 1000;

  const klines1h = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of symbols) {
    klines1h.set(sym, await fetchKlinesRange(sym, '1h', warmupStart1h, endTime));
    klines4h.set(sym, await fetchKlinesRange(sym, '4h', warmupStart4h, endTime));
  }

  const btcBars1h = klines1h.get(symbols[0])!;
  const startIndex = btcBars1h.findIndex(b => b.openTime >= startTime);
  const endIndex = btcBars1h.findIndex(b => b.openTime >= endTime);
  const testBarsCount = (endIndex !== -1 ? endIndex : btcBars1h.length) - startIndex;

  let balance = 100.0;
  let peakEquity = 100.0;
  let maxDrawdown = 0.0;
  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const lastTradeTimePerSymbol: Record<string, number> = {};

  const FEE_RATE = 0.0005; // 0.05%
  const SLIPPAGE = 0.0005; // 0.05%
  const LEVERAGE = 2;
  const ALLOCATION_PCT = 20;
  const RISK_PCT = 0.5;
  const MAX_POSITIONS = 3;
  const MAX_HOLDING_HOURS = 36;

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number; fees: number }> = {};
  symbols.forEach(s => {
    symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0, fees: 0 };
    lastTradeTimePerSymbol[s] = 0;
  });

  for (let barIdx = startIndex; barIdx < startIndex + testBarsCount; barIdx++) {
    // 1. Manage Active Positions using current bar price events
    for (let i = activeTrades.length - 1; i >= 0; i--) {
      const t = activeTrades[i];
      const curBar = klines1h.get(t.symbol)![barIdx];
      const isLong = t.side === 'LONG';
      t.highWaterMark = isLong ? Math.max(t.highWaterMark, curBar.high) : Math.min(t.highWaterMark, curBar.low);

      // Stop-loss
      const stopHit = isLong ? curBar.low <= t.stopPrice : curBar.high >= t.stopPrice;
      if (stopHit) {
        const exitPrice = t.stopPrice * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = t.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty = 0;
        t.exitReason = t.stage > 0 ? 'BREAKEVEN_STOP' : 'STOP_LOSS';
        t.exitTime = curBar.openTime;
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }

      // TP1: 50% partial exit at Previous High/Low (Move Stop to Breakeven)
      if (t.stage < 1 && (isLong ? curBar.high >= t.targets[0] : curBar.low <= t.targets[0])) {
        const step = rules.get(t.symbol)!.step;
        const tpQty = grid(t.qty * 0.5, step);
        const closeQty = Math.min(t.remainingQty, tpQty);
        const exitPrice = t.targets[0] * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = closeQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, closeQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty -= closeQty;
        t.stage = 1;
        t.stopPrice = t.entryPrice; // Move to Breakeven
        balance += pnl;
      }

      // TP2: 25% partial exit at -0.272 Fibonacci Extension (Activate 1.5% Trailing Stop)
      if (t.stage === 1 && (isLong ? curBar.high >= t.targets[1] : curBar.low <= t.targets[1])) {
        const step = rules.get(t.symbol)!.step;
        const tpQty = grid(t.qty * 0.25, step);
        const closeQty = Math.min(t.remainingQty, tpQty);
        const exitPrice = t.targets[1] * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = closeQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, closeQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty -= closeQty;
        t.stage = 2;
        t.stopPrice = isLong ? t.highWaterMark * 0.985 : t.highWaterMark * 1.015;
        balance += pnl;
      }

      // Trailing Stop Exit (Stage >= 2)
      if (t.stage >= 2) {
        t.stopPrice = isLong ? Math.max(t.stopPrice, t.highWaterMark * 0.985) : Math.min(t.stopPrice, t.highWaterMark * 1.015);
        const trailHit = isLong ? curBar.low <= t.stopPrice : curBar.high >= t.stopPrice;
        if (trailHit && t.remainingQty > 0) {
          const exitPrice = t.stopPrice * (1 - (isLong ? 1 : -1) * SLIPPAGE);
          const fee = t.remainingQty * exitPrice * FEE_RATE;
          const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
          t.realizedPnl += pnl;
          t.fees += fee;
          t.remainingQty = 0;
          t.exitReason = 'TRAILING_STOP';
          t.exitTime = curBar.openTime;
          balance += pnl;
          closedTrades.push(t);
          activeTrades.splice(i, 1);
          continue;
        }
      }

      // Horizon Exit (36 hours)
      if (t.remainingQty > 0 && curBar.openTime >= t.maxTime) {
        const exitPrice = curBar.close * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = t.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty = 0;
        t.exitReason = 'HORIZON_EXIT';
        t.exitTime = curBar.openTime;
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }
    }

    const currentEquity = balance + activeTrades.reduce((s, p) => s + grossPnl(p.side, p.entryPrice, klines1h.get(p.symbol)![barIdx].close, p.remainingQty), 0);
    peakEquity = Math.max(peakEquity, currentEquity);
    maxDrawdown = Math.max(maxDrawdown, (peakEquity - currentEquity) / peakEquity);

    // 2. Scan for Fibonacci Golden Pocket Setups
    for (const sym of symbols) {
      if (activeTrades.length >= MAX_POSITIONS) break;
      if (activeTrades.some(t => t.symbol === sym)) continue;

      const symBars1h = klines1h.get(sym)!;
      // Strictly past closed history (slice 0 to barIdx, no lookahead!)
      const historyBars = symBars1h.slice(0, barIdx);
      if (historyBars.length < 36) continue;

      const symBars4h = klines4h.get(sym)!;
      const history4h = symBars4h.filter(b => b.closeTime <= historyBars.at(-1)!.closeTime);
      if (history4h.length < 50) continue;

      // Cooldown: at least 12 hours between trades on same coin
      if (symBars1h[barIdx].openTime - lastTradeTimePerSymbol[sym] < 12 * 3600 * 1000) continue;

      const setup = evaluateFibonacciSetup(historyBars, history4h, 0.02);
      if (!setup || !setup.valid) continue;

      const rule = rules.get(sym)!;
      const curBar = symBars1h[barIdx];
      const entryPrice = curBar.open * (1 + (setup.side === 'LONG' ? 1 : -1) * SLIPPAGE);
      const stopPrice = grid(setup.stopPrice, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp1 = grid(setup.tp1, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp2 = grid(setup.tp2, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp3 = grid(setup.tp3, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');

      try {
        const available = Math.max(0, currentEquity - activeTrades.reduce((s, p) => s + (p.remainingQty * p.entryPrice) / LEVERAGE, 0));
        const qty = sizePosition({
          equity: currentEquity,
          available,
          entry: entryPrice,
          stop: stopPrice,
          leverage: LEVERAGE,
          riskPct: RISK_PCT,
          allocationPct: ALLOCATION_PCT,
          feeRate: FEE_RATE,
          slippage: SLIPPAGE,
          step: rule.step
        });

        if (qty < rule.minQty || qty * entryPrice < rule.minNotional) continue;

        const entryFee = qty * entryPrice * FEE_RATE;
        balance -= entryFee;
        lastTradeTimePerSymbol[sym] = curBar.openTime;

        activeTrades.push({
          id: `${sym}-${barIdx}`,
          symbol: sym,
          side: setup.side,
          entryTime: curBar.openTime,
          maxTime: curBar.openTime + MAX_HOLDING_HOURS * 3600 * 1000,
          entryPrice,
          stopPrice,
          targets: [tp1, tp2, tp3],
          qty,
          remainingQty: qty,
          stage: 0,
          highWaterMark: entryPrice,
          realizedPnl: -entryFee,
          fees: entryFee
        });
      } catch {}
    }
  }

  // Close remaining active trades at test end
  for (const t of activeTrades) {
    const lastBar = klines1h.get(t.symbol)![startIndex + testBarsCount - 1];
    const isLong = t.side === 'LONG';
    const exitPrice = lastBar.close * (1 - (isLong ? 1 : -1) * SLIPPAGE);
    const fee = t.remainingQty * exitPrice * FEE_RATE;
    const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
    t.realizedPnl += pnl;
    t.fees += fee;
    t.remainingQty = 0;
    t.exitReason = 'TEST_END';
    balance += pnl;
    closedTrades.push(t);
  }

  for (const t of closedTrades) {
    symStats[t.symbol].trades++;
    if (t.realizedPnl > 0.01) symStats[t.symbol].wins++;
    else symStats[t.symbol].losses++;
    symStats[t.symbol].netPnl += t.realizedPnl;
    symStats[t.symbol].fees += t.fees;
  }

  const finalEquity = balance;
  const netProfit = finalEquity - 100.0;
  const totalTrades = closedTrades.length;
  const totalWins = closedTrades.filter(t => t.realizedPnl > 0.01).length;
  const totalLosses = closedTrades.filter(t => t.realizedPnl <= 0.01).length;
  const winRate = totalTrades ? (totalWins / totalTrades * 100).toFixed(1) : '0';
  const totalFees = closedTrades.reduce((acc, t) => acc + t.fees, 0);

  const grossProfit = closedTrades.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(closedTrades.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';

  console.log(`================================================================`);
  console.log(`  ${periodName.toUpperCase()} — FIBONAÇÇİ 0.618 GOLDEN POCKET NƏTİCƏLƏRİ`);
  console.log(`================================================================`);
  console.log(`  Başlanğıc Balans: 100.00 USDT`);
  console.log(`  Yekun Balans:     ${finalEquity.toFixed(2)} USDT`);
  console.log(`  Xalis Gəlir/Zərər: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} USDT (${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}%)`);
  console.log(`  Maksimal Çəkilmə: ${(maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Cəmi Əməliyyat:   ${totalTrades} (Qalib: ${totalWins} [${winRate}%] | Məğlub: ${totalLosses})`);
  console.log(`  Qazanc Faktoru (Profit Factor): ${profitFactor}`);
  console.log(`  Cəmi Komissiya:   ${totalFees.toFixed(3)} USDT`);

  const exits: Record<string, number> = {};
  closedTrades.forEach(t => exits[t.exitReason || 'UNKNOWN'] = (exits[t.exitReason || 'UNKNOWN'] || 0) + 1);
  console.log(`  Çıxış Növləri:`, exits);

  console.log(`\n  Koinlər üzrə:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | PnL: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)}$ | Komissiya: ${st.fees.toFixed(3)}$`);
  }
  console.log('');

  return { periodName, balance: finalEquity, netProfit, winRate, totalTrades, maxDrawdown: maxDrawdown * 100, profitFactor, totalFees };
}

async function main() {
  console.log('\n################################################################');
  console.log('  FIBONAÇÇİ GOLDEN POCKET + 1:3 ASİMMETRİK R:R SINAQLARI');
  console.log('################################################################\n');

  // Period 1: June 2026 (Choppy / Sideways month)
  const juneStart = new Date('2026-06-01T00:00:00Z').getTime();
  const juneEnd = new Date('2026-07-01T00:00:00Z').getTime();
  await runFibonacciSimulation('İyun 2026 (Tam Ay)', juneStart, juneEnd);

  // Period 2: July 2026 (Mixed / Volatile month)
  const julyStart = new Date('2026-07-01T00:00:00Z').getTime();
  const julyEnd = new Date('2026-08-01T00:00:00Z').getTime();
  await runFibonacciSimulation('İyul 2026 (Tam Ay)', julyStart, julyEnd);

  // Period 3: Recent 60 Days (Aug 6, 2026 - Oct 5, 2026)
  const sixtyStart = Date.now() - 60 * 24 * 3600 * 1000;
  const sixtyEnd = Date.now();
  await runFibonacciSimulation('Son 60 Gün (Avqust - Oktyabr)', sixtyStart, sixtyEnd);
}

main().catch(console.error);
