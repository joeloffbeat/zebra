import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/orders`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ orders: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ orders: [] }, { status: 500 });
  }
}
