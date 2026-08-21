const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));
db.run("ALTER TABLE trades ADD COLUMN profit REAL DEFAULT 0", (err) => {
  if (err) console.log(err.message);
  else console.log('Added profit column');
});
