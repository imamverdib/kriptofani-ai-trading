import { NextResponse } from 'next/server';
import { runFuturesAnalysis } from '@/lib/futures-engine';
import { dbAll } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[${new Date().toISOString()}] Futures cron endpoint çağırıldı...`);

    // Check if any active futures users exist before running engine
    const activeFuturesUsers = await dbAll<any>(
      `SELECT u.id 
       FROM users u 
       JOIN futures_risk_configs f ON u.id = f.user_id 
       WHERE f.is_futures_active = 1 
       AND u.futures_api_key IS NOT NULL 
       AND u.futures_api_secret IS NOT NULL 
       LIMIT 1`
    );
    
    if (activeFuturesUsers.length === 0) {
      console.log(`[${new Date().toISOString()}] Aktiv futures istifadəçi yoxdur — futures analiz atlandı.`);
      return NextResponse.json({ ok: true, message: 'No active futures users, engine skipped' });
    }

    runFuturesAnalysis().catch(err => {
      console.error(`[${new Date().toISOString()}] Futures engine xətası:`, err);
    });

    return NextResponse.json({ ok: true, message: 'Futures analysis started' });
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Futures cron xətası:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
