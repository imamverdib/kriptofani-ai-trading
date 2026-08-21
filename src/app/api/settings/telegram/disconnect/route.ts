import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbRun } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbRun('UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = ?', [session.id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
