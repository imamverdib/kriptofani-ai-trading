import type {AppUser,Payment} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await dbGet<AppUser>("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action, targetId, paymentId } = await req.json();

    if (action === 'freeze_user') {
      await dbRun("UPDATE users SET subscription_status = 'frozen', is_active = 0 WHERE id = ?", [targetId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'activate_user') {
      await dbRun("UPDATE users SET subscription_status = 'active', is_active = 1, subscription_expires_at = datetime('now', '+30 days'), warning_7d_sent = 0, warning_3d_sent = 0 WHERE id = ?", [targetId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'approve_payment') {
      const payment = await dbGet<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (payment && payment.status === 'pending') {
        await dbRun("UPDATE payments SET status = 'approved' WHERE id = ?", [paymentId]);
        await dbRun("UPDATE users SET subscription_status = 'active', is_active = 1, subscription_expires_at = datetime('now', '+30 days'), warning_7d_sent = 0, warning_3d_sent = 0 WHERE id = ?", [payment.user_id]);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Payment not found or not pending' }, { status: 400 });
    }

    if (action === 'reject_payment') {
      const payment = await dbGet<Payment>('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (payment && payment.status === 'pending') {
        await dbRun("UPDATE payments SET status = 'rejected' WHERE id = ?", [paymentId]);
        await dbRun("UPDATE users SET subscription_status = 'frozen', is_active = 0 WHERE id = ?", [payment.user_id]);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Payment not found or not pending' }, { status: 400 });
    }

    if (action === 'delete_user') {
      if (!targetId || typeof targetId !== 'number') {
        return NextResponse.json({ error: 'targetId required' }, { status: 400 });
      }
      const targetUser = await dbGet<AppUser>('SELECT role FROM users WHERE id = ?', [targetId]);
      if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      if (targetUser.role === 'admin') {
        return NextResponse.json({ error: 'Admin istifadəçi silinə bilməz' }, { status: 403 });
      }

      // Preserve exchange ownership and execution history; monitoring must survive account archival.
      await dbRun("UPDATE users SET is_active=0,subscription_status='frozen' WHERE id=?",[targetId]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
