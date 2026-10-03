import {NextResponse} from 'next/server';
import bcrypt from 'bcryptjs';
import {transaction} from '@/lib/trading-store';
import {secretMatches} from '@/lib/service-auth';
export async function POST(req:Request){
 try{const {username,password,invitation}=await req.json();if(!secretMatches(invitation,process.env.REGISTRATION_SECRET))return NextResponse.json({error:'Private deployment: registration requires an invitation'},{status:403});
 if(typeof username!=='string'||!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)return NextResponse.json({error:'Valid username and a 12–128 character password required'},{status:400});
 const hash=await bcrypt.hash(password,12);
 await transaction(async sql=>{const count=await sql.get<{n:number}>('SELECT COUNT(*) n FROM users');if((count?.n||0)>=2)throw new Error('Two-user capacity reached');const exists=await sql.get('SELECT id FROM users WHERE username=?',[username]);if(exists)throw new Error('Username already exists');const user=await sql.run("INSERT INTO users(username,password_hash,is_active,subscription_status) VALUES (?,?,0,'unpaid')",[username,hash]);await sql.run('INSERT INTO risk_configs(user_id) VALUES (?)',[user.lastID]);await sql.run('INSERT INTO futures_risk_configs(user_id,is_futures_active) VALUES (?,0)',[user.lastID])});
 return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Registration failed'},{status:400})}
}
