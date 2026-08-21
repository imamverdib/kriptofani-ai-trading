import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram'; // Assuming this exists or I'll use fetch directly

// Since sendTelegramMessage in binance.ts/telegram.ts might just be a basic text sender,
// I'll create a custom telegram sender here to include Inline Keyboard.
async function sendAdminTelegramAlert(chatId: string, message: string, paymentId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Təsdiqlə', callback_data: `approve_payment_${paymentId}` },
        { text: '❌ Rədd et', callback_data: `reject_payment_${paymentId}` }
      ]
    ]
  };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    })
  });
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { txid } = await req.json();
    if (!txid) return NextResponse.json({ error: 'TXID required' }, { status: 400 });

    const user: any = await dbGet('SELECT * FROM users WHERE id = ?', [session.id]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // 1. Check if TXID already exists
    const existing: any = await dbGet('SELECT id FROM payments WHERE txid = ?', [txid]);
    if (existing) {
      return NextResponse.json({ error: 'Bu TXID artıq sistemdə mövcuddur.' }, { status: 400 });
    }

    // 2. Fetch Admin Wallet Address
    const walletRow: any = await dbGet("SELECT value FROM system_settings WHERE key = 'trc20_wallet_address'");
    const adminWallet = walletRow ? walletRow.value : null;

    if (!adminWallet) {
      return NextResponse.json({ error: 'Sistemdə cüzdan adresi təyin edilməyib. Adminlə əlaqə saxlayın.' }, { status: 400 });
    }

    // 3. Verify with TronScan API
    const tronUrl = `https://apilist.tronscanapi.com/api/transaction-info?hash=${txid}`;
    const tronRes = await fetch(tronUrl);
    const tronData = await tronRes.json();

    if (!tronData || tronData.contractRet !== 'SUCCESS') {
      return NextResponse.json({ error: 'Ödəniş tapılmadı və ya xətalıdır (Uğursuz tranzaksiya).' }, { status: 400 });
    }

    // 4. Validate TRC20 Transfer
    let validTransfer = false;
    const REQUIRED_AMOUNT = 10; // Nominal subscription amount
    const ACCEPTED_MINIMUM = 9; // Minimum accepted amount
    const MIN_RAW_AMOUNT = ACCEPTED_MINIMUM * 1000000; // 6 decimals
    const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

    if (tronData.trc20TransferInfo && tronData.trc20TransferInfo.length > 0) {
      for (const transfer of tronData.trc20TransferInfo) {
        if (
          transfer.contract_address === USDT_CONTRACT &&
          transfer.to_address === adminWallet &&
          parseInt(transfer.amount_str) >= MIN_RAW_AMOUNT
        ) {
          validTransfer = true;
          break;
        }
      }
    }

    if (!validTransfer) {
      return NextResponse.json({ error: 'Ödəniş tələblərə cavab vermir (Fərqli cüzdan, fərqli valyuta və ya əskik məbləğ).' }, { status: 400 });
    }

    // 5. Success! Insert payment as approved
    const result: any = await dbRun(
      'INSERT INTO payments (user_id, txid, amount, status) VALUES (?, ?, ?, ?)',
      [user.id, txid, REQUIRED_AMOUNT, 'approved']
    );

    // Update user status and add 30 days
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);
    const expiresAt = newExpiry.toISOString().split('T')[0];

    await dbRun(
      "UPDATE users SET subscription_status = 'active', is_active = 1, subscription_expires_at = ? WHERE id = ?",
      [expiresAt, user.id]
    );

    // Notify user via Telegram
    if (user.telegram_chat_id) {
      const { sendMessageToUser } = require('@/lib/telegram');
      await sendMessageToUser(user.id, user.telegram_chat_id, '✅ *Təbrik edirik!* Ödənişiniz avtomatik olaraq təsdiqləndi və KriptoFani hesabınız aktivləşdirildi. Bol qazanclar!');
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
