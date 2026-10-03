import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { transaction } from '@/lib/trading-store';
export async function POST(){
 const session=await getSession();if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 await transaction(async sql=>{await sql.run('DELETE FROM telegram_identities WHERE user_id=?',[session.id]);await sql.run('DELETE FROM telegram_links WHERE user_id=?',[session.id]);await sql.run('UPDATE users SET telegram_chat_id=NULL,telegram_username=NULL WHERE id=?',[session.id])});
 return NextResponse.json({success:true});
}
