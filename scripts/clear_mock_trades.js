const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run("DELETE FROM trades WHERE dedupe_key LIKE 'mock_%'", (err) => {
    if (err) console.error(err);
    else console.log('Mock trades deleted successfully!');
  });
});
