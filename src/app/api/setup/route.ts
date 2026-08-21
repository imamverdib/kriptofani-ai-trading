import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbRun } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Handle Futures API keys separately
    if (body.futuresApiKey !== undefined && body.futuresApiSecret !== undefined) {
      if (!body.futuresApiKey || !body.futuresApiSecret) {
        return NextResponse.json({ error: 'Futures API açarlarını daxil edin' }, { status: 400 });
      }
      const encryptedKey = encrypt(body.futuresApiKey);
      const encryptedSecret = encrypt(body.futuresApiSecret);
      await dbRun(
        'UPDATE users SET futures_api_key = ?, futures_api_secret = ? WHERE id = ?',
        [encryptedKey, encryptedSecret, session.id]
      );
      return NextResponse.json({ success: true });
    }

    // Handle Spot API keys (existing logic)
    const { telegramUsername, binanceApiKey, binanceApiSecret } = body;

    if (!binanceApiKey || !binanceApiSecret) {
      return NextResponse.json({ error: 'Binance API açarlarını daxil edin' }, { status: 400 });
    }

    // Encrypt sensitive keys
    const encryptedKey = encrypt(binanceApiKey);
    const encryptedSecret = encrypt(binanceApiSecret);

    if (telegramUsername && telegramUsername.trim() !== '') {
      // Clean username (remove @ if exists)
      const cleanTelegramUsername = telegramUsername.startsWith('@') ? telegramUsername.slice(1) : telegramUsername;
      await dbRun(
        'UPDATE users SET telegram_username = ?, binance_api_key = ?, binance_api_secret = ? WHERE id = ?',
        [cleanTelegramUsername, encryptedKey, encryptedSecret, session.id]
      );
    } else {
      await dbRun(
        'UPDATE users SET binance_api_key = ?, binance_api_secret = ? WHERE id = ?',
        [encryptedKey, encryptedSecret, session.id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
