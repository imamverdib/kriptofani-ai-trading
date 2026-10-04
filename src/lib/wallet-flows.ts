import {exchange,type Credentials} from './exchange-client';
import {positive} from './trading-math';
export interface Transfer {asset:string;amount:string;type:string;status:string;tranId:string|number;timestamp:number}
// All documented universal-transfer edges touching a wallet included in bot equity.
const edges:Record<string,[string,string]>={MAIN_UMFUTURE:['MAIN','UMFUTURE'],UMFUTURE_MAIN:['UMFUTURE','MAIN'],MAIN_CMFUTURE:['MAIN','CMFUTURE'],CMFUTURE_MAIN:['CMFUTURE','MAIN'],MAIN_MARGIN:['MAIN','MARGIN'],MARGIN_MAIN:['MARGIN','MAIN'],UMFUTURE_MARGIN:['UMFUTURE','MARGIN'],MARGIN_UMFUTURE:['MARGIN','UMFUTURE'],MAIN_FUNDING:['MAIN','FUNDING'],FUNDING_MAIN:['FUNDING','MAIN'],UMFUTURE_FUNDING:['UMFUTURE','FUNDING'],FUNDING_UMFUTURE:['FUNDING','UMFUTURE'],MAIN_OPTION:['MAIN','OPTION'],OPTION_MAIN:['OPTION','MAIN'],UMFUTURE_OPTION:['UMFUTURE','OPTION'],OPTION_UMFUTURE:['OPTION','UMFUTURE'],MAIN_PORTFOLIO_MARGIN:['MAIN','PORTFOLIO_MARGIN'],PORTFOLIO_MARGIN_MAIN:['PORTFOLIO_MARGIN','MAIN']};
export function transferFlow(row:Transfer,includeFutures:boolean):number {
 const edge=edges[row.type];if(!edge)throw new Error('Unknown wallet transfer type');
 if(row.status!=='CONFIRMED')throw new Error('Unsettled wallet transfer requires reconciliation');
 if(!Number.isFinite(row.timestamp)||row.tranId===undefined)throw new Error('Invalid transfer identity/time');
 const included=new Set(includeFutures?['MAIN','UMFUTURE']:['MAIN']);
 const direction=Number(included.has(edge[1]))-Number(included.has(edge[0]));
 const quantity=positive(row.amount,'transfer amount');
 if(!direction)return 0;
 if(row.asset!=='USDT')throw new Error('Non-USDT wallet transfer requires historical cashflow valuation');
 return direction*quantity;
}
export async function walletTransfers(c:Credentials,startTime:number,endTime:number,includeFutures:boolean){
 const result:{ref:string;time:number;amount:number}[]=[];
 for(const [type,edge] of Object.entries(edges)){
  if(!includeFutures&&!edge.includes('MAIN'))continue;
  for(let current=1;current<=1000;current++){
   const page=await exchange<{rows?:Transfer[];total:number}>('spot','/sapi/v1/asset/transfer',{type,startTime,endTime,current,size:100},c,'GET',{priority:true,weight:1});
   const rows=Array.isArray(page.rows)?page.rows:[];
   if(!Number.isInteger(page.total)||page.total<0)throw new Error('Invalid transfer history response');
   if(rows.length!==Math.min(100,Math.max(0,page.total-(current-1)*100)))throw new Error('Transfer history page is incomplete');
   for(const row of rows){
    if(row.type!==type||row.timestamp<startTime||row.timestamp>endTime)throw new Error('Transfer history range/type mismatch');
    const amount=transferFlow(row,includeFutures);if(amount!==0)result.push({ref:`${type}:${row.tranId}`,time:row.timestamp,amount});
   }
   if(current*100>=page.total)break;
   if(rows.length<100||current===1000)throw new Error('Transfer history pagination incomplete');
  }
 }
 return result;
}
