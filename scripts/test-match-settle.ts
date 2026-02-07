/**
 * Full Match & Settle E2E Test
 *
 * 1. Submit a BUY order with ZK proof  (0.02 SUI locked as quote)
 * 2. Submit a SELL order with ZK proof  (0.02 SUI locked as base)
 * 3. Call settle_match() with MatcherCap
 * 4. Verify settlement succeeded
 *
 * Uses Arkworks COMPRESSED format for Groth16 proofs on Sui.
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'mainnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

const PACKAGE_ID = process.env.DARK_POOL_PACKAGE!;
const POOL_OBJECT_ID = process.env.DARK_POOL_OBJECT!;
const MATCHER_CAP_ID = process.env.MATCHER_CAP_ID!;

const TYPE_ARGS: [string, string] = ['0x2::sui::SUI', '0x2::sui::SUI'];

// BN254 base field prime
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const HALF_P = (P - 1n) / 2n;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert bigint to 32-byte little-endian Uint8Array. */
function bigintToLE(val: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = val.toString(16).padStart(64, '0');
  for (let j = 0; j < 32; j++) {
    bytes[j] = parseInt(hex.slice((31 - j) * 2, (31 - j) * 2 + 2), 16);
  }
  return bytes;
}

/** G1 compressed: 32 bytes = x LE, y-sign flag in top bit of byte[31]. */
function g1Compressed(x: bigint, y: bigint): Uint8Array {
  const bytes = bigintToLE(x);
  if (y > HALF_P) {
    bytes[31] |= 0x80;
  }
  return bytes;
}

/** G2 compressed: 64 bytes = (x.c0 LE || x.c1 LE), y-sign flag in top bit of byte[63]. */
function g2Compressed(x_c0: bigint, x_c1: bigint, y_c0: bigint, y_c1: bigint): Uint8Array {
  const c0Bytes = bigintToLE(x_c0);
  const c1Bytes = bigintToLE(x_c1);

  // Fp2 sign: lexicographic on (c1, c0)
  let yIsPositive: boolean;
  if (y_c1 !== 0n) {
    yIsPositive = y_c1 > HALF_P;
  } else {
    yIsPositive = y_c0 > HALF_P;
  }

  if (yIsPositive) {
    c1Bytes[31] |= 0x80;
  }

  const result = new Uint8Array(64);
  result.set(c0Bytes, 0);
  result.set(c1Bytes, 32);
  return result;
}

/** Encode a snarkjs Groth16 proof into 128-byte compressed Arkworks format. */
function encodeProof(proof: any): Uint8Array {
  const proofA = g1Compressed(BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1]));
  const proofB = g2Compressed(
    BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1]),
  );
  const proofC = g1Compressed(BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1]));

  const bytes = new Uint8Array(128);
  bytes.set(proofA, 0);
  bytes.set(proofB, 32);
  bytes.set(proofC, 96);
  return bytes;
}

/** Encode public signals (array of decimal strings) to concatenated 32-byte LE, no length prefix. */
function encodePublicInputs(publicSignals: string[]): Uint8Array {
  const buf = new Uint8Array(publicSignals.length * 32);
  publicSignals.forEach((s, i) => {
    buf.set(bigintToLE(BigInt(s)), i * 32);
  });
  return buf;
}

interface OrderProof {
  proofBytes: Uint8Array;
  publicInputBytes: Uint8Array;
  commitmentBytes: Uint8Array;
  nullifierBytes: Uint8Array;
  expiry: bigint;
}

/** Generate a ZK proof for an order. */
async function generateOrderProof(
  side: number, // 1 = BUY, 0 = SELL
  amount: bigint,
  price: bigint,
): Promise<OrderProof> {
  const circuitWasmPath = path.join(__dirname, '../circuits/build/order_commitment_js/order_commitment.wasm');
  const zkeyPath = path.join(__dirname, '../circuits/build/order_commitment_0000.zkey');

  const secretBytes = crypto.randomBytes(31);
  const secret = BigInt('0x' + secretBytes.toString('hex'));
  const nonce = BigInt(Date.now()) + BigInt(crypto.randomBytes(4).readUInt32BE());
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = BigInt('1');
  const expiry = currentTime + 3600n;
  const userBalance = amount * 2n;

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      secret: secret.toString(),
      side: side.toString(),
      amount: amount.toString(),
      price: price.toString(),
      expiry: expiry.toString(),
      nonce: nonce.toString(),
      user_balance: userBalance.toString(),
      current_time: currentTime.toString(),
      pool_id: poolId.toString(),
    },
    circuitWasmPath,
    zkeyPath,
  );

  // Local verify
  const vkey = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../circuits/build/order_commitment_vkey.json'), 'utf8'),
  );
  const localValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!localValid) throw new Error('Local proof verification failed!');

  // publicSignals order: [commitment, nullifier, user_balance, current_time, pool_id]
  const commitmentBytes = bigintToLE(BigInt(publicSignals[0]));
  const nullifierBytes = bigintToLE(BigInt(publicSignals[1]));

  return {
    proofBytes: encodeProof(proof),
    publicInputBytes: encodePublicInputs(publicSignals),
    commitmentBytes,
    nullifierBytes,
    expiry,
  };
}

function hexStr(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Full Match & Settle E2E Test ===\n');
  console.log('Package:', PACKAGE_ID);
  console.log('Pool:   ', POOL_OBJECT_ID);
  console.log('Matcher:', MATCHER_CAP_ID);

  // Keypair
  const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();
  console.log('Address:', address);

  const balanceBefore = await client.getBalance({ owner: address });
  console.log('Balance:', Number(balanceBefore.totalBalance) / 1e9, 'SUI\n');

  // ── Parameters ────────────────────────────────────────────────────────
  const ORDER_AMOUNT = BigInt(20_000_000);   // 0.02 SUI in MIST
  const EXEC_PRICE = BigInt(1_000_000_000);  // 1:1 price (1e9 scaling)
  const EXEC_AMOUNT = Number(ORDER_AMOUNT);  // settle at full amount
  const QUOTE_COST = Number(ORDER_AMOUNT);   // exec_amount * exec_price / 1e9

  console.log('Order amount: 0.02 SUI (' + ORDER_AMOUNT + ' MIST)');
  console.log('Exec price:   1:1 (' + EXEC_PRICE + ')');
  console.log('Quote cost:   ' + QUOTE_COST + ' MIST\n');

  // ── Step 1: Generate BUY proof ────────────────────────────────────────
  console.log('--- Step 1: Generate BUY order proof ---');
  const buyProof = await generateOrderProof(1, ORDER_AMOUNT, BigInt(100000000000));
  console.log('  Commitment:', hexStr(buyProof.commitmentBytes));
  console.log('  Nullifier: ', hexStr(buyProof.nullifierBytes));
  console.log('  Proof:     ', buyProof.proofBytes.length, 'bytes');
  console.log('  Inputs:    ', buyProof.publicInputBytes.length, 'bytes');
  console.log('  Local verify: PASS');

  // ── Step 2: Generate SELL proof ───────────────────────────────────────
  console.log('\n--- Step 2: Generate SELL order proof ---');
  const sellProof = await generateOrderProof(0, ORDER_AMOUNT, BigInt(100000000000));
  console.log('  Commitment:', hexStr(sellProof.commitmentBytes));
  console.log('  Nullifier: ', hexStr(sellProof.nullifierBytes));
  console.log('  Proof:     ', sellProof.proofBytes.length, 'bytes');
  console.log('  Inputs:    ', sellProof.publicInputBytes.length, 'bytes');
  console.log('  Local verify: PASS');

  // ── Step 3: Submit BUY order on-chain ─────────────────────────────────
  console.log('\n--- Step 3: Submit BUY order on-chain ---');
  const buyTx = new Transaction();
  buyTx.setGasBudget(50_000_000);

  const [buyOrderCoin] = buyTx.splitCoins(buyTx.gas, [ORDER_AMOUNT]);
  buyTx.moveCall({
    target: `${PACKAGE_ID}::dark_pool::submit_buy_order`,
    arguments: [
      buyTx.object(POOL_OBJECT_ID),
      buyOrderCoin,
      buyTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(buyProof.proofBytes))),
      buyTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(buyProof.publicInputBytes))),
      buyTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(buyProof.commitmentBytes))),
      buyTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(buyProof.nullifierBytes))),
      buyTx.pure(bcs.u64().serialize(Number(buyProof.expiry))),
      buyTx.pure(bcs.vector(bcs.u8()).serialize([])), // empty encrypted_data
    ],
    typeArguments: TYPE_ARGS,
  });

  console.log('  Signing and executing...');
  const buyResult = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: buyTx,
    options: { showEffects: true, showEvents: true },
  });

  console.log('  Tx digest:', buyResult.digest);
  console.log('  Status:   ', buyResult.effects?.status?.status);
  if (buyResult.effects?.status?.status !== 'success') {
    console.error('  ERROR:', JSON.stringify(buyResult.effects?.status));
    throw new Error('BUY order submission failed');
  }
  console.log('  BUY order committed on-chain!');
  if (buyResult.events && buyResult.events.length > 0) {
    const parsed = buyResult.events[0].parsedJson as any;
    console.log('  Event - is_bid:', parsed?.is_bid, ', locked_amount:', parsed?.locked_amount);
  }
  console.log('  Explorer: https://suiscan.xyz/' + NETWORK + '/tx/' + buyResult.digest);

  // Wait for tx to be fully committed before submitting next
  console.log('  Waiting for BUY tx to finalize...');
  await client.waitForTransaction({ digest: buyResult.digest });
  console.log('  BUY tx finalized.');

  // ── Step 4: Submit SELL order on-chain ────────────────────────────────
  console.log('\n--- Step 4: Submit SELL order on-chain ---');
  const sellTx = new Transaction();
  sellTx.setGasBudget(50_000_000);

  const [sellOrderCoin] = sellTx.splitCoins(sellTx.gas, [ORDER_AMOUNT]);
  sellTx.moveCall({
    target: `${PACKAGE_ID}::dark_pool::submit_sell_order`,
    arguments: [
      sellTx.object(POOL_OBJECT_ID),
      sellOrderCoin,
      sellTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(sellProof.proofBytes))),
      sellTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(sellProof.publicInputBytes))),
      sellTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(sellProof.commitmentBytes))),
      sellTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(sellProof.nullifierBytes))),
      sellTx.pure(bcs.u64().serialize(Number(sellProof.expiry))),
      sellTx.pure(bcs.vector(bcs.u8()).serialize([])), // empty encrypted_data
    ],
    typeArguments: TYPE_ARGS,
  });

  console.log('  Signing and executing...');
  const sellResult = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: sellTx,
    options: { showEffects: true, showEvents: true },
  });

  console.log('  Tx digest:', sellResult.digest);
  console.log('  Status:   ', sellResult.effects?.status?.status);
  if (sellResult.effects?.status?.status !== 'success') {
    console.error('  ERROR:', JSON.stringify(sellResult.effects?.status));
    throw new Error('SELL order submission failed');
  }
  console.log('  SELL order committed on-chain!');
  if (sellResult.events && sellResult.events.length > 0) {
    const parsed = sellResult.events[0].parsedJson as any;
    console.log('  Event - is_bid:', parsed?.is_bid, ', locked_amount:', parsed?.locked_amount);
  }
  console.log('  Explorer: https://suiscan.xyz/' + NETWORK + '/tx/' + sellResult.digest);

  // Wait for tx to be fully committed before settlement
  console.log('  Waiting for SELL tx to finalize...');
  await client.waitForTransaction({ digest: sellResult.digest });
  console.log('  SELL tx finalized.');

  // ── Step 5: Settle the match ──────────────────────────────────────────
  console.log('\n--- Step 5: Settle match ---');
  console.log('  Buyer commitment: ', hexStr(buyProof.commitmentBytes));
  console.log('  Seller commitment:', hexStr(sellProof.commitmentBytes));
  console.log('  Exec amount:      ', EXEC_AMOUNT, 'MIST');
  console.log('  Exec price:       ', EXEC_PRICE.toString());

  const settleTx = new Transaction();
  settleTx.setGasBudget(50_000_000);

  settleTx.moveCall({
    target: `${PACKAGE_ID}::dark_pool::settle_match`,
    arguments: [
      settleTx.object(POOL_OBJECT_ID),
      settleTx.object(MATCHER_CAP_ID),
      settleTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(buyProof.commitmentBytes))),
      settleTx.pure(bcs.vector(bcs.u8()).serialize(Array.from(sellProof.commitmentBytes))),
      settleTx.pure(bcs.u64().serialize(EXEC_AMOUNT)),
      settleTx.pure(bcs.u64().serialize(Number(EXEC_PRICE))),
    ],
    typeArguments: TYPE_ARGS,
  });

  console.log('  Signing and executing...');
  const settleResult = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: settleTx,
    options: { showEffects: true, showEvents: true },
  });

  console.log('  Tx digest:', settleResult.digest);
  console.log('  Status:   ', settleResult.effects?.status?.status);

  if (settleResult.effects?.status?.status !== 'success') {
    console.error('  ERROR:', JSON.stringify(settleResult.effects?.status));
    throw new Error('Settlement failed');
  }

  console.log('  Settlement succeeded!');
  if (settleResult.events && settleResult.events.length > 0) {
    for (const event of settleResult.events) {
      console.log('  Event type:', event.type);
      const parsed = event.parsedJson as any;
      console.log('    buyer: ', parsed?.buyer);
      console.log('    seller:', parsed?.seller);
      console.log('    amount:', parsed?.amount);
      console.log('    price: ', parsed?.price);
    }
  }
  console.log('  Explorer: https://suiscan.xyz/' + NETWORK + '/tx/' + settleResult.digest);

  // ── Step 6: Verify final state ────────────────────────────────────────
  console.log('\n--- Step 6: Verify settlement ---');

  const balanceAfter = await client.getBalance({ owner: address });
  const balDiff = (Number(balanceAfter.totalBalance) - Number(balanceBefore.totalBalance)) / 1e9;
  console.log('  Balance before:', Number(balanceBefore.totalBalance) / 1e9, 'SUI');
  console.log('  Balance after: ', Number(balanceAfter.totalBalance) / 1e9, 'SUI');
  console.log('  Difference:    ', balDiff.toFixed(6), 'SUI (gas costs)');

  // Check created/deleted objects in settle tx
  const created = settleResult.effects?.created?.length ?? 0;
  const deleted = settleResult.effects?.deleted?.length ?? 0;
  console.log('  Objects created in settle tx:', created);
  console.log('  Objects deleted in settle tx:', deleted);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('         FULL FLOW TEST RESULT         ');
  console.log('========================================');
  console.log('  1. BUY order (ZK proof):   SUCCESS - ' + buyResult.digest);
  console.log('  2. SELL order (ZK proof):  SUCCESS - ' + sellResult.digest);
  console.log('  3. Settlement:             SUCCESS - ' + settleResult.digest);
  console.log('========================================');
  console.log('All three transactions succeeded on Sui mainnet.');
  console.log('The dark pool matching and settlement flow is working end-to-end.');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\n*** TEST FAILED ***');
  console.error(err);
  process.exit(1);
});
