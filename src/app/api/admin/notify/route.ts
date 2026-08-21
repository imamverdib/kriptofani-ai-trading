import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me: any = await dbGet("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { targetUserId, message } = await req.json();

    const targetUser: any = await dbGet("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (!targetUser) {
        return NextResponse.json({ error: 'İstifadəçi tapılmadı' }, { status: 404 });
    }

    // Insert to notifications table
    await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [targetUserId, 'Admindən Mesaj', message]);

    // Send via Telegram
    if (targetUser.telegram_chat_id) {
        await sendMessageToUser(targetUser.id, targetUser.telegram_chat_id, `📩 *Admindən Yeni Mesaj:*\n\n${message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
