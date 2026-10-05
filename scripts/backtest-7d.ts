import { rsi, sma } from 'technicalindicators';
import { calculateATR, computeQuantPlan } from '../src/lib/quant-math';
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

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<RawKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
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

async function main() {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT', 'ZECUSDT', 'SANDUSDT', 'XRPUSDT'];
  console.log(`\n======================================================`);
  console.log(`  7-GÜNLÜK REAL BAZAR BACKTESTİ (Binance Futures)`);
  console.log(`  Hədəf Koinlər: ${SYMBOLS.join(', ')}`);
  console.log(`  Başlanğıc Kapitalı: 100 USDT | Leverage: 2x | Risk/Trade: 0.5%`);
  console.log(`  Komissiya: 0.05% Taker | Sürüşmə: 0.05%`);
  console.log(`======================================================\n`);

  console.log('1. Binance-dən 7 günlük tarixi şamlar və birja qaydaları yüklənir...');
  const rules = await fetchExchangeRules(SYMBOLS);

  // 7 days = 7 * 24 * 4 = 672 bars (15m). Fetch 900 bars to ensure warm-up indicators
  const klines15m = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of SYMBOLS) {
    const bars15 = await fetchKlines(sym, '15m', 900);
    const bars4h = await fetchKlines(sym, '4h', 150);
    klines15m.set(sym, bars15);
    klines4h.set(sym, bars4h);
    console.log(`  ✓ ${sym.padEnd(8)}: ${bars15.length} ədəd 15m şam, ${bars4h.length} ədəd 4h şam yükləndi`);
  }

  // Find common start time for the last 672 bars (exact 7 days)
  const btcBars = klines15m.get('BTCUSDT')!;
  const testBarsCount = 672; // 7 days
  const startIndex = btcBars.length - testBarsCount;
  const startTime = btcBars[startIndex].openTime;
  const endTime = btcBars[btcBars.length - 1].closeTime;

  const startDateStr = new Date(startTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  const endDateStr = new Date(endTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  console.log(`\nTest Müddəti: ${startDateStr} — ${endDateStr} (Dəqiq 7 gün / 168 saat)\n`);

  // Define strategies to test
  type Strategy = {
    name: string;
    description: string;
    decide: (sym: string, rsiVal: number, trend4h: 'LONG'|'SHORT'|'WAIT') => 'LONG' | 'SHORT' | null;
  };

  const strategies: Strategy[] = [
    {
      name: '1. Mean Reversion (RSI 35/65)',
      description: 'Aşırı Satış (RSI < 35) -> LONG, Aşırı Alış (RSI > 65) -> SHORT',
      decide: (_sym, rsiVal) => (rsiVal < 35 ? 'LONG' : rsiVal > 65 ? 'SHORT' : null)
    },
    {
      name: '2. Mean Reversion (RSI 40/60)',
      description: 'Orta Dönüş (RSI < 40) -> LONG, (RSI > 60) -> SHORT',
      decide: (_sym, rsiVal) => (rsiVal < 40 ? 'LONG' : rsiVal > 60 ? 'SHORT' : null)
    },
    {
      name: '3. Trend Pullback Confluence',
      description: '4H Trend LONG + RSI < 40 -> LONG; 4H Trend SHORT + RSI > 60 -> SHORT',
      decide: (_sym, rsiVal, trend4h) => {
        if (trend4h === 'LONG' && rsiVal < 40) return 'LONG';
        if (trend4h === 'SHORT' && rsiVal > 60) return 'SHORT';
        return null;
      }
    },
    {
      name: '4. Klassik Trend Davamiyyəti (Momentum)',
      description: '4H Trend LONG + RSI > 50 -> LONG; 4H Trend SHORT + RSI < 50 -> SHORT',
      decide: (_sym, rsiVal, trend4h) => {
        if (trend4h === 'LONG' && rsiVal > 50 && rsiVal <= 65) return 'LONG';
        if (trend4h === 'SHORT' && rsiVal < 50 && rsiVal >= 35) return 'SHORT';
        return null;
      }
    }
  ];

  for (const strat of strategies) {
    runStrategySimulation(strat, SYMBOLS, klines15m, klines4h, rules, startIndex, testBarsCount);
  }
}

function runStrategySimulation(
  strat: { name: string; description: string; decide: (sym: string, rsiVal: number, trend4h: 'LONG'|'SHORT'|'WAIT') => 'LONG'|'SHORT'|null },
  symbols: string[],
  klines15m: Map<string, RawKline[]>,
  klines4h: Map<string, RawKline[]>,
  rulesMap: Map<string, SymbolRules>,
  startIndex: number,
  testBarsCount: number
) {
  let balance = 100.0;
  let highWaterMark = 100.0;
  let maxDrawdown = 0.0;
  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const dailyEquity: { day: string; equity: number }[] = [];
  let currentDay = '';

  const FEE_RATE = 0.0005; // 0.05%
  const SLIPPAGE = 0.0005; // 0.05%
  const LEVERAGE = 2;
  const RISK_PCT = 0.5; // 0.5%
  const ALLOCATION_PCT = 20; // 20% max per trade
  const MAX_POSITIONS = 3;
  const HORIZON_BARS = 16; // 16 * 15m = 240m (4 hours max holding)

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number }> = {};
  symbols.forEach(s => symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0 });

  // Step bar-by-bar
  for (let barIdx = startIndex; barIdx < startIndex + testBarsCount; barIdx++) {
    const refBar = klines15m.get('BTCUSDT')![barIdx];
    const dayStr = new Date(refBar.openTime).toISOString().slice(0, 10);
    if (dayStr !== currentDay) {
      currentDay = dayStr;
      const currentEq = getEquity(balance, activeTrades, klines15m, barIdx);
      dailyEquity.push({ day: currentDay, equity: currentEq });
    }

    // 1. Manage Active Positions with current bar's High/Low/Close
    for (let i = activeTrades.length - 1; i >= 0; i--) {
      const t = activeTrades[i];
      const curBar = klines15m.get(t.symbol)![barIdx];
      const isLong = t.side === 'LONG';
      t.highWaterMark = isLong ? Math.max(t.highWaterMark, curBar.high) : Math.min(t.highWaterMark, curBar.low);

      // Check Stop-Loss
      const stopHit = isLong ? curBar.low <= t.stopPrice : curBar.high >= t.stopPrice;
      if (stopHit) {
        const exitPrice = t.stopPrice * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = t.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty = 0;
        t.exitReason = 'STOP_LOSS';
        t.exitTime = curBar.openTime;
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }

      // Check Take Profit 1, 2, 3
      if (t.stage < 1 && (isLong ? curBar.high >= t.targets[0] : curBar.low <= t.targets[0])) {
        // TP1 hit: close 50%
        const tpQty = grid(t.qty * 0.5, rulesMap.get(t.symbol)!.step);
        const closeQty = Math.min(t.remainingQty, tpQty);
        const exitPrice = t.targets[0] * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = closeQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, closeQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty -= closeQty;
        t.stage = 1;
        t.stopPrice = t.entryPrice; // Breakeven
        balance += pnl;
      }

      if (t.stage === 1 && (isLong ? curBar.high >= t.targets[1] : curBar.low <= t.targets[1])) {
        // TP2 hit: close 25%
        const tpQty = grid(t.qty * 0.25, rulesMap.get(t.symbol)!.step);
        const closeQty = Math.min(t.remainingQty, tpQty);
        const exitPrice = t.targets[1] * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = closeQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(t.side, t.entryPrice, exitPrice, closeQty) - fee;
        t.realizedPnl += pnl;
        t.fees += fee;
        t.remainingQty -= closeQty;
        t.stage = 2;
        // Trailing stop 1.5%
        t.stopPrice = isLong ? t.highWaterMark * 0.985 : t.highWaterMark * 1.015;
        balance += pnl;
      }

      // Check Trailing Stop after stage 2
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

      // Check Max Holding Horizon (4 hours = 16 bars)
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

    // Update equity and drawdown
    const currentEq = getEquity(balance, activeTrades, klines15m, barIdx);
    highWaterMark = Math.max(highWaterMark, currentEq);
    maxDrawdown = Math.max(maxDrawdown, (highWaterMark - currentEq) / highWaterMark);

    // 2. Scan for New Entries
    for (const sym of symbols) {
      if (activeTrades.length >= MAX_POSITIONS) break;
      if (activeTrades.some(t => t.symbol === sym)) continue;

      const symBars = klines15m.get(sym)!;
      const historyBars = symBars.slice(0, barIdx);
      if (historyBars.length < 50) continue;

      const closes = historyBars.map(b => b.close);
      const rsiSeries = rsi({ values: closes, period: 14 });
      const currentRsi = rsiSeries.at(-1);
      if (currentRsi === undefined) continue;

      // 4H Trend
      const symBars4h = klines4h.get(sym)!;
      const history4h = symBars4h.filter(b => b.closeTime <= historyBars.at(-1)!.closeTime);
      let trend4h: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
      if (history4h.length >= 50) {
        const c4h = history4h.map(b => b.close);
        const sma20 = sma({ values: c4h, period: 20 }).at(-1);
        const sma50 = sma({ values: c4h, period: 50 }).at(-1);
        if (sma20 && sma50) {
          trend4h = sma20 > sma50 ? 'LONG' : sma20 < sma50 ? 'SHORT' : 'WAIT';
        }
      }

      // Check strategy decision
      const action = strat.decide(sym, currentRsi, trend4h);
      if (!action) continue;

      const rule = rulesMap.get(sym)!;
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
          fees: entryFee
        });
      } catch {
        // Position validation or sizing error, skip safely
      }
    }
  }

  // Close any remaining active positions at test end
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

  // Compile statistics
  for (const t of closedTrades) {
    symStats[t.symbol].trades++;
    if (t.realizedPnl > 0) symStats[t.symbol].wins++;
    else symStats[t.symbol].losses++;
    symStats[t.symbol].netPnl += t.realizedPnl;
  }

  const finalEquity = balance;
  const netProfit = finalEquity - 100.0;
  const netReturnPct = netProfit;
  const totalTrades = closedTrades.length;
  const totalWins = closedTrades.filter(t => t.realizedPnl > 0).length;
  const totalLosses = closedTrades.filter(t => t.realizedPnl <= 0).length;
  const winRate = totalTrades ? (totalWins / totalTrades * 100).toFixed(1) : '0';
  const totalFees = closedTrades.reduce((acc, t) => acc + t.fees, 0);

  console.log(`------------------------------------------------------`);
  console.log(`STRATEGİYA: ${strat.name}`);
  console.log(`Qayda: ${strat.description}`);
  console.log(`------------------------------------------------------`);
  console.log(`  Başlanğıc Balans: 100.00 USDT`);
  console.log(`  Yekun Balans:     ${finalEquity.toFixed(2)} USDT`);
  console.log(`  Xalis Gəlir/Zərər: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} USDT (${netReturnPct >= 0 ? '+' : ''}${netReturnPct.toFixed(2)}%)`);
  console.log(`  Maksimal Çəkilmə: ${(maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Cəmi Əməliyyat:   ${totalTrades} (Qalib: ${totalWins} [${winRate}%] | Məğlub: ${totalLosses})`);
  console.log(`  Ödənilən Komissiya: ${totalFees.toFixed(3)} USDT`);

  const exits: Record<string, number> = {};
  closedTrades.forEach(t => exits[t.exitReason || 'UNKNOWN'] = (exits[t.exitReason || 'UNKNOWN'] || 0) + 1);
  console.log(`  Çıxış Səbəbləri:`, exits);

  console.log(`\n  Koinlər Üzrə Bölgü:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | Xalis: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)} USDT`);
  }
  console.log(`\n`);
}

function getEquity(balance: number, activeTrades: ActiveTrade[], klinesMap: Map<string, RawKline[]>, barIdx: number): number {
  let openPnl = 0;
  for (const t of activeTrades) {
    const curBar = klinesMap.get(t.symbol)![barIdx];
    openPnl += grossPnl(t.side, t.entryPrice, curBar.close, t.remainingQty);
  }
  return balance + openPnl;
}

main().catch(console.error);
