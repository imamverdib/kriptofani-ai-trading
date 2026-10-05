import { readFile } from 'node:fs/promises';
import { simulate, entryTime, makePosition, stepPosition, hasCoverage, MINUTE, type Decision, type Config, type Dataset, type Bar, type Position, type Side } from '../src/lib/counterfactual';
import { grossPnl } from '../src/lib/trading-math';

type RawBar = (number | string)[];
type MarketExport = {
  cutoff: number;
  source: string;
  capturedAt: number;
  exchangeInfo: {
    symbols: {
      symbol: string;
      filters: { filterType: string; stepSize: string; minQty: string; maxQty: string; tickSize: string; notional: string; minNotional: string }[];
    }[];
  };
  symbols: Record<string, { trade: RawBar[]; mark: RawBar[]; funding: { fundingTime: number; fundingRate: string; markPrice: string }[] }>;
};

const bar = (r: RawBar): Bar => ({
  time: Number(r[0]),
  open: Number(r[1]),
  high: Number(r[2]),
  low: Number(r[3]),
  close: Number(r[4]),
  volume: Number(r[5])
});

async function main() {
  const decPath = 'reports/counterfactual-data/decisions.json';
  const mktPath = 'reports/counterfactual-data/market.json';
  const decisionText = await readFile(decPath, 'utf8');
  const marketText = await readFile(mktPath, 'utf8');

  const exportData = JSON.parse(decisionText) as { capturedAt: number; decisions: Decision[] };
  const raw = JSON.parse(marketText) as MarketExport;
  const cutoff = Math.floor((raw.cutoff + 1) / MINUTE) * MINUTE;
  const decisions = exportData.decisions.filter(d => d.market === 'futures').sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));

  const datasets = new Map<string, Dataset>();
  for (const [symbol, r] of Object.entries(raw.symbols)) {
    const info = raw.exchangeInfo.symbols.find(s => s.symbol === symbol);
    if (!info) continue;
    const lot = info.filters.find(f => f.filterType === 'LOT_SIZE')!;
    const marketLot = info.filters.find(f => f.filterType === 'MARKET_LOT_SIZE') || lot;
    const tick = info.filters.find(f => f.filterType === 'PRICE_FILTER')!;
    const notional = info.filters.find(f => ['MIN_NOTIONAL', 'NOTIONAL'].includes(f.filterType))!;
    const marks = new Map(r.mark.map(v => [Number(v[0]), bar(v)]));
    const candles = new Map();
    let previous = -Infinity;
    for (const row of r.trade) {
      const t = bar(row), m = marks.get(t.time);
      if (t.time <= previous) continue;
      previous = t.time;
      if (m) candles.set(t.time, { trade: t, mark: m });
    }
    const funding = new Map();
    for (const f of r.funding) {
      const time = Number(f.fundingTime), rate = Number(f.fundingRate), mark = Number(f.markPrice);
      const key = Math.floor(time / MINUTE) * MINUTE;
      funding.set(key, [...(funding.get(key) || []), { time, rate, mark }]);
    }
    datasets.set(symbol, {
      candles,
      funding,
      rules: {
        step: lot.stepSize,
        minQty: Number(lot.minQty),
        maxQty: Number(lot.maxQty),
        marketStep: marketLot.stepSize,
        marketMin: Number(marketLot.minQty),
        marketMax: Number(marketLot.maxQty),
        tick: tick.tickSize,
        minNotional: Number(notional.notional || notional.minNotional)
      }
    });
  }

  const cfg: Config = {
    allocation: 20,
    risk: 0.5,
    leverage: 2,
    maxPositions: 3,
    confidence: 75,
    fee: 0.0005,
    slippage: 0.0005
  };

  // Run portfolio simulation for Mean Reversion (RSI < 35 -> LONG, RSI > 65 -> SHORT)
  function runPortfolio(
    policyName: string,
    chooseFn: (d: Decision) => Side | null,
    horizonMinutes: number
  ) {
    const schedule = new Map<number, Decision[]>();
    for (const d of decisions) {
      const t = entryTime(d);
      if (t >= cutoff) continue;
      const a = schedule.get(t) || [];
      a.push(d);
      schedule.set(t, a);
    }

    const active: Position[] = [], closed: Position[] = [];
    const skipped: Record<string, number> = {};
    let balance = 100, high = 100, maxDD = 0, frozen = false, day = '', dayStart = 100;
    const skip = (r: string) => { skipped[r] = (skipped[r] || 0) + 1; };

    const start = Math.min(...schedule.keys());
    const equity = () => balance + active.reduce((s, p) => s + grossPnl(p.side, p.entry, p.lastMark, p.remaining), 0);

    for (let t = start; t < cutoff; t += MINUTE) {
      for (const p of active) {
        const c = datasets.get(p.symbol)!.candles.get(t);
        if (c) p.lastMark = c.mark.open;
      }
      const currentDay = new Date(t).toISOString().slice(0, 10);
      if (currentDay !== day) {
        day = currentDay;
        dayStart = equity();
      }
      const eq = equity();
      high = Math.max(high, eq);
      maxDD = Math.max(maxDD, (high - eq) / high);
      if (eq < dayStart * 0.98 || eq < high * 0.95) frozen = true;

      for (const d of schedule.get(t) || []) {
        const side = chooseFn(d);
        if (!side) { skip('NO_SIGNAL'); continue; }
        if (frozen) { skip('RISK_FREEZE'); continue; }
        if (active.some(p => p.symbol === d.symbol)) { skip('SYMBOL_OPEN'); continue; }
        if (active.length >= cfg.maxPositions) { skip('MAX_POSITIONS'); continue; }

        const data = datasets.get(d.symbol);
        if (!data) { skip('NO_DATASET'); continue; }
        const end = Math.min(t + horizonMinutes * MINUTE, cutoff);
        if (!hasCoverage(data, t, end)) { skip('DATA_GAP'); continue; }

        try {
          const curEq = equity();
          const available = Math.max(0, curEq - active.reduce((s, p) => s + p.remaining * p.entry / cfg.leverage, 0));
          const p = makePosition(d, side, data, cfg, curEq, available, end);
          if (p.risk + active.reduce((s, p) => s + p.risk, 0) > curEq * 0.02) { skip('PORTFOLIO_RISK'); continue; }
          if (p.notional + active.reduce((s, p) => s + p.notional, 0) > curEq) { skip('GROSS_NOTIONAL'); continue; }
          balance += p.net;
          active.push(p);
        } catch (e) {
          const reason = e instanceof Error ? e.message : 'UNKNOWN';
          skip(reason);
        }
      }

      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        const data = datasets.get(p.symbol)!;
        const c = data.candles.get(t);
        if (!c) continue;
        stepPosition(p, c, data.funding.get(t) || [], data.rules, cfg);
        if (p.remaining <= 1e-12) {
          balance += p.net;
          closed.push(p);
          active.splice(i, 1);
        }
      }
    }

    const wins = closed.filter(p => p.net > 0).length;
    const losses = closed.filter(p => p.net < 0).length;
    const totalPnl = closed.reduce((acc, p) => acc + p.net, 0);

    console.log(`\n================ PORTFOLIO: ${policyName} (Horizon: ${horizonMinutes}m) ================`);
    console.log(`Starting Equity: 100.00 USDT`);
    console.log(`Final Equity:    ${equity().toFixed(4)} USDT (Net: ${(equity() - 100).toFixed(4)} USDT)`);
    console.log(`Max Drawdown:    ${(maxDD * 100).toFixed(2)}%`);
    console.log(`Closed Trades:   ${closed.length} | Wins: ${wins} (${closed.length ? (wins/closed.length*100).toFixed(1) : 0}%) | Losses: ${losses}`);
    console.log(`Risk Freeze Hit: ${frozen ? 'YES' : 'NO'}`);
    console.log(`Skipped Reasons:`, skipped);
    if (closed.length > 0) {
      console.log(`Sample Closed Trades (first 3):`);
      for (const t of closed.slice(0, 3)) {
        console.log(`  ${t.symbol} ${t.side} | Entry: ${t.entry} | Net: ${t.net.toFixed(4)} | Reason: ${t.endReason}`);
      }
    }
  }

  // 1. Mean Reversion Strong (RSI < 35 -> LONG, RSI > 65 -> SHORT) at 60m and 240m
  runPortfolio(
    'Mean Reversion (RSI < 35 / > 65)',
    d => d.snapshot.rsi < 35 ? 'LONG' : d.snapshot.rsi > 65 ? 'SHORT' : null,
    60
  );

  runPortfolio(
    'Mean Reversion (RSI < 35 / > 65)',
    d => d.snapshot.rsi < 35 ? 'LONG' : d.snapshot.rsi > 65 ? 'SHORT' : null,
    240
  );

  // 2. Mean Reversion Moderate (RSI < 40 -> LONG, RSI > 60 -> SHORT) at 60m and 240m
  runPortfolio(
    'Moderate Reversion (RSI < 40 / > 60)',
    d => d.snapshot.rsi < 40 ? 'LONG' : d.snapshot.rsi > 60 ? 'SHORT' : null,
    60
  );

  runPortfolio(
    'Moderate Reversion (RSI < 40 / > 60)',
    d => d.snapshot.rsi < 40 ? 'LONG' : d.snapshot.rsi > 60 ? 'SHORT' : null,
    240
  );
}

main().catch(console.error);
