#!/bin/sh
set -eu
mkdir -p /app/data
node -e "
const sqlite3 = require('sqlite3');
const dbPath = process.env.DB_PATH || '/app/data/kripto.db';
const fs = require('fs');
if (fs.existsSync(dbPath)) {
  const db = new sqlite3.Database(dbPath);
  db.run('DELETE FROM execution_locks', (err) => {
    if (err) console.error('Failed to clean locks:', err.message);
    else console.log('Cleaned stale execution locks on container entry');
    db.close();
  });
}
" || true
exec npm start
