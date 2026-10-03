(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN warning_7d_sent INTEGER DEFAULT 0", (err) => { if (err) console.log(err.message); });
  db.run("ALTER TABLE users ADD COLUMN warning_3d_sent INTEGER DEFAULT 0", (err) => { if (err) console.log(err.message); });
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
});

})().catch(error=>{console.error(error);process.exitCode=1});
