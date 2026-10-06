import { evaluateFibonacciSetup } from '../src/lib/quant-fibonacci';
import { detectMarketRegime } from '../src/lib/quant-math';
import { grid, sizePosition, grossPnl } from '../src/lib/trading-math';
import * as fs from 'fs';

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const warmupStart = new Date('2025-08-15T00:00:00Z').getTime();
const testStart = new Date('2025-09-01T00:00:00Z').getTime();
const testEnd = new Date('2026-09-01T00:00:00Z').getTime();

const klines1h = new Map<string, any[]>();
const klines4h = new Map<string, any[]>();
for (const s of symbols) {
  klines1h.set(s, JSON.parse(fs.readFileSync('data/klines-cache/' + s + '_1h_' + warmupStart + '_' + testEnd + '.json', 'utf-8')));
  klines4h.set(s, JSON.parse(fs.readFileSync('data/klines-cache/' + s + '_4h_' + (warmupStart - 20 * 86400000) + '_' + testEnd + '.json', 'utf-8')));
}

const rules = new Map([
  ['BTCUSDT', { step: '0.001', minQty: 0.001, tick: '0.1', minNotional: 50 }],
  ['ETHUSDT', { step: '0.001', minQty: 0.001, tick: '0.01', minNotional: 20 }],
  ['SOLUSDT', { step: '0.01', minQty: 0.01, tick: '0.01', minNotional: 5 }]
]);

const btcBars = klines1h.get('BTCUSDT')!;
const startIndex = btcBars.findIndex((b: any) => b.openTime >= testStart);
const testBarsCount = btcBars.filter((b: any) => b.openTime >= testStart && b.openTime < testEnd).length;

const modes = ['CURRENT', 'LOCK_PROFIT_AT_TP1', 'MIN_WAVE_3PCT', 'ADX_25_TREND'];

for (const mode of modes) {
  let balance = 100.0;
  const activeTrades: any[] = [];
  const closedTrades: any[] = [];
  const lastTradeTimePerSymbol: Record<string, number> = {};

  for (let i = 0; i < testBarsCount; i++) {
    const barIdx = startIndex + i;
    const currentBar = btcBars[barIdx];

    for (let tIdx = activeTrades.length - 1; tIdx >= 0; tIdx--) {
      const trade = activeTrades[tIdx];
      const symBar = klines1h.get(trade.symbol)![barIdx];
      const isLong = trade.side === 'LONG';
      if (isLong) trade.highWaterMark = Math.max(trade.highWaterMark, symBar.high);
      else trade.highWaterMark = Math.min(trade.highWaterMark, symBar.low);

      const stopHit = isLong ? symBar.low <= trade.stopPrice : symBar.high >= trade.stopPrice;
      if (stopHit) {
        const exitPrice = trade.stopPrice * (1 - (isLong ? 1 : -1) * 0.0005);
        const fee = trade.remainingQty * exitPrice * 0.0005;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
        trade.realizedPnl += pnl;
        trade.fees += fee;
        trade.remainingQty = 0;
        trade.exitReason = 'STOP';
        balance += pnl;
        closedTrades.push(trade);
        activeTrades.splice(tIdx, 1);
        continue;
      }

      // TP1 Hit
      if (trade.stage === 0) {
        const tp1 = trade.targets[0];
        const tp1Hit = isLong ? symBar.high >= tp1 : symBar.low <= tp1;
        if (tp1Hit) {
          const closeQty = grid(trade.qty * 0.5, rules.get(trade.symbol)!.step);
          const exitPrice = tp1 * (1 - (isLong ? 1 : -1) * 0.0005);
          const fee = closeQty * exitPrice * 0.0005;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, closeQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty -= closeQty;
          trade.stage = 1;
          
          if (mode === 'LOCK_PROFIT_AT_TP1') {
            const riskDist = Math.abs(trade.entryPrice - trade.initialStop);
            trade.stopPrice = isLong ? trade.entryPrice + riskDist * 0.8 : trade.entryPrice - riskDist * 0.8;
          } else {
            trade.stopPrice = trade.entryPrice;
          }
          balance += pnl;
        }
      }

      if (trade.stage === 1) {
        const tp2 = trade.targets[1];
        const tp2Hit = isLong ? symBar.high >= tp2 : symBar.low <= tp2;
        if (tp2Hit) {
          const closeQty = grid(trade.qty * 0.25, rules.get(trade.symbol)!.step);
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

      if (trade.stage === 2) {
        const tp3 = trade.targets[2];
        const tp3Hit = isLong ? symBar.high >= tp3 : symBar.low <= tp3;
        if (isLong) trade.trailingStop = Math.max(trade.trailingStop, trade.highWaterMark * 0.985);
        else trade.trailingStop = Math.min(trade.trailingStop, trade.highWaterMark * 1.015);
        const trailHit = isLong ? symBar.low <= trade.trailingStop : symBar.high >= trade.trailingStop;
        if (tp3Hit || trailHit) {
          const exitBase = tp3Hit ? tp3 : trade.trailingStop;
          const exitPrice = exitBase * (1 - (isLong ? 1 : -1) * 0.0005);
          const fee = trade.remainingQty * exitPrice * 0.0005;
          const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
          trade.realizedPnl += pnl;
          trade.fees += fee;
          trade.remainingQty = 0;
          trade.exitReason = 'TP3_OR_TRAIL';
          balance += pnl;
          closedTrades.push(trade);
          activeTrades.splice(tIdx, 1);
          continue;
        }
      }

      if (symBar.openTime >= trade.maxTime && trade.remainingQty > 0) {
        const exitPrice = symBar.close * (1 - (isLong ? 1 : -1) * 0.0005);
        const fee = trade.remainingQty * exitPrice * 0.0005;
        const pnl = grossPnl(trade.side, trade.entryPrice, exitPrice, trade.remainingQty) - fee;
        trade.realizedPnl += pnl;
        trade.fees += fee;
        trade.remainingQty = 0;
        trade.exitReason = 'HORIZON';
        balance += pnl;
        closedTrades.push(trade);
        activeTrades.splice(tIdx, 1);
      }
    }

    for (const sym of symbols) {
      if (activeTrades.some(t => t.symbol === sym)) continue;
      if (activeTrades.length >= 2) break;
      const lastTradeTime = lastTradeTimePerSymbol[sym] || 0;
      if (currentBar.openTime - lastTradeTime < 4 * 3600 * 1000) continue;

      const sym1h = klines1h.get(sym)!;
      const history1h = sym1h.slice(0, barIdx + 1);
      const sym4h = klines4h.get(sym)!;
      const history4h = sym4h.filter((b: any) => b.closeTime <= currentBar.closeTime);

      const regimeInfo = detectMarketRegime(history1h.slice(-30));
      const minAdx = mode === 'ADX_25_TREND' ? 25 : 20;
      if (regimeInfo.adx < minAdx) continue;
      if (regimeInfo.regime === 'RANGING' && regimeInfo.adx < 22) continue;

      const minWave = mode === 'MIN_WAVE_3PCT' ? 0.03 : 0.02;
      const setup = evaluateFibonacciSetup(history1h, history4h, minWave);
      if (!setup || !setup.valid) continue;

      const symBar = sym1h[barIdx];
      const rule = rules.get(sym)!;
      const entryPrice = symBar.close;
      const stopPrice = grid(setup.stopPrice, rule.tick, setup.side === 'LONG' ? 'floor' : 'ceil');
      const tp1 = grid(setup.tp1, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp2 = grid(setup.tp2, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');
      const tp3 = grid(setup.tp3, rule.tick, setup.side === 'LONG' ? 'ceil' : 'floor');

      try {
        const allocPct = sym === 'BTCUSDT' ? 40 : 20;
        const qty = sizePosition({
          equity: balance,
          available: balance,
          entry: entryPrice,
          stop: stopPrice,
          leverage: 2,
          riskPct: 0.5,
          allocationPct: allocPct,
          feeRate: 0.0005,
          slippage: 0.0005,
          step: rule.step
        });
        if (qty < rule.minQty || qty * entryPrice < rule.minNotional) continue;
        const entryFee = qty * entryPrice * 0.0005;
        balance -= entryFee;
        lastTradeTimePerSymbol[sym] = symBar.openTime;
        activeTrades.push({
          id: sym + '-' + barIdx,
          symbol: sym,
          side: setup.side,
          entryTime: symBar.openTime,
          maxTime: symBar.openTime + 16 * 3600 * 1000,
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

  const wins = closedTrades.filter(t => t.realizedPnl > 0.01).length;
  const wr = closedTrades.length ? ((wins / closedTrades.length) * 100).toFixed(1) : '0';
  console.log(`Mode: ${mode.padEnd(22)} -> Balans: ${balance.toFixed(2)} USDT (PnL: ${(balance - 100).toFixed(2)}$, Əməliyyat: ${closedTrades.length}, Qələbə: ${wins}, WR: ${wr}%)`);
}
