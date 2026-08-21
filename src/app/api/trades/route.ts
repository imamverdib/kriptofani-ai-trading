import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbAll } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const trades = await dbAll(
      "SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC", 
      [session.id]
    );

    return NextResponse.json({ success: true, trades });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
