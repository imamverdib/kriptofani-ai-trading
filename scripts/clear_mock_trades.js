(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.run("DELETE FROM trades WHERE dedupe_key LIKE 'mock_%'", (err) => {
    if (err) console.error(err);
    else console.log('Mock trades deleted successfully!');
  });
});

})().catch(error=>{console.error(error);process.exitCode=1});
