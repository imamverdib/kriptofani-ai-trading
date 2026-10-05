import {test} from 'node:test';
import assert from 'node:assert/strict';

test('spot and futures activation are fully decoupled with synced master user state', async () => {
  const {transaction, read} = await import('../src/lib/trading-store');
  const {setSpotActive, setFuturesActive} = await import('../src/lib/bot-control');
  
  await transaction(async sql => {
    await sql.run("INSERT OR REPLACE INTO users(id,username,password_hash,is_active,subscription_status) VALUES (99,'decoupled-user','pwd',0,'active')");
    await sql.run("INSERT OR REPLACE INTO risk_configs(user_id,is_spot_active) VALUES (99,0)");
    await sql.run("INSERT OR REPLACE INTO futures_risk_configs(user_id,is_futures_active) VALUES (99,0)");
  });

  // Both off -> is_active = 0
  let u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 0);

  // Turn futures ON -> is_active = 1, is_spot_active = 0, is_futures_active = 1
  const resF1 = await setFuturesActive(99, true);
  assert.equal(resF1.is_futures_active, 1);
  assert.equal(resF1.is_active, 1);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 1);

  // Turn spot ON -> is_active = 1, both are 1
  const resS1 = await setSpotActive(99, true);
  assert.equal(resS1.is_spot_active, 1);
  assert.equal(resS1.is_active, 1);

  // Turn futures OFF -> is_active remains 1 because spot is still ON!
  const resF2 = await setFuturesActive(99, false);
  assert.equal(resF2.is_futures_active, 0);
  assert.equal(resF2.is_active, 1);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 1);

  // Turn spot OFF -> now BOTH are OFF, so is_active must become 0!
  const resS2 = await setSpotActive(99, false);
  assert.equal(resS2.is_spot_active, 0);
  assert.equal(resS2.is_active, 0);
  u = await read(sql => sql.get<{is_active:number}>('SELECT is_active FROM users WHERE id=99'));
  assert.equal(u?.is_active, 0);
});

test('spot and futures balances are separated in risk_state and tradingReport', async () => {
  const {transaction} = await import('../src/lib/trading-store');
  const {tradingReport} = await import('../src/lib/reporting');
  
  await transaction(async sql => {
    await sql.run("INSERT OR REPLACE INTO users(id,username,password_hash,is_active,subscription_status) VALUES (101,'balance-user','pwd',1,'active')");
    await sql.run("INSERT OR REPLACE INTO risk_state(user_id,high_water,day_start,day,equity,frozen_reason,updated_at,flow_total,spot_equity,futures_equity) VALUES (101,100,100,'2026-10-05',100.0054,NULL,?,0,0.0054,100.0)", [Date.now()]);
  });

  const spotRep = await tradingReport(101, 'spot');
  assert.equal(spotRep.stats.balance, 0.0054);
  assert.equal(spotRep.stats.totalPortfolio, 100.0054);
  assert.equal(spotRep.stats.spotBalance, 0.0054);
  assert.equal(spotRep.stats.futuresBalance, 100.0);

  const futuresRep = await tradingReport(101, 'futures');
  assert.equal(futuresRep.stats.balance, 100.0);
  assert.equal(futuresRep.stats.totalPortfolio, 100.0054);
  assert.equal(futuresRep.stats.spotBalance, 0.0054);
  assert.equal(futuresRep.stats.futuresBalance, 100.0);
});
