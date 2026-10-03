import type {AppUser} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbAll, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await dbGet<AppUser>("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { message } = await req.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Mesaj boş ola bilməz' }, { status: 400 });
    }

    const users = await dbAll<AppUser>("SELECT id, telegram_chat_id FROM users");
    
    let sentCount = 0;

    for (const user of users) {
      // 1. Send system notification
      await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [
        user.id,
        "📢 Sistem Elanı",
        message
      ]);

      // 2. Send Telegram message
      if (user.telegram_chat_id) {
        try {
          await sendMessageToUser(user.id, user.telegram_chat_id, `📢 *Sistem Elanı:*\n\n${message}`);
          sentCount++;
        } catch (e) {
          console.error(`Failed to send broadcast to user ${user.id}:`, e);
        }
      }
    }

    return NextResponse.json({ success: true, sentCount, totalUsers: users.length });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
