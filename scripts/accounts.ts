import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){
 const [action,username,...flags]=process.argv.slice(2);
 const {read}=await import('../src/lib/trading-store');
 if(action==='list'){console.log(JSON.stringify(await read(sql=>sql.all('SELECT id,username,role,is_active,subscription_status FROM users ORDER BY id')),null,2));return}
 if(action==='check'){
  const {tradingUserIds}=await import('../src/lib/deployment-policy');const ids=tradingUserIds();
  const checks=[];for(const id of ids){const user=await read(sql=>sql.get<{username:string;is_active:number;subscription_status:string}>('SELECT username,is_active,subscription_status FROM users WHERE id=?',[id]));const keys=await read(sql=>sql.all<{market:string;uid:string}>('SELECT market,uid FROM account_keys WHERE user_id=?',[id]));checks.push({id,username:user?.username||null,paused:user?.is_active===0,subscriptionActive:user?.subscription_status==='active',verifiedMarkets:keys.map(k=>k.market),sameExchangeIdentity:new Set(keys.map(k=>k.uid)).size===1})}
  console.log(JSON.stringify({admittedIds:ids,exactlyTwo:ids.length===2,checks,newEntriesEnabled:process.env.TRADING_ENABLED==='true',dedicatedAccountConfirmed:process.env.TRADING_ACCOUNT_IS_DEDICATED==='true',jwtConfigured:(process.env.JWT_SECRET?.length||0)>=32,encryptionConfigured:!!process.env.ENCRYPTION_KEY,liveExchangeTestPerformed:false},null,2));return;
 }
 if(action!=='create'||!username||!flags.includes('--password-stdin'))throw new Error('Usage: npm run accounts -- list | check | create USERNAME --password-stdin [--admin]');
 if(process.stdin.isTTY)throw new Error('Pipe the password through stdin; do not pass it as an argument');
 let password='';for await(const chunk of process.stdin){password+=chunk.toString();if(password.length>256)throw new Error('Password input too long')}
 const {createPrivateUser}=await import('../src/lib/private-accounts');const id=await createPrivateUser(username,password.replace(/\r?\n$/,''),flags.includes('--admin'));console.log(`Created paused user ${username}, ID ${id}. Add the intended two IDs to TRADING_USER_IDS before key setup. No exchange request was made.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Account setup failed');process.exitCode=1});
