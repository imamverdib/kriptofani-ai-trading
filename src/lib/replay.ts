import { grossPnl, positive, validatePlan } from './trading-math';
export interface ReplayBar {time:number;open:number;high:number;low:number;close:number}
export interface RecordedSignal {availableAt:number;symbol:string;side:'LONG'|'SHORT';stop:number;targets:[number,number,number];quantity:number;confidence:number}
export interface ReplayCosts {taker:number;slippage:number;funding:{time:number;rate:number}[];monitorIntervalMs:number}
/** Conservative OHLC replay of already-recorded signals, never a model trained on future bars. */
export function replay(signal:RecordedSignal,bars:ReplayBar[],costs:ReplayCosts){
 if(!['LONG','SHORT'].includes(signal.side)||!Number.isFinite(signal.availableAt))throw new Error('Invalid signal');
 positive(signal.quantity);if(!Number.isFinite(costs.taker)||!Number.isFinite(costs.slippage)||costs.taker<0||costs.slippage<0)throw new Error('Invalid costs');
 let previous=-Infinity;for(const b of bars){if(b.time<=previous)throw new Error('Candles must be strictly chronological');previous=b.time;[b.open,b.high,b.low,b.close].forEach(x=>positive(x));if(b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close))throw new Error('Invalid OHLC');}
 const usable=bars.filter(b=>b.time>signal.availableAt);if(!usable.length)throw new Error('No tradable bar after signal availability');
 const direction=signal.side==='LONG'?1:-1,entry=usable[0].open*(1+direction*costs.slippage);
 validatePlan(signal.side,entry,signal.stop,signal.targets);
 let remaining=signal.quantity,net=-entry*remaining*costs.taker,fees=entry*remaining*costs.taker,stage=0,high=entry,lastPoll=-Infinity;
 const fills:{time:number;qty:number;price:number;reason:string}[]=[];
 const funding=[...costs.funding].sort((a,b)=>a.time-b.time);let fundingIndex=0;
 function close(qty:number,p:number,t:number,reason:string){const fill=p*(1-direction*costs.slippage),fee=qty*fill*costs.taker;net+=grossPnl(signal.side,entry,fill,qty)-fee;fees+=fee;remaining-=qty;fills.push({time:t,qty,price:fill,reason})}
 for(const b of usable){
  while(fundingIndex<funding.length&&funding[fundingIndex].time<=b.time){const f=funding[fundingIndex++];if(f.time>=usable[0].time)net-=direction*remaining*b.open*f.rate;}
  if(remaining<=1e-12)break;
  // Native protective stop runs even between monitor polls. Stop-first when intrabar order is unknown.
  if(direction===1?b.low<=signal.stop:b.high>=signal.stop){close(remaining,direction===1?Math.min(b.open,signal.stop):Math.max(b.open,signal.stop),b.time,'STOP_OR_GAP');break;}
  if(b.time-lastPoll<costs.monitorIntervalMs)continue;lastPoll=b.time;
  const hit=(p:number)=>direction===1?b.close>=p:b.close<=p;
  const reached=hit(signal.targets[2])?3:hit(signal.targets[1])?2:hit(signal.targets[0])?1:0;
  if(reached>stage){const target=signal.quantity*[0,0.5,0.75,1][reached],already=signal.quantity-remaining;close(Math.min(remaining,target-already),b.close,b.time,`TP${reached}`);stage=reached;high=b.close;continue;}
  if(stage>0){high=direction===1?Math.max(high,b.close):Math.min(high,b.close);const trailing=stage>=2?(direction===1?Math.max(entry,high*0.985):Math.min(entry,high*1.015)):entry;
   if(direction===1?b.close<=trailing:b.close>=trailing){close(remaining,b.close,b.time,'LOCAL_TRAILING');break;}}
 }
 const marked=remaining>0?grossPnl(signal.side,entry,usable.at(-1)!.close,remaining):0;
 return {symbol:signal.symbol,entry,netRealized:net,unrealized:marked,fees,remaining,fills,closed:remaining<=1e-12};
}
export function summarizeReturns(returns:number[]){
 if(!returns.length||returns.some(r=>!Number.isFinite(r)||r<=-1))throw new Error('Invalid return sample');
 let wealth=1,high=1,maxDrawdown=0;for(const r of returns){wealth*=1+r;high=Math.max(high,wealth);maxDrawdown=Math.max(maxDrawdown,(high-wealth)/high)}
 const average=returns.reduce((s,r)=>s+r,0)/returns.length;
 return {observations:returns.length,meanReturn:average,compoundReturn:wealth-1,maxDrawdown,winRate:returns.filter(r=>r>0).length/returns.length,warning:'Recorded-signal replay only; sample dependence, selection bias, calibration and live slippage require separate validation.'};
}
