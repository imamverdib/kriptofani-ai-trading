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
  initialStop: number;
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

async function runPortfolioSimulation() {
  console.log('========================================================================');
  console.log('   KRIPTOFANI 1-ILLIK OPTIMIZASIYA EDILMIS PORTFEL BACKTESTI');
  console.log('   Müddət: 01.09.2025 - 01.09.2026 (12 Tam Ay)');
  console.log('   Koinlər: ETHUSDT, SOLUSDT, BNBUSDT, LINKUSDT (Optimal Universe)');
  console.log('   Riyazi Tənzimləmələr:');
  console.log('     1. Risk: 1.0% ($1.00 per trade) - Komissiya sürtünməsini dəf edir');
  console.log('     2. Asimmetrik Çıxış: TP1-də (+2.0R) 50% çıxış + Stop +0.8R qazanca çəkilir');
  console.log('     3. Trend Filtri: ADX >= 25 (Flət bazar dövrlərindən qorunma)');
  console.log('========================================================================\n');

  const symbols = ['ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'LINKUSDT'];
  const rules = new Map<string, SymbolRules>([
    ['ETHUSDT', { step: '0.001', minQty: 0.001, maxQty: 10000, tick: '0.01', minNotional: 20 }],
    ['SOLUSDT', { step: '0.01', minQty: 0.01, maxQty: 100000, tick: '0.01', minNotional: 5 }],
    ['BNBUSDT', { step: '0.01', minQty: 0.01, maxQty: 10000, tick: '0.01', minNotional: 5 }],
    ['LINKUSDT', { step: '0.01', minQty: 0.01, maxQty: 100000, tick: '0.001', minNotional: 20 }]
  ]);

  const warmupStart = new Date('2025-08-15T00:00:00Z').getTime();
  const testStart = new Date('2025-09-01T00:00:00Z').getTime();
  const testEnd = new Date('2026-09-01T00:00:00Z').getTime();

  console.log('Tarixi klines yüklənir...');
  const klines1h = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of symbols) {
    const k1h = await fetchKlinesCached(sym, '1h', warmupStart, testEnd);
    const k4h = await fetchKlinesCached(sym, '4h', warmupStart - 20 * 86400000, testEnd);
    klines1h.set(sym, k1h);
    klines4h.set(sym, k4h);
    console.log(`  ✓ ${sym}: 1H (${k1h.length} bar), 4H (${k4h.length} bar) hazır.`);
  }

  const base1h = klines1h.get('ETHUSDT')!;
  const startIndex = base1h.findIndex(b => b.openTime >= testStart);
  const testBarsCount = base1h.filter(b => b.openTime >= testStart && b.openTime < testEnd).length;

  console.log(`\nSimulyasiya başladılır: ${testBarsCount} saatlıq şam (365 gün)...\n`);

  const START_BALANCE = 100.0;
  const RISK_PCT = 1.0; // 1.0% risk ($1.00)
  const ALLOCATION_PCT = 25; // 25% per position
  const LEVERAGE = 2;
  const FEE_RATE = 0.0005;
  const SLIPPAGE = 0.0005;
  const MAX_CONCURRENT_POSITIONS = 2;
  const MAX_HOLDING_HOURS = 24;

  let balance = START_BALANCE;
  let peakBalance = START_BALANCE;
  let globalMaxDrawdown = 0;

  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const lastTradeTimePerSymbol: Record<string, number> = {};

  interface MonthReport {
    name: string;
    startBal: number;
    peakBal: number;
    maxDD: number;
    trades: ActiveTrade[];
  }

  const monthNames = [
    '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08'
  ];

  const monthBoundaries = [
    { name: '2025-09', start: new Date('2025-09-01T00:00:00Z').getTime(), end: new Date('2025-10-01T00:00:00Z').getTime() },
    { name: '2025-10', start: new Date('2025-10-01T00:00:00Z').getTime(), end: new Date('2025-11-01T00:00:00Z').getTime() },
    { name: '2025-11', start: new Date('2025-11-01T00:00:00Z').getTime(), end: new Date('2025-12-01T00:00:00Z').getTime() },
    { name: '2025-12', start: new Date('2025-12-01T00:00:00Z').getTime(), end: new Date('2026-01-01T00:00:00Z').getTime() },
    { name: '2026-01', start: new Date('2026-01-01T00:00:00Z').getTime(), end: new Date('2026-02-01T00:00:00Z').getTime() },
    { name: '2026-02', start: new Date('2026-02-01T00:00:00Z').getTime(), end: new Date('2026-03-01T00:00:00Z').getTime() },
    { name: '2026-03', start: new Date('2026-03-01T00:00:00Z').getTime(), end: new Date('2026-04-01T00:00:00Z').getTime() },
    { name: '2026-04', start: new Date('2026-04-01T00:00:00Z').getTime(), end: new Date('2026-05-01T00:00:00Z').getTime() },
    { name: '2026-05', start: new Date('2026-05-01T00:00:00Z').getTime(), end: new Date('2026-06-01T00:00:00Z').getTime() },
    { name: '2026-06', start: new Date('2026-06-01T00:00:00Z').getTime(), end: new Date('2026-07-01T00:00:00Z').getTime() },
    { name: '2026-07', start: new Date('2026-07-01T00:00:00Z').getTime(), end: new Date('2026-08-01T00:00:00Z').getTime() },
    { name: '2026-08', start: new Date('2026-08-01T00:00:00Z').getTime(), end: new Date('2026-09-01T00:00:00Z').getTime() }
  ];

  const monthlySnapshots: Record<string, MonthReport> = {};
  for (const m of monthNames) {
    monthlySnapshots[m] = {
      name: m,
      startBal: START_BALANCE,
      peakBal: START_BALANCE,
      maxDD: 0,
      trades: []
    };
  }

  let currentMonthIdx = 0;
  monthlySnapshots[monthBoundaries[0].name].startBal = START_BALANCE;
  monthlySnapshots[monthBoundaries[0].name].peakBal = START_BALANCE;

  for (let i = 0; i < testBarsCount; i++) {
    const barIdx = startIndex + i;
    const currentBar = base1h[barIdx];

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
        trade.exitReason = trade.stage === 0 ? 'STOP_LOSS' : 'LOCK_PROFIT_STOP';
        trade.exitTime = symBar.openTime;
        balance += pnl;
        closedTrades.push(trade);
        monthlySnapshots[curMonthName].trades.push(trade);
        activeTrades.splice(tIdx, 1);
        continue;
      }

      // TP1 Hit: 50% exit, stop moved to +0.8R profit lock
      if (trade.stage === 0) {
        const tp1 = trade.targets[0];
        const tp1Hit = isLong ? symBar.high >= tp1 : symBar.low <= tp1;
        if (tp1Hit) {
          const rule = rules.get(trade.symbol)!;
          const closeQty = grid(trade.qty * 0.5, rule.step);
          const exitPrice = tp1 * (1 - (isLong ? 1 : -1) * SLIPPAGE);
          const fee = closeQty * exitPrice * FEE_RATE;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, closeQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty -= closeQty;
          trade.stage = 1;

          // ASYMMETRIC LOCK: +0.8R secured!
          const riskDist = Math.abs(trade.entryPrice - trade.initialStop);
          trade.stopPrice = isLong ? trade.entryPrice + riskDist * 0.8 : trade.entryPrice - riskDist * 0.8;
          balance += pnl;
        }
      }

      // TP2 Hit: 25% exit, trailing stop
      if (trade.stage === 1) {
        const tp2 = trade.targets[1];
        const tp2Hit = isLong ? symBar.high >= tp2 : symBar.low <= tp2;
        if (tp2Hit) {
          const rule = rules.get(trade.symbol)!;
          const closeQty = grid(trade.qty * 0.25, rule.step);
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

      // TP3 or Trail Hit
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
          trade.exitReason = tp3Hit ? 'TP3_EXTENSION' : 'TRAILING_STOP';
          trade.exitTime = symBar.openTime;
          balance += pnl;
          closedTrades.push(trade);
          monthlySnapshots[curMonthName].trades.push(trade);
          activeTrades.splice(tIdx, 1);
          continue;
        }
      }

      // Max holding 24h
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

    // 2. Evaluate New Signals
    for (const sym of symbols) {
      if (activeTrades.some(t => t.symbol === sym)) continue;
      if (activeTrades.length >= MAX_CONCURRENT_POSITIONS) break;

      const lastTradeTime = lastTradeTimePerSymbol[sym] || 0;
      if (currentBar.openTime - lastTradeTime < 4 * 3600 * 1000) continue;

      const sym1h = klines1h.get(sym)!;
      const history1h = sym1h.slice(0, barIdx + 1);

      // ADX Trend Filter (ADX >= 25)
      const regime = detectMarketRegime(history1h.slice(-30));
      if (regime.adx < 25) continue;

      const sym4h = klines4h.get(sym)!;
      const history4h = sym4h.filter(b => b.closeTime <= currentBar.closeTime);

      const setup = evaluateFibonacciSetup(history1h, history4h);
      if (!setup || !setup.valid) continue;

      const symBar = sym1h[barIdx];
      const rule = rules.get(sym)!;
      const entryPrice = symBar.close;
      const stopPrice = grid(Math.max(setup.stopPrice, 0.0001), rule.tick, setup.side === 'LONG' ? 'floor' : 'ceil');
      const tp1 = grid(Math.max(setup.tp1, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp2 = grid(Math.max(setup.tp2, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp3 = grid(Math.max(setup.tp3, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');

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
        lastTradeTimePerSymbol[sym] = symBar.openTime;

        activeTrades.push({
          id: `${sym}-${barIdx}`,
          symbol: sym,
          side: setup.side,
          entryTime: symBar.openTime,
          maxTime: symBar.openTime + MAX_HOLDING_HOURS * 3600 * 1000,
          entryPrice,
          stopPrice,
          initialStop: stopPrice,
          targets: [tp1, tp2, tp3],
          qty,
          remainingQty: qty,
          stage: 0,
          trailingStop: 0,
          highWaterMark: entryPrice,
          realizedPnl: -entryFee,
          fees: entryFee
        });
      } catch {}
    }
  }

  // Force close any remaining open trades at the very end
  const finalBarIdx = startIndex + testBarsCount - 1;
  for (const t of activeTrades) {
    const symBar = klines1h.get(t.symbol)![finalBarIdx];
    const isLong = t.side === 'LONG';
    const exitPrice = symBar.close * (1 - (isLong ? 1 : -1) * SLIPPAGE);
    const fee = t.remainingQty * exitPrice * FEE_RATE;
    const pnl = grossPnl(t.side, t.entryPrice, exitPrice, t.remainingQty) - fee;
    t.realizedPnl += pnl;
    t.fees += fee;
    balance += pnl;
    closedTrades.push(t);
  }

  console.log('------------------------------------------------------------------------');
  console.log('  📅 AY-AY NƏTİCƏLƏR CƏDVƏLİ (12 AY):');
  console.log('------------------------------------------------------------------------');
  console.log('Ay       | Başlanğıc | Son Balans | Aylıq PnL   | Əməliyyat | Qələbə (%) | Max DD | Komissiya');
  console.log('---------+-----------+------------+-------------+-----------+------------+--------+----------');

  let cumulativeWins = 0;
  let totalFeesPaid = 0;

  for (let m = 0; m < monthNames.length; m++) {
    const mName = monthNames[m];
    const mSnap = monthlySnapshots[mName];
    const mTrades = mSnap.trades;
    const mWins = mTrades.filter(t => t.realizedPnl > 0.01).length;
    const mLosses = mTrades.filter(t => t.realizedPnl < -0.01).length;
    const mWR = mTrades.length ? ((mWins / mTrades.length) * 100).toFixed(1) : '0.0';
    const mFees = mTrades.reduce((s, t) => s + t.fees, 0);
    const mPnL = mTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const endBal = mSnap.startBal + mPnL;
    const pnlSign = mPnL >= 0 ? '+' : '';
    const pnlPct = ((mPnL / mSnap.startBal) * 100).toFixed(2);

    cumulativeWins += mWins;
    totalFeesPaid += mFees;

    console.log(
      `${mName}  | ` +
      `${mSnap.startBal.toFixed(2).padStart(8)}$ | ` +
      `${endBal.toFixed(2).padStart(9)}$ | ` +
      `${(pnlSign + mPnL.toFixed(2) + '$ (' + pnlSign + pnlPct + '%)').padStart(11)} | ` +
      `${mTrades.length.toString().padStart(9)} | ` +
      `${(mWins + '/' + mTrades.length + ' (' + mWR + '%)').padStart(10)} | ` +
      `${(mSnap.maxDD * 100).toFixed(1).padStart(5)}% | ` +
      `${mFees.toFixed(2).padStart(8)}$`
    );
  }

  const totalWins = closedTrades.filter(t => t.realizedPnl > 0.01).length;
  const overallWR = closedTrades.length ? ((totalWins / closedTrades.length) * 100).toFixed(1) : '0';
  const grossProfit = closedTrades.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(closedTrades.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';
  const netReturnPct = (((balance - START_BALANCE) / START_BALANCE) * 100).toFixed(2);

  console.log('------------------------------------------------------------------------');
  console.log('  🏆 YEKUN 1 İLLİK PORTFEL NƏTİCƏSİ:');
  console.log('------------------------------------------------------------------------');
  console.log(`  Başlanğıc Balans     : ${START_BALANCE.toFixed(2)} USDT`);
  console.log(`  Yekun Balans         : ${balance.toFixed(2)} USDT`);
  console.log(`  Xalis Gəlir (PnL)    : ${balance >= START_BALANCE ? '+' : ''}${(balance - START_BALANCE).toFixed(2)} USDT (${balance >= START_BALANCE ? '+' : ''}${netReturnPct}%)`);
  console.log(`  Ümumi Əməliyyat      : ${closedTrades.length}`);
  console.log(`  Uğurlu (Qələbə)      : ${totalWins} (${overallWR}%)`);
  console.log(`  Profit Factor (PF)   : ${profitFactor}`);
  console.log(`  Max Portfel Drawdown : ${(globalMaxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Ümumi Komissiya      : ${totalFeesPaid.toFixed(2)} USDT`);
  console.log('========================================================================\n');

  // Coin breakdown
  console.log('📊 KOİNLƏR ÜZRƏ PERFORMANS:');
  for (const sym of symbols) {
    const sTrades = closedTrades.filter(t => t.symbol === sym);
    const sWins = sTrades.filter(t => t.realizedPnl > 0.01).length;
    const sPnl = sTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const sFees = sTrades.reduce((s, t) => s + t.fees, 0);
    const sWR = sTrades.length ? ((sWins / sTrades.length) * 100).toFixed(1) : '0';
    console.log(`  ${sym.padEnd(10)}: PnL: ${sPnl >= 0 ? '+' : ''}${sPnl.toFixed(2)}$ | Əməliyyat: ${sTrades.length} | Qələbə: ${sWins} (${sWR}%) | Komissiya: ${sFees.toFixed(2)}$`);
  }
}

runPortfolioSimulation().catch(console.error);
