import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: 'Bütün xanaları doldurun' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Yeni şifrə ən azı 6 simvoldan ibarət olmalıdır' }, { status: 400 });
    }

    // Fetch user
    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) {
      return NextResponse.json({ error: 'İstifadəçi tapılmadı' }, { status: 404 });
    }

    // Verify old password
    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) {
      return NextResponse.json({ error: 'Cari şifrə yanlışdır' }, { status: 401 });
    }

    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);

    // Update in DB
    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, session.id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
