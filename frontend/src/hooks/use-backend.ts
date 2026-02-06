'use client';

import { useQuery, useMutation } from '@tanstack/react-query';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

async function fetchBackend(path: string) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new Error(`Backend ${path}: ${res.status}`);
  return res.json();
}

async function postBackend(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Backend POST ${path}: ${res.status}`);
  return res.json();
}

export interface BackendStatus {
  status: string;
  matcherAddress: string;
  sealConfigured: boolean;
  teeMode: string;
  uptime: number;
  orderBook: { bids: number; asks: number; pendingDecryption: number };
}

export interface BackendOrder {
  commitmentPrefix: string;
  owner: string;
  timestamp: number;
  side: 'buy' | 'sell';
}

export interface BackendMatch {
  buyerCommitmentPrefix: string;
  sellerCommitmentPrefix: string;
  timestamp: number;
  settled: boolean;
  settlementDigest?: string;
}

export interface TeeMetrics {
  teeMode: string;
  publicKey: string;
  matcherAddress: string;
  uptime: number;
  metrics: {
    ordersReceived: number;
    ordersDecrypted: number;
    decryptionFailures: number;
    matchesFound: number;
    settlementsExecuted: number;
    totalVolumeSettled: number;
    flashLoansExecuted: number;
  };
  orderBook: { bids: number; asks: number; pendingDecryption: number };
}

export interface TeeAttestation {
  buyerCommitmentPrefix: string;
  sellerCommitmentPrefix: string;
  signature: string;
  timestamp: number;
}

export function useBackend() {
  const status = useQuery<BackendStatus>({
    queryKey: ['backend-status'],
    queryFn: () => fetchBackend('/status'),
    refetchInterval: 5000,
    retry: 1,
  });

  const orders = useQuery<BackendOrder[]>({
    queryKey: ['backend-orders'],
    queryFn: () => fetchBackend('/orders'),
    refetchInterval: 3000,
    retry: 1,
  });

  const matches = useQuery<BackendMatch[]>({
    queryKey: ['backend-matches'],
    queryFn: () => fetchBackend('/matches'),
    refetchInterval: 3000,
    retry: 1,
  });

  const teeMetrics = useQuery<TeeMetrics>({
    queryKey: ['tee-metrics'],
    queryFn: () => fetchBackend('/tee/metrics'),
    refetchInterval: 5000,
    retry: 1,
  });

  const teeAttestations = useQuery<TeeAttestation[]>({
    queryKey: ['tee-attestations'],
    queryFn: () => fetchBackend('/tee/attestations'),
    refetchInterval: 10000,
    retry: 1,
  });

  const midPrice = useQuery<{ midPrice: number | null }>({
    queryKey: ['deepbook-midprice'],
    queryFn: () => fetchBackend('/deepbook/midprice'),
    refetchInterval: 10000,
    retry: 1,
  });

  const flashLoanDemo = useMutation({
    mutationFn: (params: { pool?: string; amount?: number }) =>
      postBackend('/flash-loan/demo', params),
  });

  return {
    status,
    orders,
    matches,
    teeMetrics,
    teeAttestations,
    midPrice,
    flashLoanDemo,
    backendUrl: BACKEND_URL,
  };
}
