import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbAll, dbRun } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tickets = await dbAll("SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC", [session.id]);
    return NextResponse.json({ success: true, tickets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, email, message } = await req.json();
    if (!phone || !email || !message) {
      return NextResponse.json({ error: 'Bütün xanaları doldurun' }, { status: 400 });
    }

    await dbRun(
      "INSERT INTO support_tickets (user_id, phone, email, message) VALUES (?, ?, ?, ?)",
      [session.id, phone, email, message]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
