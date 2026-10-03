import type {OutboxRow} from './trading-rows';
import { read, transaction, withOwner } from './trading-store';
export async function deliverNotifications(send:typeof fetch=fetch){
 return withOwner('notification-worker',async()=>{
  const rows=await read(sql=>sql.all<OutboxRow>('SELECT * FROM notification_outbox WHERE delivered_at IS NULL AND next_attempt<=? ORDER BY id LIMIT 20',[Date.now()]));
  for(const row of rows){
   try{
    if(row.chat_id&&row.chat_id!=='WEB'){
     if(!process.env.TELEGRAM_BOT_TOKEN)throw new Error('Telegram token unavailable');
     const response=await send(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:row.chat_id,text:row.text}),signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw new Error(`Telegram HTTP ${response.status}`);
     const data=await response.json();if(!data.ok)throw new Error('Telegram message rejected');
    }
    await transaction(async sql=>{
     await sql.run('INSERT INTO bot_messages(user_id,telegram_chat_id,sender,text) VALUES (?,?,?,?)',[row.user_id,row.chat_id,'BOT',row.text]);
     await sql.run('UPDATE notification_outbox SET delivered_at=?,last_error=NULL WHERE id=?',[Date.now(),row.id]);
    });
   }catch(error){
    await transaction(sql=>sql.run('UPDATE notification_outbox SET attempts=attempts+1,next_attempt=?,last_error=? WHERE id=?',[Date.now()+Math.min(3600000,10000*2**Math.min(row.attempts,9)),error instanceof Error?error.message.slice(0,200):'Delivery failed',row.id]));
   }
  }
 });
}
