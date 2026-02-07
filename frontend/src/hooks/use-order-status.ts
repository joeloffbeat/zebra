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

        // Backend returns "0xabcdef012345..." (16 chars + "...")
        const commitmentPrefix = order.commitment.slice(0, 16) + '...';

        const isMatch =
          match.commitmentAPrefix === commitmentPrefix ||
          match.commitmentBPrefix === commitmentPrefix;

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
