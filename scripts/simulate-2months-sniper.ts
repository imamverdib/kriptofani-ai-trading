import { rsi, sma } from 'technicalindicators';
import { computeQuantPlan, detectMarketRegime } from '../src/lib/quant-math';
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
  confidence?: number;
}

async function fetch60Days15m(symbol: string): Promise<RawKline[]> {
  let bars: (string | number)[][] = [];
  let endTime: number | undefined = undefined;

  for (let i = 0; i < 4; i++) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=1500${endTime ? `&endTime=${endTime}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch error for ${symbol} at page ${i}`);
    const data = await res.json() as (string | number)[][];
    if (!data.length) break;
    bars = [...data, ...bars];
    endTime = Number(data[0][0]) - 1;
  }

  const map = new Map<number, RawKline>();
  for (const k of bars) {
    const t = Number(k[0]);
    if (!map.has(t)) {
      map.set(t, {
        openTime: t,
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime: Number(k[6])
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.openTime - b.openTime);
}

async function fetch4h(symbol: string): Promise<RawKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch 4h error for ${symbol}`);
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

function runSimulation(
  title: string,
  symbols: string[],
  klines15m: Map<string, RawKline[]>,
  klines4h: Map<string, RawKline[]>,
  rules: Map<string, SymbolRules>,
  startIndex: number,
  testBarsCount: number,
  decideFn: (historyBars: RawKline[], history4h: RawKline[], lastTradeTime: number, curTime: number) => 'LONG' | 'SHORT' | null
) {
  let balance = 100.0;
  let highWaterMark = 100.0;
  let maxDrawdown = 0.0;
  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const lastTradeTimePerSymbol: Record<string, number> = {};

  const FEE_RATE = 0.0005; // 0.05%
  const SLIPPAGE = 0.0005; // 0.05%
  const LEVERAGE = 2; // User parameter
  const ALLOCATION_PCT = 20; // User parameter
  const RISK_PCT = 0.5; // User parameter
  const MAX_POSITIONS = 3;
  const HORIZON_BARS = 16; // 4 hours

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number }> = {};
  symbols.forEach(s => {
    symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0 };
    lastTradeTimePerSymbol[s] = 0;
  });

  for (let barIdx = startIndex; barIdx < startIndex + testBarsCount; barIdx++) {
    // 1. Manage Active Trades
    for (let i = activeTrades.length - 1; i >= 0; i--) {
      const t = activeTrades[i];
      const curBar = klines15m.get(t.symbol)![barIdx];
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
        t.exitReason = 'STOP_LOSS';
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }

      // TP1 (50%)
      if (t.stage < 1 && (isLong ? curBar.high >= t.targets[0] : curBar.low <= t.targets[0])) {
        const tpQty = grid(t.qty * 0.5, rules.get(t.symbol)!.step);
        const closeQty = Math.min(t.remainingQty, tpQty);
        const exitPrice = t.targets[0] * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = closeQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, closeQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty -= closeQty;
        t.stage = 1;
        t.stopPrice = t.entryPrice;
        balance += pnl;
      }

      // TP2 (25%)
      if (t.stage === 1 && (isLong ? curBar.high >= t.targets[1] : curBar.low <= t.targets[1])) {
        const tpQty = grid(t.qty * 0.25, rules.get(t.symbol)!.step);
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

      // Trailing stop
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
          balance += pnl;
          closedTrades.push(t);
          activeTrades.splice(i, 1);
          continue;
        }
      }

      // Horizon
      if (t.remainingQty > 0 && curBar.openTime >= t.maxTime) {
        const exitPrice = curBar.close * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = t.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty = 0;
        t.exitReason = 'HORIZON_EXIT';
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }
    }

    const currentEq = balance + activeTrades.reduce((s, p) => s + grossPnl(p.side, p.entryPrice, klines15m.get(p.symbol)![barIdx].close, p.remainingQty), 0);
    highWaterMark = Math.max(highWaterMark, currentEq);
    maxDrawdown = Math.max(maxDrawdown, (highWaterMark - currentEq) / highWaterMark);

    // 2. Scan for Entries
    for (const sym of symbols) {
      if (activeTrades.length >= MAX_POSITIONS) break;
      if (activeTrades.some(t => t.symbol === sym)) continue;

      const symBars = klines15m.get(sym)!;
      const historyBars = symBars.slice(0, barIdx);
      const symBars4h = klines4h.get(sym)!;
      const history4h = symBars4h.filter(b => b.closeTime <= historyBars.at(-1)!.closeTime);

      const action = decideFn(historyBars, history4h, lastTradeTimePerSymbol[sym], symBars[barIdx].openTime);
      if (!action) continue;

      const rule = rules.get(sym)!;
      const curBar = symBars[barIdx];
      const entryPrice = curBar.open * (1 + (action === 'LONG' ? 1 : -1) * SLIPPAGE);

      try {
        const plan = computeQuantPlan(action, entryPrice, historyBars.slice(-30));
        const stopPrice = grid(plan.stopLossPrice, rule.tick, action === 'LONG' ? 'ceil' : 'floor');
        const tp1 = grid(plan.takeProfit1, rule.tick, action === 'LONG' ? 'ceil' : 'floor');
        const tp2 = grid(plan.takeProfit2, rule.tick, action === 'LONG' ? 'ceil' : 'floor');
        const tp3 = grid(plan.takeProfit3, rule.tick, action === 'LONG' ? 'ceil' : 'floor');

        const available = Math.max(0, currentEq - activeTrades.reduce((s, p) => s + (p.remainingQty * p.entryPrice) / LEVERAGE, 0));
        const qty = sizePosition({
          equity: currentEq,
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
          side: action,
          entryTime: curBar.openTime,
          maxTime: curBar.openTime + HORIZON_BARS * 15 * 60 * 1000,
          entryPrice,
          stopPrice,
          targets: [tp1, tp2, tp3],
          qty,
          remainingQty: qty,
          stage: 0,
          highWaterMark: entryPrice,
          realizedPnl: -entryFee,
          fees: entryFee,
          confidence: 75
        });
      } catch {}
    }
  }

  // Close remaining active trades
  for (const t of activeTrades) {
    const lastBar = klines15m.get(t.symbol)![startIndex + testBarsCount - 1];
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
    if (t.realizedPnl > 0) symStats[t.symbol].wins++;
    else symStats[t.symbol].losses++;
    symStats[t.symbol].netPnl += t.realizedPnl;
  }

  const finalEquity = balance;
  const netProfit = finalEquity - 100.0;
  const totalTrades = closedTrades.length;
  const totalWins = closedTrades.filter(t => t.realizedPnl > 0).length;
  const totalLosses = closedTrades.filter(t => t.realizedPnl <= 0).length;
  const winRate = totalTrades ? (totalWins / totalTrades * 100).toFixed(1) : '0';
  const totalFees = closedTrades.reduce((acc, t) => acc + t.fees, 0);

  console.log(`================================================================`);
  console.log(`  ${title}`);
  console.log(`================================================================`);
  console.log(`  Başlanğıc Balans: 100.00 USDT`);
  console.log(`  Yekun Balans:     ${finalEquity.toFixed(2)} USDT`);
  console.log(`  Xalis Gəlir/Zərər: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} USDT (${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}%)`);
  console.log(`  Maksimal Çəkilmə: ${(maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Cəmi Əməliyyat:   ${totalTrades} (Qalib: ${totalWins} [${winRate}%] | Məğlub: ${totalLosses})`);
  console.log(`  Ödənilən Komissiya: ${totalFees.toFixed(3)} USDT`);

  const exits: Record<string, number> = {};
  closedTrades.forEach(t => exits[t.exitReason || 'UNKNOWN'] = (exits[t.exitReason || 'UNKNOWN'] || 0) + 1);
  console.log(`  Çıxış Növləri:`, exits);

  console.log(`\n  Koinlər Üzrə Performans:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | Xalis: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)} USDT`);
  }
  console.log(`\n`);
}

async function main() {
  const TARGET_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT'];
  console.log(`\n================================================================`);
  console.log(`  60-GÜNLÜK (2 AYLıQ) REAL BAZAR SİMULYASİYASI (Binance Futures)`);
  console.log(`  Hədəf Trend Koinləri: ${TARGET_SYMBOLS.join(', ')}`);
  console.log(`  Başlanğıc Balans: 100.00 USDT | Qaldıraq: 2x`);
  console.log(`  Allocation: 20% | Risk/Trade: 0.5% (Max 0.50$ itki)`);
  console.log(`================================================================\n`);

  console.log('1. Binance-dən 2 aylıq (60 günlük) real 15m və 4h şamlar yüklənir...');
  const rules = await fetchExchangeRules(TARGET_SYMBOLS);

  const klines15m = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of TARGET_SYMBOLS) {
    const bars15 = await fetch60Days15m(sym);
    const bars4 = await fetch4h(sym);
    klines15m.set(sym, bars15);
    klines4h.set(sym, bars4);
    console.log(`  ✓ ${sym.padEnd(8)}: ${bars15.length} ədəd 15m şam, ${bars4.length} ədəd 4h şam yükləndi`);
  }

  // Exact 60 days = 60 * 24 * 4 = 5760 bars
  const btcBars = klines15m.get('BTCUSDT')!;
  const testBarsCount = 5760;
  const startIndex = btcBars.length - testBarsCount;
  const startTime = btcBars[startIndex].openTime;
  const endTime = btcBars[btcBars.length - 1].closeTime;

  const startDateStr = new Date(startTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  const endDateStr = new Date(endTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  console.log(`\nTest Müddəti: ${startDateStr} — ${endDateStr} (Dəqiq 60 gün / 1,440 saat)\n`);

  // MODEL: Sniper Selective Pullback Engine with Cooldown & Trap Filter
  runSimulation(
    '2 AYLıQ SİSTEM: Seçilmiş Trend Koinləri (BTC, ETH, SOL, NEAR) + Sniper Qapıçısı',
    TARGET_SYMBOLS,
    klines15m,
    klines4h,
    rules,
    startIndex,
    testBarsCount,
    (historyBars, history4h, lastTradeTime, curTime) => {
      if (historyBars.length < 50 || history4h.length < 50) return null;

      // Cooldown: at least 4 hours (16 bars) between entries on the SAME symbol to avoid over-trading
      if (curTime - lastTradeTime < 4 * 3600 * 1000) return null;

      const closes = historyBars.map(b => b.close);
      const hc = history4h.map(b => b.close);

      const sma20 = sma({ values: hc, period: 20 }).at(-1)!;
      const sma50 = sma({ values: hc, period: 50 }).at(-1)!;
      const trend4h: 'LONG' | 'SHORT' | 'WAIT' = sma20 > sma50 ? 'LONG' : sma20 < sma50 ? 'SHORT' : 'WAIT';
      if (trend4h === 'WAIT') return null;

      const oscillator = rsi({ values: closes, period: 14 }).at(-1)!;
      const regimeInfo = detectMarketRegime(historyBars.slice(-40), 14);

      // Require decisive directional momentum (ADX >= 22)
      if (regimeInfo.regime === 'RANGING') return null;

      // False breakout wick filter:
      const lastBar = historyBars.at(-1)!;
      const spread = lastBar.high - lastBar.low;
      const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
      const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
      if (spread > 0 && (upperWick / spread > 0.55 || lowerWick / spread > 0.55)) return null;

      // Healthy pullback in 4H Trend direction:
      if (trend4h === 'LONG' && regimeInfo.trendDirection === 'BULLISH') {
        if (oscillator >= 38 && oscillator <= 52) return 'LONG';
      } else if (trend4h === 'SHORT' && regimeInfo.trendDirection === 'BEARISH') {
        if (oscillator >= 48 && oscillator <= 62) return 'SHORT';
      }

      return null;
    }
  );
}

main().catch(console.error);
