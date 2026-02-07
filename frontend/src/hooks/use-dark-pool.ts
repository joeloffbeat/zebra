'use client';

import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useCallback, useState } from 'react';
import { useOrderStore } from '@/lib/stores/order-store';
import { submitHiddenOrder, cancelOrder } from '@/lib/sui/dark-pool';
import { SubmitOrderParams, HiddenOrder } from '@/lib/sui/types';

export function useDarkPool() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction({
    execute: { showEffects: true, showEvents: true },
  });
  const { addOrder, updateOrderStatus, orders } = useOrderStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitOrder = useCallback(async (params: SubmitOrderParams): Promise<HiddenOrder | null> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const order = await submitHiddenOrder(params, {
        signAndExecuteTransaction: signAndExecute,
      });

      addOrder(order);
      return order;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit order';
      setError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [signAndExecute, addOrder]);

  const cancelOrderByCommitment = useCallback(async (
    commitment: string,
  ): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelOrder(commitment, {
        signAndExecuteTransaction: signAndExecute,
      });

      updateOrderStatus(commitment, 'cancelled');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel order';
      setError(message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [signAndExecute, updateOrderStatus]);

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const matchedOrders = orders.filter((o) => o.status === 'matched');
  const settledOrders = orders.filter((o) => o.status === 'settled');

  return {
    submitOrder,
    cancelOrder: cancelOrderByCommitment,
    isSubmitting,
    error,
    orders,
    pendingOrders,
    matchedOrders,
    settledOrders,
  };
}
