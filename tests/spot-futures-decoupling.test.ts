import {test} from 'node:test';
import assert from 'node:assert/strict';

test('spot and futures activation are fully decoupled with synced master user state', async () => {
  const {transaction, read} = await import('../src/lib/trading-store');
  const {setSpotActive, setFuturesActive} = await import('../src/lib/bot-control');
  
  await transaction(async sql => {
    await sql.run("INSERT INTO users(id,username,password_hash,is_active,subscription_status) VALUES (99,'decoupled-user','pwd',0,'active')");
    await sql.run("INSERT INTO risk_configs(user_id,is_spot_active) VALUES (99,0)");
    await sql.run("INSERT INTO futures_risk_configs(user_id,is_futures_active) VALUES (99,0)");
  });

  // Both off -> is_active = 0
  let u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 0);

  // Turn futures ON -> is_active = 1, is_spot_active = 0, is_futures_active = 1
  let res = await setFuturesActive(99, true);
  assert.equal(res.is_futures_active, 1);
  assert.equal(res.is_active, 1);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 1);

  // Turn spot ON -> is_active = 1, both are 1
  res = await setSpotActive(99, true);
  assert.equal(res.is_spot_active, 1);
  assert.equal(res.is_active, 1);

  // Turn futures OFF -> is_active remains 1 because spot is still ON!
  res = await setFuturesActive(99, false);
  assert.equal(res.is_futures_active, 0);
  assert.equal(res.is_active, 1);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 1);

  // Turn spot OFF -> now BOTH are OFF, so is_active must become 0!
  res = await setSpotActive(99, false);
  assert.equal(res.is_spot_active, 0);
  assert.equal(res.is_active, 0);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 0);
});
