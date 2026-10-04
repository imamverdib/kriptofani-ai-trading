import type {AppUser} from '@/lib/app-types';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { secretMatches } from '@/lib/service-auth';
import { read,transaction } from '@/lib/trading-store';
import { processUserCommand } from '@/lib/telegram';
export async function POST(req:Request){
 if(!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'),process.env.TELEGRAM_WEBHOOK_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const body=await req.json();if(!Number.isSafeInteger(body.update_id))return NextResponse.json({error:'Invalid update'},{status:400});
  if(body.callback_query){
   const cb=body.callback_query;
   const admins=(process.env.ADMIN_TELEGRAM_USER_IDS||'').split(',').map(s=>s.trim());
   if(!admins.includes(String(cb.from?.id)))return NextResponse.json({error:'Forbidden'},{status:403});
   const match=/^(approve|reject)_payment_(\d+)$/.exec(String(cb.data));if(!match)return NextResponse.json({ok:true});
   await transaction(async sql=>{
    const dedupe=await sql.run('INSERT OR IGNORE INTO telegram_updates VALUES (?,?)',[body.update_id,Date.now()]);if(!dedupe.changes)return;
    const p=await sql.get("SELECT * FROM payments WHERE id=? AND status='pending'",[Number(match[2])]);if(!p)return;
    const approved=match[1]==='approve';await sql.run('UPDATE payments SET status=? WHERE id=?',[approved?'approved':'rejected',p.id]);
    if(approved)await sql.run("UPDATE users SET subscription_status='active',subscription_expires_at=datetime('now','+30 days') WHERE id=?",[p.user_id]);
    const u=await sql.get('SELECT telegram_chat_id FROM users WHERE id=?',[p.user_id]);
    await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[p.user_id,u?.telegram_chat_id,approved?'Ödəniş təsdiqləndi. Ticarət aktivliyi ayrıca idarə olunur.':'Ödəniş təsdiqlənmədi.']);
   });return NextResponse.json({ok:true});
  }
  const message=body.message;
  if(message?.chat?.type!=='private'||!message.from?.id||String(message.chat.id)!==String(message.from.id))return NextResponse.json({ok:true});
  const text=String(message.text||'').trim(),telegramId=String(message.from.id);
  const token=/^\/start ([a-f0-9]{48})$/.exec(text);
  if(token){
   let paired=false;
   await transaction(async sql=>{
    const link=await sql.get('SELECT * FROM telegram_links WHERE hash=? AND expires_at>?',[createHash('sha256').update(token[1]).digest('hex'),Date.now()]);if(!link)return;
    const existing=await sql.get('SELECT user_id FROM telegram_identities WHERE telegram_id=?',[telegramId]);if(existing&&existing.user_id!==link.user_id)throw new Error('Telegram identity already linked');
    await sql.run('DELETE FROM telegram_identities WHERE user_id=?',[link.user_id]);
    await sql.run('INSERT INTO telegram_identities VALUES (?,?)',[telegramId,link.user_id]);
    await sql.run('UPDATE users SET telegram_chat_id=?,telegram_username=? WHERE id=?',[telegramId,message.from.username||null,link.user_id]);
    await sql.run('DELETE FROM telegram_links WHERE user_id=?',[link.user_id]);
    await sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[link.user_id,telegramId,'Telegram hesabınız təhlükəsiz bağlandı.']);
    paired=true;
   });
   if(paired&&process.env.TELEGRAM_BOT_TOKEN){
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({chat_id:telegramId,text:'✅ Telegram hesabınız kripto ticarət panelinizlə uğurla əlaqələndirildi! Ticarət siqnalları və bildirişlər bura göndəriləcək.'})
    }).catch(()=>{});
   }
   return NextResponse.json({ok:true});
  }
  const identity=await read(sql=>sql.get<AppUser>('SELECT u.* FROM telegram_identities t JOIN users u ON u.id=t.user_id WHERE t.telegram_id=?',[telegramId]));
  if(!identity){
   if(process.env.TELEGRAM_BOT_TOKEN&&(text.startsWith('/start')||text.toLowerCase()==='salam'||text.toLowerCase()==='help')){
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({chat_id:telegramId,text:'Salam! Bu botu veb tətbiqinizlə əlaqələndirmək üçün zəhmət olmasa veb panelə (Tənzimləmələr / Dashboard) daxil olub "Telegram-da Aktiv Et" düyməsinə klikləyin.'})
    }).catch(()=>{});
   }
   return NextResponse.json({ok:true});
  }
  const claimed=await transaction(sql=>sql.run('INSERT OR IGNORE INTO telegram_updates VALUES (?,?)',[body.update_id,Date.now()]));
  if(claimed.changes&&text)await processUserCommand(identity,telegramId,text);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Webhook processing failed'},{status:500})}
}
