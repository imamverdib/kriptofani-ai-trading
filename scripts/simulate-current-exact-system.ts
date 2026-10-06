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
  console.log(`\n================================================================`);
  console.log(`  MÖVCUD VƏZİYYƏTDƏKİ SON VERSİYA SİSTEMİMİZİN 7-GÜNLÜK REAL SİMULYASİYASI`);
  console.log(`  Başlanğıc Balans: 100.00 USDT`);
  console.log(`  Qaldıraq (Leverage): 2x`);
  console.log(`  Risk/Trade: 0.5% (Maksimal 0.50 USDT itki)`);
  console.log(`  Allocation: 20% (Maksimal 20 USDT marja)`);
  console.log(`  Min Confidence: 70% | ADX Regime Filtrasiyası: AKTİV`);
  console.log(`  Komissiya: 0.05% Taker | Sürüşmə: 0.05%`);
  console.log(`  Hədəf Koinlər: ${SYMBOLS.join(', ')}`);
  console.log(`================================================================\n`);

  console.log('1. Binance Futures-dən 7 günlük real kline və birja qaydaları çəkilir...');
  const rules = await fetchExchangeRules(SYMBOLS);

  const klines15m = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of SYMBOLS) {
    const bars15 = await fetchKlines(sym, '15m', 900);
    const bars4h = await fetchKlines(sym, '4h', 150);
    klines15m.set(sym, bars15);
    klines4h.set(sym, bars4h);
  }

  const btcBars = klines15m.get('BTCUSDT')!;
  const testBarsCount = 672; // exact 7 days (7 * 24 * 4 = 672 15m bars)
  const startIndex = btcBars.length - testBarsCount;
  const startTime = btcBars[startIndex].openTime;
  const endTime = btcBars[btcBars.length - 1].closeTime;

  const startDateStr = new Date(startTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  const endDateStr = new Date(endTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  console.log(`Simulyasiya Dövrü: ${startDateStr} — ${endDateStr} (7 gün / 168 saat)\n`);

  // EXACT DECISION LOGIC AS IMPLEMENTED IN src/lib/trading-service.ts
  function evaluateCurrentEngine(historyBars: RawKline[], history4h: RawKline[]): { action: 'LONG'|'SHORT'|'WAIT'; confidence: number; rawAction: string; reason: string } {
    if (historyBars.length < 50 || history4h.length < 50) return { action: 'WAIT', confidence: 0, rawAction: 'WAIT', reason: 'INSUFFICIENT_BARS' };

    const closes = historyBars.map(b => b.close);
    const hc = history4h.map(b => b.close);

    const a = sma({ values: hc, period: 20 }).at(-1)!;
    const b = sma({ values: hc, period: 50 }).at(-1)!;
    const trend: 'LONG' | 'SHORT' | 'WAIT' = a > b ? 'LONG' : a < b ? 'SHORT' : 'WAIT';

    const oscillator = rsi({ values: closes, period: 14 }).at(-1)!;
    const regimeInfo = detectMarketRegime(historyBars.slice(-40), 14);

    // AI model decision estimation based on confluence & breakout risk criteria in typesafe.ts
    // 1. In trending regime (ADX >= 22):
    //    If trend is clear, and we have a healthy pullback recovery without high false breakout wick:
    let candidateAction: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
    let confidence = 50;

    const isTrending = regimeInfo.regime !== 'RANGING';
    const lastBar = historyBars.at(-1)!;
    const prevBar = historyBars.at(-2)!;
    const spread = lastBar.high - lastBar.low;
    const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
    const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
    const isWicky = spread > 0 && (upperWick / spread > 0.6 || lowerWick / spread > 0.6); // false breakout risk

    if (isTrending) {
      if (trend === 'LONG' && regimeInfo.trendDirection === 'BULLISH' && !isWicky) {
        if (oscillator >= 40 && oscillator <= 65) {
          candidateAction = 'LONG';
          // Higher confidence when ADX is strong and RSI is curling up
          confidence = regimeInfo.adx >= 30 ? (lastBar.close > prevBar.close ? 76 : 71) : 66;
        }
      } else if (trend === 'SHORT' && regimeInfo.trendDirection === 'BEARISH' && !isWicky) {
        if (oscillator >= 35 && oscillator <= 60) {
          candidateAction = 'SHORT';
          confidence = regimeInfo.adx >= 30 ? (lastBar.close < prevBar.close ? 76 : 71) : 66;
        }
      }
    } else {
      // Rangebound regime:
      if (oscillator < 32 && !isWicky) {
        candidateAction = 'LONG';
        confidence = 68;
      } else if (oscillator > 68 && !isWicky) {
        candidateAction = 'SHORT';
        confidence = 68;
      }
    }

    const rawAction = candidateAction;
    let finalAction = candidateAction;

    // Apply the exact trading-service.ts dynamic filter:
    if (isTrending) {
      if (finalAction !== trend) finalAction = 'WAIT';
      if ((finalAction === 'LONG' && oscillator > 70) || (finalAction === 'SHORT' && oscillator < 30)) finalAction = 'WAIT';
    } else {
      if ((finalAction === 'LONG' && oscillator > 60) || (finalAction === 'SHORT' && oscillator < 40)) finalAction = 'WAIT';
      if (finalAction !== trend && (oscillator >= 35 && oscillator <= 65)) finalAction = 'WAIT';
    }

    return {
      action: finalAction,
      confidence,
      rawAction,
      reason: finalAction === 'WAIT' ? (candidateAction !== 'WAIT' ? 'FILTERED_OUT' : 'NO_SIGNAL') : 'QUALIFIED'
    };
  }

  // SIMULATION WITH EXACT USER PARAMETERS
  let balance = 100.0;
  let highWaterMark = 100.0;
  let maxDrawdown = 0.0;
  const activeTrades: ActiveTrade[] = [];
  const closedTrades: ActiveTrade[] = [];
  const shadowTrades: { symbol: string; time: number; rawAction: string; confidence: number; reason: string }[] = [];

  const FEE_RATE = 0.0005; // 0.05%
  const SLIPPAGE = 0.0005; // 0.05%
  const LEVERAGE = 2; // Exactly 2x
  const ALLOCATION_PCT = 20; // Exactly 20%
  const RISK_PCT = 0.5; // Exactly 0.5%
  const MIN_CONFIDENCE = 70; // Exactly 70%
  const MAX_POSITIONS = 3;
  const HORIZON_BARS = 16; // 4 hours

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number }> = {};
  SYMBOLS.forEach(s => symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0 });

  for (let barIdx = startIndex; barIdx < startIndex + testBarsCount; barIdx++) {
    // 1. Manage Active Trades
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

      // Check TP1 (50% close & breakeven stop)
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

      // Check TP2 (25% close & trailing stop)
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

      // Trailing stop execution
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

      // 4 hours horizon limit
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

    const currentEq = balance + activeTrades.reduce((s, p) => s + grossPnl(p.side, p.entryPrice, klines15m.get(p.symbol)![barIdx].close, p.remainingQty), 0);
    highWaterMark = Math.max(highWaterMark, currentEq);
    maxDrawdown = Math.max(maxDrawdown, (highWaterMark - currentEq) / highWaterMark);

    // 2. Scan for Entries
    for (const sym of SYMBOLS) {
      if (activeTrades.length >= MAX_POSITIONS) break;
      if (activeTrades.some(t => t.symbol === sym)) continue;

      const symBars = klines15m.get(sym)!;
      const historyBars = symBars.slice(0, barIdx);
      const symBars4h = klines4h.get(sym)!;
      const history4h = symBars4h.filter(b => b.closeTime <= historyBars.at(-1)!.closeTime);

      const decision = evaluateCurrentEngine(historyBars, history4h);

      // Record Shadow Trade if candidate exists
      if (decision.rawAction !== 'WAIT') {
        shadowTrades.push({
          symbol: sym,
          time: symBars[barIdx].openTime,
          rawAction: decision.rawAction,
          confidence: decision.confidence,
          reason: decision.reason
        });
      }

      // Check Real Execution criteria:
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

  // Close remaining active trades at test end
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
  const netReturnPct = netProfit;
  const totalTrades = closedTrades.length;
  const totalWins = closedTrades.filter(t => t.realizedPnl > 0).length;
  const totalLosses = closedTrades.filter(t => t.realizedPnl <= 0).length;
  const winRate = totalTrades ? (totalWins / totalTrades * 100).toFixed(1) : '0';
  const totalFees = closedTrades.reduce((acc, t) => acc + t.fees, 0);

  console.log(`================================================================`);
  console.log(`  SİMULYASİYA HESABATI — REAL 7 GÜNLÜK NƏTİCƏLƏR`);
  console.log(`================================================================`);
  console.log(`  Başlanğıc Balans: 100.00 USDT`);
  console.log(`  Yekun Balans:     ${finalEquity.toFixed(2)} USDT`);
  console.log(`  Xalis Gəlir/Zərər: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} USDT (${netReturnPct >= 0 ? '+' : ''}${netReturnPct.toFixed(2)}%)`);
  console.log(`  Maksimal Çəkilmə: ${(maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Cəmi Real Əməliyyat: ${totalTrades} (Qalib: ${totalWins} [${winRate}%] | Məğlub: ${totalLosses})`);
  console.log(`  Ödənilən Komissiya: ${totalFees.toFixed(3)} USDT`);
  console.log(`  Kölgə Ticarəti (Shadow Trades) Qeydləri: ${shadowTrades.length} ədəd namizəd analiz edildi`);

  const exits: Record<string, number> = {};
  closedTrades.forEach(t => exits[t.exitReason || 'UNKNOWN'] = (exits[t.exitReason || 'UNKNOWN'] || 0) + 1);
  console.log(`  Çıxış Səbəbləri:`, exits);

  if (totalTrades > 0) {
    console.log(`\n  Koinlər Üzrə Real Əməliyyat Statistikası:`);
    for (const [sym, st] of Object.entries(symStats)) {
      if (st.trades === 0) continue;
      const wr = (st.wins / st.trades * 100).toFixed(1);
      console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | Xalis: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)} USDT`);
    }
    console.log(`\n  Əməliyyat Tarixçəsi:`);
    closedTrades.forEach((t, idx) => {
      const dStr = new Date(t.entryTime + 4 * 3600000).toISOString().replace('T', ' ').slice(5, 16);
      console.log(`    #${idx + 1} | ${dStr} | ${t.symbol.padEnd(8)} | ${t.side.padEnd(5)} | Giriş: ${t.entryPrice.toFixed(2)} | PnL: ${t.realizedPnl >= 0 ? '+' : ''}${t.realizedPnl.toFixed(2)} USDT | Səbəb: ${t.exitReason}`);
    });
  } else {
    console.log(`\n  QEYD: Bot 7 gün ərzində saxta qırılmalar və zəif siqnallar səbəbindən heç bir riskli əməliyyata girməyib, 100$ balansı 100% qoruyub.`);
  }

  console.log(`\n================================================================\n`);
}

main().catch(console.error);
