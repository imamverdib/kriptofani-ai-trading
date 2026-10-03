import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {setBotActive} from '@/lib/bot-control';
export async function POST(req:Request){const session=await getSession();if(!session)return NextResponse.json({error:'Unauthorized'},{status:401});try{const body=await req.json();if(typeof body.active!=='boolean')return NextResponse.json({error:'active boolean required'},{status:400});return NextResponse.json({success:true,is_active:await setBotActive(session.id,body.active)})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Control failed'},{status:400})}}
