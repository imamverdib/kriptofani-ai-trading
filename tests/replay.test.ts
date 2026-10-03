import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay} from '../src/lib/replay';
const signal={availableAt:0,symbol:'BTCUSDT',side:'LONG' as const,stop:99,targets:[102,103,104] as [number,number,number],quantity:1,confidence:90};
const costs={taker:0.001,slippage:0,funding:[],monitorIntervalMs:30000};
test('replay cannot enter on the signal bar and charges both fees',()=>{
 const r=replay(signal,[{time:0,open:1,high:1,low:1,close:1},{time:1,open:100,high:105,low:100,close:104}],costs);
 assert.equal(r.entry,100);assert.equal(r.netRealized,3.796);assert.equal(r.remaining,0);
});
test('ambiguous OHLC SL/TP uses stop first and gaps execute worse than trigger',()=>{
 const r=replay(signal,[{time:1,open:100,high:105,low:98,close:104}],costs);assert.equal(r.fills[0].reason,'STOP_OR_GAP');assert.equal(r.fills[0].price,99);
 const gap=replay(signal,[{time:1,open:100,high:100,low:100,close:100},{time:30001,open:95,high:98,low:93,close:94}],costs);assert.equal(gap.fills[0].price,95);
});
test('out-of-order data is rejected',()=>{assert.throws(()=>replay(signal,[{time:2,open:100,high:100,low:100,close:100},{time:1,open:100,high:100,low:100,close:100}],costs))});
