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

    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'dashboard';

    if (type === 'dashboard') {
      const activeUsersCount = (await dbGet<{count: number}>("SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'"))?.count || 0;
      
      const stats = {
        totalUsers: (await dbGet<{count: number}>("SELECT COUNT(*) as count FROM users"))?.count || 0,
        activeUsers: activeUsersCount,
        pendingPayments: (await dbGet<{count: number}>("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'"))?.count || 0,
        totalRevenue: (await dbGet<{sum: number}>("SELECT SUM(amount) as sum FROM payments WHERE status = 'approved'"))?.sum || 0,
        mrr: activeUsersCount * 10,
        arr: activeUsersCount * 10 * 12,
      };

      const recentUsers = await dbAll("SELECT u.id, u.username, u.role, u.language, u.subscription_status, u.subscription_expires_at, u.created_at, (SELECT SUM(profit) FROM trades WHERE user_id = u.id AND created_at >= date('now', 'start of month')) as monthly_profit, (SELECT SUM(profit) FROM trades WHERE user_id = u.id) as lifetime_profit FROM users u ORDER BY u.created_at DESC LIMIT 5");
      const recentPayments = await dbAll("SELECT p.*, u.username FROM payments p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 5");

      return NextResponse.json({ success: true, stats, recentUsers, recentPayments });
    }
    
    if (type === 'users') {
      const users = await dbAll("SELECT u.id, u.username, u.telegram_username, u.language, u.role, u.subscription_status, u.subscription_expires_at, u.created_at, (SELECT SUM(profit) FROM trades WHERE user_id = u.id AND created_at >= date('now', 'start of month')) as monthly_profit, (SELECT SUM(profit) FROM trades WHERE user_id = u.id) as lifetime_profit FROM users u ORDER BY u.created_at DESC");
      return NextResponse.json({ success: true, users });
    }

    if (type === 'payments') {
      const payments = await dbAll("SELECT p.*, u.username FROM payments p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC");
      return NextResponse.json({ success: true, payments });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
