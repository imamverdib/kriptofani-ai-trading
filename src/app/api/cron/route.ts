import { NextResponse } from 'next/server';
import { runTradingEngine } from '@/lib/engine';
import { dbAll, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram';

async function checkSubscriptions() {
  console.log(`[${new Date().toISOString()}] Abunəliklər yoxlanılır...`);
  
  const users = await dbAll<any>('SELECT * FROM users WHERE subscription_status = "active"');
  const now = new Date();

  for (const user of users) {
    if (!user.subscription_expires_at) continue;
    
    const expiresAt = new Date(user.subscription_expires_at);
    const msLeft = expiresAt.getTime() - now.getTime();
    const daysLeft = msLeft / (1000 * 60 * 60 * 24);

    if (daysLeft <= 0) {
      await dbRun("UPDATE users SET subscription_status = 'unpaid', is_active = 0 WHERE id = ?", [user.id]);
      const msg = `⚠️ *ABUNƏLİYİNİZ BİTDİ* ⚠️\n\nAylıq abunəlik müddətiniz başa çatdığı üçün hesabınız donduruldu və ticarət botu dayandırıldı.\n\nDavam etmək üçün zəhmət olmasa KriptoAI panelinə daxil olub ödənişinizi yeniləyin.`;
      await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [user.id, 'Abunəliyiniz Bitdi', msg]);
      if (user.telegram_chat_id) {
        await sendMessageToUser(user.id, user.telegram_chat_id, msg);
      }
    } 
    else if (daysLeft <= 3 && user.warning_3d_sent === 0) {
      await dbRun("UPDATE users SET warning_3d_sent = 1 WHERE id = ?", [user.id]);
      const msg = `⏳ *DİQQƏT: 3 GÜN QALDI*\n\nSizin aylıq abunəliyinizin bitməsinə cəmi 3 gün qaldı. Sisteminizin kəsintisiz işləməsi üçün vaxtı bitmədən növbəti ay üçün abunəliyinizi yeniləyin.`;
      await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [user.id, 'Abunəliyə 3 Gün Qaldı', msg]);
      if (user.telegram_chat_id) {
        await sendMessageToUser(user.id, user.telegram_chat_id, msg);
      }
    }
    else if (daysLeft <= 7 && daysLeft > 3 && user.warning_7d_sent === 0) {
      await dbRun("UPDATE users SET warning_7d_sent = 1 WHERE id = ?", [user.id]);
      const msg = `📅 *Abunəlik Xatırlatması*\n\nSizin aylıq abunəliyinizin bitməsinə 7 gün qaldı. Kəsinti yaşamamaq üçün növbəti ay üçün abunəliyi yeniləməyi unutmayın.`;
      await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [user.id, 'Abunəliyə 7 Gün Qaldı', msg]);
      if (user.telegram_chat_id) {
        await sendMessageToUser(user.id, user.telegram_chat_id, msg);
      }
    }
  }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[${new Date().toISOString()}] Cron endpoint çağırıldı...`);
    
    // Run subscriptions synchronously first
    await checkSubscriptions();
    
    // Check if any active spot users exist before running engine
    const activeSpotUsers = await dbAll<any>(
      'SELECT id FROM users WHERE is_active = 1 AND binance_api_key IS NOT NULL AND binance_api_secret IS NOT NULL LIMIT 1'
    );
    
    if (activeSpotUsers.length === 0) {
      console.log(`[${new Date().toISOString()}] Aktiv spot istifadəçi yoxdur — spot analiz atlandı.`);
      return NextResponse.json({ ok: true, message: 'No active spot users, engine skipped' });
    }

    // Run engine asynchronously in background
    runTradingEngine().catch(err => {
      console.error(`[${new Date().toISOString()}] Trading engine xətası:`, err);
    });
    
    return NextResponse.json({ ok: true, message: 'Subscriptions checked, trading engine started' });
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Cron xətası:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
