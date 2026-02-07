import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/flash-loan/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Flash loan failed' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to execute flash loan:', error);
    return NextResponse.json({ error: 'Flash loan failed' }, { status: 500 });
  }
}
