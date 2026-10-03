import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transferFlow,type Transfer} from '../src/lib/wallet-flows';
const transfer:Transfer={asset:'USDT',amount:'100',type:'MAIN_UMFUTURE',status:'CONFIRMED',tranId:1,timestamp:1000};
test('registered spot/futures transfer is neither profit nor an external deposit',()=>{assert.equal(transferFlow(transfer,true),0);assert.equal(transferFlow({...transfer,type:'UMFUTURE_MAIN'},true),0)});
test('spot-only account tracks futures transfer as capital leaving its equity perimeter',()=>{assert.equal(transferFlow(transfer,false),-100);assert.equal(transferFlow({...transfer,type:'UMFUTURE_MAIN'},false),100)});
test('funding-wallet transfer is cashflow with the correct direction',()=>{assert.equal(transferFlow({...transfer,type:'FUNDING_MAIN'},true),100);assert.equal(transferFlow({...transfer,type:'UMFUTURE_FUNDING'},true),-100)});
test('pending, unknown, malformed and unvalued transfers cannot become credited cashflow',()=>{for(const patch of [{status:'PENDING'},{type:'UNKNOWN'},{amount:'NaN'},{asset:'BTC',type:'FUNDING_MAIN'}])assert.throws(()=>transferFlow({...transfer,...patch},true))});
test('wallet history paginates and rejects a truncated response instead of crediting partial history',async()=>{
 const {walletTransfers}=await import('../src/lib/wallet-flows');const original=globalThis.fetch;const pages:number[]=[];let truncate=false;
 globalThis.fetch=async(input)=>{const url=new URL(String(input));if(url.pathname.endsWith('/time'))return Response.json({serverTime:Date.now()});assert.equal(url.pathname,'/sapi/v1/asset/transfer');const type=url.searchParams.get('type');if(type!=='FUNDING_MAIN')return Response.json({rows:[],total:0});const page=Number(url.searchParams.get('current'));pages.push(page);return Response.json({total:101,rows:Array.from({length:truncate?1:page===1?100:1},(_,i)=>({...transfer,type,tranId:(page-1)*100+i}))})};
 try{const rows=await walletTransfers({key:'fixture',secret:'fixture'},0,2000,false);assert.equal(rows.length,101);assert.deepEqual(pages,[1,2]);assert.equal(rows.reduce((s,r)=>s+r.amount,0),10100);truncate=true;await assert.rejects(walletTransfers({key:'fixture',secret:'fixture'},0,2000,false),/incomplete/)}finally{globalThis.fetch=original}
});
