import type {AppUser,Ticket} from '@/lib/app-types';
import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet, dbRun } from '@/lib/db';
import { sendMessageToUser } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const me = await dbGet<AppUser>("SELECT role FROM users WHERE id = ?", [session.id]);
    if (!me || me.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { ticketId, reply } = await req.json();

    const ticket = await dbGet<Ticket>("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    await dbRun("UPDATE support_tickets SET status = 'answered', admin_reply = ? WHERE id = ?", [reply, ticketId]);
    
    // Add to notifications
    await dbRun("INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)", [
        ticket.user_id, 
        'Dəstək Sorğunuza Cavab', 
        `Sizin sorğunuza admin cavab verdi:\n\n${reply}`
    ]);

    // Send telegram
    const user = await dbGet<AppUser>("SELECT telegram_chat_id FROM users WHERE id = ?", [ticket.user_id]);
    if (user && user.telegram_chat_id) {
        await sendMessageToUser(ticket.user_id, user.telegram_chat_id, `📩 *Dəstək Sorğunuza Cavab:*\n\n${reply}\n\n_Əlavə sualınız olarsa panelin Dəstək bölməsindən yenidən yaza bilərsiniz._`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
