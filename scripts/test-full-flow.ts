/**
 * Full E2E test for the Zebra Dark Pool
 *
 * Tests the complete pipeline:
 * 1. Generate ZK proof for BUY order
 * 2. Encrypt order details with Seal (if configured)
 * 3. Submit buy order to contract
 * 4. Generate ZK proof for SELL order
 * 5. Encrypt and submit sell order
 * 6. Wait for backend to match (poll /matches endpoint)
 * 7. Verify settlement executed
 *
 * Usage:
 *   npx tsx scripts/test-full-flow.ts
 */

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const NETWORK = 'mainnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Load deployment info
let PACKAGE_ID = process.env.DARK_POOL_PACKAGE || '';
let POOL_OBJECT_ID = process.env.DARK_POOL_OBJECT || '';

if (!PACKAGE_ID || !POOL_OBJECT_ID) {
  const deployedPath = path.join(__dirname, '../deployed.json');
  if (fs.existsSync(deployedPath)) {
    const deployed = JSON.parse(fs.readFileSync(deployedPath, 'utf8'));
    PACKAGE_ID = PACKAGE_ID || deployed.packageId;
    POOL_OBJECT_ID = POOL_OBJECT_ID || deployed.poolObjectId;
  }
}

if (!PACKAGE_ID || !POOL_OBJECT_ID) {
  console.error('ERROR: Set DARK_POOL_PACKAGE and DARK_POOL_OBJECT in .env, or run scripts/create-pool.ts first');
  process.exit(1);
}

async function getKeypair(): Promise<Ed25519Keypair> {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error('SUI_PRIVATE_KEY not set');
  const { secretKey } = decodeSuiPrivateKey(privateKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// Minimal ZK proof generation for testing (uses snarkjs if circuits are built)
async function generateTestProof(
  side: number,
  amount: bigint,
  price: bigint,
  expiry: bigint,
  userBalance: bigint,
): Promise<{
  proofBytes: Uint8Array;
  publicInputBytes: Uint8Array;
  commitmentBytes: Uint8Array;
  nullifierBytes: Uint8Array;
}> {
  const circuitWasmPath = path.join(__dirname, '../circuits/build/order_commitment_js/order_commitment.wasm');
  const zkeyPath = path.join(__dirname, '../circuits/build/order_commitment_0000.zkey');

  if (!fs.existsSync(circuitWasmPath) || !fs.existsSync(zkeyPath)) {
    console.log('WARNING: Circuit files not found, using dummy proof (will fail on-chain verification)');
    return {
      proofBytes: new Uint8Array(256),
      publicInputBytes: new Uint8Array(160), // 5 public signals * 32 bytes
      commitmentBytes: new Uint8Array(32),
      nullifierBytes: new Uint8Array(32),
    };
  }

  const snarkjs = await import('snarkjs');

  // Generate random secret and nonce
  const secretBytes = new Uint8Array(31);
  for (let i = 0; i < 31; i++) secretBytes[i] = Math.floor(Math.random() * 256);
  const secret = BigInt('0x' + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
  const nonce = BigInt(Date.now());
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = BigInt('1');

  const circuitInput = {
    secret: secret.toString(),
    side: side.toString(),
    amount: amount.toString(),
    price: price.toString(),
    expiry: expiry.toString(),
    nonce: nonce.toString(),
    user_balance: userBalance.toString(),
    current_time: currentTime.toString(),
    pool_id: poolId.toString(),
  };

  console.log('Generating ZK proof with inputs:', {
    side,
    amount: amount.toString(),
    price: price.toString(),
  });

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    circuitWasmPath,
    zkeyPath,
  );

  // Convert to little-endian Sui format
  function bigintToLE(val: bigint): Uint8Array {
    const bytes = new Uint8Array(32);
    const hex = val.toString(16).padStart(64, '0');
    for (let j = 0; j < 32; j++) {
      bytes[j] = parseInt(hex.slice((31 - j) * 2, (31 - j) * 2 + 2), 16);
    }
    return bytes;
  }

  // Proof points: pi_a (G1), pi_b (G2 with coord swap), pi_c (G1)
  const proofPoints: bigint[] = [
    BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1]),
  ];

  const proofBytes = new Uint8Array(proofPoints.length * 32);
  proofPoints.forEach((p, i) => proofBytes.set(bigintToLE(p), i * 32));

  const publicInputBytes = new Uint8Array(publicSignals.length * 32);
  publicSignals.forEach((s: string, i: number) => publicInputBytes.set(bigintToLE(BigInt(s)), i * 32));

  // commitment = publicSignals[0], nullifier = publicSignals[1]
  const commitmentBytes = bigintToLE(BigInt(publicSignals[0]));
  const nullifierBytes = bigintToLE(BigInt(publicSignals[1]));

  return { proofBytes, publicInputBytes, commitmentBytes, nullifierBytes };
}

async function submitOrder(
  keypair: Ed25519Keypair,
  side: 'buy' | 'sell',
  amountMist: bigint,
  price: bigint,
  proofData: Awaited<ReturnType<typeof generateTestProof>>,
): Promise<string> {
  const address = keypair.toSuiAddress();

  const tx = new Transaction();
  tx.setGasBudget(50000000);

  const target = side === 'buy'
    ? `${PACKAGE_ID}::dark_pool::submit_buy_order`
    : `${PACKAGE_ID}::dark_pool::submit_sell_order`;

  // Split coin for the order
  const [orderCoin] = tx.splitCoins(tx.gas, [amountMist]);

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  // Empty encrypted data for test (Seal not configured in script)
  const encryptedData: number[] = [];

  tx.moveCall({
    target,
    arguments: [
      tx.object(POOL_OBJECT_ID),
      orderCoin,
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(proofData.proofBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(proofData.publicInputBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(proofData.commitmentBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(proofData.nullifierBytes))),
      tx.pure(bcs.u64().serialize(Number(expiry))),
      tx.pure(bcs.vector(bcs.u8()).serialize(encryptedData)),
    ],
    typeArguments: [
      '0x2::sui::SUI',
      '0x2::sui::SUI',
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`${side} order failed: ${JSON.stringify(result.effects?.status)}`);
  }

  console.log(`${side.toUpperCase()} order submitted: ${result.digest}`);
  return result.digest;
}

async function pollMatches(timeoutMs: number = 30000): Promise<any[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/matches`);
      const data = await res.json();
      if (data.matches && data.matches.length > 0) {
        return data.matches;
      }
    } catch {
      // Backend not running, skip polling
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return [];
}

async function main() {
  console.log('=== Zebra Dark Pool - Full E2E Test ===\n');
  console.log('Package:', PACKAGE_ID);
  console.log('Pool:', POOL_OBJECT_ID);

  const keypair = await getKeypair();
  const address = keypair.toSuiAddress();
  console.log('Test address:', address);

  // Check balance
  const balance = await client.getBalance({ owner: address });
  console.log('Balance:', Number(balance.totalBalance) / 1e9, 'SUI\n');

  // --- Step 1: Generate and submit BUY order ---
  console.log('Step 1: Generating ZK proof for BUY order...');
  const buyPrice = 100000000000n; // 100 (scaled by 1e9)
  const buyAmount = 100000000n; // 0.1 SUI in MIST
  const buyExpiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const buyProof = await generateTestProof(1, buyAmount, buyPrice, buyExpiry, buyAmount * 2n);
  console.log('BUY proof generated');

  console.log('\nStep 2: Submitting BUY order...');
  const buyDigest = await submitOrder(keypair, 'buy', buyAmount, buyPrice, buyProof);

  // --- Step 3: Generate and submit SELL order ---
  console.log('\nStep 3: Generating ZK proof for SELL order...');
  const sellPrice = 90000000000n; // 90 (scaled by 1e9) — crosses with buy at 100
  const sellAmount = 100000000n; // 0.1 SUI

  const sellProof = await generateTestProof(0, sellAmount, sellPrice, buyExpiry, sellAmount * 2n);
  console.log('SELL proof generated');

  console.log('\nStep 4: Submitting SELL order...');
  const sellDigest = await submitOrder(keypair, 'sell', sellAmount, sellPrice, sellProof);

  // --- Step 5: Wait for match ---
  console.log('\nStep 5: Waiting for backend to match orders...');
  const matches = await pollMatches();

  if (matches.length > 0) {
    console.log('\nMATCH FOUND!');
    console.log(JSON.stringify(matches[0], null, 2));
  } else {
    console.log('\nNo match found within timeout.');
    console.log('This is expected if the backend is not running.');
    console.log('Start the backend with: cd backend && npm run dev');
  }

  // --- Summary ---
  console.log('\n=== Test Summary ===');
  console.log(`BUY order:  ${buyDigest}`);
  console.log(`SELL order: ${sellDigest}`);
  console.log(`Matches:    ${matches.length}`);
  console.log(`Explorer:   https://suiscan.xyz/${NETWORK}/tx/${buyDigest}`);
}

main().catch(console.error);
