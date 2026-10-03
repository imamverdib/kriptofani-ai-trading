import {transaction} from './trading-store';
export async function setBotActive(userId:number,active:boolean){
 if(typeof active!=='boolean')throw new Error('active must be boolean');
 return transaction(async sql=>{const user=await sql.get<{subscription_status:string}>('SELECT subscription_status FROM users WHERE id=?',[userId]);if(!user)throw new Error('Unknown user');if(active&&user.subscription_status!=='active')throw new Error('Active subscription required');await sql.run('UPDATE users SET is_active=? WHERE id=?',[Number(active),userId]);return Number(active)});
}
