import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/flash-loan/pools`);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch pools' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch flash loan pools:', error);
    return NextResponse.json({ error: 'Failed to fetch pools' }, { status: 500 });
  }
}
