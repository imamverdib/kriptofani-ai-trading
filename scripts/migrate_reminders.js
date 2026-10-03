(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN last_reminder_sent_date TEXT", (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error(err);
    } else {
      console.log('Column added or already exists');
    }
  });
});
db.close();

})().catch(error=>{console.error(error);process.exitCode=1});
