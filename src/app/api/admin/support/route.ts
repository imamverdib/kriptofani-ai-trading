import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbAll } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me: any = await dbGet("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tickets = await dbAll(
      "SELECT t.*, u.username FROM support_tickets t JOIN users u ON t.user_id = u.id ORDER BY CASE WHEN t.status = 'pending' THEN 1 ELSE 2 END, t.created_at DESC"
    );

    return NextResponse.json({ success: true, tickets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
