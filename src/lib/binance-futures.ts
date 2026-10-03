import type {ExchangePosition} from './exchange-types';
import { exchange,exchangeInfo,klines,price } from './exchange-client';
import { grid } from './trading-math';
export const getFuturesExchangeInfo=(symbol:string)=>exchangeInfo('futures',symbol);
export const getFuturesKlines=(symbol:string,interval:string,limit=100)=>klines('futures',symbol,interval,limit);
export const getFuturesPrice=(symbol:string)=>price('futures',symbol);
export const formatFuturesQuantity=(qty:number,step:number)=>grid(qty,step);
export const formatFuturesPrice=(p:number,tick:number)=>grid(p,tick,'round');
export async function getFuturesAccountInfo(key:string,secret:string){return exchange('futures','/fapi/v2/account',{},{key,secret})}
export async function getFuturesBalance(key:string,secret:string){return Number((await getFuturesAccountInfo(key,secret)).availableBalance)}
export async function getFuturesPositions(key:string,secret:string){return (await exchange<ExchangePosition[]>('futures','/fapi/v2/positionRisk',{},{key,secret})).filter(p=>Number(p.positionAmt)!==0)}
