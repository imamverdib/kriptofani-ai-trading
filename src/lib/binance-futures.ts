import crypto from 'crypto';
import fetch from 'node-fetch';

const FUTURES_BASE_URL = 'https://fapi.binance.com';

// ─── Signature Helper ──────────────────────────────────────────────────────
function signRequest(queryString: string, apiSecret: string): string {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

// ─── Exchange Info ──────────────────────────────────────────────────────────
export async function getFuturesExchangeInfo(symbol: string): Promise<any> {
  const url = `${FUTURES_BASE_URL}/fapi/v1/exchangeInfo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch futures exchange info');
  const data: any = await res.json();
  const symbolInfo = data.symbols.find((s: any) => s.symbol === symbol);
  if (!symbolInfo) throw new Error(`Symbol ${symbol} not found in futures`);
  return symbolInfo;
}

// ─── Futures Account Balance ────────────────────────────────────────────────
export async function getFuturesBalance(apiKey: string, apiSecret: string): Promise<number> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v2/balance?${queryString}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Futures balance error: ${await res.text()}`);

  const data: any = await res.json();
  const usdtBalance = data.find((b: any) => b.asset === 'USDT');
  return usdtBalance ? parseFloat(usdtBalance.availableBalance) : 0;
}

// ─── Futures Account Info (with positions) ──────────────────────────────────
export async function getFuturesAccountInfo(apiKey: string, apiSecret: string): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v2/account?${queryString}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Futures account error: ${await res.text()}`);
  return await res.json();
}

// ─── Get Open Positions ─────────────────────────────────────────────────────
export async function getFuturesPositions(apiKey: string, apiSecret: string): Promise<any[]> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
  if (!res.ok) throw new Error(`Futures positions error: ${await res.text()}`);

  const data: any = await res.json();
  // Filter only positions with non-zero quantity
  return data.filter((p: any) => parseFloat(p.positionAmt) !== 0);
}

// ─── Klines (Candlestick Data) ─────────────────────────────────────────────
export async function getFuturesKlines(
  symbol: string, 
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d', 
  limit: number = 100
): Promise<any[]> {
  const url = `${FUTURES_BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Futures klines error: ${await res.text()}`);

  const data: any = await res.json();
  return data.map((k: any) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

// ─── Set Leverage ───────────────────────────────────────────────────────────
export async function setLeverage(
  apiKey: string, apiSecret: string, symbol: string, leverage: number
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `symbol=${symbol}&leverage=${leverage}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v1/leverage?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`Set leverage error: ${data.msg || res.statusText}`);
  return data;
}

// ─── Set Margin Type ────────────────────────────────────────────────────────
export async function setMarginType(
  apiKey: string, apiSecret: string, symbol: string, marginType: 'ISOLATED' | 'CROSSED'
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `symbol=${symbol}&marginType=${marginType}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v1/marginType?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data: any = await res.json();
  // Error code -4046 means margin type is already set — we can safely ignore it
  if (!res.ok && data.code !== -4046) {
    throw new Error(`Set margin type error: ${data.msg || res.statusText}`);
  }
  return data;
}

// ─── Place Futures Market Order ─────────────────────────────────────────────
export async function placeFuturesMarketOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  reduceOnly: boolean = false
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  let queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  if (reduceOnly) {
    queryString += `&reduceOnly=true`;
  }
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v1/order?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`Futures order error: ${data.msg || res.statusText}`);
  return data;
}

// ─── Place Futures Stop Market Order (Algo API) ────────────────
export async function placeFuturesStopOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  stopPrice: number,
  reduceOnly: boolean = true
): Promise<any> {
  // Method 1: New /fapi/v1/algoOrder endpoint (conditional STOP_MARKET)
  try {
    const timestamp = Date.now();
    const recvWindow = 5000;
    const queryString = `algoType=CONDITIONAL&symbol=${symbol}&side=${side}&type=STOP_MARKET&quantity=${quantity}&triggerPrice=${stopPrice}&reduceOnly=${reduceOnly}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signature = signRequest(queryString, apiSecret);

    const url = `${FUTURES_BASE_URL}/fapi/v1/algoOrder?${queryString}&signature=${signature}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey }
    });

    const data: any = await res.json();
    if (!res.ok) throw new Error(`Futures stop order error: ${data.msg || res.statusText}`);
    return data;
  } catch (primaryErr: any) {
    console.warn(`[SL] Primary algoOrder STOP_MARKET failed for ${symbol}: ${primaryErr.message}. Trying closePosition method...`);
    
    // Method 2: Fallback — Use closePosition=true on the algoOrder endpoint
    try {
      const timestamp2 = Date.now();
      const recvWindow2 = 10000;
      const queryString2 = `algoType=CONDITIONAL&symbol=${symbol}&side=${side}&type=STOP_MARKET&closePosition=true&triggerPrice=${stopPrice}&recvWindow=${recvWindow2}&timestamp=${timestamp2}`;
      const signature2 = signRequest(queryString2, apiSecret);

      const url2 = `${FUTURES_BASE_URL}/fapi/v1/algoOrder?${queryString2}&signature=${signature2}`;
      const res2 = await fetch(url2, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey }
      });

      const data2: any = await res2.json();
      if (!res2.ok) throw new Error(`Futures stop (closePosition) error: ${data2.msg || res2.statusText}`);
      console.log(`[SL] Successfully placed SL via closePosition algoOrder for ${symbol}`);
      return data2;
    } catch (fallbackErr: any) {
      console.error(`[SL] Both SL methods failed for ${symbol}:`, fallbackErr.message);
      throw new Error(`All SL placement methods failed for ${symbol}: Primary: ${primaryErr.message}, Fallback: ${fallbackErr.message}`);
    }
  }
}

// ─── Cancel All Open Algo Orders for Symbol ─────────────────────────────────
export async function cancelAllFuturesAlgoOrders(
  apiKey: string,
  apiSecret: string,
  symbol: string
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `symbol=${symbol}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v1/algoOpenOrders?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`Cancel algo orders error: ${data.msg || res.statusText}`);
  return data;
}

// ─── Cancel All Open Orders for Symbol ──────────────────────────────────────
export async function cancelAllFuturesOrders(
  apiKey: string, apiSecret: string, symbol: string
): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `symbol=${symbol}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);

  const url = `${FUTURES_BASE_URL}/fapi/v1/allOpenOrders?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-MBX-APIKEY': apiKey }
  });

  const data: any = await res.json();
  if (!res.ok) throw new Error(`Cancel orders error: ${data.msg || res.statusText}`);
  return data;
}

// ─── Get Current Futures Price ───────────────────────────────────────────────
export async function getFuturesPrice(symbol: string): Promise<number> {
  const url = `${FUTURES_BASE_URL}/fapi/v1/ticker/price?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Futures price error for ${symbol}`);
  const data: any = await res.json();
  return parseFloat(data.price);
}

// ─── Get Smart Top Volume Futures Coins (Signal-Based Pre-Screening) ─────────
export async function getSmartFuturesCoins(
  blacklist: string[] = [],
  count: number = 7
): Promise<string[]> {
  try {
    const res = await fetch(`${FUTURES_BASE_URL}/fapi/v1/ticker/24hr`);
    const data: any = await res.json();
    
    // 1. Filter USDT pairs
    let usdtPairs = data.filter((t: any) => t.symbol.endsWith('USDT'));
    
    // 2. Filter out stablecoins + blacklisted coins
    const excludeList = ['USDCUSDT', 'BUSDUSDT', 'TUSDUSDT', 'FDUSDUSDT', ...blacklist];
    usdtPairs = usdtPairs.filter((t: any) => !excludeList.includes(t.symbol));

    // 3. Anti-Pump/Dump & Liquidity Filter
    usdtPairs = usdtPairs.filter((t: any) => {
      const volume = parseFloat(t.quoteVolume);
      const priceChangePct = parseFloat(t.priceChangePercent);
      return volume > 50000000 && priceChangePct > -15 && priceChangePct < 15;
    });

    // 4. Sort by Trade Count (Activity/Liquidity) descending
    usdtPairs.sort((a: any, b: any) => parseInt(b.count) - parseInt(a.count));

    // 5. Take Top 30 safest/most active coins
    const top30 = usdtPairs.slice(0, 30);

    // 6. Score each coin with quick RSI check (parallel batches of 5)
    interface CoinScore {
      symbol: string;
      score: number;
      rsi: number;
      volumeRank: number;
      priceChange: number;
    }

    const scores: CoinScore[] = [];
    const batchSize = 5;

    for (let i = 0; i < top30.length; i += batchSize) {
      const batch = top30.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (t: any) => {
          try {
            const klines = await getFuturesKlines(t.symbol, '4h', 20);
            if (klines.length < 15) return null;

            const closes = klines.map((k: any) => k.close);

            // Quick RSI calculation
            const { rsi } = await import('technicalindicators');
            const rsiValues = rsi({ period: 14, values: closes });
            const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

            // Score calculation:
            // - RSI < 30 or RSI > 70 = strong signal (higher score)
            // - RSI 30-40 or 60-70 = moderate signal
            // - RSI 40-60 = weak signal (low score)
            let rsiScore = 0;
            if (currentRSI <= 25 || currentRSI >= 75) rsiScore = 100;
            else if (currentRSI <= 30 || currentRSI >= 70) rsiScore = 80;
            else if (currentRSI <= 35 || currentRSI >= 65) rsiScore = 50;
            else if (currentRSI <= 40 || currentRSI >= 60) rsiScore = 20;
            else rsiScore = 0; // 40-60 neutral zone

            // Volume bonus: higher 24h volume relative to others = small bonus
            const volumeRank = top30.indexOf(t);
            const volumeScore = Math.max(0, 30 - volumeRank); // top coins get up to 30 bonus

            // Price change momentum: moderate moves are interesting
            const priceChange = Math.abs(parseFloat(t.priceChangePercent));
            const momentumScore = priceChange > 3 && priceChange < 10 ? 20 : 0;

            return {
              symbol: t.symbol,
              score: rsiScore + volumeScore + momentumScore,
              rsi: currentRSI,
              volumeRank,
              priceChange: parseFloat(t.priceChangePercent),
            } as CoinScore;
          } catch {
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          scores.push(result.value);
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < top30.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // 7. Sort by score (descending), then by volume rank (ascending)
    scores.sort((a, b) => b.score - a.score || a.volumeRank - b.volumeRank);

    // 8. Always include BTC and ETH if available
    const selected: string[] = [];
    const btcEntry = scores.find(s => s.symbol === 'BTCUSDT');
    const ethEntry = scores.find(s => s.symbol === 'ETHUSDT');
    
    if (btcEntry) selected.push('BTCUSDT');
    if (ethEntry) selected.push('ETHUSDT');

    // Fill remaining slots with top-scored coins
    for (const entry of scores) {
      if (selected.length >= count) break;
      if (!selected.includes(entry.symbol)) {
        selected.push(entry.symbol);
      }
    }

    console.log(`[SMART-COINS] Selected ${selected.length} coins:`, 
      scores.filter(s => selected.includes(s.symbol)).map(s => 
        `${s.symbol}(RSI:${s.rsi.toFixed(1)}, Score:${s.score})`
      ).join(', '));

    return selected;
  } catch (err) {
    console.error('Failed to fetch smart futures coins', err);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  }
}

// Legacy wrapper for backward compatibility
export async function getTopFuturesCoins(): Promise<string[]> {
  return getSmartFuturesCoins([], 7);
}

// ─── Format Helpers ─────────────────────────────────────────────────────────
export function formatFuturesQuantity(qty: number, stepSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
  return Number((Math.floor(qty / stepSize) * stepSize).toFixed(precision));
}

export function formatFuturesPrice(price: number, tickSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(tickSize)));
  return Number((Math.round(price / tickSize) * tickSize).toFixed(precision));
}
