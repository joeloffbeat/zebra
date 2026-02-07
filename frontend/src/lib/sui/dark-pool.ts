import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { CONTRACTS, suiClient } from './client';
import { SubmitOrderParams, HiddenOrder } from './types';
import { generateOrderProof, proofToSuiFormat, publicSignalsToSuiFormat, hexToBytes } from '../zk/prover';
import { encryptOrderData } from '../seal/client';
import { SEAL_ALLOWLIST_ID, DBUSDC_TYPE } from '../constants';
import type { ProgressCallback } from './progress-types';

export async function submitHiddenOrder(
  params: SubmitOrderParams,
  signer: { signAndExecuteTransaction: (args: { transaction: Transaction }) => Promise<{ digest: string }> },
  onProgress?: ProgressCallback,
  walletAddress?: string
): Promise<HiddenOrder> {
  console.log('[ZEBRA] Starting order submission...', params);

  if (!SEAL_ALLOWLIST_ID) {
    console.error('[ZEBRA] SEAL_ALLOWLIST_ID not configured');
    throw new Error('SEAL_ALLOWLIST_ID not configured — Seal encryption is mandatory');
  }

  const secretBytes = crypto.getRandomValues(new Uint8Array(31));
  const secret = BigInt('0x' + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  const nonce = BigInt(Date.now());
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = 1n;

  onProgress?.("zk-proof", "active");
  console.log('[ZEBRA] Generating ZK proof...');
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
  onProgress?.("zk-proof", "complete", undefined, {
    proof: JSON.stringify(proofResult.proof),
    commitment: proofResult.commitment,
    nullifier: proofResult.nullifier,
  });

  const proofBytes = proofToSuiFormat(proofResult.proof);
  const publicInputBytes = publicSignalsToSuiFormat(proofResult.publicSignals);
  const commitmentBytes = hexToBytes(proofResult.commitment);
  const nullifierBytes = hexToBytes(proofResult.nullifier);

  onProgress?.("seal-encrypt", "active");
  console.log('[ZEBRA] Encrypting order with Seal...');
  const { encryptedBytes } = await encryptOrderData(
    {
      side: params.side === 'buy' ? 1 : 0,
      price: params.price,
      amount: params.amount,
      receivers: params.receivers,
    },
    SEAL_ALLOWLIST_ID,
  );
  const encryptedData = new Uint8Array(encryptedBytes);
  const encryptedHex = Array.from(encryptedData).map(b => b.toString(16).padStart(2, '0')).join('');
  console.log('[ZEBRA] Order encrypted, building transaction...');
  onProgress?.("seal-encrypt", "complete", undefined, {
    encryptedHex,
    byteLength: String(encryptedData.length),
  });

  onProgress?.("submit-tx", "active");

  let tx: Transaction;
  try {
    tx = new Transaction();
    tx.setGasBudget(10_000_000);
    const vecU8 = bcs.vector(bcs.u8());

    if (params.side === 'sell') {
      // SELL: lock SUI (BaseCoin) — split from gas
      const [lockCoin] = tx.splitCoins(tx.gas, [params.amount]);

      tx.moveCall({
        target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_sell_order`,
        arguments: [
          tx.object(CONTRACTS.DARK_POOL_OBJECT),
          lockCoin,
          tx.pure(vecU8.serialize(Array.from(proofBytes))),
          tx.pure(vecU8.serialize(Array.from(publicInputBytes))),
          tx.pure(vecU8.serialize(Array.from(commitmentBytes))),
          tx.pure(vecU8.serialize(Array.from(nullifierBytes))),
          tx.pure(vecU8.serialize(Array.from(encryptedData))),
        ],
        typeArguments: ['0x2::sui::SUI', DBUSDC_TYPE],
      });
    } else {
      // BUY: lock DBUSDC (QuoteCoin)
      if (!walletAddress) {
        throw new Error('Wallet address required for BUY orders');
      }

      console.log('[ZEBRA] Fetching DBUSDC coins for:', walletAddress);
      const dbUsdcCoins = await suiClient.getCoins({
        owner: walletAddress,
        coinType: DBUSDC_TYPE,
      });
      console.log('[ZEBRA] Found DBUSDC coins:', dbUsdcCoins.data.length);

      if (dbUsdcCoins.data.length === 0) {
        throw new Error('No DBUSDC tokens found in wallet. Get DBUSDC from DeepBook testnet faucet.');
      }

      const primaryCoin = tx.object(dbUsdcCoins.data[0].coinObjectId);

      if (dbUsdcCoins.data.length > 1) {
        const otherCoins = dbUsdcCoins.data.slice(1).map(c => tx.object(c.coinObjectId));
        tx.mergeCoins(primaryCoin, otherCoins);
      }

      const [lockCoin] = tx.splitCoins(primaryCoin, [params.amount]);

      tx.moveCall({
        target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_buy_order`,
        arguments: [
          tx.object(CONTRACTS.DARK_POOL_OBJECT),
          lockCoin,
          tx.pure(vecU8.serialize(Array.from(proofBytes))),
          tx.pure(vecU8.serialize(Array.from(publicInputBytes))),
          tx.pure(vecU8.serialize(Array.from(commitmentBytes))),
          tx.pure(vecU8.serialize(Array.from(nullifierBytes))),
          tx.pure(vecU8.serialize(Array.from(encryptedData))),
        ],
        typeArguments: ['0x2::sui::SUI', DBUSDC_TYPE],
      });
    }
  } catch (buildError) {
    console.error('[ZEBRA] Transaction build failed:', buildError);
    const message = buildError instanceof Error ? buildError.message : 'Failed to build transaction';
    onProgress?.("submit-tx", "error", message);
    throw buildError;
  }

  console.log('[ZEBRA] Requesting signature...');
  console.log('[ZEBRA] Transaction target:', `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_${params.side === 'sell' ? 'sell' : 'buy'}_order`);
  console.log('[ZEBRA] Pool object:', CONTRACTS.DARK_POOL_OBJECT);

  let result;
  try {
    result = await signer.signAndExecuteTransaction({
      transaction: tx,
    });
    console.log('[ZEBRA] Transaction submitted:', result.digest);
    onProgress?.("submit-tx", "complete", undefined, {
      txDigest: result.digest,
    });
  } catch (signError) {
    console.error('[ZEBRA] Sign/execute failed:', signError);
    const message = signError instanceof Error ? signError.message : 'Transaction failed';
    onProgress?.("submit-tx", "error", message);
    throw signError;
  }

  onProgress?.("await-match", "active");

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
    receivers: params.receivers,
    status: 'pending',
    createdAt: Date.now(),
    txDigest: result.digest,
  };
}

export async function cancelOrder(
  commitment: string,
  signer: { signAndExecuteTransaction: (args: { transaction: Transaction }) => Promise<{ digest: string }> },
  onProgress?: ProgressCallback
): Promise<string> {
  onProgress?.("build-tx", "active");

  const tx = new Transaction();
  tx.setGasBudget(10_000_000);

  const vecU8 = bcs.vector(bcs.u8());

  tx.moveCall({
    target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::cancel_order`,
    arguments: [
      tx.object(CONTRACTS.DARK_POOL_OBJECT),
      tx.pure(vecU8.serialize(Array.from(hexToBytes(commitment)))),
    ],
    typeArguments: ['0x2::sui::SUI', DBUSDC_TYPE],
  });

  onProgress?.("build-tx", "complete");
  onProgress?.("sign-execute", "active");

  let result;
  try {
    result = await signer.signAndExecuteTransaction({
      transaction: tx,
    });
    onProgress?.("sign-execute", "complete");
  } catch (signError) {
    const message = signError instanceof Error ? signError.message : 'Transaction failed';
    onProgress?.("sign-execute", "error", message);
    throw signError;
  }

  return result.digest;
}
