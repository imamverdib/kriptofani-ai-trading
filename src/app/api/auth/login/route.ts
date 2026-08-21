import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { dbGet } from '@/lib/db';
import { encrypt } from '@/lib/auth';

// Simple in-memory rate limiter
const rateLimit = new Map<string, { count: number, resetAt: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Rate limiting check
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const identifier = `${ip}_${username}`;
    const now = Date.now();

    let rateData = rateLimit.get(identifier);
    if (rateData) {
      if (now < rateData.resetAt) {
        if (rateData.count >= MAX_ATTEMPTS) {
          const minutesLeft = Math.ceil((rateData.resetAt - now) / 60000);
          return NextResponse.json({ 
            error: `Too many failed attempts. Please try again in ${minutesLeft} minutes.` 
          }, { status: 429 });
        }
      } else {
        rateData = { count: 0, resetAt: now + BLOCK_DURATION_MS };
      }
    } else {
      rateData = { count: 0, resetAt: now + BLOCK_DURATION_MS };
    }

    const user: any = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      rateData.count += 1;
      rateLimit.set(identifier, rateData);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      rateData.count += 1;
      rateLimit.set(identifier, rateData);
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Reset on success
    rateLimit.delete(identifier);

    // Determine if setup is complete
    const setupComplete = !!(user.binance_api_key && user.binance_api_secret && user.telegram_username);

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = await encrypt({ id: user.id, username: user.username, expires });

    const response = NextResponse.json({ success: true, setupComplete });
    response.cookies.set('session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires,
      path: '/'
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
