import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me: any = await dbGet("SELECT role FROM users WHERE id = ?", [session.id]);
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
      const payment: any = await dbGet('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (payment && payment.status === 'pending') {
        await dbRun("UPDATE payments SET status = 'approved' WHERE id = ?", [paymentId]);
        await dbRun("UPDATE users SET subscription_status = 'active', is_active = 1, subscription_expires_at = datetime('now', '+30 days'), warning_7d_sent = 0, warning_3d_sent = 0 WHERE id = ?", [payment.user_id]);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Payment not found or not pending' }, { status: 400 });
    }

    if (action === 'reject_payment') {
      const payment: any = await dbGet('SELECT * FROM payments WHERE id = ?', [paymentId]);
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
      const targetUser: any = await dbGet('SELECT role FROM users WHERE id = ?', [targetId]);
      if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      if (targetUser.role === 'admin') {
        return NextResponse.json({ error: 'Admin istifadəçi silinə bilməz' }, { status: 403 });
      }

      await dbRun('DELETE FROM futures_partial_fills WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM futures_positions WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM futures_risk_configs WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM bot_messages WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM notifications WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM support_tickets WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM trades WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM payments WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM risk_configs WHERE user_id = ?', [targetId]);
      await dbRun('DELETE FROM users WHERE id = ?', [targetId]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
