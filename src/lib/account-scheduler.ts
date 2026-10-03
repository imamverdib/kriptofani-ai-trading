/** Independent lanes: a pending account never prevents another account's next monitor pass. */
export function scheduleAccounts(ids:number[],pending:Map<number,Promise<void>>,run:(id:number)=>Promise<unknown>,failed:(id:number,error:unknown)=>Promise<unknown>){
 for(const id of ids){if(pending.has(id))continue;const task=Promise.resolve().then(()=>run(id)).then(()=>{},error=>failed(id,error).then(()=>{})).catch(error=>{console.error(`Account lane ${id} failed`,error instanceof Error?error.message:'failure')}).finally(()=>pending.delete(id));pending.set(id,task)}
}
