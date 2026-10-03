import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {gateway,type Position,type Intent} from '../src/lib/execution';
import {exchange,ExchangeError,accountUid} from '../src/lib/exchange-client';
const realFetch=globalThis.fetch;after(()=>{globalThis.fetch=realFetch});
const requests:URL[]=[];
function respond(fn:(url:URL)=>Response|Promise<Response>){globalThis.fetch=(async(input:RequestInfo|URL)=>{const url=new URL(String(input));requests.push(url);if(url.pathname.endsWith('/time'))return Response.json({serverTime:Date.now()});return fn(url)}) as typeof fetch}
const p={id:'p',user_id:1,market:'futures',symbol:'BTCUSDT',side:'LONG',tp1:102} as Position;
const intent={id:'kf-test',user_id:1,position_id:'p',purpose:'EMERGENCY:0',kind:'MARKET',side:'SELL',quantity:1,price:99} as Intent;
test('emergency market order is reduce-only, identified, signed and RESULT',async()=>{
 respond(()=>Response.json({orderId:1,status:'FILLED',executedQty:'1',avgPrice:'100'}));await gateway({key:'fake',secret:'fake-secret'}).submit(p,intent);
 const q=requests.at(-1)!.searchParams;assert.equal(q.get('reduceOnly'),'true');assert.equal(q.get('newClientOrderId'),'kf-test');assert.equal(q.get('newOrderRespType'),'RESULT');assert(q.get('signature'));assert(q.get('timestamp'));
});
test('unknown 503 does not retry with a different stop or closePosition',async()=>{
 const start=requests.length;respond(()=>Response.json({msg:'Unknown error, please check your request or try again later.'},{status:503}));
 await assert.rejects(gateway({key:'fake',secret:'fake-secret'}).submit(p,{...intent,kind:'STOP',purpose:'PROTECT_INITIAL'}),e=>e instanceof ExchangeError&&e.unknown);
 const orders=requests.slice(start).filter(u=>u.pathname.includes('algoOrder'));assert.equal(orders.length,1);assert.equal(orders[0].searchParams.get('workingType'),'MARK_PRICE');assert.equal(orders[0].searchParams.get('closePosition'),'true');assert.equal(orders[0].searchParams.get('quantity'),null);assert.equal(orders[0].searchParams.get('reduceOnly'),null);
});
test('spot OCO uses current order-list API and market stop leg',async()=>{
 respond(()=>Response.json({orderListId:1,listOrderStatus:'EXECUTING'}));await gateway({key:'fake',secret:'fake-secret'}).submit({...p,market:'spot'},{...intent,kind:'OCO'});
 const u=requests.at(-1)!;assert.equal(u.pathname,'/api/v3/orderList/oco');assert.equal(u.searchParams.get('belowType'),'STOP_LOSS');assert.equal(u.searchParams.get('quantity'),'1');
});
test('account UID comes from authenticated spot account, never arbitrary user input',async()=>{
 respond(u=>{assert.equal(u.pathname,'/api/v3/account');return Response.json({uid:1234})});assert.equal(await accountUid({key:'fake',secret:'fake'}),'1234');
});
test('bad response body after POST is execution unknown',async()=>{
 respond(()=>new Response('invalid JSON'));await assert.rejects(exchange('futures','/fapi/v1/order',{},{key:'fake',secret:'fake'},'POST'),e=>e instanceof ExchangeError&&e.unknown);
});
