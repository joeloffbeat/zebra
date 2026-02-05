/**
 * E2E ZK Proof Test — generates a real Groth16 proof and submits it on-chain.
 * Uses Arkworks COMPRESSED format as required by Sui's groth16 module.
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

const NETWORK = 'testnet';
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK) });

const PACKAGE_ID = process.env.DARK_POOL_PACKAGE!;
const POOL_OBJECT_ID = process.env.DARK_POOL_OBJECT!;

// BN254 base field prime
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const HALF_P = (P - 1n) / 2n;

// Convert bigint to 32-byte little-endian
function bigintToLE(val: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = val.toString(16).padStart(64, '0');
  for (let j = 0; j < 32; j++) {
    bytes[j] = parseInt(hex.slice((31 - j) * 2, (31 - j) * 2 + 2), 16);
  }
  return bytes;
}

// G1 compressed: 32 bytes = x LE with y sign flag in top bit of byte 31
function g1Compressed(x: bigint, y: bigint): Uint8Array {
  const bytes = bigintToLE(x);
  if (y > HALF_P) {
    bytes[31] |= 0x80;
  }
  return bytes;
}

// G2 compressed: 64 bytes = x.c0 LE (32) + x.c1 LE (32) with y sign flag in top bit of byte 63
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

async function main() {
  console.log('=== ZK Proof E2E Test (Compressed Format) ===\n');
  console.log('Package:', PACKAGE_ID);
  console.log('Pool:', POOL_OBJECT_ID);

  // 1. Get keypair
  const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();
  console.log('Address:', address);

  const balance = await client.getBalance({ owner: address });
  console.log('Balance:', Number(balance.totalBalance) / 1e9, 'SUI\n');

  // 2. Generate a real ZK proof
  const circuitWasmPath = path.join(__dirname, '../circuits/build/order_commitment_js/order_commitment.wasm');
  const zkeyPath = path.join(__dirname, '../circuits/build/order_commitment_0000.zkey');

  if (!fs.existsSync(circuitWasmPath)) throw new Error('Circuit WASM not found');
  if (!fs.existsSync(zkeyPath)) throw new Error('Zkey not found');

  const secretBytes = crypto.randomBytes(31);
  const secret = BigInt('0x' + secretBytes.toString('hex'));
  const nonce = BigInt(Date.now());
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = BigInt('1');
  const side = 1; // BUY
  const amount = BigInt(50000000); // 0.05 SUI
  const price = BigInt(100000000000);
  const expiry = currentTime + 3600n;
  const userBalance = amount * 2n;

  console.log('Generating ZK proof...');
  console.log('  Side: BUY, Amount: 0.05 SUI, Expiry:', expiry.toString());

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      secret: secret.toString(), side: side.toString(),
      amount: amount.toString(), price: price.toString(),
      expiry: expiry.toString(), nonce: nonce.toString(),
      user_balance: userBalance.toString(),
      current_time: currentTime.toString(),
      pool_id: poolId.toString(),
    },
    circuitWasmPath, zkeyPath,
  );

  console.log('Proof generated! Public signals:', publicSignals.length);

  // 3. Local verify
  const vkey = JSON.parse(fs.readFileSync(path.join(__dirname, '../circuits/build/order_commitment_vkey.json'), 'utf8'));
  const localValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log('Local verification:', localValid ? 'PASS' : 'FAIL');
  if (!localValid) throw new Error('Local proof verification failed!');

  // 4. Convert proof to Arkworks COMPRESSED format
  console.log('\nConverting to Arkworks compressed format...');

  // Proof compressed: G1(A) + G2(B) + G1(C) = 32 + 64 + 32 = 128 bytes
  const proofA = g1Compressed(BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1]));
  const proofB = g2Compressed(
    BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])
  );
  const proofC = g1Compressed(BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1]));

  const proofBytes = new Uint8Array(128);
  proofBytes.set(proofA, 0);
  proofBytes.set(proofB, 32);
  proofBytes.set(proofC, 96);
  console.log('  Proof:', proofBytes.length, 'bytes (compressed)');

  // Public inputs: just concatenated 32-byte LE scalars, NO length prefix
  const publicInputBytes = new Uint8Array(publicSignals.length * 32);
  publicSignals.forEach((s: string, i: number) => {
    publicInputBytes.set(bigintToLE(BigInt(s)), i * 32);
  });
  console.log('  Public inputs:', publicInputBytes.length, 'bytes (', publicSignals.length, 'x 32, no prefix)');

  const commitmentBytes = bigintToLE(BigInt(publicSignals[0]));
  const nullifierBytes = bigintToLE(BigInt(publicSignals[1]));

  // 5. Submit BUY order on-chain
  console.log('\nSubmitting BUY order on-chain...');
  const tx = new Transaction();
  tx.setGasBudget(50000000);

  const [orderCoin] = tx.splitCoins(tx.gas, [amount]);

  tx.moveCall({
    target: `${PACKAGE_ID}::dark_pool::submit_buy_order`,
    arguments: [
      tx.object(POOL_OBJECT_ID),
      orderCoin,
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(proofBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(publicInputBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(commitmentBytes))),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(nullifierBytes))),
      tx.pure(bcs.u64().serialize(Number(expiry))),
      tx.pure(bcs.vector(bcs.u8()).serialize([])), // empty encrypted_data
    ],
    typeArguments: ['0x2::sui::SUI', '0x2::sui::SUI'],
  });

  console.log('Signing and executing...');
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  console.log('\n========================================');
  console.log('Tx digest:', result.digest);
  console.log('Status:', result.effects?.status?.status);

  if (result.effects?.status?.status === 'success') {
    console.log('\n*** ZK PROOF VERIFIED ON-CHAIN! ***');
    console.log('Groth16 proof passed sui::groth16::verify_groth16_proof on testnet.');
    console.log('Compressed format is CORRECT.');

    if (result.events && result.events.length > 0) {
      console.log('\nEvents:');
      for (const event of result.events) {
        console.log('  Type:', event.type);
        const parsed = event.parsedJson as any;
        console.log('  Owner:', parsed?.owner);
        console.log('  Is bid:', parsed?.is_bid);
        console.log('  Locked amount:', parsed?.locked_amount);
      }
    }
  } else {
    console.log('\n*** FAILED ***');
    console.log('Error:', JSON.stringify(result.effects?.status));
  }

  console.log(`\nExplorer: https://suiscan.xyz/${NETWORK}/tx/${result.digest}`);
  console.log('========================================');
}

main().catch(console.error);
