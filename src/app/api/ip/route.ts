import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return NextResponse.json({ ip: data.ip });
  } catch {
    return NextResponse.json({ ip: '187.77.70.77' }); // Fallback
  }
}
