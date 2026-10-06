import { evaluateFibonacciSetup } from '../src/lib/quant-fibonacci';
import { detectMarketRegime } from '../src/lib/quant-math';
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

function loadCachedKlines(symbol: string, interval: string, start: number, end: number): RawKline[] {
  const cacheFile = path.join(CACHE_DIR, `${symbol}_${interval}_${start}_${end}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as RawKline[];
  }
  throw new Error(`Cache missing for ${symbol}_${interval}. Run simulate-1year.ts first.`);
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

interface MonthResult {
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

async function runSimulation(adxFilterEnabled: boolean): Promise<{ monthlyResults: MonthResult[]; finalEquity: number; netProfit: number; globalWinRate: string; globalMaxDrawdown: number; globalProfitFactor: string; totalFees: number; totalTrades: number }> {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const rules = await fetchExchangeRules(symbols);

  const warmupStart = new Date('2025-08-15T00:00:00Z').getTime();
  const testStart = new Date('2025-09-01T00:00:00Z').getTime();
  const testEnd = new Date('2026-09-01T00:00:00Z').getTime();

  const klines1h = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of symbols) {
    const bars1h = loadCachedKlines(sym, '1h', warmupStart, testEnd);
    const bars4h = loadCachedKlines(sym, '4h', warmupStart - 20 * 86400000, testEnd);
    klines1h.set(sym, bars1h);
    klines4h.set(sym, bars4h);
  }

  const btcBars = klines1h.get('BTCUSDT')!;
  const startIndex = btcBars.findIndex(b => b.openTime >= testStart);
  const testBarsCount = btcBars.filter(b => b.openTime >= testStart && b.openTime < testEnd).length;

  const monthBoundaries: { name: string; start: number; end: number }[] = [];
  let curMStart = new Date('2025-09-01T00:00:00Z');
  while (curMStart.getTime() < testEnd) {
    const year = curMStart.getUTCFullYear();
    const month = curMStart.getUTCMonth();
    const nextM = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    const mEnd = Math.min(nextM.getTime(), testEnd);
    const mName = curMStart.toISOString().slice(0, 7);
    monthBoundaries.push({ name: mName, start: curMStart.getTime(), end: mEnd });
    curMStart = nextM;
  }

  const START_BALANCE = 100.0;
  let balance = START_BALANCE;
  let peakBalance = START_BALANCE;
  let globalMaxDrawdown = 0;

  const LEVERAGE = 2;
  const RISK_PCT = 0.5;
  const ALLOCATION_PCT = 20.0;
  const FEE_RATE = 0.0005;
  const SLIPPAGE = 0.0005;
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

  for (let i = 0; i < testBarsCount; i++) {
    const barIdx = startIndex + i;
    const currentBar = btcBars[barIdx];

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

      // ADX Bazar Rejimi Detektoru (Canlı sistem filtrasiyası)
      if (adxFilterEnabled) {
        const regimeInfo = detectMarketRegime(history1h.slice(-30));
        // Əgər bazar durğundursa (ADX < 20) və ya əks istiqamətdədirsə, giriş etmə
        if (regimeInfo.adx < 20) continue; // Skip dead sideways chop
        if (regimeInfo.regime === 'RANGING' && regimeInfo.adx < 22) continue;
      }

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

  const monthlyResults: MonthResult[] = [];
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

  return { monthlyResults, finalEquity, netProfit, globalWinRate, globalMaxDrawdown, globalProfitFactor, totalFees, totalTrades };
}

async function main() {
  console.log('🚀 1 İLLİK (01.09.2025 - 01.09.2026) MÜQAYİSƏLİ SINAQ İCRA OLUNUR...\n');

  console.log('1️⃣ Variant A: Təmiz Fibonacci Golden Pocket (ADX filtrsiz)...');
  const base = await runSimulation(false);

  console.log('\n2️⃣ Variant B: Canlı Kodumuzdakı ADX Bazar Rejimi Detektoru İlə (ADX >= 20)...');
  const withAdx = await runSimulation(true);

  console.log(`\n====================================================================================================================`);
  console.log(`  1 İLLİK AY-AY MÜQAYİSƏ: TƏMİZ FİBONACCİ (A) vs CANLI ADX DETEKTORU İLƏ (B)`);
  console.log(`====================================================================================================================`);
  console.log(`| Ay       | (A) Əməliyyat | (A) PnL ($) | (A) PnL (%) | (B) Əməliyyat | (B) PnL ($) | (B) PnL (%) | Fərq (Mənfəət Artımı) |`);
  console.log(`|:---------|:--------------|:------------|:------------|:--------------|:------------|:------------|:----------------------|`);

  for (let i = 0; i < base.monthlyResults.length; i++) {
    const a = base.monthlyResults[i];
    const b = withAdx.monthlyResults[i];
    const signA = a.netPnl >= 0 ? '+' : '';
    const signB = b.netPnl >= 0 ? '+' : '';
    const diff = b.netPnl - a.netPnl;
    const signDiff = diff >= 0 ? '+' : '';

    console.log(
      `| ${a.name.padEnd(8)} | ` +
      `${(a.tradesCount + ' (' + a.winRate + '%)').padStart(13)} | ` +
      `${(signA + a.netPnl.toFixed(2) + '$').padStart(11)} | ` +
      `${(signA + a.pnlPct.toFixed(2) + '%').padStart(11)} | ` +
      `${(b.tradesCount + ' (' + b.winRate + '%)').padStart(13)} | ` +
      `${(signB + b.netPnl.toFixed(2) + '$').padStart(11)} | ` +
      `${(signB + b.pnlPct.toFixed(2) + '%').padStart(11)} | ` +
      `${(signDiff + diff.toFixed(2) + '$ ' + (diff > 0 ? '🟢 Artım' : diff < 0 ? '🔴 Azalma' : '⚪ Eyni')).padStart(21)} |`
    );
  }

  console.log(`====================================================================================================================\n`);

  console.log(`🏆 1 İLLİK YEKUN NƏTİCƏLƏRİN MÜQAYİSƏSİ:`);
  console.log(`   Parametr                   | Variant A (Filtrsiz)        | Variant B (Canlı ADX Filtrli)`);
  console.log(`   ---------------------------|-----------------------------|-------------------------------`);
  console.log(`   Başlanğıc Balans           | 100.00 USDT                 | 100.00 USDT`);
  console.log(`   Yekun Balans               | ${base.finalEquity.toFixed(2)} USDT                 | ${withAdx.finalEquity.toFixed(2)} USDT`);
  console.log(`   1 İllik Xalis Mənfəət      | ${base.netProfit >= 0 ? '+' : ''}${base.netProfit.toFixed(2)} USDT (${base.netProfit >= 0 ? '+' : ''}${((base.netProfit/100)*100).toFixed(2)}%)      | ${withAdx.netProfit >= 0 ? '+' : ''}${withAdx.netProfit.toFixed(2)} USDT (${withAdx.netProfit >= 0 ? '+' : ''}${((withAdx.netProfit/100)*100).toFixed(2)}%)`);
  console.log(`   Qələbə Nisbəti (Win Rate)  | ${base.globalWinRate}%                      | ${withAdx.globalWinRate}%`);
  console.log(`   Cəmi Əməliyyat Sayı        | ${base.totalTrades} əməliyyat               | ${withAdx.totalTrades} əməliyyat`);
  console.log(`   Qazanc Faktoru (PF)        | ${base.globalProfitFactor}                        | ${withAdx.globalProfitFactor}`);
  console.log(`   Maksimal Çəkilmə (Max DD)  | ${(base.globalMaxDrawdown * 100).toFixed(2)}%                       | ${(withAdx.globalMaxDrawdown * 100).toFixed(2)}%`);
  console.log(`   Ödənilən Cəmi Komissiya    | ${base.totalFees.toFixed(3)} USDT                 | ${withAdx.totalFees.toFixed(3)} USDT`);
}

main().catch(console.error);
