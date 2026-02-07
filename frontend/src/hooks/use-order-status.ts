'use client';

import { useEffect, useRef, useState } from 'react';
import { useBackend, BackendMatch } from './use-backend';
import { useOrderStore } from '@/lib/stores/order-store';

export function useOrderStatus() {
  const { matches } = useBackend();
  const { orders, updateOrderStatus } = useOrderStore();
  const [latestMatch, setLatestMatch] = useState<BackendMatch | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const seenSettlements = useRef(new Set<string>());

  useEffect(() => {
    if (!matches.data || !orders.length) return;

    for (const match of matches.data) {
      const key = `${match.commitmentAPrefix}-${match.commitmentBPrefix}`;

      // Find if any local order matches this commitment prefix
      for (const order of orders) {
        const orderStatus = order.status as string;
        if (orderStatus === 'settled' || orderStatus === 'cancelled') continue;

        // Backend commitment has 0x prefix, frontend doesn't.
        // Backend prefix = "0x8730771963424836".slice(0,16)+"..." = "0x87307719634248..."
        // Frontend commitment = "8730771963424836..."
        // After stripping 0x and "...", lengths differ (14 vs 16), so use startsWith.
        const strip = (s: string) =>
          s.replace(/\.{3}$/, '').replace(/^0x/i, '').toLowerCase();

        const orderPrefix = strip(order.commitment.slice(0, 20));
        const prefixA = strip(match.commitmentAPrefix);
        const prefixB = strip(match.commitmentBPrefix);

        const isMatch =
          orderPrefix.startsWith(prefixA) || prefixA.startsWith(orderPrefix) ||
          orderPrefix.startsWith(prefixB) || prefixB.startsWith(orderPrefix);

        if (isMatch) {
          // DeepBook flash loan settlements have "deepbook:" prefix in commitmentB
          // These skip the "matched" intermediate state — go straight to settled
          const isDeepBookSettlement = match.commitmentBPrefix.startsWith('deepbook:');

          if (match.settled && orderStatus !== 'settled') {
            updateOrderStatus(order.commitment, 'settled');

            if (!seenSettlements.current.has(key)) {
              seenSettlements.current.add(key);
              setLatestMatch(match);
              setShowMatchModal(true);
            }
          } else if (!match.settled && order.status === 'pending' && !isDeepBookSettlement) {
            updateOrderStatus(order.commitment, 'matched');
          }
        }
      }
    }
  }, [matches.data, orders, updateOrderStatus]);

  return {
    latestMatch,
    showMatchModal,
    setShowMatchModal,
  };
}
