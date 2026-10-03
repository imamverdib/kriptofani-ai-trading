/** This deployment is intentionally limited to two explicitly admitted trading users. */
export function tradingUserIds(value=process.env.TRADING_USER_IDS):number[]{
 if(!value?.trim())return [];
 const values=value.split(',').map(s=>s.trim());if(values.some(s=>!/^\d+$/.test(s)))throw new Error('TRADING_USER_IDS must contain integer IDs');
 const ids=[...new Set(values.map(Number))];if(ids.length>2||ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error('This deployment supports at most two trading users');return ids;
}
export function assertTradingUser(userId:number){if(!tradingUserIds().includes(userId))throw new Error('User is not admitted to this two-account deployment')}
