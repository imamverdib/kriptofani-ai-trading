import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbAll, dbRun, dbGet } from '@/lib/db';
import { processUserCommand } from '@/lib/telegram';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const messages = await dbAll(
      'SELECT id, sender, text, created_at FROM bot_messages WHERE user_id = ? ORDER BY created_at ASC',
      [session.id]
    );

    return NextResponse.json({ success: true, messages });
  } catch (err: any) {
    console.error('Chat GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const text = body.text ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Mətn boş ola bilməz' }, { status: 400 });
    }

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Record incoming USER message
    await dbRun(
      'INSERT INTO bot_messages (user_id, telegram_chat_id, sender, text) VALUES (?, ?, ?, ?)',
      [user.id, user.telegram_chat_id || 'WEB', 'USER', text]
    );

    // Process command synchronously (so the DB gets the bot's reply before we return)
    await processUserCommand(user, user.telegram_chat_id || 'WEB', text);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Chat POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
