import { NextResponse } from 'next/server';
import { dbRun, dbGet } from '@/lib/db';
import { processUserCommand, sendMessageToUser } from '@/lib/telegram';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(req: Request) {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
      if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();

    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data;
      const message = callbackQuery.message;
      const chatId = message.chat.id;

      if (data.startsWith('approve_payment_') || data.startsWith('reject_payment_')) {
        const isApprove = data.startsWith('approve_payment_');
        const paymentId = parseInt(data.split('_').pop() || '0');

        if (paymentId) {
          const payment: any = await dbGet('SELECT * FROM payments WHERE id = ?', [paymentId]);
          if (payment && payment.status === 'pending') {
            const newStatus = isApprove ? 'approved' : 'rejected';
            await dbRun('UPDATE payments SET status = ? WHERE id = ?', [newStatus, paymentId]);
            
            if (isApprove) {
              await dbRun("UPDATE users SET subscription_status = 'active', is_active = 1, subscription_expires_at = datetime('now', '+30 days') WHERE id = ?", [payment.user_id]);
              const targetUser: any = await dbGet('SELECT telegram_chat_id FROM users WHERE id = ?', [payment.user_id]);
              if (targetUser && targetUser.telegram_chat_id) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: targetUser.telegram_chat_id, text: `✅ Təbrik edirik! Ödənişiniz təsdiqləndi. Hesabınız 30 gün müddətinə aktivləşdirildi!` })
                });
              }
            } else {
              await dbRun("UPDATE users SET subscription_status = 'frozen' WHERE id = ?", [payment.user_id]);
              const targetUser: any = await dbGet('SELECT telegram_chat_id FROM users WHERE id = ?', [payment.user_id]);
              if (targetUser && targetUser.telegram_chat_id) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: targetUser.telegram_chat_id, text: `❌ Ödənişiniz (TXID: ${payment.txid}) təsdiqlənmədi. Zəhmət olmasa düzgün TXID daxil edin.` })
                });
              }
            }

            if (TELEGRAM_BOT_TOKEN) {
              await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: message.message_id,
                  text: message.text + `\n\nNəticə: ${isApprove ? '✅ Təsdiqləndi' : '❌ Rədd edildi'}`
                })
              });
            }
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.message && body.message.chat && body.message.from) {
      const chatId = body.message.chat.id;
      const username = body.message.from.username;
      const text = body.message.text ? body.message.text.trim() : '';

      if (!text) {
        return NextResponse.json({ ok: true });
      }

      // Check if user is linked by telegram_chat_id
      let user: any = await dbGet('SELECT * FROM users WHERE telegram_chat_id = ?', [String(chatId)]);

      // If user is not linked by chat_id, try to link by telegram_username or username
      if (!user && username) {
        const foundUser: any = await dbGet('SELECT * FROM users WHERE telegram_username = ? COLLATE NOCASE OR username = ? COLLATE NOCASE', [username, username]);
        if (foundUser) {
          await dbRun('UPDATE users SET telegram_chat_id = ?, telegram_username = ? WHERE id = ?', [String(chatId), username, foundUser.id]);
          user = await dbGet('SELECT * FROM users WHERE id = ?', [foundUser.id]);
        }
      }

      // Sync only telegram_username — never overwrite the login username
      if (user && username && user.telegram_username !== username) {
        try {
          await dbRun('UPDATE users SET telegram_username = ? WHERE id = ?', [username, user.id]);
        } catch (e) {
          console.error('Failed to sync telegram_username:', e);
        }
      }

      // If still no user linked, prompt for setup
      if (!user) {
        if (TELEGRAM_BOT_TOKEN) {
          if (text.startsWith('/start') && username) {
             await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `⚠️ Sistemdə @${username} istifadəçi adı ilə hesab tapılmadı. Zəhmət olmasa, əvvəlcə KriptoFani veb panelindən qeydiyyatdan keçin və Telegram istifadəçi adınızı düzgün daxil edin.` })
            });
          } else {
             await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: `⚠️ Zəhmət olmasa, əvvəlcə KriptoFani veb panelindən tənzimləmələri edin və Telegram istifadəçi adınızı qeyd edin. (Sizin Telegram istifadəçi adınız: @${username || 'yoxdur'})` })
            });
          }
        }
        return NextResponse.json({ ok: true });
      }

      // Record incoming USER message
      await dbRun(
        'INSERT INTO bot_messages (user_id, telegram_chat_id, sender, text) VALUES (?, ?, ?, ?)',
        [user.id, String(chatId), 'USER', text]
      );

      // Process the command
      await processUserCommand(user, String(chatId), text);
    }
    
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook xətası:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
