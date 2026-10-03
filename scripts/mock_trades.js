(async()=>{
const {default: sqlite3}=await import('sqlite3');
const {default: path}=await import('path');
const db = new sqlite3.Database(path.join(process.cwd(), 'kripto.db'));

db.serialize(() => {
  db.get("SELECT id FROM users LIMIT 1", (err, row) => {
    if (err || !row) return console.error("No user found");
    const userId = row.id;

    const stmt = db.prepare('INSERT INTO trades (user_id, symbol, action, price, amount, status, dedupe_key, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    
    // BUY BTC
    stmt.run(userId, 'BTCUSDT', 'BUY', 65000, 0.001, 'EXECUTED', 'mock_buy_1', 0);
    // SELL BTC
    stmt.run(userId, 'BTCUSDT', 'SELL', 66000, 0.001, 'EXECUTED', 'mock_sell_1', 1.0);
    
    // BUY ETH
    stmt.run(userId, 'ETHUSDT', 'BUY', 3500, 0.1, 'EXECUTED', 'mock_buy_2', 0);

    stmt.finalize(() => {
      console.log('Mock trades inserted successfully!');
    });
  });
});

})().catch(error=>{console.error(error);process.exitCode=1});
