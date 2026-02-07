import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/constants';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/deepbook/midprice`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ midPrice: null }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch mid-price:', error);
    return NextResponse.json({ midPrice: null }, { status: 500 });
  }
}
