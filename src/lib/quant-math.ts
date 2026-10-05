import { positive } from './trading-math';
import { adx } from 'technicalindicators';
export interface QuantPlan {
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskDistance: number;
  riskPercent: number;
  rewardPercent: number;
  riskRewardRatio: number;
}

export interface KlineBar {
  high: number;
  low: number;
  close: number;
}

/**
 * Calculates Average True Range (ATR) over 14 periods
 */
export function calculateATR(bars: KlineBar[], period = 14): number {
  if (bars.length < period + 1) {
    // Fallback: estimate from last bar spread
    const last = bars[bars.length - 1];
    return Math.max(last ? (last.high - last.low) : 0, 0.0001);
  }

  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const prev = bars[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trValues.push(tr);
  }

  const recentTR = trValues.slice(-period);
  const sum = recentTR.reduce((acc, val) => acc + val, 0);
  return sum / recentTR.length;
}

/**
 * Computes a deterministic risk plan; profitability must be validated separately
 * based on structural support/resistance and ATR volatility.
 */
export function computeQuantPlan(
  action: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  currentPrice: number,
  bars: KlineBar[] = [],
  supportLevels: number[] = [],
  resistanceLevels: number[] = []
): QuantPlan {
  positive(currentPrice, 'entry');
  for (const b of bars) { positive(b.high); positive(b.low); positive(b.close); if(b.high<b.low)throw new Error('Invalid candle'); }
  const entryPrice = currentPrice;
  const atr = calculateATR(bars, 14);
  const volatilityBuffer = atr * 1.5;

  let stopLossPrice = 0;

  if (action === 'LONG' || action === 'BUY') {
    // Find closest structural support below current price
    const validSupports = supportLevels
      .filter((s) => s < currentPrice && s > currentPrice * 0.96)
      .sort((a, b) => b - a); // closest first

    if (validSupports.length > 0) {
      stopLossPrice = validSupports[0] * 0.998; // 0.2% below structure
    } else {
      stopLossPrice = currentPrice - volatilityBuffer;
    }

    // Safety boundary: Stop-loss must be between 0.5% and 2.5%
    const minSL = currentPrice * 0.995; // 0.5% max tightness
    const maxSL = currentPrice * 0.975; // 2.5% max width

    if (stopLossPrice > minSL) stopLossPrice = minSL;
    if (stopLossPrice < maxSL) stopLossPrice = maxSL;

    const riskDistance = currentPrice - stopLossPrice;
    const takeProfit1 = currentPrice + riskDistance * 2.0; // 1:2 R:R (50%)
    const takeProfit2 = currentPrice + riskDistance * 3.0; // 1:3 R:R (25%)
    const takeProfit3 = currentPrice + riskDistance * 4.0; // 1:4 R:R (25%)

    return {
      entryPrice,
      stopLossPrice,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      riskDistance,
      riskPercent: Number(((riskDistance / currentPrice) * 100).toFixed(2)),
      rewardPercent: Number((((takeProfit1 - currentPrice) / currentPrice) * 100).toFixed(2)),
      riskRewardRatio: 2.0
    };
  } else {
    // SHORT / SELL
    const validResistances = resistanceLevels
      .filter((r) => r > currentPrice && r < currentPrice * 1.04)
      .sort((a, b) => a - b); // closest first

    if (validResistances.length > 0) {
      stopLossPrice = validResistances[0] * 1.002; // 0.2% above structure
    } else {
      stopLossPrice = currentPrice + volatilityBuffer;
    }

    // Safety boundary: Stop-loss between 0.5% and 2.5%
    const minSL = currentPrice * 1.005; // 0.5%
    const maxSL = currentPrice * 1.025; // 2.5%

    if (stopLossPrice < minSL) stopLossPrice = minSL;
    if (stopLossPrice > maxSL) stopLossPrice = maxSL;

    const riskDistance = stopLossPrice - currentPrice;
    const takeProfit1 = currentPrice - riskDistance * 2.0; // 1:2 R:R (50%)
    const takeProfit2 = currentPrice - riskDistance * 3.0; // 1:3 R:R (25%)
    const takeProfit3 = currentPrice - riskDistance * 4.0; // 1:4 R:R (25%)

    return {
      entryPrice,
      stopLossPrice,
      takeProfit1,
      takeProfit2,
      takeProfit3,
      riskDistance,
      riskPercent: Number(((riskDistance / currentPrice) * 100).toFixed(2)),
      rewardPercent: Number((((currentPrice - takeProfit1) / currentPrice) * 100).toFixed(2)),
      riskRewardRatio: 2.0
    };
  }
}

/**
 * Finds key swing structural support and resistance levels from candlestick history
 */
export function findSwingLevels(bars: KlineBar[], lookback = 36): { supports: number[]; resistances: number[] } {
  if (!bars || bars.length < 5) return { supports: [], resistances: [] };
  const slice = bars.slice(-Math.max(lookback, 10));
  const supports: number[] = [];
  const resistances: number[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const b = slice[i];
    if (b.low <= slice[i - 1].low && b.low <= slice[i - 2].low && b.low <= slice[i + 1].low && b.low <= slice[i + 2].low) {
      supports.push(b.low);
    }
    if (b.high >= slice[i - 1].high && b.high >= slice[i - 2].high && b.high >= slice[i + 1].high && b.high >= slice[i + 2].high) {
      resistances.push(b.high);
    }
  }

  const minLow = Math.min(...slice.map(b => b.low));
  const maxHigh = Math.max(...slice.map(b => b.high));
  if (!supports.includes(minLow)) supports.push(minLow);
  if (!resistances.includes(maxHigh)) resistances.push(maxHigh);

  return {
    supports: supports.sort((a, b) => b - a),
    resistances: resistances.sort((a, b) => a - b)
  };
}

export type MarketRegime = 'UNKNOWN' | 'RANGING' | 'TRENDING' | 'STRONG_TREND';

export interface MarketRegimeInfo {
  regime: MarketRegime;
  adx: number;
  pdi: number;
  mdi: number;
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Detects whether the market is in consolidation (ranging) or trending (directional momentum).
 * Returns UNKNOWN if data is insufficient or invalid.
 */
export function detectMarketRegime(bars: KlineBar[], period = 14): MarketRegimeInfo {
  if (!bars || bars.length < period * 2) {
    return {
      regime: 'UNKNOWN',
      adx: 0,
      pdi: 0,
      mdi: 0,
      trendDirection: 'NEUTRAL'
    };
  }

  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const closes = bars.map(b => b.close);

  const adxResults = adx({ high: highs, low: lows, close: closes, period });
  const latest = adxResults.at(-1);

  if (!latest || typeof latest.adx !== 'number' || !Number.isFinite(latest.adx)) {
    return {
      regime: 'UNKNOWN',
      adx: 0,
      pdi: 0,
      mdi: 0,
      trendDirection: 'NEUTRAL'
    };
  }

  const currentAdx = latest.adx;
  const pdi = latest.pdi ?? 0;
  const mdi = latest.mdi ?? 0;

  let regime: MarketRegime = 'RANGING';
  if (currentAdx >= 35) {
    regime = 'STRONG_TREND';
  } else if (currentAdx >= 22) {
    regime = 'TRENDING';
  } else {
    regime = 'RANGING';
  }

  let trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (pdi > mdi + 3) {
    trendDirection = 'BULLISH';
  } else if (mdi > pdi + 3) {
    trendDirection = 'BEARISH';
  }

  return {
    regime,
    adx: Number(currentAdx.toFixed(2)),
    pdi: Number(pdi.toFixed(2)),
    mdi: Number(mdi.toFixed(2)),
    trendDirection
  };
}
