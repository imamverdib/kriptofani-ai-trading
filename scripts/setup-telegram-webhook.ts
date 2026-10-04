import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const baseUrl = process.env.NEXTAUTH_URL || 'https://kripto.behbudlu.com';

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing in environment.');
    process.exit(1);
  }

  const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/api/telegram/webhook`;
  console.log(`📡 Setting Telegram webhook for bot...`);
  console.log(`   Target URL: ${webhookUrl}`);

  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      drop_pending_updates: false,
    }),
  });

  const setData = await setRes.json();
  if (!setData.ok) {
    console.error('❌ Failed to set webhook:', setData);
    process.exit(1);
  }
  console.log('✅ Webhook successfully set:', setData.description);

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log('📋 Current Webhook Status:', infoData.result);
}

main().catch((err) => {
  console.error('❌ Error executing setup-telegram-webhook:', err);
  process.exit(1);
});
