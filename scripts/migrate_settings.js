const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `, (err) => {
    if (err) console.error(err);
    else console.log('system_settings created');
  });
});
