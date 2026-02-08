import { NextResponse } from 'next/server';
import { MATCHING_ENGINE_URL } from '@/lib/constants';

export async function GET() {
  try {
    const res = await fetch(`${MATCHING_ENGINE_URL}/tee/attestations`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ attestations: [] }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch TEE attestations:', error);
    return NextResponse.json({ attestations: [] }, { status: 500 });
  }
}
