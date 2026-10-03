import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueueManual } from '@/lib/jobs';
export async function POST() {
 const session=await getSession();if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json({success:true,job:await enqueueManual('spot',session.id)},{status:202})}
 catch(e){return NextResponse.json({error:e instanceof Error?errorMessage(e):'Unable to queue work'},{status:409})}
}
