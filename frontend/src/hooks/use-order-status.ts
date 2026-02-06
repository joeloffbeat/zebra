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
      const key = `${match.buyerCommitmentPrefix}-${match.sellerCommitmentPrefix}`;

      // Find if any local order matches this commitment prefix
      for (const order of orders) {
        const orderStatus = order.status as string;
        if (orderStatus === 'settled' || orderStatus === 'cancelled') continue;

        const commitmentPrefix = order.commitment.slice(0, 14);

        const isMatch =
          match.buyerCommitmentPrefix === commitmentPrefix ||
          match.sellerCommitmentPrefix === commitmentPrefix;

        if (isMatch) {
          if (match.settled && orderStatus !== 'settled') {
            updateOrderStatus(order.commitment, 'settled');

            if (!seenSettlements.current.has(key)) {
              seenSettlements.current.add(key);
              setLatestMatch(match);
              setShowMatchModal(true);
            }
          } else if (!match.settled && order.status === 'pending') {
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
