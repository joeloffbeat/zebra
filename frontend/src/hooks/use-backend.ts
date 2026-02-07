'use client';

import { useQuery, useMutation } from '@tanstack/react-query';

// All requests go through Next.js API routes (server-side proxy to matching engine)
async function fetchApi(path: string) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function postApi(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API POST ${path}: ${res.status}`);
  return res.json();
}

export interface BackendStatus {
  status: string;
  timestamp: number;
  tee: { mode: string; publicKey: string; attestationCount: number };
  matcherAddress: string;
  orderBook: { bids: number; asks: number; pendingDecryption: number };
  recentMatches: number;
}

export interface BackendOrder {
  commitmentPrefix: string;
  timestamp: number;
}

export interface BackendMatch {
  commitmentAPrefix: string;
  commitmentBPrefix: string;
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
  commitmentAPrefix: string;
  commitmentBPrefix: string;
  signature: string;
  timestamp: number;
}

export function useBackend() {
  const status = useQuery<BackendStatus>({
    queryKey: ['backend-status'],
    queryFn: () => fetchApi('/status'),
    refetchInterval: 5000,
    retry: 1,
  });

  const orders = useQuery<BackendOrder[]>({
    queryKey: ['backend-orders'],
    queryFn: async () => {
      const data = await fetchApi('/orders');
      return data.orders || [];
    },
    refetchInterval: 3000,
    retry: 1,
  });

  const matches = useQuery<BackendMatch[]>({
    queryKey: ['backend-matches'],
    queryFn: async () => {
      const data = await fetchApi('/matches');
      return data.matches || [];
    },
    refetchInterval: 3000,
    retry: 1,
  });

  const teeMetrics = useQuery<TeeMetrics>({
    queryKey: ['tee-metrics'],
    queryFn: () => fetchApi('/tee/metrics'),
    refetchInterval: 5000,
    retry: 1,
  });

  const teeAttestations = useQuery<TeeAttestation[]>({
    queryKey: ['tee-attestations'],
    queryFn: async () => {
      const data = await fetchApi('/tee/attestations');
      return data.attestations || [];
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const midPrice = useQuery<{ midPrice: number | null }>({
    queryKey: ['deepbook-midprice'],
    queryFn: () => fetchApi('/deepbook/midprice'),
    refetchInterval: 10000,
    retry: 1,
  });

  const flashLoanDemo = useMutation({
    mutationFn: (params: { pool?: string; amount?: number }) =>
      postApi('/flash-loan/demo', params),
  });

  return {
    status,
    orders,
    matches,
    teeMetrics,
    teeAttestations,
    midPrice,
    flashLoanDemo,
  };
}
