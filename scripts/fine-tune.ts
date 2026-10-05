import { readFile } from 'node:fs/promises';
import { simulate, portfolio, MINUTE, type Decision, type Config, type Dataset, type Bar, type Policy } from '../src/lib/counterfactual';

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

async function run() {
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

  console.log('=== EXPERIMENT 1: SYMBOL BREAKDOWN (Horizon 60m & 240m) ===');
  for (const h of [60, 240]) {
    console.log(`\n--- HORIZON ${h} MINUTES ---`);
    const symStats: Record<string, { total: number; longWins: number; longLoss: number; shortWins: number; shortLoss: number; netPnl: number }> = {};
    for (const d of decisions) {
      const ds = datasets.get(d.symbol);
      if (!ds) continue;
      if (!symStats[d.symbol]) symStats[d.symbol] = { total: 0, longWins: 0, longLoss: 0, shortWins: 0, shortLoss: 0, netPnl: 0 };
      
      const rL = simulate(d, 'LONG', ds, cfg, h, cutoff);
      const rS = simulate(d, 'SHORT', ds, cfg, h, cutoff);

      if (rL.status === 'SIMULATED' && rL.position) {
        symStats[d.symbol].total++;
        if (rL.position.net > 0) symStats[d.symbol].longWins++;
        else symStats[d.symbol].longLoss++;
        symStats[d.symbol].netPnl += rL.position.net;
      }
      if (rS.status === 'SIMULATED' && rS.position) {
        if (rS.position.net > 0) symStats[d.symbol].shortWins++;
        else symStats[d.symbol].shortLoss++;
        symStats[d.symbol].netPnl += rS.position.net;
      }
    }

    for (const [sym, st] of Object.entries(symStats)) {
      const lTotal = st.longWins + st.longLoss;
      const sTotal = st.shortWins + st.shortLoss;
      const lRate = lTotal ? (st.longWins / lTotal * 100).toFixed(1) + '%' : '0%';
      const sRate = sTotal ? (st.shortWins / sTotal * 100).toFixed(1) + '%' : '0%';
      console.log(`${sym.padEnd(10)} | Long: ${st.longWins}/${lTotal} (${lRate}) | Short: ${st.shortWins}/${sTotal} (${sRate}) | Total Net: ${st.netPnl.toFixed(3)} USDT`);
    }
  }

  console.log('\n=== EXPERIMENT 2: RSI THRESHOLD FINE-TUNING ===');
  const rsiBands = [
    { name: 'Oversold Mean Reversion (LONG if RSI < 35, SHORT if RSI > 65)', filter: (d: Decision, side: 'LONG'|'SHORT') => (side === 'LONG' && d.snapshot.rsi < 35) || (side === 'SHORT' && d.snapshot.rsi > 65) },
    { name: 'Moderate Reversion (LONG if RSI < 40, SHORT if RSI > 60)', filter: (d: Decision, side: 'LONG'|'SHORT') => (side === 'LONG' && d.snapshot.rsi < 40) || (side === 'SHORT' && d.snapshot.rsi > 60) },
    { name: 'Trend Momentum (LONG if RSI > 50 & Trend=LONG, SHORT if RSI < 50 & Trend=SHORT)', filter: (d: Decision, side: 'LONG'|'SHORT') => (side === 'LONG' && d.snapshot.rsi > 50 && d.snapshot.trend === 'LONG') || (side === 'SHORT' && d.snapshot.rsi < 50 && d.snapshot.trend === 'SHORT') },
    { name: 'Strong Trend Momentum (LONG if RSI 55-65 & Trend=LONG, SHORT if RSI 35-45 & Trend=SHORT)', filter: (d: Decision, side: 'LONG'|'SHORT') => (side === 'LONG' && d.snapshot.rsi >= 55 && d.snapshot.rsi <= 65 && d.snapshot.trend === 'LONG') || (side === 'SHORT' && d.snapshot.rsi >= 35 && d.snapshot.rsi <= 45 && d.snapshot.trend === 'SHORT') }
  ];

  for (const band of rsiBands) {
    let count = 0, wins = 0, losses = 0, totalNet = 0;
    for (const d of decisions) {
      const ds = datasets.get(d.symbol);
      if (!ds) continue;
      for (const side of ['LONG', 'SHORT'] as const) {
        if (!band.filter(d, side)) continue;
        const res = simulate(d, side, ds, cfg, 60, cutoff);
        if (res.status === 'SIMULATED' && res.position) {
          count++;
          if (res.position.net > 0) wins++;
          else losses++;
          totalNet += res.position.net;
        }
      }
    }
    const winRate = count ? (wins / count * 100).toFixed(1) + '%' : '0%';
    const avgNet = count ? (totalNet / count).toFixed(4) : '0';
    console.log(`\nStrategy (60m): ${band.name}`);
    console.log(`  Trades: ${count} | Wins: ${wins} (${winRate}) | Losses: ${losses} | Net PnL: ${totalNet.toFixed(2)} USDT | Avg/Trade: ${avgNet} USDT`);
  }

  console.log('\n=== EXPERIMENT 3: SAME RSI BANDS AT HORIZON 240m (4 Hours) ===');
  for (const band of rsiBands) {
    let count = 0, wins = 0, losses = 0, totalNet = 0;
    for (const d of decisions) {
      const ds = datasets.get(d.symbol);
      if (!ds) continue;
      for (const side of ['LONG', 'SHORT'] as const) {
        if (!band.filter(d, side)) continue;
        const res = simulate(d, side, ds, cfg, 240, cutoff);
        if (res.status === 'SIMULATED' && res.position) {
          count++;
          if (res.position.net > 0) wins++;
          else losses++;
          totalNet += res.position.net;
        }
      }
    }
    const winRate = count ? (wins / count * 100).toFixed(1) + '%' : '0%';
    const avgNet = count ? (totalNet / count).toFixed(4) : '0';
    console.log(`\nStrategy (240m): ${band.name}`);
    console.log(`  Trades: ${count} | Wins: ${wins} (${winRate}) | Losses: ${losses} | Net PnL: ${totalNet.toFixed(2)} USDT | Avg/Trade: ${avgNet} USDT`);
  }
}

run().catch(console.error);
