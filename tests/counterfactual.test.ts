import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate,portfolio,entryTime,choose,type Decision,type Dataset,type Config} from '../src/lib/counterfactual';
const cfg:Config={allocation:20,risk:0.5,leverage:2,maxPositions:1,confidence:75,fee:0.0005,slippage:0.0005};
const d:Decision={id:'a',symbol:'ABCUSDT',market:'futures',time:59000,decision:{action:'WAIT',confidence:0},snapshot:{asOf:58000,trend:'LONG',rsi:50,bars:[{openTime:-60000,closeTime:0,high:100.1,low:99.9,close:100}]}};
function data():Dataset{return {rules:{step:'0.01',minQty:0.01,maxQty:100,marketStep:'0.01',marketMin:0.01,marketMax:100,tick:'0.01',minNotional:5},funding:new Map(),candles:new Map([60000,120000,180000].map(time=>[time,{trade:{time,open:100,high:100.1,low:99.9,close:100},mark:{time,open:100,high:100.1,low:99.9,close:100}}]))}}
test('counterfactual uses next minute and accounts for both fees, slippage and scheduled funding',()=>{
 const market=data();market.funding.set(60000,[{time:60000,rate:0.001,mark:100}]);
 const r=simulate(d,'LONG',market,cfg,2,240000);assert.equal(r.status,'SIMULATED');if(r.status!=='SIMULATED')return;
 assert.equal(entryTime(d),60000);assert.equal(r.position.entry,100.05);assert.equal(r.position.remaining,0);assert(r.position.net<0);assert(r.position.fees>0);assert(r.position.funding<0);assert.equal(r.position.fills.at(-1)?.time,180000);
 assert(Math.abs(r.position.net-r.position.fills.reduce((s,f)=>s+f.cash,0))<1e-10);
});
test('mark-price stop is conservative for ambiguous bar even when contract low stays above stop',()=>{
 const market=data();market.candles.get(60000)!.mark.low=99;market.candles.get(60000)!.mark.high=103;
 const r=simulate(d,'LONG',market,cfg,2,240000);assert.equal(r.status,'SIMULATED');if(r.status!=='SIMULATED')return;assert.equal(r.position.endReason,'STOP_OR_GAP');assert.equal(r.position.ambiguities,1);assert(r.position.net<0);
});
test('future information, insufficient horizon and missing bars are not silently accepted',()=>{
 const market=data();assert.equal(simulate(d,'LONG',market,cfg,4,240000).status,'CENSORED');market.candles.delete(120000);assert.equal(simulate(d,'LONG',market,cfg,2,240000).status,'DATA_GAP');
 const invalid={...d,snapshot:{...d.snapshot,bars:[{...d.snapshot.bars[0],closeTime:60000}]}};
 const r=simulate(invalid,'LONG',data(),cfg,2,240000);assert.equal(r.status,'REJECTED');if(r.status==='REJECTED')assert.equal(r.reason,'NON_POINT_IN_TIME_SNAPSHOT');
});
test('portfolio caps simultaneous exposure, preserves cash identity and keeps actual WAIT flat',()=>{
 const decisions=[d,{...d,id:'b',symbol:'XYZUSDT'}];const markets=new Map([['ABCUSDT',data()],['XYZUSDT',data()]]);
 const r=portfolio(decisions,markets,cfg,'trend',2,240000);assert.equal(r.closed.length,1);assert.equal(r.skipped.MAX_POSITIONS,1);assert(Math.abs(r.finalEquity-100-r.closed.reduce((s,p)=>s+p.net,0))<1e-9);
 const flat=portfolio(decisions,markets,cfg,'actual',2,240000);assert.equal(flat.finalEquity,100);assert.equal(flat.closed.length,0);
 assert.equal(choose({...d,snapshot:{...d.snapshot,rsi:70}},'trend_rsi',cfg),null);
});
