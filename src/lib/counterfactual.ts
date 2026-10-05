import {computeQuantPlan} from './quant-math';
import {grid,sizePosition,validatePlan,grossPnl} from './trading-math';
export type Side='LONG'|'SHORT';
export type Bar={time:number;open:number;high:number;low:number;close:number;volume?:number};
export type Decision={id:string;symbol:string;market:string;time:number;decision:{action:string;confidence:number};snapshot:{asOf:number;trend:string;rsi:number;bars:{openTime:number;closeTime:number;high:number;low:number;close:number}[]}};
export type Rules={step:string;minQty:number;maxQty:number;marketStep:string;marketMin:number;marketMax:number;tick:string;minNotional:number};
export type Config={allocation:number;risk:number;leverage:number;maxPositions:number;confidence:number;fee:number;slippage:number};
export type Candle={trade:Bar;mark:Bar};
export type Funding={time:number;rate:number;mark:number};
export type Dataset={candles:Map<number,Candle>;funding:Map<number,Funding[]>;rules:Rules};
export type Fill={time:number;quantity:number;price:number;reason:string;cash:number};
export type Position={id:string;symbol:string;side:Side;start:number;end:number;entry:number;stop:number;targets:number[];qty:number;remaining:number;stage:number;high:number;net:number;fees:number;funding:number;risk:number;notional:number;fills:Fill[];ambiguities:number;endReason:string;lastMark:number};
export const MINUTE=60000;
export function entryTime(d:Decision){return (Math.floor(d.time/MINUTE)+1)*MINUTE}
export function makePosition(d:Decision,side:Side,data:Dataset,cfg:Config,equity:number,available:number,end:number):Position{
 const start=entryTime(d),c=data.candles.get(start);if(!c)throw Error('ENTRY_DATA_MISSING');
 if(!d.snapshot.bars.length||d.snapshot.bars.some(b=>b.closeTime>=d.snapshot.asOf||b.closeTime>=d.time))throw Error('NON_POINT_IN_TIME_SNAPSHOT');
 const reference=d.snapshot.bars.at(-1)!.close;
 if(Math.abs(c.trade.open-reference)/reference>0.005)throw Error('ENTRY_DRIFT');
 const direction=side==='LONG'?1:-1,entry=c.trade.open*(1+direction*cfg.slippage);
 const p=computeQuantPlan(side,c.trade.open,d.snapshot.bars),round=side==='LONG'?'ceil':'floor';
 const stop=grid(p.stopLossPrice,data.rules.tick,round),targets=[p.takeProfit1,p.takeProfit2,p.takeProfit3].map(v=>grid(v,data.rules.tick,round));
 validatePlan(side,c.trade.open,stop,targets);
 // Execution risk reserve uses the same fixed 0.5% allowance as the live sizing policy.
 const qty=sizePosition({equity,available,entry:c.trade.open,stop,leverage:cfg.leverage,riskPct:cfg.risk,allocationPct:cfg.allocation,feeRate:cfg.fee,slippage:0.005,step:data.rules.step});
 const r=data.rules;
 if(qty<r.minQty||qty>r.maxQty||qty<r.marketMin||qty>r.marketMax||Number(r.marketStep)>0&&Math.abs(grid(qty,r.marketStep)-qty)>1e-10)throw Error('LOT_SIZE');
 if(qty*c.trade.open<r.minNotional)throw Error('MIN_NOTIONAL');
 const previous=data.candles.get(start-MINUTE)?.trade;
 if(previous?.volume!==undefined&&qty*c.trade.open>previous.volume*previous.close*0.01)throw Error('PARTICIPATION_CAP');
 const fee=entry*qty*cfg.fee;
 return {id:d.id,symbol:d.symbol,side,start,end,entry,stop,targets,qty,remaining:qty,stage:0,high:entry,net:-fee,fees:fee,funding:0,risk:qty*(Math.abs(c.trade.open-stop)+c.trade.open*(2*cfg.fee+0.005)),notional:qty*entry,fills:[{time:start,quantity:qty,price:entry,reason:'ENTRY',cash:-fee}],ambiguities:0,endReason:'',lastMark:c.mark.open};
}
export function closePart(p:Position,qty:number,price:number,time:number,reason:string,cfg:Config){
 if(qty<=1e-12)return;
 const fill=price*(1-(p.side==='LONG'?1:-1)*cfg.slippage),fee=qty*fill*cfg.fee,cash=grossPnl(p.side,p.entry,fill,qty)-fee;
 p.remaining=Math.max(0,p.remaining-qty);p.net+=cash;p.fees+=fee;p.fills.push({time,quantity:qty,price:fill,reason,cash});if(p.remaining<1e-12)p.endReason=reason;
}
export function stepPosition(p:Position,c:Candle,funding:Funding[],rules:Rules,cfg:Config){
 if(p.remaining<1e-12)return;
 const long=p.side==='LONG',direction=long?1:-1,b=c.mark,t=c.trade,at=t.time+MINUTE;
 for(const f of funding){const cash=-direction*p.remaining*f.mark*f.rate;p.net+=cash;p.funding+=cash;p.fills.push({time:f.time,quantity:0,price:f.mark,reason:'FUNDING',cash})}
 p.lastMark=b.close;
 const stopHit=long?b.low<=p.stop:b.high>=p.stop;
 if(stopHit){
  if(long?b.high>=p.targets[p.stage] : b.low<=p.targets[p.stage])p.ambiguities++;
  // Unknown sub-minute execution: approximate contract/mark basis by bar-open basis.
  const trigger=long?Math.min(b.open,p.stop):Math.max(b.open,p.stop);
  closePart(p,p.remaining,trigger+(t.open-b.open),at,'STOP_OR_GAP',cfg);return;
 }
 const hit=(price:number)=>long?b.close>=price:b.close<=price;
 const reached=hit(p.targets[2])?3:hit(p.targets[1])?2:hit(p.targets[0])?1:0;
 if(reached>p.stage){
  const target=grid(p.qty*[0,0.5,0.75,1][reached],rules.step),qty=Math.min(p.remaining,Math.max(0,target-(p.qty-p.remaining)));
  closePart(p,qty,t.close,at,'TP'+reached,cfg);p.stage=reached;p.high=b.close;
 }else if(p.stage>0){
  p.high=long?Math.max(p.high,b.close):Math.min(p.high,b.close);
  const trail=p.stage>=2?(long?Math.max(p.entry,p.high*0.985):Math.min(p.entry,p.high*1.015)):p.entry;
  if(long?b.close<=trail:b.close>=trail)closePart(p,p.remaining,t.close,at,'LOCAL_TRAILING',cfg);
 }
 if(p.remaining>1e-12&&at>=p.end)closePart(p,p.remaining,t.close,at,'HORIZON_EXIT',cfg);
}
export function hasCoverage(data:Dataset,start:number,end:number){for(let t=start;t<end;t+=MINUTE)if(!data.candles.has(t))return false;return true}
export function simulate(d:Decision,side:Side,data:Dataset,cfg:Config,horizon:number,cutoff:number){
 const start=entryTime(d),end=start+horizon*MINUTE;
 if(end>cutoff)return {status:'CENSORED' as const};
 if(!hasCoverage(data,start,end))return {status:'DATA_GAP' as const};
 try{const p=makePosition(d,side,data,cfg,100,100,end);for(let t=start;t<end&&p.remaining>1e-12;t+=MINUTE)stepPosition(p,data.candles.get(t)!,data.funding.get(t)||[],data.rules,cfg);return {status:'SIMULATED' as const,position:p}}catch(e){return {status:'REJECTED' as const,reason:e instanceof Error?e.message:'UNKNOWN'}}
}
export type Policy='actual'|'trend'|'trend_rsi'|'long'|'short';
export function choose(d:Decision,policy:Policy,cfg:Config):Side|null{
 if(policy==='actual')return ['LONG','SHORT'].includes(d.decision.action)&&d.decision.confidence>=cfg.confidence?d.decision.action as Side:null;
 if(policy==='long')return 'LONG';if(policy==='short')return 'SHORT';
 const side=d.snapshot.trend;if(side!=='LONG'&&side!=='SHORT')return null;
 if(policy==='trend_rsi'&&(side==='LONG'&&d.snapshot.rsi>65||side==='SHORT'&&d.snapshot.rsi<35))return null;
 return side;
}
/** Chronological, shared-wallet simulation. Full remaining reservations are kept until close, as live code does. */
export function portfolio(decisions:Decision[],datasets:Map<string,Dataset>,cfg:Config,policy:Policy,horizon:number,cutoff:number){
 const schedule=new Map<number,Decision[]>();for(const d of decisions){const t=entryTime(d);if(t>=cutoff)continue;const a=schedule.get(t)||[];a.push(d);schedule.set(t,a)}
 const active:Position[]=[],closed:Position[]=[],skipped:Record<string,number>={};let balance=100,high=100,maxDD=0,frozen=false,day='',dayStart=100;
 const curve:{time:number;equity:number;open:number}[]=[];const skip=(reason:string)=>{skipped[reason]=(skipped[reason]||0)+1};
 const start=Math.min(...schedule.keys());if(!Number.isFinite(start))return {policy,finalEquity:100,maxDrawdown:0,closed:[],skipped,curve:[],frozen:false};
 const equity=()=>balance+active.reduce((s,p)=>s+grossPnl(p.side,p.entry,p.lastMark,p.remaining),0);
 for(let t=start;t<cutoff;t+=MINUTE){
  // Mark at the current minute's open before allocating capital: no use of its future close.
  for(const p of active){const c=datasets.get(p.symbol)!.candles.get(t);if(c)p.lastMark=c.mark.open}
  const currentDay=new Date(t).toISOString().slice(0,10);if(currentDay!==day){day=currentDay;dayStart=equity()}
  const checkRisk=()=>{const eq=equity();high=Math.max(high,eq);maxDD=Math.max(maxDD,(high-eq)/high);if(eq<dayStart*0.98||eq<high*0.95)frozen=true;return eq};
  checkRisk();
  for(const d of schedule.get(t)||[]){
   const side=choose(d,policy,cfg);if(!side){skip('NO_SIGNAL');continue}if(frozen){skip('RISK_FREEZE');continue}
   if(active.some(p=>p.symbol===d.symbol)){skip('SYMBOL_OPEN');continue}if(active.length>=cfg.maxPositions){skip('MAX_POSITIONS');continue}
   const data=datasets.get(d.symbol)!;const end=Math.min(t+horizon*MINUTE,cutoff);
   if(!hasCoverage(data,t,end)){skip('DATA_GAP');continue}
   try{
    const eq=equity(),available=Math.max(0,eq-active.reduce((s,p)=>s+p.remaining*p.entry/cfg.leverage,0));
    const p=makePosition(d,side,data,cfg,eq,available,end);
    if(p.risk+active.reduce((s,p)=>s+p.risk,0)>eq*0.02){skip('PORTFOLIO_RISK');continue}
    if(p.notional+active.reduce((s,p)=>s+p.notional,0)>eq){skip('GROSS_NOTIONAL');continue}
    active.push(p);balance+=p.net;
   }catch(e){skip(e instanceof Error?e.message:'UNKNOWN')}
  }
  for(let i=active.length-1;i>=0;i--){const p=active[i],data=datasets.get(p.symbol)!,before=p.net;stepPosition(p,data.candles.get(t)!,data.funding.get(t)||[],data.rules,cfg);balance+=p.net-before;if(p.remaining<1e-12){if(p.end===cutoff&&p.endReason==='HORIZON_EXIT')p.endReason='SAMPLE_END_EXIT';closed.push(p);active.splice(i,1)}}
  const eq=checkRisk();curve.push({time:t+MINUTE,equity:eq,open:active.length});
 }
 return {policy,finalEquity:balance,maxDrawdown:maxDD,closed,skipped,curve,frozen};
}
