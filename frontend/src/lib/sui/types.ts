export interface HiddenOrder {
  id: string;
  commitment: string;
  nullifier: string;
  secret: string;
  nonce: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
  expiry: string;
  status: 'pending' | 'matched' | 'settled' | 'cancelled' | 'expired';
  createdAt: number;
  txDigest: string;
}

export interface SubmitOrderParams {
  side: 'buy' | 'sell';
  amount: bigint;
  price: bigint;
  expiry: bigint;
  coinObjectId: string;
}

export interface ProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  commitment: string;
  nullifier: string;
}

export interface OrderInput {
  secret: bigint;
  side: number;
  amount: bigint;
  price: bigint;
  expiry: bigint;
  nonce: bigint;
  userBalance: bigint;
  currentTime: bigint;
  poolId: bigint;
}
