import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { dbGet } from '@/lib/db';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const LOG_PATH = '/app/data/app.log';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await dbGet('SELECT role FROM users WHERE id = ?', [session.id]);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!fs.existsSync(LOG_PATH)) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500'), 1), 2000);
    const search = searchParams.get('search');

    // Run tail command to read the last lines efficiently
    const { stdout } = await execAsync(`tail -n ${limit} ${LOG_PATH}`);
    let logs = stdout.split('\n');

    // Filter empty trailing newline
    if (logs.length > 0 && logs[logs.length - 1] === '') {
      logs.pop();
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      logs = logs.filter(line => line.toLowerCase().includes(lowerSearch));
    }

    return NextResponse.json({ success: true, logs });
  } catch (err: any) {
    console.error('Logs API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await dbGet('SELECT role FROM users WHERE id = ?', [session.id]);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (fs.existsSync(LOG_PATH)) {
      fs.writeFileSync(LOG_PATH, ''); // Truncate logs
    }

    return NextResponse.json({ success: true, message: 'Loglar təmizləndi' });
  } catch (err: any) {
    console.error('Logs DELETE API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
