import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
// An import-time DB_PATH capture must never point at the checkout's default database.
const directory=await mkdtemp(join(tmpdir(),'kripto-test-run-'));
const env={...process.env,DB_PATH:join(directory,'guard.db'),TRADING_ENABLED:'false',TRADING_ACCOUNT_IS_DEDICATED:'false',JWT_SECRET:'test-session-secret-not-production',ENCRYPTION_KEY:'test-encryption-key-not-production',TELEGRAM_BOT_TOKEN:'',GEMINI_API_KEY:'',TYPESAFE_API_KEY:''};
const files=(await readdir('tests')).filter(f=>f.endsWith('.test.ts')).map(f=>join('tests',f));
const child=spawn(process.execPath,['--import','tsx','--test',...files],{env,stdio:'inherit'});
const code=await new Promise((r,j)=>{child.on('error',j);child.on('exit',c=>r(c??1))});
await rm(directory,{recursive:true,force:true});process.exitCode=code;
