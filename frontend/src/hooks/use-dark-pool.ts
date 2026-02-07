'use client';

import { useSignTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useCallback, useState } from 'react';
import { useOrderStore } from '@/lib/stores/order-store';
import { submitHiddenOrder, cancelOrder } from '@/lib/sui/dark-pool';
import { SubmitOrderParams, HiddenOrder } from '@/lib/sui/types';
import type { ProgressCallback } from '@/lib/sui/progress-types';

export function useDarkPool() {
  const { mutateAsync: signTransaction } = useSignTransaction();
  const suiClient = useSuiClient();
  const { addOrder, updateOrderStatus, orders } = useOrderStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wrapper that signs and then executes via SuiClient
  const signAndExecute = useCallback(async ({ transaction }: { transaction: Transaction }) => {
    // Sign the transaction
    const { signature, bytes } = await signTransaction({ transaction });

    // Execute via SuiClient
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true, showEvents: true },
    });

    return { digest: result.digest, effects: result.effects, events: result.events };
  }, [signTransaction, suiClient]);

  const submitOrder = useCallback(async (
    params: SubmitOrderParams,
    onProgress?: ProgressCallback,
    walletAddress?: string
  ): Promise<HiddenOrder | null> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const order = await submitHiddenOrder(params, {
        signAndExecuteTransaction: signAndExecute,
      }, onProgress, walletAddress);

      addOrder(order);
      return order;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit order';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [signAndExecute, addOrder]);

  const cancelOrderByCommitment = useCallback(async (
    commitment: string,
    onProgress?: ProgressCallback
  ): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelOrder(commitment, {
        signAndExecuteTransaction: signAndExecute,
      }, onProgress);

      updateOrderStatus(commitment, 'cancelled');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel order';
      setError(message);
      throw err;
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
