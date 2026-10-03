import { exchangeInfo } from './exchange-client';
import { grid } from './trading-math';
export const getExchangeInfo=(symbol:string)=>exchangeInfo('spot',symbol);
export const formatQuantity=(qty:number,step:number)=>grid(qty,step);
export const formatPrice=(price:number,tick:number)=>grid(price,tick,'round');
