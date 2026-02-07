import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/tee/metrics`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Backend unavailable' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch TEE metrics:', error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
