(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));
db.run("ALTER TABLE trades ADD COLUMN profit REAL DEFAULT 0", (err) => {
  if (err) console.log(err.message);
  else console.log('Added profit column');
});

})().catch(error=>{console.error(error);process.exitCode=1});
