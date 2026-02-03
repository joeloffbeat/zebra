'use client';

import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { useCallback, useState } from 'react';
import { useOrderStore } from '@/lib/stores/order-store';
import { submitHiddenOrder, cancelOrder } from '@/lib/sui/dark-pool';
import { SubmitOrderParams, HiddenOrder } from '@/lib/sui/types';

export function useDarkPool() {
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
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
    } catch (err: any) {
      setError(err.message || 'Failed to submit order');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [signAndExecute, addOrder]);

  const cancelOrderByCommitment = useCallback(async (
    commitment: string,
    isBid: boolean
  ): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelOrder(commitment, isBid, {
        signAndExecuteTransaction: signAndExecute,
      });

      updateOrderStatus(commitment, 'cancelled');
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
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
