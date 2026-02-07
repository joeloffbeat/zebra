export interface Receiver {
  address: string;
  percentage: number; // 0-100 integer
}

/**
 * If receivers array is empty, default to owner at 100%.
 */
export function resolveReceivers(receivers: Receiver[] | undefined, ownerAddress: string): Receiver[] {
  if (!receivers || receivers.length === 0) {
    return [{ address: ownerAddress, percentage: 100 }];
  }
  return receivers;
}

/**
 * Compute integer split amounts with last-gets-remainder pattern.
 */
export function computeSplitAmounts(totalPayout: bigint, receivers: Receiver[]): { address: string; amount: bigint }[] {
  let sent = 0n;
  const results: { address: string; amount: bigint }[] = [];

  for (let i = 0; i < receivers.length - 1; i++) {
    const amount = (totalPayout * BigInt(receivers[i].percentage)) / 100n;
    results.push({ address: receivers[i].address, amount });
    sent += amount;
  }

  // Last receiver gets remainder
  results.push({
    address: receivers[receivers.length - 1].address,
    amount: totalPayout - sent,
  });

  return results;
}
