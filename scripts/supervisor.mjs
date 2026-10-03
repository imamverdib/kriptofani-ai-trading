import {spawn} from 'node:child_process';
const started=Date.now();let checking=false;
const grouped=process.platform!=='win32',children=new Map(),restarts=new Map();let closing=false;
function signal(child,name){try{if(grouped&&child.pid)process.kill(-child.pid,name);else child.kill(name)}catch(e){if(e.code!=='ESRCH')console.error('Child shutdown failed',e.code)}}
function shutdown(code=0){if(closing)return;closing=true;for(const child of children.values())signal(child,'SIGTERM');setTimeout(()=>{for(const child of children.values())signal(child,'SIGKILL');process.exit(code)},15000).unref();process.exitCode=code}
function launch(name){if(closing)return;const child=spawn('npm',['run',name],{stdio:'inherit',detached:grouped});children.set(name,child);child.on('error',()=>shutdown(1));child.on('exit',()=>{signal(child,'SIGKILL');children.delete(name);if(closing)return;const attempts=(restarts.get(name)||[]).filter(t=>Date.now()-t<60000);attempts.push(Date.now());restarts.set(name,attempts);if(attempts.length>3){console.error(`${name} repeatedly failed; external service restart required`);shutdown(1);return}setTimeout(()=>launch(name),2000*attempts.length)})}
for(const name of ['web','worker','watchdog'])launch(name);
process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());

const healthTimer=setInterval(async()=>{if(closing||checking||Date.now()-started<90000)return;checking=true;try{const r=await fetch('http://127.0.0.1:3005/api/health',{signal:AbortSignal.timeout(5000)});const health=await r.json();if(health.web===true&&health.worker===false){const child=children.get('worker');if(child){signal(child,'SIGTERM');setTimeout(()=>{if(children.get('worker')===child)signal(child,'SIGKILL')},10000).unref()}}}catch{/* Web process exit is handled separately; do not infer worker death from a network failure. */}finally{checking=false}},15000);healthTimer.unref();
