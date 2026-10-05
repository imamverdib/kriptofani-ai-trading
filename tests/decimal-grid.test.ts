import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grid,sizePosition} from '../src/lib/trading-math';
test('small capital sizes with long decimal expansions round down instead of throwing',()=>{
 const quantity=20/123456.78;
 assert.equal(grid(quantity,'0.001'),0);
 assert.equal(grid(quantity,'0.00001'),0.00016);
 assert.equal(grid(quantity,'0.001','ceil'),0.001);
 assert.equal(sizePosition({equity:100,available:100,entry:3456.78,stop:3400,leverage:2,riskPct:0.5,allocationPct:10,feeRate:0.0005,slippage:0.005,step:'0.001'}),0.005);
});
test('decimal grid handles scientific notation and rounding boundaries without binary multiplication drift',()=>{
 assert.equal(grid(1.2345678901234567e-7,'1e-8'),1.2e-7);
 assert.equal(grid(1.2345678901234567e-7,'1e-8','ceil'),1.3e-7);
 assert.equal(grid(1.25,'0.25'),1.25);
 assert.equal(grid(1.2499999999999998,'0.25'),1);
 assert.equal(grid(0.375,'0.25','round'),0.5);
 assert.equal(grid(1e21,'0.001'),1e21);
 assert.equal(grid(Number.MIN_VALUE,Number.MIN_VALUE),Number.MIN_VALUE);
});
