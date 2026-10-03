(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const dbPath = path.join(process.cwd(), 'kripto.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    if (err) console.log('role column might already exist:', err.message);
    else console.log('Added role column');
  });
  db.run(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'pending'`, (err) => {
    if (err) console.log('subscription_status column might already exist:', err.message);
    else console.log('Added subscription_status column');
  });
  db.run(`ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME`, (err) => {
    if (err) console.log('subscription_expires_at column might already exist:', err.message);
    else console.log('Added subscription_expires_at column');
  });
  
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      txid TEXT UNIQUE NOT NULL,
      amount REAL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `, (err) => {
    if (err) console.error('Error creating payments table:', err.message);
    else console.log('Created payments table');
  });
});

})().catch(error=>{console.error(error);process.exitCode=1});
