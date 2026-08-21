import { NextResponse } from 'next/server';
import { dbAll, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram';

export async function GET(req: Request) {
  try {
    // In production, you would check for an authorization header here 
    // to ensure only your cron job service can hit this endpoint.
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Fetch users who are active and have a telegram chat id and an expiration date
    const users: any[] = await dbAll(`
      SELECT id, username, telegram_chat_id, subscription_expires_at, last_reminder_sent_date 
      FROM users 
      WHERE subscription_status = 'active' 
        AND telegram_chat_id IS NOT NULL 
        AND subscription_expires_at IS NOT NULL
    `);

    let sentCount = 0;

    for (const user of users) {
      if (user.last_reminder_sent_date === todayStr) {
        continue; // Already sent a reminder today
      }

      const expiresAt = new Date(user.subscription_expires_at);
      const today = new Date();
      
      // Calculate diff in days
      const diffTime = expiresAt.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 3 || diffDays === 1) {
        const msg = `⚠️ *Abunəlik Xatırlatması* ⚠️\n\nHörmətli @${user.username}, KriptoFani sistemindəki abunəliyinizin bitməsinə *${diffDays} gün* qalıb.\nSistemin fəaliyyətinin kəsilməməsi üçün zəhmət olmasa Panelə daxil olaraq ödənişinizi yeniləyin.`;
        
        try {
          await sendMessageToUser(user.id, user.telegram_chat_id, msg);
          // Mark as sent today
          await dbRun("UPDATE users SET last_reminder_sent_date = ? WHERE id = ?", [todayStr, user.id]);
          sentCount++;
        } catch (e) {
          console.error(`Failed to send reminder to ${user.username}:`, e);
        }
      } else if (diffDays <= 0) {
        // Auto-expire user if their time has passed and cron runs
        await dbRun("UPDATE users SET subscription_status = 'expired' WHERE id = ?", [user.id]);
        const msg = `❌ *Abunəliyiniz Bitdi* ❌\n\nHörmətli @${user.username}, KriptoFani abunəlik müddətiniz başa çatdığı üçün fəaliyyətiniz müvəqqəti dayandırıldı. Zəhmət olmasa ödənişinizi yeniləyin.`;
        await sendMessageToUser(user.id, user.telegram_chat_id, msg).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, reminders_sent: sentCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
