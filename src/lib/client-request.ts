/** A rejected settings write must not be displayed as a successful pause/risk update. */
export async function checkedFetch(input:RequestInfo|URL,init?:RequestInit){const response=await fetch(input,init);if(!response.ok){const data=await response.json().catch(()=>({error:'Request failed'}));throw new Error(typeof data.error==='string'?data.error:`HTTP ${response.status}`)}return response}
