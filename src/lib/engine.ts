import crypto from 'crypto';
import { dbRun, dbGet, dbAll } from './db';
import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { decrypt } from './encryption';
import { getExchangeInfo, formatQuantity, formatPrice, placeMarketOrder, placeOCOOrder } from './binance';
import { rsi, sma } from 'technicalindicators';
import { sendMessageToUser } from './telegram';
import { isTypeSafeConfigured, evaluateWithJev } from './typesafe';
import { computeQuantPlan } from './quant-math';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// No hardcoded COINS array anymore

function signBinanceRequest(queryString: string, apiSecret: string) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

async function getBinanceBalances(apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signBinanceRequest(queryString, apiSecret);
  
  const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
  
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Binance API error: ${await res.text()}`);
  
  const data: any = await res.json();
  return data.balances;
}

// Fetch Klines (Candlestick data) for indicators
async function getKlines(symbol: string) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: any = await res.json();
  return data.map((k: any) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function getTopVolumeCoins(): Promise<string[]> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    const data: any = await res.json();
    const usdtPairs = data.filter((t: any) => t.symbol.endsWith('USDT'));
    usdtPairs.sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    return usdtPairs.slice(0, 5).map((t: any) => t.symbol);
  } catch (err) {
    console.error('Failed to fetch top volume coins', err);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']; // fallback
  }
}

// Gemini Structured Output Schema
const decisionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    action: { type: SchemaType.STRING },
    confidence: { type: SchemaType.INTEGER },
    reason_summary: { type: SchemaType.STRING },
    risk_plan: {
      type: SchemaType.OBJECT,
      properties: {
        position_size_usd: { type: SchemaType.NUMBER },
        stop_loss_price: { type: SchemaType.NUMBER },
        take_profit_price: { type: SchemaType.NUMBER }
      },
      required: ['position_size_usd', 'stop_loss_price', 'take_profit_price']
    }
  },
  required: ['action', 'confidence', 'reason_summary', 'risk_plan']
};

async function callGeminiWithRetry(model: any, prompt: string, maxRetries = 2): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return JSON.parse(text);
    } catch (err: any) {
      console.warn(`[Spot Engine] Gemini sorğusu cəhd ${attempt} uğursuz oldu: ${err.message}`);
      if (attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export async function runTradingEngine(targetUserId?: number) {
  let users: any[];
  if (targetUserId) {
    users = await dbAll<any>('SELECT * FROM users WHERE id = ? AND binance_api_key IS NOT NULL AND binance_api_secret IS NOT NULL', [targetUserId]);
  } else {
    users = await dbAll<any>('SELECT * FROM users WHERE is_active = 1 AND binance_api_key IS NOT NULL AND binance_api_secret IS NOT NULL');
  }
  
  for (const user of users) {
    try {
      const apiKey = decrypt(user.binance_api_key);
      const apiSecret = decrypt(user.binance_api_secret);
      
      if (!apiKey || !apiSecret) {
        console.error(`Decryption failed for user ${user.username}`);
        continue;
      }

      const riskConfig = await dbGet<any>('SELECT * FROM risk_configs WHERE user_id = ?', [user.id]);
      const balances = await getBinanceBalances(apiKey, apiSecret);
      
      let availableUsdt = 0;
      const usdtBal = balances.find((b: any) => b.asset === 'USDT');
      if (usdtBal) availableUsdt = parseFloat(usdtBal.free);

      // Determine target coins
      let targetSymbols: string[] = [];
      const userTargetConfig = riskConfig?.target_coins || 'AUTO';
      if (userTargetConfig === 'AUTO') {
        targetSymbols = await getTopVolumeCoins();
      } else {
        targetSymbols = userTargetConfig.split(',');
      }

      const hourlyHoldSummaries: string[] = [];
      for (const symbol of targetSymbols) {
        try {
          const coin = { symbol };
          const coinBal = balances.find((b: any) => b.asset === symbol.replace('USDT', ''));
          const sellableAssetBalance = coinBal ? parseFloat(coinBal.free) : 0;

          // Technical indicators
          const klines = await getKlines(coin.symbol);
          if (!klines) continue;
          
          const closes = klines.map((k: any) => k.close);
          const currentPrice = closes[closes.length - 1];
          const rsiValues = rsi({ period: 14, values: closes });
          const smaValues = sma({ period: 20, values: closes });
          const currentRSI = rsiValues[rsiValues.length - 1];
          const currentSMA = smaValues[smaValues.length - 1];

          // ──── PRE-FILTER: Skip AI call when no actionable signal ────
          // RSI neutral zone (35-65) + price near SMA (±2%) = no trade opportunity
          const priceNearSMA = Math.abs(currentPrice - currentSMA) / currentSMA < 0.02;
          const rsiNeutral = currentRSI > 35 && currentRSI < 65;
          
          if (rsiNeutral && priceNearSMA && sellableAssetBalance === 0) {
            console.log(`[${coin.symbol}] Pre-filter: RSI(${currentRSI.toFixed(1)}) neutral + price near SMA → AI çağırışı atlandı`);
            hourlyHoldSummaries.push(`*${coin.symbol}*: RSI (${currentRSI.toFixed(1)}) neytral zonadadır, siqnal yoxdur`);
            continue;
          }

          let decision: any = null;
          let quantPlan: any = null;

          if (isTypeSafeConfigured()) {
            console.log(`[${coin.symbol}] Evaluating with TypeSafe AI (Jev System-1)...`);
            const marketState = `
              Symbol: ${coin.symbol}
              Current Price: ${currentPrice}
              RSI (14h): ${currentRSI.toFixed(2)}
              SMA (20h): ${currentSMA.toFixed(2)}
              Available USDT: ${availableUsdt}
              Sellable Balance: ${sellableAssetBalance}
            `;
            const jev = await evaluateWithJev(marketState);
            if (jev) {
              if (jev.isHighRisk) {
                console.log(`[${coin.symbol}] TypeSafe Jev flagged high false breakout risk. Skipping.`);
                hourlyHoldSummaries.push(`*${coin.symbol}*: Jev yalançı qırılma riski (False Breakout) aşkarladı`);
                continue;
              }

              let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
              if (jev.action === 'LONG') {
                action = 'BUY';
              } else if (jev.action === 'SHORT' && sellableAssetBalance > 0) {
                action = 'SELL';
              }

              if (action !== 'HOLD') {
                const supports = klines.map((k: any) => k.low).filter((l: number) => l < currentPrice).sort((a: number, b: number) => b - a).slice(0, 3);
                const resistances = klines.map((k: any) => k.high).filter((h: number) => h > currentPrice).sort((a: number, b: number) => a - b).slice(0, 3);
                quantPlan = computeQuantPlan(action, currentPrice, klines, supports, resistances);

                decision = {
                  action,
                  confidence: jev.confidence,
                  reason_summary: `TypeSafe Jev (${jev.latencyMs}ms, Güvən: ${jev.confidence}%, Trend: ${jev.trendStrength})`,
                  risk_plan: {
                    position_size_usd: availableUsdt * ((riskConfig?.max_risk_pct || 2) / 100),
                    stop_loss_price: quantPlan.stopLossPrice,
                    take_profit_price: quantPlan.takeProfit1
                  },
                  engine: 'TYPESAFE',
                  latencyMs: jev.latencyMs,
                  trendStrength: jev.trendStrength
                };
              } else {
                decision = {
                  action: 'HOLD',
                  confidence: jev.confidence,
                  reason_summary: `TypeSafe Jev gözləmə qərarı (${jev.latencyMs}ms, Conf: ${jev.confidence}%)`,
                  engine: 'TYPESAFE',
                  latencyMs: jev.latencyMs
                };
              }
            }
          }

          // Fallback to Gemini if TypeSafe is not configured or failed
          if (!decision) {
            const prompt = `
              System: You are an autonomous quantitative crypto trader.
              Data for ${coin.symbol}:
              - Current Price: ${currentPrice}
              - RSI (14h): ${currentRSI.toFixed(2)}
              - SMA (20h): ${currentSMA.toFixed(2)}
              
              Portfolio:
              - Available USDT: ${availableUsdt}
              - Sellable Asset (${coin.symbol.replace('USDT', '')}): ${sellableAssetBalance}
              - Max Risk Pct: ${riskConfig?.max_risk_pct || 2}%
              
              Decision Logic:
              - Provide highly logical BUY or SELL decisions if an opportunity exists (RSI overbought/oversold, SMA crosses, etc). Otherwise HOLD.
              - If BUY, suggest position_size_usd, stop_loss_price, and take_profit_price.
            `;

            const model = genAI.getGenerativeModel({ 
              model: "gemini-2.5-flash",
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: decisionSchema,
              }
            });
            
            decision = await callGeminiWithRetry(model, prompt);
            if (decision) decision.engine = 'GEMINI';
          }

          console.log(`[${coin.symbol}] AI Decision:`, decision);

          if (!decision || typeof decision !== 'object' || !decision.action) {
            console.warn(`[${coin.symbol}] AI qeyri-müəyyən cavab qaytardı, atlanır.`);
            continue;
          }

          const action = decision.action;
          const confidence = decision.confidence || 0;
          const minConf = riskConfig?.min_confidence || 75;

          if ((action === 'BUY' || action === 'SELL') && confidence >= minConf) {
            
            // Riyazi Blokada (Math Blockade)
            if (action === 'BUY' && currentRSI > 70) {
              await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *Riyazi Blokada*\nSüni Zəka ${coin.symbol} üçün BUY qərarı verdi, lakin RSI (${currentRSI.toFixed(2)}) həddən artıq yüksək olduğu üçün qərar ləğv edildi.`);
              continue;
            }
            if (action === 'SELL' && currentRSI < 30) {
              await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *Riyazi Blokada*\nSüni Zəka ${coin.symbol} üçün SELL qərarı verdi, lakin RSI (${currentRSI.toFixed(2)}) həddən artıq aşağı olduğu üçün qərar ləğv edildi.`);
              continue;
            }

            // AI Defensive Price Validation (BUY üçün SL < Qiymət < TP şərti)
            if (action === 'BUY') {
              const rawSL = decision.risk_plan?.stop_loss_price;
              const rawTP = decision.risk_plan?.take_profit_price;
              if (!rawSL || !rawTP || isNaN(rawSL) || isNaN(rawTP) || rawSL >= currentPrice || rawTP <= currentPrice) {
                console.warn(`[${coin.symbol}] AI qiymətləri məntiqsizdir (SL: ${rawSL}, TP: ${rawTP}, Qiymət: ${currentPrice}). Ləğv edildi.`);
                await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *AI Qiymət Blokadası*\n${coin.symbol} üçün AI məntiqsiz SL/TP təklif etdi (SL: $${rawSL}, TP: $${rawTP}, Qiymət: $${currentPrice}). Əməliyyat ləğv edildi.`);
                continue;
              }
            }

            // Validate via Exchange Info
            const exchangeInfo = await getExchangeInfo(coin.symbol);
            const lotFilter = exchangeInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
            const priceFilter = exchangeInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
            
            let quantity = 0;
            const maxAllowedRiskUsd = availableUsdt * ((riskConfig?.max_risk_pct || 2) / 100);

            if (action === 'BUY') {
               const requestedSizeUsd = decision.risk_plan?.position_size_usd || 0;
               const finalSizeUsd = Math.min(requestedSizeUsd, maxAllowedRiskUsd);
               
               if (finalSizeUsd < 10) {
                 await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *Limit Xətası*\n${coin.symbol} alış məbləği ($${finalSizeUsd.toFixed(2)}) Binance-in minimum $10 limitindən az olduğu üçün əməliyyat ləğv edildi.`);
                 continue;
               }

               // Pre-flight Fee & Balance Check (0.1% komissiya nəzərə alınmaqla)
               if (availableUsdt < finalSizeUsd * 1.001) {
                 await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *Balans Xətası*\n${coin.symbol} üçün tələb olunan $${finalSizeUsd.toFixed(2)} məbləğ mövcud sərbəst balansınızdan ($${availableUsdt.toFixed(2)}) çoxdur.`);
                 continue;
               }

               quantity = finalSizeUsd / currentPrice;
            } else {
               quantity = sellableAssetBalance;
               const sellValueUsd = quantity * currentPrice;

               if (sellValueUsd < 10 && sellValueUsd > 0) {
                 await sendMessageToUser(user.id, user.telegram_chat_id, `⚠️ *Limit Xətası*\n${coin.symbol} satış məbləği ($${sellValueUsd.toFixed(2)}) Binance-in minimum $10 limitindən az olduğu üçün ləğv edildi.`);
                 continue;
               }
            }
            
            quantity = formatQuantity(quantity, parseFloat(lotFilter.stepSize));
            const tpPrice = formatPrice(decision.risk_plan.take_profit_price, parseFloat(priceFilter.tickSize));
            const slTrigger = formatPrice(decision.risk_plan.stop_loss_price, parseFloat(priceFilter.tickSize));

            if (quantity >= parseFloat(lotFilter.minQty)) {
              let profit = 0;
              if (action === 'SELL') {
                 const lastBuy = await dbGet<any>('SELECT price FROM trades WHERE user_id = ? AND symbol = ? AND action = "BUY" ORDER BY created_at DESC LIMIT 1', [user.id, coin.symbol]);
                 if (lastBuy) {
                   profit = (currentPrice - lastBuy.price) * quantity;
                 }
              }
              
              // 1. Place Market Entry Order
              await placeMarketOrder(apiKey, apiSecret, coin.symbol, action, quantity);
              
              // 2. Place OCO Order with 3 Retries & Emergency Orphan Position Protection
              if (action === 'BUY') {
                let ocoSuccess = false;
                let ocoAttempts = 0;
                let lastOcoErr: any = null;

                while (!ocoSuccess && ocoAttempts < 3) {
                  ocoAttempts++;
                  try {
                    // Slight buffer adjustment if retry
                    const adjustFactor = ocoAttempts > 1 ? (1 - (ocoAttempts - 1) * 0.001) : 1;
                    const adjustedSlTrigger = formatPrice(slTrigger * adjustFactor, parseFloat(priceFilter.tickSize));
                    const adjustedSlLimit = formatPrice(adjustedSlTrigger * 0.998, parseFloat(priceFilter.tickSize));

                    await placeOCOOrder(apiKey, apiSecret, coin.symbol, action, quantity, tpPrice, adjustedSlTrigger, adjustedSlLimit);
                    ocoSuccess = true;
                  } catch (ocoErr: any) {
                    lastOcoErr = ocoErr;
                    console.error(`OCO attempt ${ocoAttempts} failed for ${coin.symbol}:`, ocoErr.message);
                    if (ocoAttempts < 3) {
                      await new Promise(res => setTimeout(res, 1500));
                    }
                  }
                }

                // If OCO still fails, protect user capital via EMERGENCY MARKET SELL
                if (!ocoSuccess) {
                  console.error(`CRITICAL: OCO failed 3 times for ${coin.symbol}. Executing EMERGENCY EXIT!`);
                  try {
                    await placeMarketOrder(apiKey, apiSecret, coin.symbol, 'SELL', quantity);
                    await sendMessageToUser(
                      user.id,
                      user.telegram_chat_id,
                      `🚨 *TƏCİLİ QORUMA İŞƏ DÜŞDÜ*\n\n${coin.symbol} alışından sonra Stop-Loss (OCO) yerləşdirilməsi 3 cəhddən sonra uğursuz oldu (${lastOcoErr?.message}).\n\nVəsaitinizin qorumasız qalmaması üçün koinlər dərhal bazar qiymətindən geri satıldı və balans qorundu.`
                    );
                    continue;
                  } catch (exitErr: any) {
                    console.error(`EMERGENCY EXIT FAILED for ${coin.symbol}:`, exitErr);
                    await sendMessageToUser(
                      user.id,
                      user.telegram_chat_id,
                      `🔥 *KRİTİK XƏBƏRDARLIQ*\n\n${coin.symbol} üçün Stop-Loss yerləşdirilə bilmədi və təcili satış icra olunmadı! Zəhmət olmasa Binance hesabınıza daxil olaraq mövqeni manual bağlayın!`
                    );
                    continue;
                  }
                }
              }

              const dedupeKey = `trade_${coin.symbol}_${action}_${Date.now()}`;
              await dbRun(
                'INSERT INTO trades (user_id, symbol, action, price, amount, status, dedupe_key, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [user.id, coin.symbol, action, currentPrice, quantity, 'EXECUTED', dedupeKey, profit]
              );

              if (decision.engine === 'TYPESAFE') {
                await sendMessageToUser(
                  user.id,
                  user.telegram_chat_id,
                  `⚡ *TYPE-SAFE EXECUTION (SPOT)*\n\n` +
                  `Koin: *${coin.symbol}* | Növ: *${action}*\n` +
                  `💰 Qiymət: $${currentPrice}\n` +
                  `🛑 Stop-Loss: $${slTrigger} (-${quantPlan?.riskPercent || '1.0'}%)\n` +
                  `🎯 Take-Profit: $${tpPrice} (+${quantPlan?.rewardPercent || '2.0'}%)\n` +
                  `📦 Miqdar: ${quantity}\n` +
                  `⚡ Latency: ${decision.latencyMs}ms | Güvən: ${confidence}%`
                );
              } else {
                await sendMessageToUser(
                  user.id,
                  user.telegram_chat_id,
                  `✅ *Spot Ticarət İcra Olundu*\n\n` +
                  `Koin: *${coin.symbol}* | Növ: *${action}*\n` +
                  `💰 Qiymət: $${currentPrice}\n` +
                  `🛑 Stop-Loss: $${slTrigger}\n` +
                  `🎯 Take-Profit: $${tpPrice}\n` +
                  `📦 Miqdar: ${quantity}\n` +
                  `📝 Səbəb: ${decision.reason_summary}`
                );
              }
            }
          } else {
            if (targetUserId) {
              await sendMessageToUser(user.id, user.telegram_chat_id, `ℹ️ *Analiz Nəticəsi*\nKoin: ${coin.symbol}\nQərar: HOLD\nSəbəb: ${decision.reason_summary}`);
            } else {
              hourlyHoldSummaries.push(`*${coin.symbol}*: ${decision.reason_summary}`);
            }
          }
        } catch (coinErr: any) {
           console.error(`Error processing coin ${symbol} for user ${user.username}:`, coinErr);
        }
      }

      if (!targetUserId && hourlyHoldSummaries.length > 0) {
        await sendMessageToUser(user.id, user.telegram_chat_id, `ℹ️ *Saatlıq Analiz Nəticəsi (HOLD)*\n\nHazırda heç bir koin üçün əlverişli ticarət fürsəti tapılmadı:\n\n${hourlyHoldSummaries.join('\n')}`);
      }
    } catch (err: any) {
      console.error(`Error processing user ${user.username}:`, err);
    }
  }
}
