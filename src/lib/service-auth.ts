import { timingSafeEqual } from 'node:crypto';
export function secretMatches(actual:unknown,expected:string|undefined):boolean {
 if(!expected||expected.length<16||typeof actual!=='string'||!actual)return false;
 const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
export function cronAuthorized(req:Request){const secret=process.env.CRON_SECRET;return !!secret&&secret.length>=16&&secretMatches(req.headers.get('authorization'),`Bearer ${secret}`)}
