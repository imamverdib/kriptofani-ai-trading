import cron from 'node-cron';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const PORT = process.env.PORT || 3005;
const CRON_URL = `http://localhost:${PORT}/api/cron`;
const FUTURES_CRON_URL = `http://localhost:${PORT}/api/futures/cron`;
const FUTURES_MONITOR_URL = `http://localhost:${PORT}/api/futures/monitor`;
const CRON_HEADERS: Record<string, string> = process.env.CRON_SECRET
  ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  : {};

console.log('🤖 KriptoAI Worker başladıldı...');
console.log('📊 Spot: Saatlıq ticarət dövrəsi aktivdir (Hər saatın tamamında).');
console.log('⚡ Futures: 30 dəqiqəlik analiz dövrəsi aktivdir.');
console.log('⚡ Futures: 30 saniyəlik pozisiya izləmə aktivdir.');

// ── Spot Engine: Run every hour at minute 0 ──
cron.schedule('0 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Saatlıq Spot dövrə işə salınır...`);
  try {
    const res = await fetch(CRON_URL, { headers: CRON_HEADERS });
    const data = await res.json();
    console.log(`[${new Date().toISOString()}] Spot cron nəticəsi:`, data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Spot cron sorğusu xətası:`, error);
  }
});

// ── Futures Analysis: Run every 30 minutes ──
cron.schedule('*/30 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Futures analiz dövrəsi işə salınır...`);
  try {
    const res = await fetch(FUTURES_CRON_URL, { headers: CRON_HEADERS });
    const data = await res.json();
    console.log(`[${new Date().toISOString()}] Futures cron nəticəsi:`, data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Futures cron sorğusu xətası:`, error);
  }
});

// ── Futures Position Monitor: Run every 30 seconds ──
cron.schedule('* * * * *', async () => {
  try {
    await fetch(FUTURES_MONITOR_URL, { headers: CRON_HEADERS });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Futures monitor xətası:`, error);
  }
});

cron.schedule('* * * * *', async () => {
  await new Promise(resolve => setTimeout(resolve, 30000));
  try {
    await fetch(FUTURES_MONITOR_URL, { headers: CRON_HEADERS });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Futures monitor xətası (30s):`, error);
  }
});
