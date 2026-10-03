import {readFileSync,writeFileSync} from 'node:fs';
import {accountOwner,execute,prepare,reserve,getPosition,monitorPosition,type Gateway,type Position,type Intent} from '../../src/lib/execution';
import {withOwner,transaction,read} from '../../src/lib/trading-store';
import type {ExchangeOrder,ExchangeFill} from '../../src/lib/exchange-types';
process.env.TRADING_USER_IDS='1';
const mode=process.argv[2],file=process.env.FIXTURE_EXCHANGE_PATH!;
interface State {actual:number;orders:Record<string,ExchangeOrder>;trades:Record<string,ExchangeFill[]>;submissions:string[]}
const state:State=mode==='crash'?{actual:0,orders:{},trades:{},submissions:[]}:JSON.parse(readFileSync(file,'utf8'));
const save=()=>writeFileSync(file,JSON.stringify(state));
const g:Gateway={
 async submit(p:Position,i:Intent){state.submissions.push(i.purpose);const result:ExchangeOrder=i.kind==='STOP'?{algoId:i.id,algoStatus:'NEW',quantity:i.quantity,triggerPrice:i.price}:{orderId:i.id,status:'FILLED',executedQty:i.quantity};state.orders[i.id]=result;
 if(i.kind==='MARKET'){state.actual=i.quantity;state.trades[i.id]=[{id:i.id,orderId:i.id,qty:i.quantity,price:100,commission:0,commissionAsset:'USDT',side:'BUY',realizedPnl:0,time:Date.now()}]}
 save();if(mode==='crash'&&i.purpose==='ENTRY')process.kill(process.pid,'SIGKILL');return result;},
 async query(_p,i){const r=state.orders[i.id];if(!r)throw new Error('Unknown exchange order');return r},
 async fills(_p,id){return state.trades[id]||[]},async exposure(){return state.actual},async step(){return '0.1'},async cancel(){throw new Error('Unexpected cancellation')}
};
async function main(){
 if(mode==='crash'){
  await transaction(async sql=>{await sql.run("INSERT INTO users(id,username,password_hash,is_active,subscription_status) VALUES (1,'fixture','fixture',1,'active')");await sql.run('INSERT INTO futures_risk_configs(user_id,is_futures_active) VALUES (1,1)');await sql.run("INSERT INTO exchange_accounts VALUES ('fixture-uid',1)");await sql.run("INSERT INTO account_keys VALUES (1,'futures','fixture-uid','fingerprint')");await sql.run("INSERT INTO system_settings VALUES ('worker_heartbeat',?)",[String(Date.now())])});
  await withOwner('worker-singleton',()=>accountOwner(1,async()=>{const p=await reserve({user_id:1,market:'futures',symbol:'BTCUSDT',side:'LONG',stop_price:99,tp1:102,tp2:103,tp3:104,leverage:2,risk_reserved:10,notional_reserved:1000,reason:'crash fixture'},3,10000);await execute(p,await prepare(p,'ENTRY','MARKET',10),g)}));
 }else{
  const result=await withOwner('worker-singleton',()=>accountOwner(1,async()=>{const row=await read(sql=>sql.get<{id:string}>('SELECT id FROM managed_positions WHERE user_id=1'));if(!row)throw new Error('Missing durable reservation');await monitorPosition(await getPosition(row.id,1),g,100)}));
  // getPosition checks below, since callback returns void even on successful ownership.
  void result;const p=await read(sql=>sql.get<{state:string;remaining_qty:number}>('SELECT state,remaining_qty FROM managed_positions WHERE user_id=1'));console.log(JSON.stringify(p));
 }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
