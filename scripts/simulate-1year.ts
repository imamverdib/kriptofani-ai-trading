import { evaluateFibonacciSetup } from '../src/lib/quant-fibonacci';
import { grid, sizePosition, grossPnl } from '../src/lib/trading-math';
import * as fs from 'fs';
import * as path from 'path';

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
  trailingStop: number;
  highWaterMark: number;
  realizedPnl: number;
  fees: number;
  exitReason?: string;
  exitTime?: number;
}

const CACHE_DIR = path.join(process.cwd(), 'data', 'klines-cache');

async function fetchKlinesCached(symbol: string, interval: string, start: number, end: number): Promise<RawKline[]> {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(CACHE_DIR, `${symbol}_${interval}_${start}_${end}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as RawKline[];
      if (cached.length > 0) return cached;
    } catch {}
  }

  let allKlines: RawKline[] = [];
  let currentStart = start;

  while (currentStart < end) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${end}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch error for ${symbol}: ${res.statusText}`);
    const data = await res.json() as (string | number)[][];
    if (!data.length) break;

    const parsed = data.map(k => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: Number(k[6])
    }));

    allKlines.push(...parsed);
    currentStart = parsed[parsed.length - 1].closeTime + 1;
    if (parsed.length < 1000) break;
    // Small delay to be gentle with Binance public API
    await new Promise(r => setTimeout(r, 50));
  }

  const seen = new Set<number>();
  const deduplicated = allKlines.filter(k => {
    if (seen.has(k.openTime)) return false;
    seen.add(k.openTime);
    return true;
  });

  fs.writeFileSync(cacheFile, JSON.stringify(deduplicated));
  return deduplicated;
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

interface MonthSummary {
  name: string;
  startBalance: number;
  endBalance: number;
  netPnl: number;
  pnlPct: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  maxDrawdown: number;
  fees: number;
  profitFactor: number;
}

export async function runOneYearSimulation() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const rules = await fetchExchangeRules(symbols);

  // 1 Year: 2025-09-01 to 2026-09-01
  const warmupStart = new Date('2025-08-15T00:00:00Z').getTime();
  const testStart = new Date('2025-09-01T00:00:00Z').getTime();
  const testEnd = new Date('2026-09-01T00:00:00Z').getTime();

  console.log(`📡 Binance Futures-dən 1 illik (2025-09-01 -> 2026-09-01) məlumatlar yüklənir...`);

  const klines1h = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of symbols) {
    console.log(`   Yüklənir: ${sym}...`);
    const bars1h = await fetchKlinesCached(sym, '1h', warmupStart, testEnd);
    const bars4h = await fetchKlinesCached(sym, '4h', warmupStart - 20 * 86400000, testEnd);
    klines1h.set(sym, bars1h);
    klines4h.set(sym, bars4h);
    console.log(`   ${sym}: ${bars1h.length} 1H şam, ${bars4h.length} 4H şam hazır.`);
  }

  const btcBars = klines1h.get('BTCUSDT')!;
  const startIndex = btcBars.findIndex(b => b.openTime >= testStart);
  if (startIndex === -1) throw new Error('Test start date not found in loaded klines');

  const testBarsCount = btcBars.filter(b => b.openTime >= testStart && b.openTime < testEnd).length;
  console.log(`\n⏳ 1 il üzrə test olunacaq şam sayı: ${testBarsCount} saat (~365 gün)\n`);

  // Define the 12 calendar month boundaries
  const monthBoundaries: { name: string; start: number; end: number }[] = [];
  let curMStart = new Date('2025-09-01T00:00:00Z');
  while (curMStart.getTime() < testEnd) {
    const year = curMStart.getUTCFullYear();
    const month = curMStart.getUTCMonth();
    const nextM = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    const mEnd = Math.min(nextM.getTime(), testEnd);
    const mName = curMStart.toISOString().slice(0, 7); // e.g. "2025-09"
    monthBoundaries.push({ name: mName, start: curMStart.getTime(), end: mEnd });
    curMStart = nextM;
  }

  const START_BALANCE = 100.0;
  let balance = START_BALANCE;
  let peakBalance = START_BALANCE;
  let globalMaxDrawdown = 0;

  const LEVERAGE = 2;
  const RISK_PCT = 0.5; // 0.5% risk per trade
  const ALLOCATION_PCT = 20.0; // 20% margin
  const FEE_RATE = 0.0005; // 0.05% taker fee
  const SLIPPAGE = 0.0005; // 0.05% slippage
  const MAX_HOLDING_HOURS = 16;
  const MAX_CONCURRENT_POSITIONS = 2;

  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const lastTradeTimePerSymbol: Record<string, number> = {};

  const monthlySnapshots: Record<string, { startBal: number; trades: ActiveTrade[]; peakBal: number; maxDD: number }> = {};
  monthBoundaries.forEach(m => {
    monthlySnapshots[m.name] = { startBal: 0, trades: [], peakBal: 0, maxDD: 0 };
  });

  let currentMonthIdx = 0;
  monthlySnapshots[monthBoundaries[0].name].startBal = START_BALANCE;
  monthlySnapshots[monthBoundaries[0].name].peakBal = START_BALANCE;

  // Step candle by candle across the entire 365 days
  for (let i = 0; i < testBarsCount; i++) {
    const barIdx = startIndex + i;
    const currentBar = btcBars[barIdx];

    // Check if month changed
    while (currentMonthIdx < monthBoundaries.length - 1 && currentBar.openTime >= monthBoundaries[currentMonthIdx].end) {
      currentMonthIdx++;
      const mObj = monthBoundaries[currentMonthIdx];
      monthlySnapshots[mObj.name].startBal = balance;
      monthlySnapshots[mObj.name].peakBal = balance;
    }
    const curMonthName = monthBoundaries[currentMonthIdx].name;

    // 1. Manage Active Positions
    for (let tIdx = activeTrades.length - 1; tIdx >= 0; tIdx--) {
      const trade = activeTrades[tIdx];
      const symBar = klines1h.get(trade.symbol)![barIdx];
      const isLong = trade.side === 'LONG';

      if (isLong) {
        trade.highWaterMark = Math.max(trade.highWaterMark, symBar.high);
      } else {
        trade.highWaterMark = Math.min(trade.highWaterMark, symBar.low);
      }

      // Check Stop Loss
      const stopHit = isLong ? symBar.low <= trade.stopPrice : symBar.high >= trade.stopPrice;
      if (stopHit) {
        const exitPrice = trade.stopPrice * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const exitFee = trade.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - exitFee;
        trade.realizedPnl += pnl;
        trade.fees += exitFee;
        trade.remainingQty = 0;
        trade.exitReason = trade.stage === 0 ? 'STOP_LOSS' : 'BREAKEVEN_STOP';
        trade.exitTime = symBar.openTime;
        balance += pnl;
        closedTrades.push(trade);
        monthlySnapshots[curMonthName].trades.push(trade);
        activeTrades.splice(tIdx, 1);
        continue;
      }

      // Stage 0 -> Stage 1: TP1 Hit (50% position exit, stop moved to breakeven)
      if (trade.stage === 0) {
        const tp1 = trade.targets[0];
        const tp1Hit = isLong ? symBar.high >= tp1 : symBar.low <= tp1;
        if (tp1Hit) {
          const closeQty = grid(trade.qty * 0.5, rules.get(trade.symbol)!.step);
          const exitPrice = tp1 * (1 - (isLong ? 1 : -1) * SLIPPAGE);
          const fee = closeQty * exitPrice * FEE_RATE;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, closeQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty -= closeQty;
          trade.stage = 1;
          trade.stopPrice = trade.entryPrice;
          balance += pnl;
        }
      }

      // Stage 1 -> Stage 2: TP2 Hit (25% position exit, trailing stop activated)
      if (trade.stage === 1) {
        const tp2 = trade.targets[1];
        const tp2Hit = isLong ? symBar.high >= tp2 : symBar.low <= tp2;
        if (tp2Hit) {
          const closeQty = grid(trade.qty * 0.25, rules.get(trade.symbol)!.step);
          const exitPrice = tp2 * (1 - (isLong ? 1 : -1) * SLIPPAGE);
          const fee = closeQty * exitPrice * FEE_RATE;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, closeQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty -= closeQty;
          trade.stage = 2;
          trade.trailingStop = isLong ? trade.highWaterMark * 0.985 : trade.highWaterMark * 1.015;
          balance += pnl;
        }
      }

      // Stage 2: Trailing Stop or TP3
      if (trade.stage === 2) {
        const tp3 = trade.targets[2];
        const tp3Hit = isLong ? symBar.high >= tp3 : symBar.low <= tp3;

        if (isLong) {
          trade.trailingStop = Math.max(trade.trailingStop, trade.highWaterMark * 0.985);
        } else {
          trade.trailingStop = Math.min(trade.trailingStop, trade.highWaterMark * 1.015);
        }

        const trailHit = isLong ? symBar.low <= trade.trailingStop : symBar.high >= trade.trailingStop;

        if (tp3Hit || trailHit) {
          const exitBase = tp3Hit ? tp3 : trade.trailingStop;
          const exitPrice = exitBase * (1 - (isLong ? 1 : -1) * SLIPPAGE);
          const fee = trade.remainingQty * exitPrice * FEE_RATE;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty = 0;
          trade.exitReason = tp3Hit ? 'TP3_GOLDEN_EXTENSION' : 'TRAILING_STOP';
          trade.exitTime = symBar.openTime;
          balance += pnl;
          closedTrades.push(trade);
          monthlySnapshots[curMonthName].trades.push(trade);
          activeTrades.splice(tIdx, 1);
          continue;
        }
      }

      // Time Horizon Expiry (16 hours)
      if (symBar.openTime >= trade.maxTime && trade.remainingQty > 0) {
        const exitPrice = symBar.close * (1 - (isLong ? 1 : -1) * SLIPPAGE);
        const fee = trade.remainingQty * exitPrice * FEE_RATE;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
        trade.realizedPnl += pnl;
        trade.fees += fee;
        trade.remainingQty = 0;
        trade.exitReason = trade.stage > 0 ? 'HORIZON_PROFIT' : 'HORIZON_EXPIRY';
        trade.exitTime = symBar.openTime;
        balance += pnl;
        closedTrades.push(trade);
        monthlySnapshots[curMonthName].trades.push(trade);
        activeTrades.splice(tIdx, 1);
      }
    }

    // Equity and Drawdown Tracking
    let currentEquity = balance;
    for (const t of activeTrades) {
      const symBar = klines1h.get(t.symbol)![barIdx];
      const mtm = grossPnl(t.side, t.entryPrice, symBar.close, t.remainingQty);
      currentEquity += mtm;
    }

    if (currentEquity > peakBalance) peakBalance = currentEquity;
    const globalDD = (peakBalance - currentEquity) / peakBalance;
    if (globalDD > globalMaxDrawdown) globalMaxDrawdown = globalDD;

    const curMSnap = monthlySnapshots[curMonthName];
    if (currentEquity > curMSnap.peakBal) curMSnap.peakBal = currentEquity;
    const curMDD = (curMSnap.peakBal - currentEquity) / curMSnap.peakBal;
    if (curMDD > curMSnap.maxDD) curMSnap.maxDD = curMDD;

    // 2. Evaluate New Signals (at 1H close)
    for (const sym of symbols) {
      if (activeTrades.some(t => t.symbol === sym)) continue;
      if (activeTrades.length >= MAX_CONCURRENT_POSITIONS) break;

      const lastTradeTime = lastTradeTimePerSymbol[sym] || 0;
      if (currentBar.openTime - lastTradeTime < 4 * 3600 * 1000) continue;

      const sym1h = klines1h.get(sym)!;
      const history1h = sym1h.slice(0, barIdx + 1);

      const sym4h = klines4h.get(sym)!;
      const history4h = sym4h.filter(b => b.closeTime <= currentBar.closeTime);

      const setup = evaluateFibonacciSetup(history1h, history4h);
      if (!setup || !setup.valid) continue;

      const symBar = sym1h[barIdx];
      const rule = rules.get(sym)!;
      const entryPrice = symBar.close;
      const stopPrice = grid(setup.stopPrice, rule.tick, setup.side === 'LONG' ? 'floor' : 'ceil');
      const tp1 = grid(setup.tp1, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp2 = grid(setup.tp2, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp3 = grid(setup.tp3, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');

      try {
        const available = Math.max(0, currentEquity - activeTrades.reduce((s, p) => s + (p.remainingQty * p.entryPrice) / LEVERAGE, 0));
        const allocPct = sym === 'BTCUSDT' ? Math.max(ALLOCATION_PCT, 40) : ALLOCATION_PCT;
        const qty = sizePosition({
          equity: currentEquity,
          available,
          entry: entryPrice,
          stop: stopPrice,
          leverage: LEVERAGE,
          riskPct: RISK_PCT,
          allocationPct: allocPct,
          feeRate: FEE_RATE,
          slippage: SLIPPAGE,
          step: rule.step
        });

        if (qty < rule.minQty || qty * entryPrice < rule.minNotional) continue;

        const entryFee = qty * entryPrice * FEE_RATE;
        balance -= entryFee;
        lastTradeTimePerSymbol[sym] = symBar.openTime;

        activeTrades.push({
          id: `${sym}-${barIdx}`,
          symbol: sym,
          side: setup.side,
          entryTime: symBar.openTime,
          maxTime: symBar.openTime + MAX_HOLDING_HOURS * 3600 * 1000,
          entryPrice,
          stopPrice,
          targets: [tp1, tp2, tp3],
          qty,
          remainingQty: qty,
          stage: 0,
          trailingStop: 0,
          highWaterMark: entryPrice,
          realizedPnl: -entryFee,
          fees: entryFee
        });
      } catch (err) {}
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
    const lastMName = monthBoundaries[monthBoundaries.length - 1].name;
    monthlySnapshots[lastMName].trades.push(t);
  }

  // Process month-by-month results
  const monthlyResults: MonthSummary[] = [];
  let runningBal = START_BALANCE;

  for (const m of monthBoundaries) {
    const snap = monthlySnapshots[m.name];
    const mTrades = snap.trades;
    const mPnl = mTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const mFees = mTrades.reduce((s, t) => s + t.fees, 0);
    const mStart = runningBal;
    const mEnd = runningBal + mPnl;
    runningBal = mEnd;

    const wins = mTrades.filter(t => t.realizedPnl > 0.01).length;
    const losses = mTrades.filter(t => t.realizedPnl <= 0.01).length;
    const winRate = mTrades.length ? Number((wins / mTrades.length * 100).toFixed(1)) : 0;
    const pnlPct = Number((mPnl / mStart * 100).toFixed(2));

    const grossProfit = mTrades.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
    const grossLoss = Math.abs(mTrades.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.9 : 0);

    monthlyResults.push({
      name: m.name,
      startBalance: Number(mStart.toFixed(2)),
      endBalance: Number(mEnd.toFixed(2)),
      netPnl: Number(mPnl.toFixed(2)),
      pnlPct,
      tradesCount: mTrades.length,
      winsCount: wins,
      lossesCount: losses,
      winRate,
      maxDrawdown: Number((snap.maxDD * 100).toFixed(2)),
      fees: Number(mFees.toFixed(3)),
      profitFactor
    });
  }

  // Symbol Breakdown
  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number; fees: number }> = {
    BTCUSDT: { trades: 0, wins: 0, losses: 0, netPnl: 0, fees: 0 },
    ETHUSDT: { trades: 0, wins: 0, losses: 0, netPnl: 0, fees: 0 },
    SOLUSDT: { trades: 0, wins: 0, losses: 0, netPnl: 0, fees: 0 }
  };

  for (const t of closedTrades) {
    symStats[t.symbol].trades++;
    if (t.realizedPnl > 0.01) symStats[t.symbol].wins++;
    else symStats[t.symbol].losses++;
    symStats[t.symbol].netPnl += t.realizedPnl;
    symStats[t.symbol].fees += t.fees;
  }

  const finalEquity = balance;
  const netProfit = finalEquity - START_BALANCE;
  const totalTrades = closedTrades.length;
  const totalWins = closedTrades.filter(t => t.realizedPnl > 0.01).length;
  const totalLosses = closedTrades.filter(t => t.realizedPnl <= 0.01).length;
  const globalWinRate = totalTrades ? (totalWins / totalTrades * 100).toFixed(1) : '0';
  const totalFees = closedTrades.reduce((acc, t) => acc + t.fees, 0);

  const grossProfit = closedTrades.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(closedTrades.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
  const globalProfitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '∞' : '0.00');

  console.log(`\n========================================================================================`);
  console.log(`  1 İLLİK (01.09.2025 – 01.09.2026) KASET REPLAY NƏTİCƏLƏRİ — AY-AY DETALLI CƏDVƏL`);
  console.log(`========================================================================================`);
  console.log(`| Ay       | Giriş Balans | Çıxış Balans | Xalis PnL ($) | PnL (%) | Əməliyyat | WinRate | Max DD | Komissiya | PF   |`);
  console.log(`|:---------|:-------------|:-------------|:--------------|:--------|:----------|:--------|:-------|:----------|:-----|`);
  for (const mr of monthlyResults) {
    const sign = mr.netPnl >= 0 ? '+' : '';
    console.log(
      `| ${mr.name.padEnd(8)} | ${mr.startBalance.toFixed(2).padStart(12)} | ${mr.endBalance.toFixed(2).padStart(12)} | ` +
      `${(sign + mr.netPnl.toFixed(2) + '$').padStart(13)} | ${(sign + mr.pnlPct.toFixed(2) + '%').padStart(7)} | ` +
      `${(mr.tradesCount + ' (' + mr.winsCount + 'W/' + mr.lossesCount + 'L)').padStart(9)} | ${(mr.winRate + '%').padStart(7)} | ` +
      `${(mr.maxDrawdown.toFixed(2) + '%').padStart(6)} | ${(mr.fees.toFixed(2) + '$').padStart(9)} | ${mr.profitFactor.toFixed(2).padStart(4)} |`
    );
  }
  console.log(`========================================================================================\n`);

  console.log(`🏆 1 İLLİK YEKUN KUMULYATİV MƏNZƏRƏ:`);
  console.log(`   Başlanğıc Kapital: ${START_BALANCE.toFixed(2)} USDT`);
  console.log(`   Yekun Balans:      ${finalEquity.toFixed(2)} USDT`);
  console.log(`   Xalis Mənfəət:     ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} USDT (${netProfit >= 0 ? '+' : ''}${((netProfit / START_BALANCE) * 100).toFixed(2)}%)`);
  console.log(`   Qələbə Nisbəti:    ${globalWinRate}% (${totalWins} Qələbə / ${totalLosses} Zərər / Cəmi: ${totalTrades} Əməliyyat)`);
  console.log(`   İllik Max Drawdown:${(globalMaxDrawdown * 100).toFixed(2)}%`);
  console.log(`   Qazanc Faktoru:    ${globalProfitFactor}`);
  console.log(`   Cəmi Komissiya:    ${totalFees.toFixed(3)} USDT (Bütün 1 il ərzində!)`);

  console.log(`\n🪙 Koinlər üzrə 1 İllik Paylanma:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    const sign = st.netPnl >= 0 ? '+' : '';
    console.log(`   ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | PnL: ${sign}${st.netPnl.toFixed(2)}$ | Komissiya: ${st.fees.toFixed(3)}$`);
  }

  return { monthlyResults, finalEquity, netProfit, globalWinRate, globalMaxDrawdown, globalProfitFactor, totalFees, totalTrades, symStats };
}

runOneYearSimulation().catch(err => {
  console.error('Fatal 1-year simulation error:', err);
  process.exit(1);
});
