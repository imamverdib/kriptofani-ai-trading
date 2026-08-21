import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbRun, dbGet } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Toggle the state
    await dbRun('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?', [session.id]);
    
    // Fetch the new state
    const user: any = await dbGet('SELECT is_active FROM users WHERE id = ?', [session.id]);

    return NextResponse.json({ success: true, is_active: user.is_active });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
