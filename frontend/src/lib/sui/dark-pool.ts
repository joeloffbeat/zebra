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
  // Generate random secret and nonce
  const secretBytes = crypto.getRandomValues(new Uint8Array(31));
  const secret = BigInt('0x' + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  const nonce = BigInt(Date.now());

  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = BigInt(CONTRACTS.DARK_POOL_OBJECT.slice(2) || '1');

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

  // Convert to Sui format (little-endian)
  const proofBytes = proofToSuiFormat(proofResult.proof);
  const publicInputBytes = publicSignalsToSuiFormat(proofResult.publicSignals);
  const commitmentBytes = hexToBytes(proofResult.commitment);
  const nullifierBytes = hexToBytes(proofResult.nullifier);

  // Encrypt order details with Seal
  let encryptedData = new Uint8Array(0);
  if (SEAL_ALLOWLIST_ID) {
    try {
      const { encryptedBytes } = await encryptOrderData(
        {
          side: params.side === 'buy' ? 1 : 0,
          price: params.price,
          amount: params.amount,
          expiry: params.expiry,
        },
        SEAL_ALLOWLIST_ID,
      );
      encryptedData = new Uint8Array(encryptedBytes);
    } catch (error) {
      console.warn('Seal encryption failed, submitting without encrypted data:', error);
    }
  }

  // Build transaction
  const tx = new Transaction();

  const target = params.side === 'buy'
    ? `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_buy_order`
    : `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_sell_order`;

  const vecU8 = bcs.vector(bcs.u8());

  tx.moveCall({
    target,
    arguments: [
      tx.object(CONTRACTS.DARK_POOL_OBJECT),
      tx.object(params.coinObjectId),
      tx.pure(vecU8.serialize(Array.from(proofBytes))),
      tx.pure(vecU8.serialize(Array.from(publicInputBytes))),
      tx.pure(vecU8.serialize(Array.from(commitmentBytes))),
      tx.pure(vecU8.serialize(Array.from(nullifierBytes))),
      tx.pure(bcs.u64().serialize(params.expiry)),
      tx.pure(vecU8.serialize(Array.from(encryptedData))),
    ],
    typeArguments: [
      '0x2::sui::SUI',
      '0x2::sui::SUI',
    ],
  });

  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });

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
  isBid: boolean,
  signer: { signAndExecuteTransaction: (args: { transaction: Transaction }) => Promise<{ digest: string }> }
): Promise<string> {
  const tx = new Transaction();

  const target = isBid
    ? `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::cancel_buy_order`
    : `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::cancel_sell_order`;

  const vecU8 = bcs.vector(bcs.u8());

  tx.moveCall({
    target,
    arguments: [
      tx.object(CONTRACTS.DARK_POOL_OBJECT),
      tx.pure(vecU8.serialize(Array.from(hexToBytes(commitment)))),
    ],
    typeArguments: [
      '0x2::sui::SUI',
      '0x2::sui::SUI',
    ],
  });

  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });

  return result.digest;
}
