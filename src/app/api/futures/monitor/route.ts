import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/service-auth';
import { enqueue } from '@/lib/jobs';
export async function GET(req:Request) {
 if(!cronAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json({success:true,job:await enqueue('monitor')},{status:202})}
 catch{return NextResponse.json({error:'Unable to queue work'},{status:503})}
}
