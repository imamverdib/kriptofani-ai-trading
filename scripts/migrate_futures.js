(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const dbPath = path.join(process.cwd(), 'kripto.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Futures positions table
  db.run(`
    CREATE TABLE IF NOT EXISTS futures_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      symbol TEXT,
      side TEXT,
      entry_price REAL,
      quantity REAL,
      remaining_qty REAL,
      leverage INTEGER DEFAULT 5,
      margin_mode TEXT DEFAULT 'ISOLATED',
      stop_loss_price REAL,
      take_profit_1 REAL,
      take_profit_2 REAL,
      take_profit_3 REAL,
      trailing_active INTEGER DEFAULT 0,
      trailing_stop_price REAL,
      highest_price REAL,
      lowest_price REAL,
      tp1_filled INTEGER DEFAULT 0,
      tp2_filled INTEGER DEFAULT 0,
      tp3_filled INTEGER DEFAULT 0,
      entry_timeframe TEXT,
      trend_direction TEXT,
      entry_reason TEXT,
      status TEXT DEFAULT 'OPEN',
      total_pnl REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `, (err) => {
    if (err) console.error('Error creating futures_positions:', err.message);
    else console.log('✅ Created futures_positions table');
  });

  // Partial fills table
  db.run(`
    CREATE TABLE IF NOT EXISTS futures_partial_fills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER,
      user_id INTEGER,
      tp_level INTEGER,
      quantity REAL,
      exit_price REAL,
      pnl REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (position_id) REFERENCES futures_positions (id)
    )
  `, (err) => {
    if (err) console.error('Error creating futures_partial_fills:', err.message);
    else console.log('✅ Created futures_partial_fills table');
  });

  // Futures risk config table
  db.run(`
    CREATE TABLE IF NOT EXISTS futures_risk_configs (
      user_id INTEGER PRIMARY KEY,
      max_risk_pct REAL DEFAULT 2,
      max_open_positions INTEGER DEFAULT 3,
      leverage INTEGER DEFAULT 5,
      min_confidence INTEGER DEFAULT 80,
      target_coins TEXT DEFAULT 'AUTO',
      is_futures_active INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `, (err) => {
    if (err) console.error('Error creating futures_risk_configs:', err.message);
    else console.log('✅ Created futures_risk_configs table');
  });

  // Add futures columns to users table
  db.run(`ALTER TABLE users ADD COLUMN futures_api_key TEXT`, (err) => {
    if (err) console.log('futures_api_key column might already exist:', err.message);
    else console.log('✅ Added futures_api_key column');
  });

  db.run(`ALTER TABLE users ADD COLUMN futures_api_secret TEXT`, (err) => {
    if (err) console.log('futures_api_secret column might already exist:', err.message);
    else console.log('✅ Added futures_api_secret column');
  });

  db.run(`ALTER TABLE users ADD COLUMN last_futures_force_run INTEGER DEFAULT 0`, (err) => {
    if (err) console.log('last_futures_force_run column might already exist:', err.message);
    else console.log('✅ Added last_futures_force_run column');
  });
});

db.close(() => {
  console.log('\n🎉 Futures migration completed!');
});

})().catch(error=>{console.error(error);process.exitCode=1});
