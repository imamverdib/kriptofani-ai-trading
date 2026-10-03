import {dbRun,dbGet} from '../../src/lib/db';
async function main(){
 if(process.argv[2]==='seed'){
  await dbRun("INSERT INTO users(id,username,password_hash,is_active) VALUES (1,'legacy-fixture','fixture',0)");
  await dbRun('INSERT INTO risk_configs(user_id,min_confidence,max_risk_pct) VALUES (1,91,3)');
  await dbRun("INSERT INTO futures_positions(user_id,symbol,side,entry_price,quantity,remaining_qty,stop_loss_price,take_profit_1,take_profit_2,take_profit_3,status) VALUES (1,'BTCUSDT','LONG',100,1,1,99,102,103,104,'OPEN')");
 }else{
  const {initTradingStore}=await import('../../src/lib/trading-store');await initTradingStore();await initTradingStore();
  const config=await dbGet('SELECT min_confidence,max_risk_pct,risk_per_trade_pct FROM risk_configs WHERE user_id=1');const position=await dbGet('SELECT status,remaining_qty FROM futures_positions WHERE user_id=1');console.log(JSON.stringify({config,position}));
 }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
