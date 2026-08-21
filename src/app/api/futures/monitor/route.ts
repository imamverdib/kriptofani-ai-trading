import { NextResponse } from 'next/server';
import { monitorFuturesPositions } from '@/lib/futures-engine';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[${new Date().toISOString()}] Futures monitor endpoint çağırıldı...`);

    monitorFuturesPositions().catch(err => {
      console.error(`[${new Date().toISOString()}] Futures monitor xətası:`, err);
    });

    return NextResponse.json({ ok: true, message: 'Futures positions monitored' });
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Futures monitor xətası:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
