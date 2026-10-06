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
  confidence: number;
}

async function fetch30Days15m(symbol: string): Promise<RawKline[]> {
  const url1 = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=1500`;
  const res1 = await fetch(url1);
  if (!res1.ok) throw new Error(`Fetch error 1 for ${symbol}`);
  const data1 = await res1.json() as (string | number)[][];
  const endTime = Number(data1[0][0]) - 1;

  const url2 = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=1500&endTime=${endTime}`;
  const res2 = await fetch(url2);
  if (!res2.ok) throw new Error(`Fetch error 2 for ${symbol}`);
  const data2 = await res2.json() as (string | number)[][];

  const all = [...data2, ...data1];
  return all.map(k => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6])
  }));
}

async function fetch4h(symbol: string): Promise<RawKline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=4h&limit=400`;
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

function evaluateEngine(historyBars: RawKline[], history4h: RawKline[]): { action: 'LONG'|'SHORT'|'WAIT'; confidence: number } {
  if (historyBars.length < 50 || history4h.length < 50) return { action: 'WAIT', confidence: 0 };

  const closes = historyBars.map(b => b.close);
  const hc = history4h.map(b => b.close);

  const a = sma({ values: hc, period: 20 }).at(-1)!;
  const b = sma({ values: hc, period: 50 }).at(-1)!;
  const trend: 'LONG' | 'SHORT' | 'WAIT' = a > b ? 'LONG' : a < b ? 'SHORT' : 'WAIT';

  const oscillator = rsi({ values: closes, period: 14 }).at(-1)!;
  const regimeInfo = detectMarketRegime(historyBars.slice(-40), 14);

  const isTrending = regimeInfo.regime !== 'RANGING';
  const lastBar = historyBars.at(-1)!;
  const prevBar = historyBars.at(-2)!;
  const spread = lastBar.high - lastBar.low;
  const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  const isWicky = spread > 0 && (upperWick / spread > 0.6 || lowerWick / spread > 0.6);

  let candidateAction: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  let confidence = 50;

  if (isTrending) {
    if (trend === 'LONG' && regimeInfo.trendDirection === 'BULLISH' && !isWicky) {
      if (oscillator >= 40 && oscillator <= 65) {
        candidateAction = 'LONG';
        confidence = regimeInfo.adx >= 30 ? (lastBar.close > prevBar.close ? 76 : 71) : 66;
      }
    } else if (trend === 'SHORT' && regimeInfo.trendDirection === 'BEARISH' && !isWicky) {
      if (oscillator >= 35 && oscillator <= 60) {
        candidateAction = 'SHORT';
        confidence = regimeInfo.adx >= 30 ? (lastBar.close < prevBar.close ? 76 : 71) : 66;
      }
    }
  } else {
    if (oscillator < 32 && !isWicky) {
      candidateAction = 'LONG';
      confidence = 68;
    } else if (oscillator > 68 && !isWicky) {
      candidateAction = 'SHORT';
      confidence = 68;
    }
  }

  let finalAction = candidateAction;
  if (isTrending) {
    if (finalAction !== trend) finalAction = 'WAIT';
    if ((finalAction === 'LONG' && oscillator > 70) || (finalAction === 'SHORT' && oscillator < 30)) finalAction = 'WAIT';
  } else {
    if ((finalAction === 'LONG' && oscillator > 60) || (finalAction === 'SHORT' && oscillator < 40)) finalAction = 'WAIT';
    if (finalAction !== trend && (oscillator >= 35 && oscillator <= 65)) finalAction = 'WAIT';
  }

  return { action: finalAction, confidence };
}

async function runBacktest(
  title: string,
  symbols: string[],
  klines15m: Map<string, RawKline[]>,
  klines4h: Map<string, RawKline[]>,
  rules: Map<string, SymbolRules>,
  startIndex: number,
  testBarsCount: number
) {
  let balance = 100.0;
  let highWaterMark = 100.0;
  let maxDrawdown = 0.0;
  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];

  const FEE_RATE = 0.0005; // 0.05%
  const SLIPPAGE = 0.0005; // 0.05%
  const LEVERAGE = 2;
  const ALLOCATION_PCT = 20;
  const RISK_PCT = 0.5;
  const MIN_CONFIDENCE = 70;
  const MAX_POSITIONS = 3;
  const HORIZON_BARS = 16;

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number }> = {};
  symbols.forEach(s => symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0 });

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

      const decision = evaluateEngine(historyBars, history4h);
      if (decision.action === 'WAIT' || decision.confidence < MIN_CONFIDENCE) continue;

      const action = decision.action;
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
          confidence: decision.confidence
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
  console.log(`  Çıxış Səbəbləri:`, exits);

  console.log(`\n  Koinlər Üzrə Performans:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | Xalis: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)} USDT`);
  }
  console.log(`\n`);
}

async function main() {
  const ALL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT', 'ZECUSDT', 'SANDUSDT', 'XRPUSDT'];
  console.log(`\n================================================================`);
  console.log(`  30-GÜNLÜK (1 AYLıQ) REAL BAZAR SİMULYASİYASI (Binance Futures)`);
  console.log(`================================================================\n`);

  console.log('1. Bütün koinlər üçün 30 günlük real 15m və 4h şamlar yüklənir...');
  const rules = await fetchExchangeRules(ALL_SYMBOLS);

  const klines15m = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of ALL_SYMBOLS) {
    const bars15 = await fetch30Days15m(sym);
    const bars4 = await fetch4h(sym);
    klines15m.set(sym, bars15);
    klines4h.set(sym, bars4);
    console.log(`  ✓ ${sym.padEnd(8)}: ${bars15.length} ədəd 15m şam, ${bars4.length} ədəd 4h şam yükləndi`);
  }

  // Exact 30 days = 30 * 24 * 4 = 2880 bars
  const btcBars = klines15m.get('BTCUSDT')!;
  const testBarsCount = 2880;
  const startIndex = btcBars.length - testBarsCount;
  const startTime = btcBars[startIndex].openTime;
  const endTime = btcBars[btcBars.length - 1].closeTime;

  const startDateStr = new Date(startTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  const endDateStr = new Date(endTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  console.log(`\nTest Müddəti: ${startDateStr} — ${endDateStr} (Dəqiq 30 gün / 720 saat)\n`);

  // Test 1: Full 7 coins
  await runBacktest(
    'TEST 1: Bütün 7 Koin ilə 1 Aylıq Simulyasiya (BTC, ETH, SOL, NEAR, ZEC, SAND, XRP)',
    ALL_SYMBOLS,
    klines15m,
    klines4h,
    rules,
    startIndex,
    testBarsCount
  );

  // Test 2: Clean High-Liquidity Trend Coins (BTC, ETH, SOL, NEAR)
  const CLEAN_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT'];
  await runBacktest(
    'TEST 2: Seçilmiş Likvid və Trend Koinləri ilə (Yalnız BTC, ETH, SOL, NEAR)',
    CLEAN_SYMBOLS,
    klines15m,
    klines4h,
    rules,
    startIndex,
    testBarsCount
  );
}

main().catch(console.error);
