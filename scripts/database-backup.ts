import {loadEnvConfig} from '@next/env';
import {backupDatabase,restoreDatabase,verifyDatabase} from '../src/lib/database-backup';
loadEnvConfig(process.cwd());
async function main(){const [action,source,destination]=process.argv.slice(2);if(!source||!['backup','restore','verify'].includes(action)||action!=='verify'&&!destination)throw new Error('Usage: npm run db:backup -- backup|restore|verify SOURCE [NEW_DESTINATION]');if(action==='verify')await verifyDatabase(source);else await (action==='backup'?backupDatabase:restoreDatabase)(source,destination);console.log('Database operation verified; no running DB was replaced.')}
main().catch(e=>{console.error(e instanceof Error?e.message:'Backup failed');process.exitCode=1});
