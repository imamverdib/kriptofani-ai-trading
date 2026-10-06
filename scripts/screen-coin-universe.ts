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

const CACHE_DIR = path.join(process.cwd(), 'data', 'klines-cache');

async function fetchKlinesCached(symbol: string, interval: string, start: number, end: number): Promise<RawKline[]> {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
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

async function screenCoin(symbol: string, rule: { step: string; minQty: number; tick: string; minNotional: number }) {
  const warmupStart = new Date('2025-08-15T00:00:00Z').getTime();
  const testStart = new Date('2025-09-01T00:00:00Z').getTime();
  const testEnd = new Date('2026-09-01T00:00:00Z').getTime();

  const bars1h = await fetchKlinesCached(symbol, '1h', warmupStart, testEnd);
  const bars4h = await fetchKlinesCached(symbol, '4h', warmupStart - 20 * 86400000, testEnd);

  const startIndex = bars1h.findIndex(b => b.openTime >= testStart);
  const testBarsCount = bars1h.filter(b => b.openTime >= testStart && b.openTime < testEnd).length;

  let balance = 100.0;
  let peakBalance = 100.0;
  let maxDrawdown = 0;
  const activeTrades: any[] = [];
  const closedTrades: any[] = [];
  let lastTradeTime = 0;

  for (let i = 0; i < testBarsCount; i++) {
    const barIdx = startIndex + i;
    const curBar = bars1h[barIdx];

    // Manage active trades
    for (let tIdx = activeTrades.length - 1; tIdx >= 0; tIdx--) {
      const trade = activeTrades[tIdx];
      const isLong = trade.side === 'LONG';
      if (isLong) trade.highWaterMark = Math.max(trade.highWaterMark, curBar.high);
      else trade.highWaterMark = Math.min(trade.highWaterMark, curBar.low);

      const stopHit = isLong ? curBar.low <= trade.stopPrice : curBar.high >= trade.stopPrice;
      if (stopHit) {
        const exitPrice = trade.stopPrice * (1 - (isLong ? 1 : -1) * 0.0005);
        const fee = trade.remainingQty * exitPrice * 0.0005;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
        trade.realizedPnl += pnl;
        trade.fees += fee;
        trade.remainingQty = 0;
        balance += pnl;
        closedTrades.push(trade);
        activeTrades.splice(tIdx, 1);
        continue;
      }

      // TP1 Hit: 50% exit, stop moved to +0.8R profit lock!
      if (trade.stage === 0) {
        const tp1 = trade.targets[0];
        const tp1Hit = isLong ? curBar.high >= tp1 : curBar.low <= tp1;
        if (tp1Hit) {
          const closeQty = grid(trade.qty * 0.5, rule.step);
          const exitPrice = tp1 * (1 - (isLong ? 1 : -1) * 0.0005);
          const fee = closeQty * exitPrice * 0.0005;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, closeQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty -= closeQty;
          trade.stage = 1;
          const riskDist = Math.abs(trade.entryPrice - trade.initialStop);
          trade.stopPrice = isLong ? trade.entryPrice + riskDist * 0.8 : trade.entryPrice - riskDist * 0.8;
          balance += pnl;
        }
      }

      // TP2 Hit: 25% exit, trailing stop
      if (trade.stage === 1) {
        const tp2 = trade.targets[1];
        const tp2Hit = isLong ? curBar.high >= tp2 : curBar.low <= tp2;
        if (tp2Hit) {
          const closeQty = grid(trade.qty * 0.25, rule.step);
          const exitPrice = tp2 * (1 - (isLong ? 1 : -1) * 0.0005);
          const fee = closeQty * exitPrice * 0.0005;
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
        const tp3Hit = isLong ? curBar.high >= tp3 : curBar.low <= tp3;
        if (isLong) trade.trailingStop = Math.max(trade.trailingStop, trade.highWaterMark * 0.985);
        else trade.trailingStop = Math.min(trade.trailingStop, trade.highWaterMark * 1.015);
        const trailHit = isLong ? curBar.low <= trade.trailingStop : curBar.high >= trade.trailingStop;
        if (tp3Hit || trailHit) {
          const exitBase = tp3Hit ? tp3 : trade.trailingStop;
          const exitPrice = exitBase * (1 - (isLong ? 1 : -1) * 0.0005);
          const fee = trade.remainingQty * exitPrice * 0.0005;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty = 0;
          balance += pnl;
          closedTrades.push(trade);
          activeTrades.splice(tIdx, 1);
          continue;
        }
      }

      // Max holding 24h
      if (curBar.openTime >= trade.maxTime && trade.remainingQty > 0) {
        const exitPrice = curBar.close * (1 - (isLong ? 1 : -1) * 0.0005);
        const fee = trade.remainingQty * exitPrice * 0.0005;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
        trade.realizedPnl += pnl;
        trade.fees += fee;
        trade.remainingQty = 0;
        balance += pnl;
        closedTrades.push(trade);
        activeTrades.splice(tIdx, 1);
      }
    }

    if (balance > peakBalance) peakBalance = balance;
    const dd = (peakBalance - balance) / peakBalance;
    if (dd > maxDrawdown) maxDrawdown = dd;

    // Check entry
    if (activeTrades.length >= 1) continue;
    if (curBar.openTime - lastTradeTime < 4 * 3600 * 1000) continue;

    const hist1h = bars1h.slice(0, barIdx + 1);
    const hist4h = bars4h.filter(b => b.closeTime <= curBar.closeTime);

    const regime = detectMarketRegime(hist1h.slice(-30));
    if (regime.adx < 25) continue; // Strong trend filter

    const setup = evaluateFibonacciSetup(hist1h, hist4h);
    if (!setup || !setup.valid) continue;

    const entryPrice = curBar.close;
    const stopPrice = grid(Math.max(setup.stopPrice, 0.0001), rule.tick, setup.side === 'LONG' ? 'floor' : 'ceil');
    const tp1 = grid(Math.max(setup.tp1, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
    const tp2 = grid(Math.max(setup.tp2, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
    const tp3 = grid(Math.max(setup.tp3, 0.0001), rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');

    try {
      const qty = sizePosition({
        equity: balance,
        available: balance,
        entry: entryPrice,
        stop: stopPrice,
        leverage: 2,
        riskPct: 1.0, // 1.0% risk ($1.00)
        allocationPct: 25, // 25% max allocation
        feeRate: 0.0005,
        slippage: 0.0005,
        step: rule.step
      });
      if (qty < rule.minQty || qty * entryPrice < rule.minNotional) continue;
      const entryFee = qty * entryPrice * 0.0005;
      balance -= entryFee;
      lastTradeTime = curBar.openTime;
      activeTrades.push({
        id: `${symbol}-${barIdx}`,
        symbol,
        side: setup.side,
        entryTime: curBar.openTime,
        maxTime: curBar.openTime + 24 * 3600 * 1000,
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

  const wins = closedTrades.filter(t => t.realizedPnl > 0.01).length;
  const wr = closedTrades.length ? ((wins / closedTrades.length) * 100).toFixed(1) : '0';
  const net = balance - 100;
  const grossProfit = closedTrades.filter(t => t.realizedPnl > 0).reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(closedTrades.filter(t => t.realizedPnl < 0).reduce((s, t) => s + t.realizedPnl, 0));
  const pf = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A';
  const totalFees = closedTrades.reduce((s, t) => s + t.fees, 0);

  return { symbol, balance, net, trades: closedTrades.length, wins, wr, maxDrawdown: maxDrawdown * 100, pf, fees: totalFees };
}

async function main() {
  console.log('🔍 KOİN PORTFELİ SKANERİ (1 İLLİK NƏTİCƏLƏR):');
  const candidates: { sym: string; rule: any }[] = [
    { sym: 'ETHUSDT', rule: { step: '0.001', minQty: 0.001, tick: '0.01', minNotional: 20 } },
    { sym: 'SOLUSDT', rule: { step: '0.01', minQty: 0.01, tick: '0.01', minNotional: 5 } },
    { sym: 'BNBUSDT', rule: { step: '0.01', minQty: 0.01, tick: '0.01', minNotional: 5 } },
    { sym: 'LINKUSDT', rule: { step: '0.01', minQty: 0.01, tick: '0.001', minNotional: 20 } },
    { sym: 'AVAXUSDT', rule: { step: '1', minQty: 1, tick: '0.01', minNotional: 5 } }
  ];

  for (const c of candidates) {
    try {
      const res = await screenCoin(c.sym, c.rule);
      const sign = res.net >= 0 ? '+' : '';
      console.log(`  ${res.symbol.padEnd(10)} -> Balans: ${res.balance.toFixed(2)}$ (${sign}${res.net.toFixed(2)}$) | Əməliyyat: ${res.trades} | Qələbə: ${res.wins} (${res.wr}%) | Max DD: ${res.maxDrawdown.toFixed(2)}% | PF: ${res.pf} | Komissiya: ${res.fees.toFixed(2)}$`);
    } catch (e: any) {
      console.error(`  Xəta: ${c.sym}:`, e.message);
    }
  }
}

main().catch(console.error);
