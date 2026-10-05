import {transaction, type SQL} from './trading-store';

export async function syncUserActiveState(sql: SQL, userId: number): Promise<number> {
  const spot = await sql.get<{is_spot_active: number}>('SELECT is_spot_active FROM risk_configs WHERE user_id = ?', [userId]);
  const futures = await sql.get<{is_futures_active: number}>('SELECT is_futures_active FROM futures_risk_configs WHERE user_id = ?', [userId]);
  const userActive = ((spot?.is_spot_active === 1) || (futures?.is_futures_active === 1)) ? 1 : 0;
  await sql.run('UPDATE users SET is_active = ? WHERE id = ?', [userActive, userId]);
  return userActive;
}

export async function setSpotActive(userId: number, active: boolean) {
  if (typeof active !== 'boolean') throw new Error('active must be boolean');
  return transaction(async sql => {
    const user = await sql.get<{subscription_status: string}>('SELECT subscription_status FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('Unknown user');
    if (active && user.subscription_status !== 'active') throw new Error('Active subscription required');
    const existing = await sql.get('SELECT user_id FROM risk_configs WHERE user_id = ?', [userId]);
    if (!existing) {
      await sql.run('INSERT INTO risk_configs (user_id, is_spot_active) VALUES (?, ?)', [userId, Number(active)]);
    } else {
      await sql.run('UPDATE risk_configs SET is_spot_active = ? WHERE user_id = ?', [Number(active), userId]);
    }
    const is_active = await syncUserActiveState(sql, userId);
    return { is_spot_active: Number(active), is_active };
  });
}

export async function setFuturesActive(userId: number, active: boolean) {
  if (typeof active !== 'boolean') throw new Error('active must be boolean');
  return transaction(async sql => {
    const user = await sql.get<{subscription_status: string}>('SELECT subscription_status FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('Unknown user');
    if (active && user.subscription_status !== 'active') throw new Error('Active subscription required');
    const existing = await sql.get('SELECT user_id FROM futures_risk_configs WHERE user_id = ?', [userId]);
    if (!existing) {
      await sql.run('INSERT INTO futures_risk_configs (user_id, is_futures_active) VALUES (?, ?)', [userId, Number(active)]);
    } else {
      await sql.run('UPDATE futures_risk_configs SET is_futures_active = ? WHERE user_id = ?', [Number(active), userId]);
    }
    const is_active = await syncUserActiveState(sql, userId);
    return { is_futures_active: Number(active), is_active };
  });
}

export async function setBotActive(userId: number, active: boolean) {
  if (typeof active !== 'boolean') throw new Error('active must be boolean');
  return transaction(async sql => {
    const user = await sql.get<{subscription_status: string}>('SELECT subscription_status FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('Unknown user');
    if (active && user.subscription_status !== 'active') throw new Error('Active subscription required');
    if (!active) {
      await sql.run('UPDATE risk_configs SET is_spot_active = 0 WHERE user_id = ?', [userId]);
      await sql.run('UPDATE futures_risk_configs SET is_futures_active = 0 WHERE user_id = ?', [userId]);
      await sql.run('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
      return 0;
    } else {
      await sql.run('UPDATE risk_configs SET is_spot_active = 1 WHERE user_id = ?', [userId]);
      const is_active = await syncUserActiveState(sql, userId);
      return is_active;
    }
  });
}

