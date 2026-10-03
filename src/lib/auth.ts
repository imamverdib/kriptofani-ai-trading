import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import type {NextRequest} from 'next/server';
function signingKey(){const secret=process.env.JWT_SECRET;if(!secret||secret.length<32)throw new Error('JWT_SECRET must contain at least 32 characters');return new TextEncoder().encode(secret)}
export interface Session extends JWTPayload {id:number;username:string;expires?:string}
export async function encrypt(payload:JWTPayload) {
 return new SignJWT(payload).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('24h').sign(signingKey());
}
export async function decrypt(input:string):Promise<Session>{
 const {payload}=await jwtVerify(input,signingKey(),{algorithms:['HS256']});
 if(!Number.isSafeInteger(payload.id)||Number(payload.id)<=0||typeof payload.username!=='string')throw new Error('Invalid session');
 return {...payload,id:Number(payload.id),username:payload.username};
}
export async function getSession(){const value=(await cookies()).get('session')?.value;if(!value)return null;try{return await decrypt(value)}catch{return null}}
export async function updateSession(request:NextRequest){
 const token=request.cookies.get('session')?.value;if(!token)return;
 const parsed=await decrypt(token),expires=new Date(Date.now()+86400000);parsed.expires=expires.toISOString();
 const res=new Response();res.headers.append('Set-Cookie',`session=${await encrypt(parsed)}; Path=/; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV==='production'?'Secure; ':''}Expires=${expires.toUTCString()}`);return res;
}
