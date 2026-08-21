import crypto from 'crypto';
import fetch from 'node-fetch';

export interface BinanceExchangeInfo {
  symbols: {
    symbol: string;
    filters: any[];
  }[];
}

function signRequest(queryString: string, apiSecret: string) {
  return crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

export async function getExchangeInfo(symbol: string): Promise<any> {
  const url = `https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch exchange info');
  const data: any = await res.json();
  return data.symbols[0];
}

export function formatQuantity(qty: number, stepSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
  return Number((Math.floor(qty / stepSize) * stepSize).toFixed(precision));
}

export function formatPrice(price: number, tickSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(tickSize)));
  return Number((Math.round(price / tickSize) * tickSize).toFixed(precision));
}

export async function placeMarketOrder(apiKey: string, apiSecret: string, symbol: string, side: 'BUY' | 'SELL', quantity: number) {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const queryString = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);
  
  const url = `https://api.binance.com/api/v3/order`;
  
  const res = await fetch(`${url}?${queryString}&signature=${signature}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Binance Order Error: ${data.msg || res.statusText}`);
  return data;
}

export async function placeOCOOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: 'BUY' | 'SELL', 
  quantity: number, 
  price: number, 
  stopPrice: number, 
  stopLimitPrice: number
) {
  const timestamp = Date.now();
  const recvWindow = 5000;
  // OCO side is OPPOSITE to the entry side. If we bought, OCO side must be SELL.
  const ocoSide = side === 'BUY' ? 'SELL' : 'BUY';
  
  const queryString = `symbol=${symbol}&side=${ocoSide}&quantity=${quantity}&price=${price}&stopPrice=${stopPrice}&stopLimitPrice=${stopLimitPrice}&stopLimitTimeInForce=GTC&recvWindow=${recvWindow}&timestamp=${timestamp}`;
  const signature = signRequest(queryString, apiSecret);
  
  const url = `https://api.binance.com/api/v3/order/oco`;
  
  const res = await fetch(`${url}?${queryString}&signature=${signature}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  
  const data: any = await res.json();
  if (!res.ok) throw new Error(`Binance OCO Error: ${data.msg || res.statusText}`);
  return data;
}
