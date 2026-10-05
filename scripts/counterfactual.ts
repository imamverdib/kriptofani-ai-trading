import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {simulate,portfolio,MINUTE,type Decision,type Config,type Dataset,type Bar,type Policy} from '../src/lib/counterfactual';
type RawBar=(number|string)[];
type MarketExport={cutoff:number;source:string;capturedAt:number;exchangeInfo:{symbols:{symbol:string;filters:{filterType:string;stepSize:string;minQty:string;maxQty:string;tickSize:string;notional:string;minNotional:string}[]}[]};symbols:Record<string,{trade:RawBar[];mark:RawBar[];funding:{fundingTime:number;fundingRate:string;markPrice:string}[]}>};
const bar=(r:RawBar):Bar=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])});
const mean=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const round=(n:number|null)=>n===null?null:Number(n.toFixed(6));
async function main(){
 const [input,marketInput,output]=process.argv.slice(2);if(!input||!marketInput||!output)throw Error('Usage: tsx scripts/counterfactual.ts decisions.json market.json output-directory');
 const decisionText=await readFile(input,'utf8'),marketText=await readFile(marketInput,'utf8');
 const exportData=JSON.parse(decisionText) as {capturedAt:number;config:{max_risk_pct:number;risk_per_trade_pct:number;leverage:number;max_open_positions:number;min_confidence:number};decisions:Decision[]};
 const raw=JSON.parse(marketText) as MarketExport,cutoff=Math.floor((raw.cutoff+1)/MINUTE)*MINUTE;
 const decisions=exportData.decisions.filter(d=>d.market==='futures').sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 const datasets=new Map<string,Dataset>();const coverage=[];
 for(const [symbol,r] of Object.entries(raw.symbols)){
  const info=raw.exchangeInfo.symbols.find(s=>s.symbol===symbol);if(!info)throw Error('No current exchange rules: '+symbol);
  const lot=info.filters.find(f=>f.filterType==='LOT_SIZE')!,marketLot=info.filters.find(f=>f.filterType==='MARKET_LOT_SIZE')||lot,tick=info.filters.find(f=>f.filterType==='PRICE_FILTER')!,notional=info.filters.find(f=>['MIN_NOTIONAL','NOTIONAL'].includes(f.filterType))!;
  const marks=new Map(r.mark.map(v=>[Number(v[0]),bar(v)])),candles=new Map();
  let previous=-Infinity;for(const row of r.trade){const t=bar(row),m=marks.get(t.time);if(t.time<=previous)throw Error('Unsorted/duplicate data '+symbol);previous=t.time;for(const b of [t,...(m?[m]:[])])if(![b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error('Invalid OHLC '+symbol);if(m)candles.set(t.time,{trade:t,mark:m})}
  const funding=new Map();for(const f of r.funding){const time=Number(f.fundingTime),rate=Number(f.fundingRate),mark=Number(f.markPrice);if(!Number.isFinite(rate)||!Number.isFinite(mark)||mark<=0)throw Error('Invalid funding mark '+symbol);const key=Math.floor(time/MINUTE)*MINUTE;funding.set(key,[...(funding.get(key)||[]),{time,rate,mark}])}
  datasets.set(symbol,{candles,funding,rules:{step:lot.stepSize,minQty:Number(lot.minQty),maxQty:Number(lot.maxQty),marketStep:marketLot.stepSize,marketMin:Number(marketLot.minQty),marketMax:Number(marketLot.maxQty),tick:tick.tickSize,minNotional:Number(notional.notional||notional.minNotional)}});
  coverage.push({symbol,tradeBars:r.trade.length,markBars:r.mark.length,paired:candles.size,funding:r.funding.length});
 }
 const cfg:Config={allocation:exportData.config.max_risk_pct,risk:exportData.config.risk_per_trade_pct,leverage:exportData.config.leverage,maxPositions:exportData.config.max_open_positions,confidence:exportData.config.min_confidence,fee:0.0005,slippage:0.0005};
 const rows=[];
 for(const slip of [0,0.0005,0.001])for(const horizon of [15,60,240])for(const d of decisions)for(const side of ['LONG','SHORT'] as const){
  const r=simulate(d,side,datasets.get(d.symbol)!,{...cfg,slippage:slip},horizon,cutoff);const p=r.status==='SIMULATED'?r.position:null;
  rows.push({id:d.id,time:d.time,timeBaku:new Date(d.time+4*3600000).toISOString().replace('Z','+04:00'),symbol:d.symbol,actual:d.decision.action,confidence:d.decision.confidence,trend:d.snapshot.trend,rsi:d.snapshot.rsi,side,horizon,slippage:slip,status:r.status,rejection:r.status==='REJECTED'?r.reason:'',entry:p?.entry??null,quantity:p?.qty??null,stop:p?.stop??null,tp1:p?.targets[0]??null,tp2:p?.targets[1]??null,tp3:p?.targets[2]??null,net:p?round(p.net):null,fees:p?round(p.fees):null,funding:p?round(p.funding):null,ambiguities:p?.ambiguities??null,exit:p?.endReason??null});
 }
 const stats=[];
 for(const slip of [0,0.0005,0.001])for(const horizon of [15,60,240])for(const group of ['LONG','SHORT','TREND','TREND_RSI']){
  const groupRows=rows.filter(r=>r.slippage===slip&&r.horizon===horizon&&(group==='LONG'||group==='SHORT'?r.side===group:r.side===r.trend&&(group!=='TREND_RSI'||!(r.side==='LONG'&&r.rsi>65||r.side==='SHORT'&&r.rsi<35))));const filled=groupRows.filter(r=>r.net!==null),nets=filled.map(r=>r.net!);const rejected:Record<string,number>={};for(const r of groupRows)if(r.status!=='SIMULATED'){const key=r.rejection||r.status;rejected[key]=(rejected[key]||0)+1}
  stats.push({group,slippage:slip,horizon,total:groupRows.length,simulated:filled.length,winners:nets.filter(n=>n>0).length,losers:nets.filter(n=>n<0).length,flat:nets.filter(n=>n===0).length,meanNet:round(mean(nets)),medianNet:nets.length?[...nets].sort((a,b)=>a-b)[Math.floor(nets.length/2)]:null,ambiguities:filled.reduce((s,r)=>s+(r.ambiguities||0),0),rejected});
 }
 const portfolios=[];for(const slip of [0,0.0005,0.001])for(const policy of ['actual','trend','trend_rsi','long','short'] as Policy[]){const p=portfolio(decisions,datasets,{...cfg,slippage:slip},policy,240,cutoff);portfolios.push({...p,slippage:slip})}
 await mkdir(output,{recursive:true});const headers=Object.keys(rows[0]);const csv=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
 await writeFile(join(output,'decisions.csv'),headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csv(r[h as keyof typeof r])).join(',')).join('\n')+'\n');
 const summary={capturedAt:exportData.capturedAt,cutoff,first:decisions[0].time,last:decisions.at(-1)!.time,decisions:decisions.length,symbols:datasets.size,config:cfg,hashes:{decisions:createHash('sha256').update(decisionText).digest('hex'),market:createHash('sha256').update(marketText).digest('hex')},coverage,stats,portfolios:portfolios.map(p=>({...p,closed:p.closed.map(t=>({id:t.id,symbol:t.symbol,side:t.side,start:t.start,end:t.fills.at(-1)?.time,net:round(t.net),fees:round(t.fees),funding:round(t.funding),reason:t.endReason})),curve:p.curve}))};
 await writeFile(join(output,'results.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({decisions:summary.decisions,coverage,stats:stats.filter(s=>s.slippage===0.0005),portfolios:portfolios.map(p=>({policy:p.policy,slippage:p.slippage,final:p.finalEquity,drawdown:p.maxDrawdown,trades:p.closed.length,skipped:p.skipped,frozen:p.frozen}))},null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Replay failed');process.exitCode=1});
