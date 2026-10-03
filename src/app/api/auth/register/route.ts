import {errorMessage} from '@/lib/errors';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { dbGet, dbRun } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password || username.length < 3 || password.length < 6) {
      return NextResponse.json({ error: 'Invalid username or password (min 6 chars)' }, { status: 400 });
    }

    const existingUser = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun("INSERT INTO users (username, password_hash, subscription_status) VALUES (?, ?, 'unpaid')", [username, hash]);
    
    // Default risk config
    await dbRun('INSERT INTO risk_configs (user_id) VALUES (?)', [result.lastID]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
