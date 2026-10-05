import { sma } from 'technicalindicators';
import type { KlineBar } from './quant-math';
import { positive } from './trading-math';

export interface FibonacciLevels {
  swingLow: number;
  swingHigh: number;
  range: number;
  fib0: number;       // 0.0 (Extremum)
  fib0_236: number;   // 23.6%
  fib0_382: number;   // 38.2%
  fib0_500: number;   // 50.0% (Equilibrium)
  fib0_618: number;   // 61.8% (Golden Pocket Start)
  fib0_705: number;   // 70.5% (Golden Pocket Sweet Spot)
  fib0_786: number;   // 78.6% (Deep Invalidation Line)
  fib1: number;       // 100.0% (Origin)
  ext0_272: number;   // -27.2% Expansion Target
  ext0_618: number;   // -61.8% Expansion Target
}

export interface FibonacciSetup {
  valid: boolean;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopPrice: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskDistance: number;
  riskRewardRatio: number;
  levels: FibonacciLevels;
  reason: string;
}

/**
 * Calculates exact institutional Fibonacci Retracement and Extension levels for a wave.
 */
export function calculateFibonacciLevels(
  side: 'LONG' | 'SHORT',
  swingLow: number,
  swingHigh: number
): FibonacciLevels {
  positive(swingLow, 'swingLow');
  positive(swingHigh, 'swingHigh');
  if (swingHigh <= swingLow) {
    throw new Error(`Invalid wave: swingHigh (${swingHigh}) must be greater than swingLow (${swingLow})`);
  }

  const range = swingHigh - swingLow;

  if (side === 'LONG') {
    // Bullish wave: Low (1.0) -> High (0.0). Retracement moves downwards.
    return {
      swingLow,
      swingHigh,
      range,
      fib0: swingHigh,
      fib0_236: swingHigh - range * 0.236,
      fib0_382: swingHigh - range * 0.382,
      fib0_500: swingHigh - range * 0.500,
      fib0_618: swingHigh - range * 0.618,
      fib0_705: swingHigh - range * 0.705,
      fib0_786: swingHigh - range * 0.786,
      fib1: swingLow,
      ext0_272: swingHigh + range * 0.272,
      ext0_618: swingHigh + range * 0.618
    };
  } else {
    // Bearish wave: High (1.0) -> Low (0.0). Retracement moves upwards.
    return {
      swingLow,
      swingHigh,
      range,
      fib0: swingLow,
      fib0_236: swingLow + range * 0.236,
      fib0_382: swingLow + range * 0.382,
      fib0_500: swingLow + range * 0.500,
      fib0_618: swingLow + range * 0.618,
      fib0_705: swingLow + range * 0.705,
      fib0_786: swingLow + range * 0.786,
      fib1: swingHigh,
      ext0_272: swingLow - range * 0.272,
      ext0_618: swingLow - range * 0.618
    };
  }
}

/**
 * Evaluates whether current market state forms an institutional Fibonacci Golden Pocket setup.
 * Strictly uses closed history without lookahead bias.
 */
export function evaluateFibonacciSetup(
  history1h: KlineBar[],
  history4h: KlineBar[],
  minWavePct = 0.02
): FibonacciSetup | null {
  if (history1h.length < 36 || history4h.length < 50) return null;

  // 1. Macro Trend Direction (4H SMA20 vs SMA50)
  const h4Closes = history4h.map(b => b.close);
  const sma20 = sma({ values: h4Closes, period: 20 }).at(-1);
  const sma50 = sma({ values: h4Closes, period: 50 }).at(-1);
  if (!sma20 || !sma50) return null;

  const macroTrend: 'LONG' | 'SHORT' | 'WAIT' = sma20 > sma50 ? 'LONG' : sma20 < sma50 ? 'SHORT' : 'WAIT';
  if (macroTrend === 'WAIT') return null;

  // 2. Identify Primary Swing Wave in last 36 1H bars
  const windowBars = history1h.slice(-36);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let highIdx = 0;
  let lowIdx = 0;

  windowBars.forEach((bar, idx) => {
    if (bar.high > swingHigh) {
      swingHigh = bar.high;
      highIdx = idx;
    }
    if (bar.low < swingLow) {
      swingLow = bar.low;
      lowIdx = idx;
    }
  });

  const range = swingHigh - swingLow;
  const wavePct = range / swingLow;
  if (wavePct < minWavePct) return null; // Wave too small to overcome fees and provide R:R

  const currentBar = windowBars.at(-1)!;
  const entryPrice = currentBar.close;

  // 3. Evaluate Golden Pocket Pullback
  if (macroTrend === 'LONG') {
    // Uptrend criteria:
    // Low occurred first, followed by High (at least 3 bars ago to ensure wave completed)
    if (lowIdx >= highIdx || highIdx >= 33) return null;

    const levels = calculateFibonacciLevels('LONG', swingLow, swingHigh);

    // Current candle touched Golden Pocket (0.618 - 0.705) and defended 0.786
    const touchedGoldenPocket = currentBar.low <= levels.fib0_618;
    const defendedInvalidation = currentBar.close >= levels.fib0_786;

    if (!touchedGoldenPocket || !defendedInvalidation) return null;

    // Structural Stop: 0.2% below swingLow
    let stopPrice = swingLow * 0.998;
    // Clamping boundaries: min 0.5%, max 2.5%
    const minSL = entryPrice * 0.995;
    const maxSL = entryPrice * 0.975;
    if (stopPrice > minSL) stopPrice = minSL;
    if (stopPrice < maxSL) stopPrice = maxSL;

    const riskDistance = entryPrice - stopPrice;
    if (riskDistance <= 0) return null;

    // Asymmetric Targets: Ensure at least 2.0R for TP1 to satisfy risk policies, and extensions for TP2/TP3
    const tp1 = Math.max(levels.fib0, entryPrice + riskDistance * 2.0);
    const tp2 = Math.max(levels.ext0_272, tp1 + riskDistance * 0.5);
    const tp3 = Math.max(levels.ext0_618, tp2 + riskDistance * 0.5);

    const rewardDistance = tp1 - entryPrice;
    const riskRewardRatio = Number((rewardDistance / riskDistance).toFixed(2));

    return {
      valid: true,
      side: 'LONG',
      entryPrice,
      stopPrice,
      tp1,
      tp2,
      tp3,
      riskDistance,
      riskRewardRatio,
      levels,
      reason: `Bullish Golden Pocket Retracement (Wave: +${(wavePct * 100).toFixed(1)}%, R:R: ${riskRewardRatio})`
    };
  } else {
    // Downtrend criteria:
    // High occurred first, followed by Low
    if (highIdx >= lowIdx || lowIdx >= 33) return null;

    const levels = calculateFibonacciLevels('SHORT', swingLow, swingHigh);

    // Current candle touched Golden Pocket (0.618 - 0.705) and defended 0.786
    const touchedGoldenPocket = currentBar.high >= levels.fib0_618;
    const defendedInvalidation = currentBar.close <= levels.fib0_786;

    if (!touchedGoldenPocket || !defendedInvalidation) return null;

    // Structural Stop: 0.2% above swingHigh
    let stopPrice = swingHigh * 1.002;
    const minSL = entryPrice * 1.005;
    const maxSL = entryPrice * 1.025;
    if (stopPrice < minSL) stopPrice = minSL;
    if (stopPrice > maxSL) stopPrice = maxSL;

    const riskDistance = stopPrice - entryPrice;
    if (riskDistance <= 0) return null;

    // Asymmetric Targets: Ensure at least 2.0R for TP1 to satisfy risk policies, and extensions for TP2/TP3
    const tp1 = Math.min(levels.fib0, entryPrice - riskDistance * 2.0);
    const tp2 = Math.min(levels.ext0_272, tp1 - riskDistance * 0.5);
    const tp3 = Math.min(levels.ext0_618, tp2 - riskDistance * 0.5);

    const rewardDistance = entryPrice - tp1;
    const riskRewardRatio = Number((rewardDistance / riskDistance).toFixed(2));

    return {
      valid: true,
      side: 'SHORT',
      entryPrice,
      stopPrice,
      tp1,
      tp2,
      tp3,
      riskDistance,
      riskRewardRatio,
      levels,
      reason: `Bearish Golden Pocket Retracement (Wave: -${(wavePct * 100).toFixed(1)}%, R:R: ${riskRewardRatio})`
    };
  }
}
