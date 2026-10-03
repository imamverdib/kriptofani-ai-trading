import type {SymbolInfo} from './exchange-types';
import { createHmac,createHash } from 'node:crypto';
import type { Market } from './trading-store';

export type Credentials = { key:string; secret:string };
export class ExchangeError extends Error {
  constructor(message:string, public code:number, public unknown=false){super(message)}
}
const roots={spot:process.env.BINANCE_SPOT_URL || 'https://api.binance.com',futures:process.env.BINANCE_FUTURES_URL || 'https://fapi.binance.com'};
const cache=new Map<string,{expires:number; value:Promise<unknown>}>();
const blocked=new Map<string,number>();
const privateBlocked=new Map<string,number>();
let tokens=900, last=Date.now();
let orderTokens=30, orderLast=Date.now();
const clocks=new Map<string,{offset:number;expires:number}>();
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Conservative single-worker IP budget; exchange headers can tighten it. */
async function budget(root:string,weight:number,mutating:boolean,priority:boolean){
  const now=Date.now(); tokens=Math.min(900,tokens+(now-last)*15/1000);last=now;
  orderTokens=Math.min(30,orderTokens+(now-orderLast)*3/1000);orderLast=now;
  if((blocked.get(root)||0)>now)throw new ExchangeError('Exchange rate circuit open',429);
  if(tokens-weight<(priority?0:150)||(mutating&&orderTokens<1))throw new ExchangeError('Local rate budget exhausted',429);
  tokens-=weight;if(mutating)orderTokens--;
}
export async function exchange<T = Record<string, unknown>>(market:Market, endpoint:string, params:Record<string,string|number|boolean>={}, credentials?:Credentials, method='GET', options:{priority?:boolean;weight?:number;cacheMs?:number}={}):Promise<T>{
  const root=roots[market];
  const identity=credentials?`${root}:${createHash('sha256').update(credentials.key).digest('hex')}`:null;
  if(identity&&(privateBlocked.get(identity)||0)>Date.now())throw new ExchangeError('Account API circuit temporarily open',-2015);
  if(!/^https:\/\//.test(root))throw new Error('Exchange requires HTTPS');
  const cacheKey=`${root}${endpoint}?${new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]))}`;
  if(!credentials&&method==='GET'&&options.cacheMs){
    const hit=cache.get(cacheKey);if(hit&&hit.expires>Date.now())return hit.value as Promise<T>;
    const value=request();cache.set(cacheKey,{expires:Date.now()+options.cacheMs,value});
    try{return await value}catch(e){cache.delete(cacheKey);throw e}
  }
  return request();
  async function request():Promise<T>{
    if(credentials){
      const clock=clocks.get(root);
      if(!clock||clock.expires<Date.now()){
        const before=Date.now();const time=await exchange<{serverTime:number}>(market,market==='spot'?'/api/v3/time':'/fapi/v1/time',{},undefined,'GET',{priority:options.priority,weight:1});
        clocks.set(root,{offset:Number(time.serverTime)-(before+Date.now())/2,expires:Date.now()+60000});
      }
    }
    await budget(root,options.weight||10,method!=='GET',!!options.priority);
    const q=new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));
    if(credentials){q.set('recvWindow','5000');q.set('timestamp',String(Math.round(Date.now()+(clocks.get(root)?.offset||0))));q.set('signature',createHmac('sha256',credentials.secret).update(q.toString()).digest('hex'));}
    try{
      const response=await fetch(`${root}${endpoint}?${q}`,{method,headers:credentials?{'X-MBX-APIKEY':credentials.key}:{},signal:AbortSignal.timeout(10000),cache:'no-store'});
      const used=Number(response.headers.get('x-mbx-used-weight-1m')||0);
      if(used>900)tokens=Math.min(tokens,Math.max(0,1050-used));
      if(response.status===429||response.status===418){blocked.set(root,Date.now()+Math.max(60000,Number(response.headers.get('retry-after')||60)*1000));}
      const data=await response.json();
      if(identity&&(response.status===401||[-2014,-2015].includes(Number(data.code))))privateBlocked.set(identity,Date.now()+30000);
      if(!response.ok)throw new ExchangeError(`Binance ${data.code ?? response.status}: ${String(data.msg||'request rejected').slice(0,240)}`,Number(data.code||response.status),method!=='GET'&&(response.status>=500||response.status===408));
      return data;
    }catch(e){
      if(e instanceof ExchangeError)throw e;
      if(identity)privateBlocked.set(identity,Date.now()+10000);
      // Never include signed URLs, keys or fetch cause in logs.
      throw new ExchangeError('Exchange transport/response failure',0,method!=='GET');
    }
  }
}
export async function retryRead<T>(fn:()=>Promise<T>):Promise<T>{
  let last:unknown;
  for(let i=0;i<3;i++){try{return await fn()}catch(e){last=e;if(e instanceof ExchangeError&&(e.code===418||e.code===429))throw e;await sleep(150*(2**i))}}
  throw last;
}
export async function accountUid(c:Credentials):Promise<string>{
  const data=await exchange('spot','/api/v3/account',{},c);
  if(!data.uid)throw new Error('Exchange account UID could not be verified');return String(data.uid);
}
export async function exchangeInfo(m:Market,symbol:string){
  const d=await exchange<{symbols:SymbolInfo[]}>(m,m==='spot'?'/api/v3/exchangeInfo':'/fapi/v1/exchangeInfo',m==='spot'?{symbol}:{},undefined,'GET',{cacheMs:300000,weight:20});
  const info=d.symbols?.find(s=>s.symbol===symbol);
  if(!info||info.status!=='TRADING')throw new Error('Symbol is not trading');return info;
}
export async function klines(m:Market,symbol:string,interval:string,limit:number){
  const d=await exchange<(string|number)[][]>(m,m==='spot'?'/api/v3/klines':'/fapi/v1/klines',{symbol,interval,limit:limit+1},undefined,'GET',{cacheMs:15000,weight:5});
  return d.filter(k=>Number(k[6])<Date.now()-2000).slice(-limit).map(k=>({openTime:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closeTime:+k[6]}));
}
export async function price(m:Market,symbol:string){
  const d=await exchange(m,m==='spot'?'/api/v3/ticker/price':'/fapi/v1/premiumIndex',{symbol},undefined,'GET',{priority:true,cacheMs:1000,weight:2});
  const value=Number(m==='spot'?d.price:d.markPrice);if(!Number.isFinite(value)||value<=0)throw new Error('Invalid market price');return value;
}
export async function depthQuote(m:Market,symbol:string,side:string,qty:number){
  const d=await exchange<{bids:[string,string][];asks:[string,string][]}>(m,m==='spot'?'/api/v3/depth':'/fapi/v1/depth',{symbol,limit:100},undefined,'GET',{cacheMs:500,weight:10});
  const bid=Number(d.bids?.[0]?.[0]),ask=Number(d.asks?.[0]?.[0]);
  if(!(bid>0&&ask>=bid))throw new Error('Invalid order book');
  const mid=(bid+ask)/2,spread=(ask-bid)/mid;
  let remaining=qty,value=0;
  for(const [p,q] of side==='BUY'?d.asks:d.bids){const filled=Math.min(remaining,Number(q));value+=filled*Number(p);remaining-=filled;if(remaining<=1e-12)break;}
  if(qty>0&&remaining>1e-10)throw new Error('Insufficient order book depth');
  const vwap=qty>0?value/qty:(side==='BUY'?ask:bid);
  if(spread>0.002||Math.abs(vwap-mid)/mid>0.003)throw new Error('Spread/slippage exceeds execution budget');
  return {price:vwap,mid,spread};
}
