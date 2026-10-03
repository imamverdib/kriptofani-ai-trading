import {join,dirname} from 'node:path';
import {dbPath} from './db';
import {backupDatabase,verifyDatabase} from './database-backup';
import {read,transaction,withOwner} from './trading-store';
export async function dailyBackup(now=Date.now()){
 return withOwner('daily-backup',async()=>{
  const last=await read(sql=>sql.get<{value:string}>("SELECT value FROM system_settings WHERE key='backup_last_success'"));if(last&&now-Number(last.value)<86400000)return;
  const path=join(process.env.BACKUP_DIR||join(dirname(dbPath),'backups'),`kripto-${new Date(now).toISOString().slice(0,10)}.db`);
  try{await backupDatabase(dbPath,path)}catch(e){if(!(e instanceof Error)||!('code' in e)||e.code!=='EEXIST')throw e;await verifyDatabase(path)}
  await transaction(sql=>sql.run("INSERT INTO system_settings VALUES ('backup_last_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[String(now)]));
 });
}
