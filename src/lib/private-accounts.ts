import bcrypt from 'bcryptjs';
import {transaction} from './trading-store';
export async function createPrivateUser(username:string,password:string,admin=false){
 if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||password.length<12||password.length>128)throw new Error('Username 3–40 characters; password 12–128 characters required');
 const hash=await bcrypt.hash(password,12);
 return transaction(async sql=>{const count=await sql.get<{n:number}>('SELECT COUNT(*) n FROM users');if((count?.n||0)>=2)throw new Error('Two-user capacity reached');if(admin&&(count?.n||0)>0)throw new Error('Only the initial account may be bootstrapped as admin');
 const user=await sql.run("INSERT INTO users(username,password_hash,role,is_active,subscription_status) VALUES (?,?,?,0,'active')",[username,hash,admin?'admin':'user']);await sql.run('INSERT INTO risk_configs(user_id) VALUES (?)',[user.lastID]);await sql.run('INSERT INTO futures_risk_configs(user_id,is_futures_active) VALUES (?,0)',[user.lastID]);return user.lastID;
 });
}
