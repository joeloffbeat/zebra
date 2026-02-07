import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { CONTRACTS } from './client';
import { SubmitOrderParams, HiddenOrder } from './types';
import { generateOrderProof, proofToSuiFormat, publicSignalsToSuiFormat, hexToBytes } from '../zk/prover';
import { encryptOrderData } from '../seal/client';

const SEAL_ALLOWLIST_ID = process.env.NEXT_PUBLIC_SEAL_ALLOWLIST_ID || '';

export async function submitHiddenOrder(
  params: SubmitOrderParams,
  signer: { signAndExecuteTransaction: (args: { transaction: Transaction }) => Promise<{ digest: string }> }
): Promise<HiddenOrder> {
  console.log('[ZEBRA] Starting order submission...', params);

  // Seal encryption is mandatory
  if (!SEAL_ALLOWLIST_ID) {
    console.error('[ZEBRA] SEAL_ALLOWLIST_ID not configured');
    throw new Error('SEAL_ALLOWLIST_ID not configured — Seal encryption is mandatory');
  }

  // Generate random secret and nonce
  const secretBytes = crypto.getRandomValues(new Uint8Array(31));
  const secret = BigInt('0x' + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  const nonce = BigInt(Date.now());

  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = 1n;

  console.log('[ZEBRA] Generating ZK proof...');
  // Generate ZK proof
  const proofResult = await generateOrderProof({
    secret,
    side: params.side === 'buy' ? 1 : 0,
    amount: params.amount,
    price: params.price,
    expiry: params.expiry,
    nonce,
    userBalance: params.amount * 2n,
    currentTime,
    poolId,
  });
  console.log('[ZEBRA] ZK proof generated:', proofResult.commitment.slice(0, 20) + '...');

  // Convert to Sui format (little-endian)
  const proofBytes = proofToSuiFormat(proofResult.proof);
  const publicInputBytes = publicSignalsToSuiFormat(proofResult.publicSignals);
  const commitmentBytes = hexToBytes(proofResult.commitment);
  const nullifierBytes = hexToBytes(proofResult.nullifier);

  console.log('[ZEBRA] Encrypting order with Seal...');
  // Encrypt order details with Seal (mandatory)
  const { encryptedBytes } = await encryptOrderData(
    {
      side: params.side === 'buy' ? 1 : 0,
      price: params.price,
      amount: params.amount,
    },
    SEAL_ALLOWLIST_ID,
  );
  const encryptedData = new Uint8Array(encryptedBytes);
  console.log('[ZEBRA] Order encrypted, building transaction...');

  // Build transaction — unified submit_order, single type arg, splitCoins for locking
  const tx = new Transaction();
  tx.setGasBudget(10_000_000);

  const vecU8 = bcs.vector(bcs.u8());

  // Split exact amount from gas coin for locking
  const [lockCoin] = tx.splitCoins(tx.gas, [params.amount]);

  tx.moveCall({
    target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_order`,
    arguments: [
      tx.object(CONTRACTS.DARK_POOL_OBJECT),
      lockCoin,
      tx.pure(vecU8.serialize(Array.from(proofBytes))),
      tx.pure(vecU8.serialize(Array.from(publicInputBytes))),
      tx.pure(vecU8.serialize(Array.from(commitmentBytes))),
      tx.pure(vecU8.serialize(Array.from(nullifierBytes))),
      tx.pure(vecU8.serialize(Array.from(encryptedData))),
    ],
    typeArguments: ['0x2::sui::SUI'],
  });

  console.log('[ZEBRA] Requesting signature...');
  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });
  console.log('[ZEBRA] Transaction submitted:', result.digest);

  return {
    id: crypto.randomUUID(),
    commitment: proofResult.commitment,
    nullifier: proofResult.nullifier,
    secret: secret.toString(),
    nonce: nonce.toString(),
    side: params.side,
    amount: params.amount.toString(),
    price: params.price.toString(),
    expiry: params.expiry.toString(),
    status: 'pending',
    createdAt: Date.now(),
    txDigest: result.digest,
  };
}

export async function cancelOrder(
  commitment: string,
  signer: { signAndExecuteTransaction: (args: { transaction: Transaction }) => Promise<{ digest: string }> }
): Promise<string> {
  const tx = new Transaction();
  tx.setGasBudget(10_000_000);

  const vecU8 = bcs.vector(bcs.u8());

  tx.moveCall({
    target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::cancel_order`,
    arguments: [
      tx.object(CONTRACTS.DARK_POOL_OBJECT),
      tx.pure(vecU8.serialize(Array.from(hexToBytes(commitment)))),
    ],
    typeArguments: ['0x2::sui::SUI'],
  });

  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });

  return result.digest;
}
