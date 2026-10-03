import sqlite3 from 'sqlite3';
import {chmod,link,unlink,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
function open(file:string,mode:number){return new Promise<sqlite3.Database>((r,j)=>{const db=new sqlite3.Database(file,mode,e=>e?j(e):r(db));db.configure('busyTimeout',10000)})}
function run(db:sqlite3.Database,sql:string,args:unknown[]=[]){return new Promise<void>((r,j)=>db.run(sql,args,e=>e?j(e):r()))}
function all<T>(db:sqlite3.Database,sql:string){return new Promise<T[]>((r,j)=>db.all<T>(sql,(e,rows)=>e?j(e):r(rows)))}
function close(db:sqlite3.Database){return new Promise<void>((r,j)=>db.close(e=>e?j(e):r()))}
export async function verifyDatabase(file:string){const db=await open(file,sqlite3.OPEN_READONLY);try{const check=await all<{integrity_check:string}>(db,'PRAGMA integrity_check');if(check.length!==1||check[0].integrity_check!=='ok')throw new Error('Database integrity check failed');if((await all(db,'PRAGMA foreign_key_check')).length)throw new Error('Database foreign-key check failed')}finally{await close(db)}}
/** VACUUM INTO takes a consistent SQLite snapshot including committed WAL content. Never overwrites. */
export async function backupDatabase(source:string,destination:string){
 if(resolve(source)===resolve(destination))throw new Error('Backup destination must differ from source');
 await mkdir(dirname(destination),{recursive:true,mode:0o700});const temporary=`${destination}.${randomUUID()}.tmp`;
 const db=await open(source,sqlite3.OPEN_READONLY);
 try{await run(db,'VACUUM main INTO ?',[temporary]);await chmod(temporary,0o600);await verifyDatabase(temporary);await link(temporary,destination)}
 finally{await close(db);await unlink(temporary).catch(()=>{})}
}
/** Restore to a NEW path only. Operator changes DB_PATH after shutting down all old processes. */
export async function restoreDatabase(source:string,destination:string){await verifyDatabase(source);await backupDatabase(source,destination)}
