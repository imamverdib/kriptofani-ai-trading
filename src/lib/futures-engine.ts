import { dbRun, dbGet, dbAll } from './db';
import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { decrypt } from './encryption';
import { sendMessageToUser } from './telegram';
import { rsi, sma, macd } from 'technicalindicators';
import {
  getFuturesKlines,
  getFuturesBalance,
  getFuturesExchangeInfo,
  getFuturesPrice,
  getSmartFuturesCoins,
  setLeverage,
  setMarginType,
  placeFuturesMarketOrder,
  placeFuturesStopOrder,
  cancelAllFuturesOrders,
  cancelAllFuturesAlgoOrders,
  formatFuturesQuantity,
  formatFuturesPrice,
} from './binance-futures';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// Technical Analysis Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface FVG {
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  midpoint: number;
}

interface SupportResistance {
  supports: number[];
  resistances: number[];
}

// Detect Fair Value Gaps (3-candle pattern where middle candle creates a gap)
function detectFVGs(klines: Kline[]): FVG[] {
  const fvgs: FVG[] = [];
  for (let i = 2; i < klines.length; i++) {
    const prev = klines[i - 2];
    const curr = klines[i - 1];
    const next = klines[i];

    // Bullish FVG: gap between candle 1 high and candle 3 low
    if (next.low > prev.high) {
      fvgs.push({
        type: 'BULLISH',
        top: next.low,
        bottom: prev.high,
        midpoint: (next.low + prev.high) / 2,
      });
    }

    // Bearish FVG: gap between candle 3 high and candle 1 low
    if (next.high < prev.low) {
      fvgs.push({
        type: 'BEARISH',
        top: prev.low,
        bottom: next.high,
        midpoint: (prev.low + next.high) / 2,
      });
    }
  }
  // Return only recent FVGs (last 5)
  return fvgs.slice(-5);
}

// Calculate pivot-based support & resistance
function calculateSupportResistance(klines: Kline[]): SupportResistance {
  const pivots: number[] = [];
  for (let i = 2; i < klines.length - 2; i++) {
    const k = klines[i];
    // Swing high
    if (k.high > klines[i - 1].high && k.high > klines[i - 2].high &&
        k.high > klines[i + 1].high && k.high > klines[i + 2].high) {
      pivots.push(k.high);
    }
    // Swing low
    if (k.low < klines[i - 1].low && k.low < klines[i - 2].low &&
        k.low < klines[i + 1].low && k.low < klines[i + 2].low) {
      pivots.push(-k.low); // negative to distinguish
    }
  }

  const currentPrice = klines[klines.length - 1].close;
  const resistances = pivots.filter(p => p > 0 && p > currentPrice).sort((a, b) => a - b).slice(0, 3);
  const supports = pivots.filter(p => p < 0).map(p => -p).filter(p => p < currentPrice).sort((a, b) => b - a).slice(0, 3);

  return { supports, resistances };
}

// Calculate volume spike (current vs average)
function getVolumeAnalysis(klines: Kline[]): { currentVolume: number; avgVolume: number; isSpike: boolean } {
  const volumes = klines.map(k => k.volume);
  const recent = volumes.slice(-1)[0];
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return {
    currentVolume: recent,
    avgVolume: avg,
    isSpike: recent > avg * 1.2,
  };
}

// Detect MACD divergence
function detectDivergence(closes: number[], macdValues: any[]): string {
  if (macdValues.length < 10) return 'NONE';
  
  const recentCloses = closes.slice(-10);
  const recentMACD = macdValues.slice(-10).map((m: any) => m.MACD);

  const priceHigher = recentCloses[recentCloses.length - 1] > recentCloses[0];
  const macdHigher = recentMACD[recentMACD.length - 1] > recentMACD[0];

  if (priceHigher && !macdHigher) return 'BEARISH_DIVERGENCE';
  if (!priceHigher && macdHigher) return 'BULLISH_DIVERGENCE';
  return 'NONE';
}

// ═══════════════════════════════════════════════════════════════════════════
// Gemini AI Schema for Futures Decision
// ═══════════════════════════════════════════════════════════════════════════

const futuresDecisionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    action: { type: SchemaType.STRING },
    confidence: { type: SchemaType.INTEGER },
    reason_summary: { type: SchemaType.STRING },
    risk_plan: {
      type: SchemaType.OBJECT,
      properties: {
        entry_price: { type: SchemaType.NUMBER },
        stop_loss_price: { type: SchemaType.NUMBER },
        take_profit_1: { type: SchemaType.NUMBER },
        take_profit_2: { type: SchemaType.NUMBER },
        take_profit_3: { type: SchemaType.NUMBER },
        position_size_usd: { type: SchemaType.NUMBER },
      },
      required: ['entry_price', 'stop_loss_price', 'take_profit_1', 'take_profit_2', 'take_profit_3', 'position_size_usd'],
    },
  },
  required: ['action', 'confidence', 'reason_summary', 'risk_plan'],
};

async function callGeminiFuturesWithRetry(model: any, prompt: string, maxRetries = 2): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text);
    } catch (err: any) {
      console.warn(`[Futures Engine] Gemini sorğusu cəhd ${attempt} uğursuz oldu: ${err.message}`);
      if (attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: Futures Analysis Engine (runs every 15 minutes)
// ═══════════════════════════════════════════════════════════════════════════

export async function runFuturesAnalysis(targetUserId?: number) {
  let users: any[];
  if (targetUserId) {
    users = await dbAll<any>(
      'SELECT * FROM users WHERE id = ? AND futures_api_key IS NOT NULL AND futures_api_secret IS NOT NULL',
      [targetUserId]
    );
  } else {
    users = await dbAll<any>(
      `SELECT u.* FROM users u 
       INNER JOIN futures_risk_configs frc ON u.id = frc.user_id 
       WHERE frc.is_futures_active = 1 
       AND u.futures_api_key IS NOT NULL 
       AND u.futures_api_secret IS NOT NULL`
    );
  }

  for (const user of users) {
    try {
      const apiKey = decrypt(user.futures_api_key);
      const apiSecret = decrypt(user.futures_api_secret);
      if (!apiKey || !apiSecret) {
        console.error(`Futures decryption failed for user ${user.username}`);
        continue;
      }

      const riskConfig = await dbGet<any>('SELECT * FROM futures_risk_configs WHERE user_id = ?', [user.id]);
      if (!riskConfig) continue;

      const availableUsdt = await getFuturesBalance(apiKey, apiSecret);

      // Check max open positions
      const openPositions = await dbAll<any>(
        'SELECT * FROM futures_positions WHERE user_id = ? AND status = ?',
        [user.id, 'OPEN']
      );
      if (openPositions.length >= (riskConfig.max_open_positions || 3)) {
        console.log(`User ${user.username}: max open positions reached (${openPositions.length})`);
        continue;
      }

      // Determine target coins
      let targetSymbols: string[];
      if (riskConfig.target_coins === 'AUTO') {
        const blacklist = riskConfig.blacklist_coins
          ? riskConfig.blacklist_coins.split(',').filter((c: string) => c.trim())
          : [];
        const coinCount = riskConfig.auto_coin_count || 7;
        targetSymbols = await getSmartFuturesCoins(blacklist, coinCount);
      } else {
        targetSymbols = riskConfig.target_coins.split(',');
      }

      const holdSummaries: string[] = [];

      for (const symbol of targetSymbols) {
        try {
          // Skip if already have an open position for this symbol
          const existingPosition = openPositions.find(p => p.symbol === symbol);
          if (existingPosition) continue;

          // ──────────────────────────────────────────────────────────
          // FASE 1: Big Picture Analysis (4H + 1D)
          // ──────────────────────────────────────────────────────────
          const klines4h = await getFuturesKlines(symbol, '4h', 100);
          const klines1d = await getFuturesKlines(symbol, '1d', 210);

          if (!klines4h.length || !klines1d.length) continue;

          const closes4h = klines4h.map(k => k.close);
          const closes1d = klines1d.map(k => k.close);

          // 4H indicators
          const rsi4h = rsi({ period: 14, values: closes4h });
          const sma20_4h = sma({ period: 20, values: closes4h });
          const sma50_4h = sma({ period: 50, values: closes4h });
          const macd4h = macd({ values: closes4h, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });

          // 1D indicators
          const sma200_1d = sma({ period: 200, values: closes1d });
          const rsi1d = rsi({ period: 14, values: closes1d });

          // Support/Resistance from 4H
          const sr4h = calculateSupportResistance(klines4h);

          // FVG from 4H
          const fvgs4h = detectFVGs(klines4h);

          // Volume analysis from 4H
          const volume4h = getVolumeAnalysis(klines4h);

          // Trend determination
          const currentPrice = closes4h[closes4h.length - 1];
          const currentSMA20 = sma20_4h[sma20_4h.length - 1];
          const currentSMA50 = sma50_4h[sma50_4h.length - 1];
          const currentSMA200 = sma200_1d.length > 0 ? sma200_1d[sma200_1d.length - 1] : null;

          let trendDirection = 'NEUTRAL';
          if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) trendDirection = 'BULLISH';
          else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) trendDirection = 'BEARISH';

          // MACD divergence from 4H
          const divergence4h = detectDivergence(closes4h, macd4h);

          // ──────────────────────────────────────────────────────────
          // FASE 2: Entry Search (5m + 15m)
          // ──────────────────────────────────────────────────────────
          const klines15m = await getFuturesKlines(symbol, '15m', 100);
          const klines5m = await getFuturesKlines(symbol, '5m', 100);

          const closes15m = klines15m.map(k => k.close);
          const closes5m = klines5m.map(k => k.close);

          // 15m indicators
          const rsi15m = rsi({ period: 14, values: closes15m });
          const macd15m = macd({ values: closes15m, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
          const volume15m = getVolumeAnalysis(klines15m);
          const fvgs15m = detectFVGs(klines15m);

          // 5m indicators
          const rsi5m = rsi({ period: 14, values: closes5m });
          const volume5m = getVolumeAnalysis(klines5m);

          // Divergence on 15m
          const divergence15m = detectDivergence(closes15m, macd15m);

          // ──────────────────────────────────────────────────────────
          // PRE-FILTER: Skip AI when no confluence signals exist
          // ──────────────────────────────────────────────────────────
          const currentRSI15m = rsi15m[rsi15m.length - 1];
          const rsi15mNeutral = currentRSI15m > 40 && currentRSI15m < 60;
          const noVolumeSpike = !volume15m.isSpike && !volume5m.isSpike && !volume4h.isSpike;
          const noDivergence = divergence4h === 'NONE' && divergence15m === 'NONE';
          const noFVGNearPrice = fvgs15m.length === 0 && fvgs4h.length === 0;
          
          // Skip only when trend is NEUTRAL AND all signals are absent
          if (trendDirection === 'NEUTRAL' && rsi15mNeutral && noVolumeSpike && noDivergence && noFVGNearPrice) {
            console.log(`[FUTURES][${symbol}] Pre-filter: Trend neytral + heç bir siqnal yox → atlandı`);
            holdSummaries.push(`*${symbol}*: Trend neytral, RSI(15m: ${currentRSI15m?.toFixed(1)}) neytral, heç bir siqnal yox`);
            continue;
          }

          // ──────────────────────────────────────────────────────────
          // FASE 3: AI Decision
          // ──────────────────────────────────────────────────────────
          const prompt = `
System: You are a disciplined Binance FUTURES day trader. Follow the rules below.

═══ TRADING RULES ═══

1. TREND ALIGNMENT (mandatory with exceptions):
   - BEARISH trend → ONLY SHORT or WAIT. Never LONG. (Exception: If BULLISH_DIVERGENCE is present on 15m or 4H, counter-trend LONG scalp is ALLOWED).
   - BULLISH trend → ONLY LONG or WAIT. Never SHORT. (Exception: If BEARISH_DIVERGENCE is present on 15m or 4H, counter-trend SHORT scalp is ALLOWED).
   - NEUTRAL trend → LONG or SHORT only with confluence (divergence OR FVG + RSI).

2. ENTRY CONDITIONS:
   - For LONG: RSI(15m) should be below 50. This RSI rule is bypassed if a strong BULLISH_DIVERGENCE is present.
   - For SHORT: RSI(15m) should be above 50. This RSI rule is bypassed if a strong BEARISH_DIVERGENCE is present.
   - Price should be near a key level (support for LONG, resistance for SHORT) or showing strong momentum.
   - FVG near price is a strong confirming signal (preferred but not strictly required if other signals align).

3. ENTRY PRICE:
   - entry_price MUST be within 1% of current price.

4. STOP LOSS:
   - Minimum SL distance: 0.3% from entry.
   - Maximum SL distance: 2.5% from entry.
   - Place SL behind a structural level.

5. TAKE PROFIT:
   - Minimum risk:reward 1:2 for TP1.
   - take_profit_1 = 1:2 R:R (50% exit), take_profit_2 = 1:3 (25%), take_profit_3 = 1:4+ (25%).

6. CONFIDENCE:
   - 70+ = Good setup: trend/divergence + at least 1 confirming signal.
   - Below 70 = WAIT.

7. When no clear setup → WAIT.

═══ MARKET DATA ═══

Symbol: ${symbol}
Current Price: ${currentPrice}
Trend Direction (4H SMA cross): ${trendDirection}

--- Higher Timeframe (4H + Daily) ---
RSI (14, 4H): ${rsi4h[rsi4h.length - 1]?.toFixed(2) || 'N/A'}
RSI (14, 1D): ${rsi1d[rsi1d.length - 1]?.toFixed(2) || 'N/A'}
SMA 20 (4H): ${currentSMA20?.toFixed(4) || 'N/A'}
SMA 50 (4H): ${currentSMA50?.toFixed(4) || 'N/A'}
SMA 200 (1D): ${currentSMA200?.toFixed(4) || 'N/A'}
MACD Divergence (4H): ${divergence4h}
Volume (4H): ${volume4h.isSpike ? 'SPIKE ⚡' : 'Normal'} (Current: ${volume4h.currentVolume.toFixed(2)}, Avg: ${volume4h.avgVolume.toFixed(2)})
Support Levels: ${sr4h.supports.map(s => s.toFixed(4)).join(', ') || 'None detected'}
Resistance Levels: ${sr4h.resistances.map(r => r.toFixed(4)).join(', ') || 'None detected'}
FVGs (4H): ${fvgs4h.map(f => `${f.type} [${f.bottom.toFixed(4)}-${f.top.toFixed(4)}]`).join(', ') || 'None'}

--- Entry Timeframe (15m + 5m) ---
RSI (14, 15m): ${rsi15m[rsi15m.length - 1]?.toFixed(2) || 'N/A'}
RSI (14, 5m): ${rsi5m[rsi5m.length - 1]?.toFixed(2) || 'N/A'}
MACD Divergence (15m): ${divergence15m}
Volume (15m): ${volume15m.isSpike ? 'SPIKE ⚡' : 'Normal'}
Volume (5m): ${volume5m.isSpike ? 'SPIKE ⚡' : 'Normal'}
FVGs (15m): ${fvgs15m.map(f => `${f.type} [${f.bottom.toFixed(4)}-${f.top.toFixed(4)}]`).join(', ') || 'None'}

--- Portfolio ---
Available USDT: ${availableUsdt}
Leverage: ${riskConfig.leverage || 5}x
Max Risk %: ${riskConfig.max_risk_pct || 2}%

Provide your decision: "LONG", "SHORT", or "WAIT".
If LONG/SHORT: provide entry_price (near current price), stop_loss_price, take_profit_1, take_profit_2, take_profit_3, and position_size_usd.
If WAIT: explain briefly why no setup meets the rules.
`;

          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: futuresDecisionSchema,
            },
          });

          const decision = await callGeminiFuturesWithRetry(model, prompt);
          console.log(`[FUTURES][${symbol}] AI Decision:`, decision);

          if (!decision || typeof decision !== 'object' || !decision.action) {
            console.warn(`[FUTURES][${symbol}] AI qeyri-müəyyən cavab qaytardı, atlanır.`);
            continue;
          }

          const action = decision.action;
          const confidence = decision.confidence || 0;
          const minConf = riskConfig.min_confidence || 80;

          if ((action === 'LONG' || action === 'SHORT') && confidence >= minConf) {
            // ──────────────────────────────────────────────────────
            // FASE 4: Math Validation & Execution
            // ──────────────────────────────────────────────────────

            // ──── TREND FILTER (P0) ────
            // Trend-ə zidd ticarətləri blokla — bu ən kritik filtrdir (Divergensiya istisna olmaqla)
            const hasBullishDivergence = divergence15m === 'BULLISH_DIVERGENCE' || divergence4h === 'BULLISH_DIVERGENCE';
            const hasBearishDivergence = divergence15m === 'BEARISH_DIVERGENCE' || divergence4h === 'BEARISH_DIVERGENCE';

            if (action === 'LONG' && trendDirection === 'BEARISH' && !hasBullishDivergence) {
              console.log(`[FUTURES][${symbol}] BLOCKED: LONG in BEARISH trend without bullish divergence`);
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `🚫 *Trend Filtr*\n${symbol}: BEARISH trend-də yalnız güclü Bullish Divergensiya olduqda LONG açıla bilər. Ləğv edildi.`);
              continue;
            }
            if (action === 'SHORT' && trendDirection === 'BULLISH' && !hasBearishDivergence) {
              console.log(`[FUTURES][${symbol}] BLOCKED: SHORT in BULLISH trend without bearish divergence`);
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `🚫 *Trend Filtr*\n${symbol}: BULLISH trend-də yalnız güclü Bearish Divergensiya olduqda SHORT açıla bilər. Ləğv edildi.`);
              continue;
            }

            // ──── COOLDOWN CHECK (P1) ────
            // Eyni coində SL-dən sonra 2 saat gözlə
            const lastClosedPosition = await dbGet<any>(
              `SELECT closed_at FROM futures_positions 
               WHERE symbol = ? AND user_id = ? AND status = 'CLOSED' 
               ORDER BY closed_at DESC LIMIT 1`,
              [symbol, user.id]
            );
            if (lastClosedPosition?.closed_at) {
              const timeSinceClose = Date.now() - new Date(lastClosedPosition.closed_at).getTime();
              const cooldownMs = 2 * 60 * 60 * 1000; // 2 saat
              if (timeSinceClose < cooldownMs) {
                const minutesLeft = Math.ceil((cooldownMs - timeSinceClose) / 60000);
                console.log(`[FUTURES][${symbol}] Cooldown: ${minutesLeft} dəqiqə qalıb`);
                continue;
              }
            }

            // Riyazi Blokada
            // Riyazi Blokada (currentRSI15m is already computed in pre-filter above)
            if (action === 'LONG' && currentRSI15m > 70) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚡ *Futures Riyazi Blokada*\n${symbol} üçün LONG qərarı verildi, lakin 15m RSI (${currentRSI15m.toFixed(2)}) həddən artıq yüksəkdir. Ləğv edildi.`);
              continue;
            }
            if (action === 'SHORT' && currentRSI15m < 30) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚡ *Futures Riyazi Blokada*\n${symbol} üçün SHORT qərarı verildi, lakin 15m RSI (${currentRSI15m.toFixed(2)}) həddən artıq aşağıdır. Ləğv edildi.`);
              continue;
            }

            // Validate R:R ratio (minimum 1:2)
            const entryPrice = decision.risk_plan?.entry_price || currentPrice;
            const slPrice = decision.risk_plan?.stop_loss_price;
            const tp1Price = decision.risk_plan?.take_profit_1;

            // ──── AI DEFENSIVE PRICE VALIDATION ────
            if (action === 'LONG') {
              if (!slPrice || !tp1Price || isNaN(slPrice) || isNaN(tp1Price) || slPrice >= entryPrice || tp1Price <= entryPrice) {
                console.warn(`[FUTURES][${symbol}] AI qiymətləri məntiqsizdir (SL: ${slPrice}, Entry: ${entryPrice}, TP1: ${tp1Price}). Ləğv edildi.`);
                await sendMessageToUser(user.id, user.telegram_chat_id,
                  `⚠️ *Futures Qiymət Blokadası*\n${symbol}: AI məntiqsiz LONG qiymətləri təklif etdi (SL: $${slPrice}, Entry: $${entryPrice}, TP: $${tp1Price}). Əmr ləğv edildi.`);
                continue;
              }
            } else if (action === 'SHORT') {
              if (!slPrice || !tp1Price || isNaN(slPrice) || isNaN(tp1Price) || slPrice <= entryPrice || tp1Price >= entryPrice) {
                console.warn(`[FUTURES][${symbol}] AI qiymətləri məntiqsizdir (SL: ${slPrice}, Entry: ${entryPrice}, TP1: ${tp1Price}). Ləğv edildi.`);
                await sendMessageToUser(user.id, user.telegram_chat_id,
                  `⚠️ *Futures Qiymət Blokadası*\n${symbol}: AI məntiqsiz SHORT qiymətləri təklif etdi (SL: $${slPrice}, Entry: $${entryPrice}, TP: $${tp1Price}). Əmr ləğv edildi.`);
                continue;
              }
            }

            // ──── ENTRY PRICE VALIDATION (P1) ────
            // AI-nın verdiyi entry qiyməti cari qiymətdən çox fərqlidirsə ləğv et
            const entryDeviation = Math.abs(entryPrice - currentPrice) / currentPrice;
            if (entryDeviation > 0.01) { // 1%+ fərq
              console.log(`[FUTURES][${symbol}] Entry price ($${entryPrice}) is ${(entryDeviation * 100).toFixed(2)}% away from current ($${currentPrice}). Skipping.`);
              continue;
            }

            const riskDistance = Math.abs(entryPrice - slPrice);
            const rewardDistance = Math.abs(tp1Price - entryPrice);

            // ──── SL DISTANCE VALIDATION ────
            const slDistancePct = riskDistance / entryPrice;
            if (slDistancePct < 0.003) { // SL 0.3%-dən yaxın
              console.log(`[FUTURES][${symbol}] SL too tight (${(slDistancePct * 100).toFixed(2)}%). Skipping.`);
              continue;
            }
            if (slDistancePct > 0.02) { // SL 2%-dən uzaq
              console.log(`[FUTURES][${symbol}] SL too wide (${(slDistancePct * 100).toFixed(2)}%). Skipping.`);
              continue;
            }

            if (riskDistance === 0 || rewardDistance / riskDistance < 1.8) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚡ *Futures R:R Blokada*\n${symbol}: Risk:Reward nisbəti (${(rewardDistance / riskDistance).toFixed(2)}) minimum 1:2 tələbini ödəmir. Ləğv edildi.`);
              continue;
            }

            // Exchange info for formatting
            const exchangeInfo = await getFuturesExchangeInfo(symbol);
            const lotFilter = exchangeInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
            const priceFilter = exchangeInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');

            const leverage = riskConfig.leverage || 5;
            const maxRiskUsd = availableUsdt * ((riskConfig.max_risk_pct || 2) / 100);
            const requestedSizeUsd = decision.risk_plan?.position_size_usd || 0;
            const finalSizeUsd = Math.min(requestedSizeUsd, maxRiskUsd);

            if (finalSizeUsd < 5) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚡ *Futures Limit Xətası*\n${symbol}: Pozisiya ölçüsü ($${finalSizeUsd.toFixed(2)}) minimum limitdən azdır. Ləğv edildi.`);
              continue;
            }

            // Pre-flight Margin/Balance Check
            if (availableUsdt < finalSizeUsd * 1.002) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚠️ *Futures Balans Xətası*\n${symbol}: Tələb olunan marja ($${finalSizeUsd.toFixed(2)}) mövcud sərbəst balansınızdan ($${availableUsdt.toFixed(2)}) çoxdur.`);
              continue;
            }

            // Calculate quantity with leverage
            const notionalValue = finalSizeUsd * leverage;
            let quantity = notionalValue / currentPrice;
            quantity = formatFuturesQuantity(quantity, parseFloat(lotFilter.stepSize));

            const formattedSL = formatFuturesPrice(slPrice, parseFloat(priceFilter.tickSize));
            const formattedTP1 = formatFuturesPrice(tp1Price, parseFloat(priceFilter.tickSize));
            const formattedTP2 = formatFuturesPrice(decision.risk_plan?.take_profit_2 || tp1Price * 1.01, parseFloat(priceFilter.tickSize));
            const formattedTP3 = formatFuturesPrice(decision.risk_plan?.take_profit_3 || tp1Price * 1.02, parseFloat(priceFilter.tickSize));

            if (quantity < parseFloat(lotFilter.minQty)) {
              console.log(`[FUTURES][${symbol}] Quantity too small`);
              continue;
            }

            // Set leverage and margin type
            try {
              await setMarginType(apiKey, apiSecret, symbol, 'ISOLATED');
            } catch (e: any) {
              console.log(`Margin type set note: ${e.message}`);
            }
            await setLeverage(apiKey, apiSecret, symbol, leverage);

            // Place entry order
            const side = action === 'LONG' ? 'BUY' : 'SELL';
            const entryOrder = await placeFuturesMarketOrder(apiKey, apiSecret, symbol, side, quantity);

            // Place initial Stop Loss with 3 Retries & Emergency Orphan Position Protection
            const slSide = action === 'LONG' ? 'SELL' : 'BUY';
            let slPlaced = false;
            let slAttempts = 0;
            let lastSlErr: any = null;

            while (!slPlaced && slAttempts < 3) {
              slAttempts++;
              try {
                const adjustFactor = slAttempts > 1 ? (action === 'LONG' ? (1 - (slAttempts - 1) * 0.001) : (1 + (slAttempts - 1) * 0.001)) : 1;
                const adjustedSL = formatFuturesPrice(slPrice * adjustFactor, parseFloat(priceFilter.tickSize));
                await placeFuturesStopOrder(apiKey, apiSecret, symbol, slSide, quantity, adjustedSL);
                slPlaced = true;
              } catch (slErr: any) {
                lastSlErr = slErr;
                console.error(`[FUTURES][${symbol}] SL attempt ${slAttempts} failed:`, slErr.message);
                if (slAttempts < 3) {
                  await new Promise(res => setTimeout(res, 1500));
                }
              }
            }

            // CRITICAL: If SL failed 3 times, EMERGENCY CLOSE to avoid liquidation!
            if (!slPlaced) {
              console.error(`[FUTURES][${symbol}] CRITICAL: SL failed 3 times! Executing EMERGENCY CLOSE!`);
              try {
                await placeFuturesMarketOrder(apiKey, apiSecret, symbol, slSide, quantity);
                await sendMessageToUser(
                  user.id,
                  user.telegram_chat_id,
                  `🚨 *TƏCİLİ FUTURES QORUMASI*\n\n${symbol} ${action} açıldıqdan sonra Stop-Loss qoyulması 3 cəhddən sonra uğursuz oldu (${lastSlErr?.message}).\n\nMövqe kredit çiyni riskindən qorunmaq üçün dərhal bazar qiyməti ilə bağlandı!`
                );
                continue;
              } catch (closeErr: any) {
                console.error(`[FUTURES][${symbol}] EMERGENCY CLOSE FAILED:`, closeErr);
                await sendMessageToUser(
                  user.id,
                  user.telegram_chat_id,
                  `🔥 *KRİTİK FUTURES XƏTASI*\n\n${symbol} üçün nə Stop-Loss qoyuldu, nə də təcili bağlanış icra olundu! Dərhal Binance Futures-a daxil olub mövqeni manual bağlayın!`
                );
                continue;
              }
            }

            // Save position to DB
            await dbRun(
              `INSERT INTO futures_positions 
               (user_id, symbol, side, entry_price, quantity, remaining_qty, leverage, margin_mode,
                stop_loss_price, take_profit_1, take_profit_2, take_profit_3,
                highest_price, lowest_price, entry_timeframe, trend_direction, entry_reason, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'ISOLATED', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
              [
                user.id, symbol, action, currentPrice, quantity, quantity, leverage,
                formattedSL, formattedTP1, formattedTP2, formattedTP3,
                currentPrice, currentPrice,
                volume15m.isSpike ? '15m' : '5m',
                trendDirection,
                decision.reason_summary
              ]
            );

            // Send notification
            await sendMessageToUser(user.id, user.telegram_chat_id,
              `⚡ *Futures Ticarət Açıldı*\n\n` +
              `📊 *${symbol}* — ${action}\n` +
              `💰 Giriş: $${currentPrice}\n` +
              `🔴 Stop Loss: $${formattedSL}\n` +
              `🟢 TP1 (1:2): $${formattedTP1} — 50%\n` +
              `🟢 TP2 (1:3): $${formattedTP2} — 25%\n` +
              `🟢 TP3 (1:4): $${formattedTP3} — 25%\n` +
              `📐 Leverage: ${leverage}x\n` +
              `📏 Miqdar: ${quantity}\n\n` +
              `📝 Səbəb: ${decision.reason_summary}`);

          } else {
            if (targetUserId) {
              await sendMessageToUser(user.id, user.telegram_chat_id,
                `⚡ *Futures Analiz*\nKoin: ${symbol}\nQərar: Gözləmə (WAIT)\nSəbəb: ${decision.reason_summary}`);
            } else {
              holdSummaries.push(`*${symbol}*: ${decision.reason_summary}`);
            }
          }
        } catch (coinErr: any) {
          console.error(`[FUTURES] Error processing ${symbol} for ${user.username}:`, coinErr);
        }
      }

      if (!targetUserId && holdSummaries.length > 0) {
        await sendMessageToUser(user.id, user.telegram_chat_id,
          `⚡ *Futures Analiz Nəticəsi (WAIT)*\n\nHazırda heç bir koin üçün əlverişli futures fürsəti tapılmadı:\n\n${holdSummaries.join('\n')}`);
      }
    } catch (err: any) {
      console.error(`[FUTURES] Error for user ${user.username}:`, err);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Position Monitor (runs every 30 seconds)
// ═══════════════════════════════════════════════════════════════════════════

export async function monitorFuturesPositions() {
  const openPositions = await dbAll<any>(
    `SELECT fp.*, u.futures_api_key, u.futures_api_secret, u.telegram_chat_id
     FROM futures_positions fp
     INNER JOIN users u ON fp.user_id = u.id
     WHERE fp.status = 'OPEN'`
  );

  for (const pos of openPositions) {
    try {
      const apiKey = decrypt(pos.futures_api_key);
      const apiSecret = decrypt(pos.futures_api_secret);
      if (!apiKey || !apiSecret) continue;

      const currentPrice = await getFuturesPrice(pos.symbol);

      // Update highest/lowest tracking
      if (currentPrice > pos.highest_price) {
        await dbRun('UPDATE futures_positions SET highest_price = ? WHERE id = ?', [currentPrice, pos.id]);
      }
      if (currentPrice < pos.lowest_price || pos.lowest_price === 0) {
        await dbRun('UPDATE futures_positions SET lowest_price = ? WHERE id = ?', [currentPrice, pos.id]);
      }

      const isLong = pos.side === 'LONG';

      // Calculate current PnL
      const pnl = isLong
        ? (currentPrice - pos.entry_price) * pos.remaining_qty * pos.leverage
        : (pos.entry_price - currentPrice) * pos.remaining_qty * pos.leverage;

      // ──── Check Stop Loss ────
      const slHit = isLong ? currentPrice <= pos.stop_loss_price : currentPrice >= pos.stop_loss_price;
      if (slHit) {
        await closePosition(pos, currentPrice, 'STOP_LOSS', apiKey, apiSecret);
        continue;
      }

      // ──── Check Trailing Stop ────
      if (pos.trailing_active && pos.trailing_stop_price) {
        const trailingHit = isLong
          ? currentPrice <= pos.trailing_stop_price
          : currentPrice >= pos.trailing_stop_price;

        if (trailingHit) {
          await closePosition(pos, currentPrice, 'TRAILING_STOP', apiKey, apiSecret);
          continue;
        }

        // Update trailing stop (1.5% trailing distance)
        const trailingPct = 0.015;
        if (isLong && currentPrice > (pos.highest_price || pos.entry_price)) {
          const newTrailingStop = currentPrice * (1 - trailingPct);
          if (newTrailingStop > pos.trailing_stop_price) {
            await dbRun('UPDATE futures_positions SET trailing_stop_price = ?, highest_price = ? WHERE id = ?',
              [newTrailingStop, currentPrice, pos.id]);
          }
        } else if (!isLong && currentPrice < (pos.lowest_price || pos.entry_price)) {
          const newTrailingStop = currentPrice * (1 + trailingPct);
          if (newTrailingStop < pos.trailing_stop_price) {
            await dbRun('UPDATE futures_positions SET trailing_stop_price = ?, lowest_price = ? WHERE id = ?',
              [newTrailingStop, currentPrice, pos.id]);
          }
        }
      }

      // ──── Check TP1 (1:2) — Sell 50% ────
      if (!pos.tp1_filled) {
        const tp1Hit = isLong ? currentPrice >= pos.take_profit_1 : currentPrice <= pos.take_profit_1;
        if (tp1Hit) {
          try {
            const exInfo = await getFuturesExchangeInfo(pos.symbol);
            const lotFilter = exInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
            const stepSize = lotFilter ? parseFloat(lotFilter.stepSize) : 0.001;
            const sellQty = formatFuturesQuantity(pos.quantity * 0.5, stepSize);
            
            if (sellQty > 0) {
              const closeSide = isLong ? 'SELL' : 'BUY';
              await placeFuturesMarketOrder(apiKey, apiSecret, pos.symbol, closeSide, sellQty, true);

              const partialPnl = isLong
                ? (currentPrice - pos.entry_price) * sellQty * pos.leverage
                : (pos.entry_price - currentPrice) * sellQty * pos.leverage;

              await dbRun(
                'INSERT INTO futures_partial_fills (position_id, user_id, tp_level, quantity, exit_price, pnl) VALUES (?, ?, 1, ?, ?, ?)',
                [pos.id, pos.user_id, sellQty, currentPrice, partialPnl]
              );

              const newRemaining = pos.remaining_qty - sellQty;

              // Move SL to breakeven
              try {
                await cancelAllFuturesOrders(apiKey, apiSecret, pos.symbol);
              } catch (e) {
                console.error('Failed to cancel standard orders:', e);
              }
              try {
                await cancelAllFuturesAlgoOrders(apiKey, apiSecret, pos.symbol);
              } catch (e) {
                console.error('Failed to cancel algo orders:', e);
              }
              const slSide = isLong ? 'SELL' : 'BUY';
              try {
                await placeFuturesStopOrder(apiKey, apiSecret, pos.symbol, slSide, newRemaining, pos.entry_price);
              } catch (e: any) {
                console.error('Failed to move SL to breakeven:', e);
              }

              await dbRun(
                'UPDATE futures_positions SET tp1_filled = 1, remaining_qty = ?, stop_loss_price = ?, total_pnl = total_pnl + ? WHERE id = ?',
                [newRemaining, pos.entry_price, partialPnl, pos.id]
              );

              await sendMessageToUser(pos.user_id, pos.telegram_chat_id,
                `⚡ *Futures TP1 (1:2) Satıldı!*\n\n` +
                `📊 ${pos.symbol} — ${pos.side}\n` +
                `💰 Satış Qiyməti: $${currentPrice}\n` +
                `📏 Satılan: ${sellQty} (50%)\n` +
                `💵 PnL: $${partialPnl.toFixed(2)}\n` +
                `🔄 SL breakeven-ə ($${pos.entry_price}) çəkildi`);
            }
          } catch (e: any) {
            console.error(`TP1 execution error for ${pos.symbol}:`, e);
          }
        }
      }

      // ──── Check TP2 (1:3) — Sell 25% ────
      if (pos.tp1_filled && !pos.tp2_filled) {
        const tp2Hit = isLong ? currentPrice >= pos.take_profit_2 : currentPrice <= pos.take_profit_2;
        if (tp2Hit) {
          try {
            const exInfo = await getFuturesExchangeInfo(pos.symbol);
            const lotFilter = exInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
            const stepSize = lotFilter ? parseFloat(lotFilter.stepSize) : 0.001;
            const sellQty = formatFuturesQuantity(pos.remaining_qty * 0.5, stepSize);
            
            if (sellQty > 0) {
              const closeSide = isLong ? 'SELL' : 'BUY';
              await placeFuturesMarketOrder(apiKey, apiSecret, pos.symbol, closeSide, sellQty, true);

              const partialPnl = isLong
                ? (currentPrice - pos.entry_price) * sellQty * pos.leverage
                : (pos.entry_price - currentPrice) * sellQty * pos.leverage;

              await dbRun(
                'INSERT INTO futures_partial_fills (position_id, user_id, tp_level, quantity, exit_price, pnl) VALUES (?, ?, 2, ?, ?, ?)',
                [pos.id, pos.user_id, sellQty, currentPrice, partialPnl]
              );

              const newRemaining = pos.remaining_qty - sellQty;

              // Activate trailing stop
              const trailingPct = 0.015;
              const initialTrailingStop = isLong
                ? currentPrice * (1 - trailingPct)
                : currentPrice * (1 + trailingPct);

              // Cancel old SL, set trailing
              try {
                await cancelAllFuturesOrders(apiKey, apiSecret, pos.symbol);
              } catch (e) {
                console.error('Failed to cancel standard orders:', e);
              }
              try {
                await cancelAllFuturesAlgoOrders(apiKey, apiSecret, pos.symbol);
              } catch (e) {
                console.error('Failed to cancel algo orders:', e);
              }

              await dbRun(
                `UPDATE futures_positions SET tp2_filled = 1, remaining_qty = ?, trailing_active = 1, 
                 trailing_stop_price = ?, total_pnl = total_pnl + ? WHERE id = ?`,
                [newRemaining, initialTrailingStop, partialPnl, pos.id]
              );

              await sendMessageToUser(pos.user_id, pos.telegram_chat_id,
                `⚡ *Futures TP2 (1:3) Satıldı!*\n\n` +
                `📊 ${pos.symbol} — ${pos.side}\n` +
                `💰 Satış Qiyməti: $${currentPrice}\n` +
                `📏 Satılan: ${sellQty} (25%)\n` +
                `💵 PnL: $${partialPnl.toFixed(2)}\n` +
                `🔄 Trailing Stop aktivləşdirildi ($${initialTrailingStop.toFixed(4)})`);
            }
          } catch (e: any) {
            console.error(`TP2 execution error for ${pos.symbol}:`, e);
          }
        }
      }

      // ──── Check TP3 (1:4+) — Sell remaining 25% ────
      if (pos.tp1_filled && pos.tp2_filled && !pos.tp3_filled) {
        const tp3Hit = isLong ? currentPrice >= pos.take_profit_3 : currentPrice <= pos.take_profit_3;
        if (tp3Hit) {
          await closePosition(pos, currentPrice, 'TP3', apiKey, apiSecret);
        }
      }

    } catch (err: any) {
      console.error(`[FUTURES MONITOR] Error for position ${pos.id}:`, err);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Close Position Helper
// ═══════════════════════════════════════════════════════════════════════════

async function closePosition(pos: any, exitPrice: number, reason: string, apiKey: string, apiSecret: string) {
  try {
    const isLong = pos.side === 'LONG';
    const closeSide = isLong ? 'SELL' : 'BUY';
    const remainingQty = pos.remaining_qty;

    if (remainingQty > 0) {
      await placeFuturesMarketOrder(apiKey, apiSecret, pos.symbol, closeSide, remainingQty, true);
    }

    // Cancel any remaining open orders
    try {
      await cancelAllFuturesOrders(apiKey, apiSecret, pos.symbol);
    } catch (e) {
      // Ignore cancel errors
    }
    try {
      await cancelAllFuturesAlgoOrders(apiKey, apiSecret, pos.symbol);
    } catch (e) {
      // Ignore cancel errors
    }

    const finalPnl = isLong
      ? (exitPrice - pos.entry_price) * remainingQty * pos.leverage
      : (pos.entry_price - exitPrice) * remainingQty * pos.leverage;

    // Save partial fill
    const tpLevel = reason === 'TP3' ? 3 : 0;
    if (remainingQty > 0) {
      await dbRun(
        'INSERT INTO futures_partial_fills (position_id, user_id, tp_level, quantity, exit_price, pnl) VALUES (?, ?, ?, ?, ?, ?)',
        [pos.id, pos.user_id, tpLevel, remainingQty, exitPrice, finalPnl]
      );
    }

    await dbRun(
      `UPDATE futures_positions SET status = 'CLOSED', remaining_qty = 0, 
       total_pnl = total_pnl + ?, closed_at = CURRENT_TIMESTAMP,
       tp3_filled = CASE WHEN ? = 'TP3' THEN 1 ELSE tp3_filled END
       WHERE id = ?`,
      [finalPnl, reason, pos.id]
    );

    const emoji = (pos.total_pnl + finalPnl) >= 0 ? '🟢' : '🔴';
    const reasonText = reason === 'STOP_LOSS' ? 'Stop Loss' 
      : reason === 'TRAILING_STOP' ? 'Trailing Stop' 
      : reason === 'TP3' ? 'Take Profit 3 (1:4)' 
      : 'Manual';

    await sendMessageToUser(pos.user_id, pos.telegram_chat_id,
      `⚡ *Futures Pozisiya Bağlandı* ${emoji}\n\n` +
      `📊 ${pos.symbol} — ${pos.side}\n` +
      `💰 Giriş: $${pos.entry_price} → Çıxış: $${exitPrice}\n` +
      `📏 Bağlanan miqdar: ${remainingQty}\n` +
      `📐 Leverage: ${pos.leverage}x\n` +
      `💵 Son hissə PnL: $${finalPnl.toFixed(2)}\n` +
      `💰 Ümumi PnL: $${(pos.total_pnl + finalPnl).toFixed(2)}\n` +
      `📝 Səbəb: ${reasonText}`);

  } catch (err: any) {
    console.error(`Failed to close position ${pos.id}:`, err);
  }
}
