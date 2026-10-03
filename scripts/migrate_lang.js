(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
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

})().catch(error=>{console.error(error);process.exitCode=1});
