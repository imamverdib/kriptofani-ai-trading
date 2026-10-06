import { rsi, sma } from 'technicalindicators';
import { calculateATR, computeQuantPlan, detectMarketRegime } from '../src/lib/quant-math';
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

async function main() {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NEARUSDT'];

  console.log(`\n================================================================`);
  console.log(`  İYUL 2026 REAL BAZAR SİMULYASİYASI — 1H SNIPER STRATEGİYASI`);
  console.log(`  Zaman İntervalı: 1 SAAT (1H) | Trend Təsdiqi: 4 SAAT (4H)`);
  console.log(`  Başlanğıc Balans: 100.00 USDT | Leverage: 2x`);
  console.log(`  Risk/Trade: 0.5% (Maksimal 0.50$ itki) | Allocation: 20%`);
  console.log(`  Komissiya: 0.05% Taker | Sürüşmə: 0.05%`);
  console.log(`  Koinlər: ${SYMBOLS.join(', ')}`);
  console.log(`================================================================\n`);

  const rules = await fetchExchangeRules(SYMBOLS);

  // Exact July 2026: 2026-07-01 00:00:00 UTC to 2026-08-01 00:00:00 UTC (31 days)
  const julyStart = new Date('2026-07-01T00:00:00Z').getTime();
  const julyEnd = new Date('2026-08-01T00:00:00Z').getTime();

  // Warmup from June 18, 2026 for 1H bars
  const warmupStart1h = julyStart - 13 * 24 * 3600 * 1000;
  // Warmup from May 15, 2026 for 4H bars
  const warmupStart4h = julyStart - 45 * 24 * 3600 * 1000;

  const klines1h = new Map<string, RawKline[]>();
  const klines4h = new Map<string, RawKline[]>();

  for (const sym of SYMBOLS) {
    const bars1 = await fetchKlinesRange(sym, '1h', warmupStart1h, julyEnd);
    const bars4 = await fetchKlinesRange(sym, '4h', warmupStart4h, julyEnd);
    klines1h.set(sym, bars1);
    klines4h.set(sym, bars4);
    console.log(`  ✓ ${sym.padEnd(8)}: ${bars1.length} ədəd 1h şam, ${bars4.length} ədəd 4h şam yükləndi`);
  }

  // Find exact start index for July 1 00:00
  const btcBars1h = klines1h.get('BTCUSDT')!;
  const startIndex = btcBars1h.findIndex(b => b.openTime >= julyStart);
  const endIndex = btcBars1h.findIndex(b => b.openTime >= julyEnd);
  const testBarsCount = (endIndex !== -1 ? endIndex : btcBars1h.length) - startIndex;

  const startStr = new Date(btcBars1h[startIndex].openTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  const endStr = new Date(btcBars1h[startIndex + testBarsCount - 1].closeTime + 4 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (Bakı)';
  console.log(`\nTest Müddəti: ${startStr} — ${endStr} (Tam 31 gün / 744 saat)\n`);

  let balance = 100.0;
  let highWaterMark = 100.0;
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
  const HORIZON_BARS = 24; // 24 hours max holding time on 1H timeframe

  const symStats: Record<string, { trades: number; wins: number; losses: number; netPnl: number }> = {};
  SYMBOLS.forEach(s => {
    symStats[s] = { trades: 0, wins: 0, losses: 0, netPnl: 0 };
    lastTradeTimePerSymbol[s] = 0;
  });

  for (let barIdx = startIndex; barIdx < startIndex + testBarsCount; barIdx++) {
    // 1. Manage Active Positions
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
        t.exitReason = 'STOP_LOSS';
        t.exitTime = curBar.openTime;
        balance += pnl;
        closedTrades.push(t);
        activeTrades.splice(i, 1);
        continue;
      }

      // TP1 (2R -> 50% close & move stop to BE)
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

      // TP2 (3R -> 25% close & activate 1.5% trailing stop)
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
          t.exitTime = curBar.openTime;
          balance += pnl;
          closedTrades.push(t);
          activeTrades.splice(i, 1);
          continue;
        }
      }

      // 24 hours horizon exit
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

    const currentEq = balance + activeTrades.reduce((s, p) => s + grossPnl(p.side, p.entryPrice, klines1h.get(p.symbol)![barIdx].close, p.remainingQty), 0);
    highWaterMark = Math.max(highWaterMark, currentEq);
    maxDrawdown = Math.max(maxDrawdown, (highWaterMark - currentEq) / highWaterMark);

    // 2. Scan for Entries
    for (const sym of SYMBOLS) {
      if (activeTrades.length >= MAX_POSITIONS) break;
      if (activeTrades.some(t => t.symbol === sym)) continue;

      const symBars = klines1h.get(sym)!;
      const historyBars = symBars.slice(0, barIdx);
      if (historyBars.length < 50) continue;

      const symBars4h = klines4h.get(sym)!;
      const history4h = symBars4h.filter(b => b.closeTime <= historyBars.at(-1)!.closeTime);
      if (history4h.length < 50) continue;

      // Cooldown: at least 8 hours between trades on same coin
      if (symBars[barIdx].openTime - lastTradeTimePerSymbol[sym] < 8 * 3600 * 1000) continue;

      const hc = history4h.map(b => b.close);
      const sma20 = sma({ values: hc, period: 20 }).at(-1)!;
      const sma50 = sma({ values: hc, period: 50 }).at(-1)!;
      const trend4h: 'LONG' | 'SHORT' | 'WAIT' = sma20 > sma50 ? 'LONG' : sma20 < sma50 ? 'SHORT' : 'WAIT';
      if (trend4h === 'WAIT') continue;

      const closes = historyBars.map(b => b.close);
      const oscillator = rsi({ values: closes, period: 14 }).at(-1)!;
      const regimeInfo = detectMarketRegime(historyBars.slice(-30), 14);

      if (regimeInfo.regime === 'RANGING') continue;

      // Reject wicky candles (false breakouts)
      const lastBar = historyBars.at(-1)!;
      const spread = lastBar.high - lastBar.low;
      const upperWick = lastBar.high - Math.max(lastBar.open, lastBar.close);
      const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
      if (spread > 0 && (upperWick / spread > 0.55 || lowerWick / spread > 0.55)) continue;

      // Clean trend pullback criteria
      let action: 'LONG' | 'SHORT' | null = null;
      if (trend4h === 'LONG' && regimeInfo.trendDirection === 'BULLISH') {
        if (oscillator >= 38 && oscillator <= 55) action = 'LONG';
      } else if (trend4h === 'SHORT' && regimeInfo.trendDirection === 'BEARISH') {
        if (oscillator >= 45 && oscillator <= 62) action = 'SHORT';
      }

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
          maxTime: curBar.openTime + HORIZON_BARS * 3600 * 1000,
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
  console.log(`  İYUL 2026 YEKUN NƏTİCƏLƏRİ`);
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

  console.log(`\n  Koinlər Üzrə Nəticələr:`);
  for (const [sym, st] of Object.entries(symStats)) {
    if (st.trades === 0) continue;
    const wr = (st.wins / st.trades * 100).toFixed(1);
    console.log(`    ${sym.padEnd(8)}: ${st.trades} əməliyyat | ${st.wins} qələbə (${wr}%) | Xalis: ${st.netPnl >= 0 ? '+' : ''}${st.netPnl.toFixed(2)} USDT`);
  }

  console.log(`\n  Bütün Əməliyyatların Siyahısı (İyul 2026):`);
  closedTrades.forEach((t, idx) => {
    const dStr = new Date(t.entryTime + 4 * 3600000).toISOString().replace('T', ' ').slice(5, 16);
    console.log(`    #${idx + 1} | ${dStr} | ${t.symbol.padEnd(8)} | ${t.side.padEnd(5)} | Giriş: ${t.entryPrice.toFixed(2)} | PnL: ${t.realizedPnl >= 0 ? '+' : ''}${t.realizedPnl.toFixed(2)} USDT | Səbəb: ${t.exitReason}`);
  });

  console.log(`\n================================================================\n`);
}

main().catch(console.error);
