import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbAll, dbRun } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const notifications = await dbAll("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [session.id]);
    const unreadCount: any = await dbGet("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0", [session.id]);

    return NextResponse.json({ success: true, notifications, unreadCount: unreadCount?.count || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Mark all as read
    await dbRun("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [session.id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
