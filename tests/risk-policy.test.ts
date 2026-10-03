import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equityRisk} from '../src/lib/risk-policy';
import {validatePlan} from '../src/lib/trading-math';
import {computeQuantPlan} from '../src/lib/quant-math';
test('deposit cannot conceal a 6% trading drawdown',()=>{
 const previous=equityRisk(undefined,1000,0,'2026-10-03');const current=equityRisk(previous,1440,500,'2026-10-03');
 assert.equal(current.adjusted,940);assert.equal(current.drawdown,0.06);assert(current.reason);
});
test('withdrawal is not trading loss',()=>{
 const previous=equityRisk(undefined,1000,0,'2026-10-03');const current=equityRisk(previous,800,-200,'2026-10-03');assert.equal(current.drawdown,0);assert.equal(current.dailyLoss,0);
});
test('stop, target and NaN validations cannot pass by coercion',()=>{
 assert.throws(()=>computeQuantPlan('LONG',0,[]));assert.throws(()=>validatePlan('SHORT',100,101,[98,99,97]));assert.throws(()=>validatePlan('LONG',100,99,[101.8,103,104]));assert.throws(()=>validatePlan('LONG',NaN,99,[102,103,104]));
});
test('volatile ATR rejects setup rather than putting stop inside structure',()=>{assert.throws(()=>computeQuantPlan('LONG',100,Array.from({length:20},()=>({high:105,low:95,close:100}))));});
