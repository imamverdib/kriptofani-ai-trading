import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){const {dailyBackup}=await import('../src/lib/scheduled-backup');const {checkWorker}=await import('../src/lib/watchdog');const {deliverNotifications}=await import('../src/lib/outbox');let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});while(!stopping){try{await checkWorker();await deliverNotifications();await dailyBackup()}catch(e){console.error('Watchdog failed',e instanceof Error?e.message:'failure')}await new Promise(r=>setTimeout(r,5000))}}
main().catch(()=>{process.exitCode=1});
