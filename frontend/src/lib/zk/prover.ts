import { OrderInput, ProofResult } from '../sui/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let snarkjs: any = null;
let circuitWasm: ArrayBuffer | null = null;
let circuitZkey: ArrayBuffer | null = null;

// BN254 base field prime
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const HALF_P = (P - 1n) / 2n;

async function loadSnarkjs() {
  if (!snarkjs) {
    snarkjs = await import('snarkjs');
  }
  return snarkjs;
}

async function loadCircuit() {
  if (!circuitWasm || !circuitZkey) {
    const [wasmResponse, zkeyResponse] = await Promise.all([
      fetch('/circuits/order_commitment.wasm'),
      fetch('/circuits/order_commitment_0000.zkey'),
    ]);
    circuitWasm = await wasmResponse.arrayBuffer();
    circuitZkey = await zkeyResponse.arrayBuffer();
  }
  return { wasm: circuitWasm, zkey: circuitZkey };
}

export async function generateOrderProof(input: OrderInput): Promise<ProofResult> {
  const sn = await loadSnarkjs();
  const { wasm, zkey } = await loadCircuit();

  const circuitInput = {
    secret: input.secret.toString(),
    side: input.side.toString(),
    amount: input.amount.toString(),
    price: input.price.toString(),
    expiry: input.expiry.toString(),
    nonce: input.nonce.toString(),
    user_balance: input.userBalance.toString(),
    current_time: input.currentTime.toString(),
    pool_id: input.poolId.toString(),
  };

  const { proof, publicSignals } = await sn.groth16.fullProve(
    circuitInput,
    new Uint8Array(wasm),
    new Uint8Array(zkey)
  );

  return {
    proof,
    publicSignals,
    commitment: publicSignals[0],
    nullifier: publicSignals[1],
  };
}

// Convert a bigint to 32-byte little-endian Uint8Array
function bigintToLEBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  const hex = value.toString(16).padStart(64, '0');
  for (let j = 0; j < 32; j++) {
    bytes[j] = parseInt(hex.slice((31 - j) * 2, (31 - j) * 2 + 2), 16);
  }
  return bytes;
}

// G1 compressed: 32 bytes = x LE with y sign flag in top bit of byte 31
// Arkworks: 0x80 flag means y > -y (y > halfP)
function g1Compressed(x: bigint, y: bigint): Uint8Array {
  const bytes = bigintToLEBytes(x);
  if (y > HALF_P) {
    bytes[31] |= 0x80;
  }
  return bytes;
}

// G2 compressed: 64 bytes = x.c0 LE (32) + x.c1 LE (32) with y sign flag in top bit of byte 63
// Fp2 sign uses lexicographic ordering: compare c1 first, then c0
function g2Compressed(x_c0: bigint, x_c1: bigint, y_c0: bigint, y_c1: bigint): Uint8Array {
  const c0Bytes = bigintToLEBytes(x_c0);
  const c1Bytes = bigintToLEBytes(x_c1);

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

// Convert snarkjs proof to Sui/Arkworks COMPRESSED format (128 bytes)
export function proofToSuiFormat(proof: ProofResult['proof']): Uint8Array {
  // Compressed: G1(A) + G2(B) + G1(C) = 32 + 64 + 32 = 128 bytes
  const proofA = g1Compressed(BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1]));
  const proofB = g2Compressed(
    BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])
  );
  const proofC = g1Compressed(BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1]));

  const bytes = new Uint8Array(128);
  bytes.set(proofA, 0);
  bytes.set(proofB, 32);
  bytes.set(proofC, 96);
  return bytes;
}

// Convert public signals to Sui format: concatenated 32-byte LE scalars, NO length prefix
export function publicSignalsToSuiFormat(signals: string[]): Uint8Array {
  const result = new Uint8Array(signals.length * 32);
  signals.forEach((signal, i) => {
    const leBytes = bigintToLEBytes(BigInt(signal));
    result.set(leBytes, i * 32);
  });
  return result;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

