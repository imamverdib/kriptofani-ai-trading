import { NextResponse } from 'next/server';
import { randomBytes,createHash } from 'node:crypto';
import { getSession } from '@/lib/auth';
import { transaction } from '@/lib/trading-store';
export async function POST(){
 const session=await getSession();if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 const token=randomBytes(24).toString('hex');
 await transaction(async sql=>{await sql.run('DELETE FROM telegram_links WHERE user_id=? OR expires_at<?',[session.id,Date.now()]);await sql.run('INSERT INTO telegram_links VALUES (?,?,?)',[createHash('sha256').update(token).digest('hex'),session.id,Date.now()+600000])});
 return NextResponse.json({success:true,command:`/start ${token}`,expiresIn:600});
}
