const sqlite3 = require('sqlite3');
const path = require('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'az'", (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('Column already exists');
      } else {
        console.error(err);
      }
    } else {
      console.log('Language column added to users table');
    }
  });
});
