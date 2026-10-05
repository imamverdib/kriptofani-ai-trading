import type { AppUser } from './app-types';
import type { SpotAccount } from './exchange-types';
import { exchange } from './exchange-client';
import { dbRun, dbGet } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { setBotActive } from './bot-control';




export const AVAILABLE_COINS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 
  'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'MATICUSDT'
];

export async function sendMessageToUser(userId: number, chatId: string | number, text: string) {
  const { transaction } = await import('./trading-store');
  await transaction(sql=>sql.run('INSERT INTO notification_outbox(user_id,chat_id,text) VALUES (?,?,?)',[userId,chatId ? String(chatId) : null,text]));
}

export async function fetchBinanceBalance(apiKey: string, apiSecret: string): Promise<number> {
  const data=await exchange<SpotAccount>('spot','/api/v3/account',{},{key:apiKey,secret:apiSecret});
  const usdtAsset=data.balances.find(b=>b.asset==='USDT');
  if (usdtAsset) {
    return Number(usdtAsset.free) + Number(usdtAsset.locked);
  }
  return 0;
}

export async function getOrCreateConfig(userId: number) {
  let config = await dbGet<{user_id:number;max_risk_pct:number;max_open_positions:number;max_leverage:number;min_confidence:number;target_coins:string}>('SELECT * FROM risk_configs WHERE user_id = ?', [userId]);
  if (!config) {
    config = {
      user_id: userId,
      max_risk_pct: 2,
      max_open_positions: 5,
      max_leverage: 1,
      min_confidence: 75,
      target_coins: 'AUTO'
    };
    await dbRun(
      'INSERT INTO risk_configs (user_id, max_risk_pct, max_open_positions, max_leverage, min_confidence, target_coins) VALUES (?, ?, ?, ?, ?, ?)',
      [config.user_id, config.max_risk_pct, config.max_open_positions, config.max_leverage, config.min_confidence, config.target_coins]
    );
  }
  return config;
}

export async function processUserCommand(user: AppUser, chatId: string, text: string) {
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  if (command === '/start') {
    await sendMessageToUser(user.id, chatId, `✅ Hesabınız uğurla təsdiqləndi! KriptoFani sistemindən avtomatik ticarət bildirişlərini bu çatda alacaqsınız.\n\nMövcud idarəetmə əmrlərinin siyahısını görmək üçün /yardim yaza bilərsiniz.`);
  } 
  else if (command === '/yardim') {
    const helpMessage = 
`🤖 *KriptoFani Bot Əmrləri:*

📊 *Məlumat:*
/status - Botun cari vəziyyəti, risk faizi, koinlər və balans
/koinler - Ticarət olunan bütün koinlərin siyahısı

⚙️ *İdarəetmə:*
/aktiv - Botu işə salır (Canlı)
/dayandir - Botu dayandırır (Pauza)
/faiz [0-20] - Maksimum ayırma faizini təyin edir (məsələn: /faiz 5)

🪙 *Koin Seçimi:*
/koin_auto - Koin seçimini Süni Zəkaya (AUTO) tapşırır
/koin_elave [koin] - Manual siyahıya koin əlavə edir (məsələn: /koin_elave SOL)
/koin_sil [koin] - Manual siyahıdan koin silir (məsələn: /koin_sil BTC)`;
    
    await sendMessageToUser(user.id, chatId, helpMessage);
  }
  else if (command === '/status') {
    const config = await getOrCreateConfig(user.id);
    let balance: number | null = null;
    let balanceErr = '';

    if (user.binance_api_key && user.binance_api_secret) {
      try {
        const apiKey = decrypt(user.binance_api_key, `${user.id}:spot:key`);
        const apiSecret = decrypt(user.binance_api_secret, `${user.id}:spot:secret`);
        balance = await fetchBinanceBalance(apiKey, apiSecret);
      } catch {
        balanceErr = ' (Binance API xətası)';
      }
    }

    const formattedCoins = config.target_coins === 'AUTO' 
      ? '🤖 Süni Zəka Seçimi (AUTO)' 
      : config.target_coins.split(',').map((c: string) => c.replace('USDT', '')).join(', ');

    const spotCfg = await dbGet<{is_spot_active: number}>('SELECT is_spot_active FROM risk_configs WHERE user_id = ?', [user.id]);
    const futuresCfg = await dbGet<{is_futures_active: number}>('SELECT is_futures_active FROM futures_risk_configs WHERE user_id = ?', [user.id]);
    const spotActive = spotCfg?.is_spot_active === 1;
    const futuresActive = futuresCfg?.is_futures_active === 1;

    const statusMessage = 
`📊 *KriptoFani Cari Vəziyyət:*

🟢 *Ümumi Status:* ${user.is_active === 1 ? 'Aktiv (Ticarət Gedir)' : 'Pauza (Deaktiv)'}
📊 *Spot Panel:* ${spotActive ? '🟢 Aktiv (1h rutin)' : '🔴 Deaktiv'}
⚡ *Futures Panel:* ${futuresActive ? '🟢 Aktiv (15m rutin)' : '🔴 Deaktiv'}
💰 *Spot Balansı:* ${balance !== null ? `$${balance.toLocaleString()}` : 'Məlumat tapılmadı' + balanceErr}
📈 *Spot Risk Limiti:* %${config.max_risk_pct}
🪙 *Hədəf Koinlər:* ${formattedCoins}`;

    await sendMessageToUser(user.id, chatId, statusMessage);
  }
  else if (command === '/aktiv') {
    await setBotActive(user.id, true);
    await sendMessageToUser(user.id, chatId, '🟢 KriptoFani ticarət botu uğurla aktivləşdirildi! Yeni ticarət imkanları analiz edilir...');
  }
  else if (command === '/dayandir') {
    await setBotActive(user.id, false);
    await sendMessageToUser(user.id, chatId, '🔴 KriptoFani ticarət botu pauza rejiminə keçirildi. Mövcud əməliyyatlar saxlanılacaq, lakin yeni mövqe açılmayacaq.');
  }
  else if (command === '/faiz') {
    if (!arg) {
      await sendMessageToUser(user.id, chatId, '⚠️ Zəhmət olmasa, təyin etmək istədiyiniz risk faizini daxil edin. Məsələn: /faiz 5');
      return;
    }

    const newRiskPct = parseFloat(arg);
    if (isNaN(newRiskPct) || newRiskPct < 0 || newRiskPct > 20) {
      await sendMessageToUser(user.id, chatId, '⚠️ Zəhmət olmasa, 0 ilə 20 arasında bir rəqəm daxil edin. Məsələn: /faiz 5');
      return;
    }

    await getOrCreateConfig(user.id); // Ensure config exists
    await dbRun('UPDATE risk_configs SET max_risk_pct = ? WHERE user_id = ?', [newRiskPct, user.id]);
    await sendMessageToUser(user.id, chatId, `✅ Hər əməliyyat üçün maksimum kapital ayırma faizi %${newRiskPct} olaraq təyin edildi.`);
  }
  else if (command === '/koinler') {
    const config = await getOrCreateConfig(user.id);
    const formattedCoins = config.target_coins === 'AUTO' 
      ? 'Süni Zəka (AUTO)' 
      : config.target_coins.split(',').map((c: string) => c.replace('USDT', '')).join(', ');

    const coinsMessage = 
`🪙 *Koin Tənzimləmələri:*

🤖 *Rejim:* ${config.target_coins === 'AUTO' ? 'Süni Zəka (AUTO)' : 'Manual Seçim'}
🎯 *Seçilmiş Koinlər:* ${formattedCoins}

💡 *Populyar Koinlər:*
${AVAILABLE_COINS.map(c => `• ${c.replace('USDT', '')}`).join('\n')}
(İstədiyiniz başqa bir Binance koinini də əlavə edə bilərsiniz)

_Koini siyahıya əlavə etmək üçün:_ \`/koin_elave SOL\`
_Koini siyahıdan silmək üçün:_ \`/koin_sil BTC\`
_Süni Zəka seçiminə keçmək üçün:_ \`/koin_auto\``;

    await sendMessageToUser(user.id, chatId, coinsMessage);
  }
  else if (command === '/koin_auto') {
    await getOrCreateConfig(user.id);
    await dbRun('UPDATE risk_configs SET target_coins = ? WHERE user_id = ?', ['AUTO', user.id]);
    await sendMessageToUser(user.id, chatId, '🤖 Koin seçimi Süni Zəkaya (AUTO rejim) həvalə edildi. Bot avtomatik olaraq Binance-də son 24 saatın ən aktiv 5 koinini analiz edəcək.');
  }
  else if (command === '/koin_elave') {
    if (!arg) {
      await sendMessageToUser(user.id, chatId, '⚠️ Zəhmət olmasa, əlavə etmək istədiyiniz koinin adını yazın. Məsələn: /koin_elave SOL');
      return;
    }

    let coinInput = arg.toUpperCase().trim();
    if (!coinInput.endsWith('USDT')) {
      coinInput = coinInput + 'USDT';
    }

    const config = await getOrCreateConfig(user.id);
    const currentCoins = config.target_coins;
    let newCoinsList = '';

    if (currentCoins === 'AUTO') {
      newCoinsList = coinInput;
    } else {
      const coinsArray = currentCoins.split(',').map((c: string) => c.trim());
      if (coinsArray.includes(coinInput)) {
        await sendMessageToUser(user.id, chatId, `⚠️ ${coinInput.replace('USDT', '')} artıq hədəf koinlər siyahısındadır.`);
        return;
      }
      coinsArray.push(coinInput);
      newCoinsList = coinsArray.join(',');
    }

    await dbRun('UPDATE risk_configs SET target_coins = ? WHERE user_id = ?', [newCoinsList, user.id]);
    const displayList = newCoinsList.split(',').map((c: string) => c.replace('USDT', '')).join(', ');
    await sendMessageToUser(user.id, chatId, `✅ ${coinInput.replace('USDT', '')} hədəf koinlər siyahısına əlavə edildi.\nCari siyahı: ${displayList}`);
  }
  else if (command === '/koin_sil') {
    if (!arg) {
      await sendMessageToUser(user.id, chatId, '⚠️ Zəhmət olmasa, silmək istədiyiniz koinin adını yazın. Məsələn: /koin_sil SOL');
      return;
    }

    let coinInput = arg.toUpperCase().trim();
    if (!coinInput.endsWith('USDT')) {
      coinInput = coinInput + 'USDT';
    }

    const config = await getOrCreateConfig(user.id);
    if (config.target_coins === 'AUTO') {
      await sendMessageToUser(user.id, chatId, '⚠️ Hazırda AUTO rejimdəsiniz. Manual rejimə keçmək üçün əvvəlcə hər hansı bir koin əlavə edin (/koin_elave SOL).');
      return;
    }

    const coinsArray = config.target_coins.split(',').map((c: string) => c.trim());
    if (!coinsArray.includes(coinInput)) {
      await sendMessageToUser(user.id, chatId, `⚠️ ${coinInput.replace('USDT', '')} koinlər siyahısında tapılmadı.`);
      return;
    }

    const newCoinsArray = coinsArray.filter((c: string) => c !== coinInput);
    let newCoinsList = newCoinsArray.join(',');
    
    if (newCoinsList === '') {
      newCoinsList = 'AUTO';
      await dbRun('UPDATE risk_configs SET target_coins = ? WHERE user_id = ?', [newCoinsList, user.id]);
      await sendMessageToUser(user.id, chatId, `✅ ${coinInput.replace('USDT', '')} silindi. Siyahı boş qaldığı üçün avtomatik AUTO rejimə keçildi.`);
    } else {
      await dbRun('UPDATE risk_configs SET target_coins = ? WHERE user_id = ?', [newCoinsList, user.id]);
      const displayList = newCoinsList.split(',').map((c: string) => c.replace('USDT', '')).join(', ');
      await sendMessageToUser(user.id, chatId, `✅ ${coinInput.replace('USDT', '')} silindi.\nQalan siyahı: ${displayList}`);
    }
  }
  else {
    await sendMessageToUser(user.id, chatId, '🤔 Bu əmri tanımadım. Kömək üçün /yardim yaza bilərsiniz.');
  }
}
