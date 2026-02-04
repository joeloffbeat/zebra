# Zebra Implementation Plan - Sui ZK Dark Pool

## Overview

This plan covers implementing the complete core logic for Zebra - a Sui-native ZK dark pool for hidden limit orders. We'll build:

1. **ZK Circuits** - Order commitment proofs using Circom/Groth16
2. **Move Smart Contracts** - On-chain verification and order management
3. **Frontend Integration** - Sui SDK, wallet connection, proof generation
4. **Backend Matching Engine** - Off-chain order matching service
5. **Testing & Deployment** - Testnet deployment and verification

---

## Phase 1: Project Structure & Dependencies

### 1.1 Create Project Directories

```
zebra/
├── frontend/           # Existing Next.js UI
├── contracts/          # NEW: Move smart contracts
│   ├── sources/
│   │   ├── dark_pool.move
│   │   ├── order_book.move
│   │   └── settlement.move
│   ├── tests/
│   └── Move.toml
├── circuits/           # NEW: Circom ZK circuits
│   ├── order_commitment.circom
│   ├── build/
│   └── scripts/
├── backend/            # NEW: Matching engine
│   ├── src/
│   └── package.json
└── scripts/            # NEW: Deployment scripts
```

### 1.2 Frontend Dependencies to Add

```json
{
  "@mysten/sui": "^2.1.0",
  "@mysten/dapp-kit": "^1.0.1",
  "@mysten/deepbook-v3": "^1.0.3",
  "snarkjs": "^0.7.0",
  "circomlibjs": "^0.1.7",
  "zustand": "^4.5.0"
}
```

---

## Phase 2: ZK Circuit Design

### 2.1 Order Commitment Circuit

**File:** `circuits/order_commitment.circom`

The circuit proves knowledge of a valid order without revealing details:

```circom
pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// OrderCommitment: Proves valid hidden order for dark pool
// Pattern adapted from private_transfer.circom
template OrderCommitment() {
    // Private inputs (hidden order details)
    signal input secret;           // User's secret (prevents frontrunning)
    signal input side;             // 0 = SELL, 1 = BUY
    signal input amount;           // Order amount (in base units)
    signal input price;            // Limit price (in quote units)
    signal input expiry;           // Expiration timestamp
    signal input nonce;            // Unique order nonce

    // Public inputs
    signal input user_balance;     // User's available balance (for validation)
    signal input current_time;     // Current timestamp (for expiry check)
    signal input pool_id;          // Trading pool identifier

    // Public outputs
    signal output commitment;      // Hash commitment of order
    signal output nullifier;       // Prevents order reuse

    // === Constraint 1: Compute commitment ===
    // commitment = Poseidon(side, amount, price, expiry, nonce, secret)
    component commitment_hasher = Poseidon(6);
    commitment_hasher.inputs[0] <== side;
    commitment_hasher.inputs[1] <== amount;
    commitment_hasher.inputs[2] <== price;
    commitment_hasher.inputs[3] <== expiry;
    commitment_hasher.inputs[4] <== nonce;
    commitment_hasher.inputs[5] <== secret;
    commitment <== commitment_hasher.out;

    // === Constraint 2: Generate nullifier ===
    // nullifier = Poseidon(secret, pool_id) - prevents reusing same secret
    component nullifier_hasher = Poseidon(2);
    nullifier_hasher.inputs[0] <== secret;
    nullifier_hasher.inputs[1] <== pool_id;
    nullifier <== nullifier_hasher.out;

    // === Constraint 3: Validate side (must be 0 or 1) ===
    signal side_check;
    side_check <== side * (side - 1);
    side_check === 0;

    // === Constraint 4: Amount > 0 ===
    component amount_gt_zero = GreaterThan(64);
    amount_gt_zero.in[0] <== amount;
    amount_gt_zero.in[1] <== 0;
    amount_gt_zero.out === 1;

    // === Constraint 5: Price > 0 ===
    component price_gt_zero = GreaterThan(64);
    price_gt_zero.in[0] <== price;
    price_gt_zero.in[1] <== 0;
    price_gt_zero.out === 1;

    // === Constraint 6: Expiry > current_time ===
    component expiry_valid = GreaterThan(64);
    expiry_valid.in[0] <== expiry;
    expiry_valid.in[1] <== current_time;
    expiry_valid.out === 1;

    // === Constraint 7: Sufficient balance ===
    // For BUY: need amount * price in quote currency
    // For SELL: need amount in base currency
    // Simplified: just check amount <= balance
    component balance_sufficient = LessEqThan(64);
    balance_sufficient.in[0] <== amount;
    balance_sufficient.in[1] <== user_balance;
    balance_sufficient.out === 1;
}

component main {public [user_balance, current_time, pool_id]} = OrderCommitment();
```

### 2.2 Circuit Build Process

```bash
# 1. Compile circuit
circom circuits/order_commitment.circom --r1cs --wasm -o circuits/build/

# 2. Download Powers of Tau (one-time)
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau

# 3. Generate proving key
snarkjs groth16 setup circuits/build/order_commitment.r1cs ptau/powersOfTau28_hez_final_16.ptau circuits/build/order_commitment_0000.zkey

# 4. Export verification key
snarkjs zkey export verificationkey circuits/build/order_commitment_0000.zkey circuits/build/order_commitment_vkey.json

# 5. Generate Sui-compatible verification key bytes
node scripts/export_vkey_for_sui.js
```

### 2.3 Verification Key Export Script

**File:** `circuits/scripts/export_vkey_for_sui.js`

```javascript
const fs = require('fs');
const path = require('path');

// Convert snarkjs vkey to Sui groth16 format
function exportVkeyForSui(vkeyPath, outputPath) {
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));

    // Sui expects Arkworks canonical compressed serialization
    // This requires converting the JSON vkey to bytes
    // The exact format depends on the curve (BN254)

    const vkBytes = serializeVkeyForSui(vkey);

    fs.writeFileSync(outputPath, JSON.stringify({
        vk_bytes: '0x' + Buffer.from(vkBytes).toString('hex'),
        curve: 'bn254',
        nPublic: vkey.nPublic
    }, null, 2));

    console.log('Verification key exported for Sui');
}

function serializeVkeyForSui(vkey) {
    // Implementation follows Arkworks serialization format
    // See: https://github.com/MystenLabs/sui/blob/main/docs/content/guides/developer/cryptography/groth16.mdx
    // ... serialization logic
}

exportVkeyForSui(
    path.join(__dirname, '../build/order_commitment_vkey.json'),
    path.join(__dirname, '../build/sui_vkey.json')
);
```

---

## Phase 3: Move Smart Contracts

### 3.1 Dark Pool Module

**File:** `contracts/sources/dark_pool.move`

```move
module zebra::dark_pool {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::groth16;
    use sui::hash::blake2b256;
    use std::vector;

    // ==================== Error Codes ====================
    const EInvalidProof: u64 = 0;
    const EOrderExpired: u64 = 1;
    const ENullifierUsed: u64 = 2;
    const EInsufficientBalance: u64 = 3;
    const EOrderNotFound: u64 = 4;
    const EUnauthorized: u64 = 5;
    const EInvalidReveal: u64 = 6;

    // ==================== Structs ====================

    /// Global dark pool state (shared object)
    public struct DarkPool<phantom BaseAsset, phantom QuoteAsset> has key {
        id: UID,
        // Verification key for Groth16 proofs
        vk_bytes: vector<u8>,
        // Active order commitments: commitment_hash -> OrderCommitment
        commitments: Table<vector<u8>, OrderCommitment>,
        // Used nullifiers (prevents double-spending)
        nullifiers: Table<vector<u8>, bool>,
        // Locked funds for base asset
        base_vault: Balance<BaseAsset>,
        // Locked funds for quote asset
        quote_vault: Balance<QuoteAsset>,
        // Pool configuration
        config: PoolConfig,
    }

    /// Order commitment stored on-chain
    public struct OrderCommitment has store, drop {
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        locked_amount: u64,
        is_bid: bool, // true = buy, false = sell
        created_at: u64,
        expiry: u64,
    }

    /// Pool configuration
    public struct PoolConfig has store, drop {
        min_order_size: u64,
        max_order_size: u64,
        fee_bps: u64, // basis points (100 = 1%)
        pool_id: vector<u8>, // unique identifier for nullifier generation
    }

    /// Order reveal (submitted after match)
    public struct OrderReveal has drop {
        side: u8,      // 0 = sell, 1 = buy
        amount: u64,
        price: u64,
        expiry: u64,
        nonce: u64,
        secret: vector<u8>,
    }

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    // ==================== Events ====================

    public struct OrderCommitted has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        owner: address,
        is_bid: bool,
        locked_amount: u64,
        timestamp: u64,
    }

    public struct OrderMatched has copy, drop {
        pool_id: vector<u8>,
        buyer_commitment: vector<u8>,
        seller_commitment: vector<u8>,
        execution_price: u64,
        amount: u64,
        timestamp: u64,
    }

    public struct OrderCancelled has copy, drop {
        pool_id: vector<u8>,
        commitment: vector<u8>,
        owner: address,
        timestamp: u64,
    }

    public struct OrderSettled has copy, drop {
        pool_id: vector<u8>,
        buyer: address,
        seller: address,
        amount: u64,
        price: u64,
        timestamp: u64,
    }

    // ==================== Initialization ====================

    /// Create a new dark pool
    public fun create_pool<BaseAsset, QuoteAsset>(
        vk_bytes: vector<u8>,
        pool_id: vector<u8>,
        min_order_size: u64,
        max_order_size: u64,
        fee_bps: u64,
        ctx: &mut TxContext
    ): AdminCap {
        let pool = DarkPool<BaseAsset, QuoteAsset> {
            id: object::new(ctx),
            vk_bytes,
            commitments: table::new(ctx),
            nullifiers: table::new(ctx),
            base_vault: balance::zero<BaseAsset>(),
            quote_vault: balance::zero<QuoteAsset>(),
            config: PoolConfig {
                min_order_size,
                max_order_size,
                fee_bps,
                pool_id,
            },
        };

        transfer::share_object(pool);

        AdminCap {
            id: object::new(ctx),
        }
    }

    // ==================== Order Submission ====================

    /// Submit a hidden BUY order with ZK proof
    public fun submit_buy_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        quote_coin: Coin<QuoteAsset>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        expiry: u64,
        ctx: &mut TxContext
    ) {
        // 1. Verify the ZK proof
        verify_proof(pool, &proof_points, &public_inputs);

        // 2. Check nullifier not used
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        // 3. Lock the quote funds
        let locked_amount = coin::value(&quote_coin);
        let coin_balance = coin::into_balance(quote_coin);
        balance::join(&mut pool.quote_vault, coin_balance);

        // 4. Store commitment
        let order = OrderCommitment {
            commitment: commitment,
            nullifier: nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_bid: true,
            created_at: tx_context::epoch(ctx),
            expiry,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        // 5. Emit event
        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            is_bid: true,
            locked_amount,
            timestamp: tx_context::epoch(ctx),
        });
    }

    /// Submit a hidden SELL order with ZK proof
    public fun submit_sell_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        base_coin: Coin<BaseAsset>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        commitment: vector<u8>,
        nullifier: vector<u8>,
        expiry: u64,
        ctx: &mut TxContext
    ) {
        // 1. Verify the ZK proof
        verify_proof(pool, &proof_points, &public_inputs);

        // 2. Check nullifier not used
        assert!(!table::contains(&pool.nullifiers, nullifier), ENullifierUsed);

        // 3. Lock the base funds
        let locked_amount = coin::value(&base_coin);
        let coin_balance = coin::into_balance(base_coin);
        balance::join(&mut pool.base_vault, coin_balance);

        // 4. Store commitment
        let order = OrderCommitment {
            commitment: commitment,
            nullifier: nullifier,
            owner: tx_context::sender(ctx),
            locked_amount,
            is_bid: false,
            created_at: tx_context::epoch(ctx),
            expiry,
        };

        table::add(&mut pool.commitments, commitment, order);
        table::add(&mut pool.nullifiers, nullifier, true);

        // 5. Emit event
        event::emit(OrderCommitted {
            pool_id: pool.config.pool_id,
            commitment,
            nullifier,
            owner: tx_context::sender(ctx),
            is_bid: false,
            locked_amount,
            timestamp: tx_context::epoch(ctx),
        });
    }

    // ==================== Proof Verification ====================

    /// Verify a Groth16 proof using Sui's native module
    fun verify_proof<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
        proof_points: &vector<u8>,
        public_inputs: &vector<u8>,
    ) {
        // Prepare verification key
        let pvk = groth16::prepare_verifying_key(
            &groth16::bn254(),
            &pool.vk_bytes
        );

        // Create proof inputs
        let proof = groth16::proof_points_from_bytes(*proof_points);
        let inputs = groth16::public_proof_inputs_from_bytes(*public_inputs);

        // Verify
        let valid = groth16::verify_groth16_proof(
            &groth16::bn254(),
            &pvk,
            &inputs,
            &proof
        );

        assert!(valid, EInvalidProof);
    }

    // ==================== Order Cancellation ====================

    /// Cancel an order and refund locked funds
    public fun cancel_order<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        commitment: vector<u8>,
        ctx: &mut TxContext
    ): Coin<BaseAsset> { // or Coin<QuoteAsset> depending on order type
        // 1. Get and verify order
        assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
        let order = table::remove(&mut pool.commitments, commitment);

        // 2. Verify ownership
        assert!(order.owner == tx_context::sender(ctx), EUnauthorized);

        // 3. Refund based on order type
        let refund = if (order.is_bid) {
            // Refund quote asset
            let quote_balance = balance::split(&mut pool.quote_vault, order.locked_amount);
            coin::from_balance(quote_balance, ctx)
        } else {
            // Refund base asset
            let base_balance = balance::split(&mut pool.base_vault, order.locked_amount);
            coin::from_balance(base_balance, ctx)
        };

        // 4. Emit event
        event::emit(OrderCancelled {
            pool_id: pool.config.pool_id,
            commitment,
            owner: order.owner,
            timestamp: tx_context::epoch(ctx),
        });

        // Note: This is simplified - actual implementation needs type handling
        abort 0 // Placeholder - needs proper coin type handling
    }

    // ==================== Settlement ====================

    /// Settle a matched order pair
    /// Called by matching engine after finding a cross
    public fun settle_match<BaseAsset, QuoteAsset>(
        pool: &mut DarkPool<BaseAsset, QuoteAsset>,
        buyer_commitment: vector<u8>,
        seller_commitment: vector<u8>,
        buyer_reveal: OrderReveal,
        seller_reveal: OrderReveal,
        ctx: &mut TxContext
    ) {
        // 1. Verify both orders exist
        assert!(table::contains(&pool.commitments, buyer_commitment), EOrderNotFound);
        assert!(table::contains(&pool.commitments, seller_commitment), EOrderNotFound);

        // 2. Verify reveals match commitments
        let buyer_order = table::borrow(&pool.commitments, buyer_commitment);
        let seller_order = table::borrow(&pool.commitments, seller_commitment);

        verify_reveal(&buyer_commitment, &buyer_reveal);
        verify_reveal(&seller_commitment, &seller_reveal);

        // 3. Verify orders haven't expired
        let current_time = tx_context::epoch(ctx);
        assert!(buyer_order.expiry > current_time, EOrderExpired);
        assert!(seller_order.expiry > current_time, EOrderExpired);

        // 4. Verify price cross (buyer price >= seller price)
        assert!(buyer_reveal.price >= seller_reveal.price, EInvalidReveal);

        // 5. Calculate execution price (midpoint)
        let exec_price = (buyer_reveal.price + seller_reveal.price) / 2;

        // 6. Calculate execution amount (minimum of both)
        let exec_amount = if (buyer_reveal.amount < seller_reveal.amount) {
            buyer_reveal.amount
        } else {
            seller_reveal.amount
        };

        // 7. Execute settlement
        // Transfer base from seller to buyer
        let base_to_transfer = balance::split(&mut pool.base_vault, exec_amount);
        let base_coin = coin::from_balance(base_to_transfer, ctx);
        transfer::public_transfer(base_coin, buyer_order.owner);

        // Transfer quote from buyer to seller
        let quote_amount = exec_amount * exec_price;
        let quote_to_transfer = balance::split(&mut pool.quote_vault, quote_amount);
        let quote_coin = coin::from_balance(quote_to_transfer, ctx);
        transfer::public_transfer(quote_coin, seller_order.owner);

        // 8. Remove settled orders
        let _ = table::remove(&mut pool.commitments, buyer_commitment);
        let _ = table::remove(&mut pool.commitments, seller_commitment);

        // 9. Emit event
        event::emit(OrderSettled {
            pool_id: pool.config.pool_id,
            buyer: buyer_order.owner,
            seller: seller_order.owner,
            amount: exec_amount,
            price: exec_price,
            timestamp: current_time,
        });
    }

    /// Verify that a reveal matches its commitment
    fun verify_reveal(commitment: &vector<u8>, reveal: &OrderReveal) {
        // Recompute commitment from reveal data
        // commitment = Poseidon(side, amount, price, expiry, nonce, secret)
        // For now, use blake2b256 as placeholder (Poseidon needs external library)
        let mut data = vector::empty<u8>();
        vector::append(&mut data, bcs::to_bytes(&reveal.side));
        vector::append(&mut data, bcs::to_bytes(&reveal.amount));
        vector::append(&mut data, bcs::to_bytes(&reveal.price));
        vector::append(&mut data, bcs::to_bytes(&reveal.expiry));
        vector::append(&mut data, bcs::to_bytes(&reveal.nonce));
        vector::append(&mut data, reveal.secret);

        let computed = blake2b256(&data);
        assert!(computed == *commitment, EInvalidReveal);
    }

    // ==================== View Functions ====================

    public fun get_commitment<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
        commitment: vector<u8>
    ): &OrderCommitment {
        table::borrow(&pool.commitments, commitment)
    }

    public fun is_nullifier_used<BaseAsset, QuoteAsset>(
        pool: &DarkPool<BaseAsset, QuoteAsset>,
        nullifier: vector<u8>
    ): bool {
        table::contains(&pool.nullifiers, nullifier)
    }
}
```

### 3.2 Move.toml Configuration

**File:** `contracts/Move.toml`

```toml
[package]
name = "zebra"
version = "0.0.1"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
zebra = "0x0"
```

---

## Phase 4: Frontend Integration

### 4.1 Directory Structure

```
frontend/src/
├── lib/
│   ├── sui/
│   │   ├── client.ts           # Sui client setup
│   │   ├── wallet.ts           # Wallet connection
│   │   ├── dark-pool.ts        # Dark pool contract interactions
│   │   └── types.ts            # TypeScript types
│   ├── zk/
│   │   ├── prover.ts           # Proof generation
│   │   ├── witness.ts          # Witness calculation
│   │   └── circuits.ts         # Circuit loading
│   └── stores/
│       ├── wallet-store.ts     # Wallet state (Zustand)
│       └── order-store.ts      # Order state (Zustand)
├── providers/
│   └── sui-provider.tsx        # Sui dApp Kit provider
└── hooks/
    ├── use-wallet.ts           # Wallet hook
    ├── use-dark-pool.ts        # Dark pool hook
    └── use-proof.ts            # Proof generation hook
```

### 4.2 Sui Client Setup

**File:** `frontend/src/lib/sui/client.ts`

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export const NETWORK = 'testnet';

export const suiClient = new SuiClient({
  url: getFullnodeUrl(NETWORK),
});

// Contract addresses (to be updated after deployment)
export const CONTRACTS = {
  DARK_POOL_PACKAGE: '0x...', // Update after deployment
  DARK_POOL_OBJECT: '0x...',  // Shared object ID
};

export { Transaction };
```

### 4.3 Proof Generation

**File:** `frontend/src/lib/zk/prover.ts`

```typescript
import * as snarkjs from 'snarkjs';

interface OrderInput {
  secret: bigint;
  side: number; // 0 = sell, 1 = buy
  amount: bigint;
  price: bigint;
  expiry: bigint;
  nonce: bigint;
  userBalance: bigint;
  currentTime: bigint;
  poolId: bigint;
}

interface ProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
  commitment: string;
  nullifier: string;
}

// Load circuit WASM and zkey (cached)
let circuitWasm: ArrayBuffer | null = null;
let circuitZkey: ArrayBuffer | null = null;

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
  const { wasm, zkey } = await loadCircuit();

  // Prepare circuit inputs
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

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    new Uint8Array(wasm),
    new Uint8Array(zkey)
  );

  // Extract commitment and nullifier from public signals
  // Based on circuit output order
  const commitment = publicSignals[0];
  const nullifier = publicSignals[1];

  return {
    proof,
    publicSignals,
    commitment,
    nullifier,
  };
}

// Convert proof to Sui-compatible format
export function proofToSuiFormat(proof: ProofResult['proof']): Uint8Array {
  // Concatenate proof points in the format expected by Sui's groth16 module
  const points: bigint[] = [];

  // pi_a (G1 point)
  points.push(BigInt(proof.pi_a[0]));
  points.push(BigInt(proof.pi_a[1]));

  // pi_b (G2 point - note coordinate swap)
  points.push(BigInt(proof.pi_b[0][1]));
  points.push(BigInt(proof.pi_b[0][0]));
  points.push(BigInt(proof.pi_b[1][1]));
  points.push(BigInt(proof.pi_b[1][0]));

  // pi_c (G1 point)
  points.push(BigInt(proof.pi_c[0]));
  points.push(BigInt(proof.pi_c[1]));

  // Serialize to bytes (32 bytes per field element)
  const bytes = new Uint8Array(points.length * 32);
  points.forEach((point, i) => {
    const hex = point.toString(16).padStart(64, '0');
    for (let j = 0; j < 32; j++) {
      bytes[i * 32 + j] = parseInt(hex.slice(j * 2, j * 2 + 2), 16);
    }
  });

  return bytes;
}

// Convert public signals to Sui format
export function publicSignalsToSuiFormat(signals: string[]): Uint8Array {
  const bytes = new Uint8Array(signals.length * 32);
  signals.forEach((signal, i) => {
    const bigint = BigInt(signal);
    const hex = bigint.toString(16).padStart(64, '0');
    for (let j = 0; j < 32; j++) {
      bytes[i * 32 + j] = parseInt(hex.slice(j * 2, j * 2 + 2), 16);
    }
  });
  return bytes;
}
```

### 4.4 Dark Pool Contract Interactions

**File:** `frontend/src/lib/sui/dark-pool.ts`

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, CONTRACTS } from './client';
import { generateOrderProof, proofToSuiFormat, publicSignalsToSuiFormat } from '../zk/prover';

interface SubmitOrderParams {
  side: 'buy' | 'sell';
  amount: bigint;
  price: bigint;
  expiry: bigint;
  coinObjectId: string; // The coin to lock
}

export async function submitHiddenOrder(
  params: SubmitOrderParams,
  signer: any // Wallet signer
) {
  // 1. Generate random secret and nonce
  const secret = BigInt('0x' + crypto.getRandomValues(new Uint8Array(31)).reduce(
    (s, b) => s + b.toString(16).padStart(2, '0'), ''
  ));
  const nonce = BigInt(Date.now());

  // 2. Get current time and user balance
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const poolId = BigInt(CONTRACTS.DARK_POOL_OBJECT.slice(2)); // Convert address to bigint

  // 3. Generate ZK proof
  const proofResult = await generateOrderProof({
    secret,
    side: params.side === 'buy' ? 1 : 0,
    amount: params.amount,
    price: params.price,
    expiry: params.expiry,
    nonce,
    userBalance: params.amount, // Simplified - should query actual balance
    currentTime,
    poolId,
  });

  // 4. Convert proof to Sui format
  const proofBytes = proofToSuiFormat(proofResult.proof);
  const publicInputBytes = publicSignalsToSuiFormat(proofResult.publicSignals);
  const commitmentBytes = hexToBytes(proofResult.commitment);
  const nullifierBytes = hexToBytes(proofResult.nullifier);

  // 5. Build transaction
  const tx = new Transaction();

  if (params.side === 'buy') {
    tx.moveCall({
      target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_buy_order`,
      arguments: [
        tx.object(CONTRACTS.DARK_POOL_OBJECT),
        tx.object(params.coinObjectId),
        tx.pure(Array.from(proofBytes)),
        tx.pure(Array.from(publicInputBytes)),
        tx.pure(Array.from(commitmentBytes)),
        tx.pure(Array.from(nullifierBytes)),
        tx.pure(params.expiry),
      ],
      typeArguments: [
        '0x2::sui::SUI', // Base asset
        '0x...::usdc::USDC', // Quote asset - update with actual USDC type
      ],
    });
  } else {
    tx.moveCall({
      target: `${CONTRACTS.DARK_POOL_PACKAGE}::dark_pool::submit_sell_order`,
      arguments: [
        tx.object(CONTRACTS.DARK_POOL_OBJECT),
        tx.object(params.coinObjectId),
        tx.pure(Array.from(proofBytes)),
        tx.pure(Array.from(publicInputBytes)),
        tx.pure(Array.from(commitmentBytes)),
        tx.pure(Array.from(nullifierBytes)),
        tx.pure(params.expiry),
      ],
      typeArguments: [
        '0x2::sui::SUI',
        '0x...::usdc::USDC',
      ],
    });
  }

  // 6. Sign and execute
  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
  });

  // 7. Return order details (store locally for later reveal)
  return {
    digest: result.digest,
    commitment: proofResult.commitment,
    nullifier: proofResult.nullifier,
    secret: secret.toString(),
    nonce: nonce.toString(),
    side: params.side,
    amount: params.amount.toString(),
    price: params.price.toString(),
    expiry: params.expiry.toString(),
  };
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
```

### 4.5 Wallet Store (Zustand)

**File:** `frontend/src/lib/stores/wallet-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  balance: {
    sui: string;
    usdc: string;
  };

  // Actions
  setAddress: (address: string | null) => void;
  setConnected: (connected: boolean) => void;
  setBalance: (balance: { sui: string; usdc: string }) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      address: null,
      isConnected: false,
      balance: { sui: '0', usdc: '0' },

      setAddress: (address) => set({ address }),
      setConnected: (isConnected) => set({ isConnected }),
      setBalance: (balance) => set({ balance }),
      disconnect: () => set({ address: null, isConnected: false, balance: { sui: '0', usdc: '0' } }),
    }),
    {
      name: 'zebra-wallet',
    }
  )
);
```

### 4.6 Order Store (Zustand)

**File:** `frontend/src/lib/stores/order-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HiddenOrder {
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

interface OrderState {
  orders: HiddenOrder[];

  // Actions
  addOrder: (order: HiddenOrder) => void;
  updateOrderStatus: (commitment: string, status: HiddenOrder['status']) => void;
  removeOrder: (commitment: string) => void;
  getOrderByCommitment: (commitment: string) => HiddenOrder | undefined;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],

      addOrder: (order) => set((state) => ({
        orders: [...state.orders, order],
      })),

      updateOrderStatus: (commitment, status) => set((state) => ({
        orders: state.orders.map((o) =>
          o.commitment === commitment ? { ...o, status } : o
        ),
      })),

      removeOrder: (commitment) => set((state) => ({
        orders: state.orders.filter((o) => o.commitment !== commitment),
      })),

      getOrderByCommitment: (commitment) =>
        get().orders.find((o) => o.commitment === commitment),
    }),
    {
      name: 'zebra-orders',
    }
  )
);
```

---

## Phase 5: Backend Matching Engine

### 5.1 Matching Engine Architecture

```
backend/
├── src/
│   ├── index.ts           # Entry point
│   ├── sui-listener.ts    # Listen to on-chain events
│   ├── order-book.ts      # In-memory order book
│   ├── matcher.ts         # Matching logic
│   └── settlement.ts      # Trigger settlements
├── package.json
└── tsconfig.json
```

### 5.2 Event Listener

**File:** `backend/src/sui-listener.ts`

```typescript
import { SuiClient, SuiEventFilter } from '@mysten/sui/client';
import { EventEmitter } from 'events';

const DARK_POOL_PACKAGE = '0x...'; // Update after deployment

export class SuiEventListener extends EventEmitter {
  private client: SuiClient;
  private unsubscribe: (() => void) | null = null;

  constructor(rpcUrl: string) {
    super();
    this.client = new SuiClient({ url: rpcUrl });
  }

  async start() {
    const filter: SuiEventFilter = {
      MoveEventType: `${DARK_POOL_PACKAGE}::dark_pool::OrderCommitted`,
    };

    this.unsubscribe = await this.client.subscribeEvent({
      filter,
      onMessage: (event) => {
        this.emit('orderCommitted', {
          commitment: event.parsedJson?.commitment,
          nullifier: event.parsedJson?.nullifier,
          owner: event.parsedJson?.owner,
          isBid: event.parsedJson?.is_bid,
          lockedAmount: event.parsedJson?.locked_amount,
          timestamp: event.parsedJson?.timestamp,
        });
      },
    });

    console.log('Listening for OrderCommitted events...');
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
```

### 5.3 Order Book & Matcher

**File:** `backend/src/matcher.ts`

```typescript
interface CommittedOrder {
  commitment: string;
  owner: string;
  isBid: boolean;
  lockedAmount: bigint;
  timestamp: number;
  // Encrypted order details (optional - provided by user)
  encryptedPrice?: string;
  encryptedAmount?: string;
}

export class OrderMatcher {
  private bids: Map<string, CommittedOrder> = new Map();
  private asks: Map<string, CommittedOrder> = new Map();

  addOrder(order: CommittedOrder) {
    if (order.isBid) {
      this.bids.set(order.commitment, order);
    } else {
      this.asks.set(order.commitment, order);
    }

    // Try to find matches
    this.findMatches();
  }

  removeOrder(commitment: string) {
    this.bids.delete(commitment);
    this.asks.delete(commitment);
  }

  findMatches(): Array<{ buyer: CommittedOrder; seller: CommittedOrder }> {
    const matches: Array<{ buyer: CommittedOrder; seller: CommittedOrder }> = [];

    // Simple matching: pair orders with similar locked amounts
    // In production, would use encrypted price hints
    for (const [buyCommitment, buyer] of this.bids) {
      for (const [sellCommitment, seller] of this.asks) {
        // Match if locked amounts are within 10% of each other
        // This is a simplified heuristic
        const ratio = Number(buyer.lockedAmount) / Number(seller.lockedAmount);
        if (ratio >= 0.9 && ratio <= 1.1) {
          matches.push({ buyer, seller });

          // Remove matched orders
          this.bids.delete(buyCommitment);
          this.asks.delete(sellCommitment);
          break;
        }
      }
    }

    return matches;
  }
}
```

---

## Phase 6: Deployment & Testing

### 6.1 Deploy Move Contracts

```bash
# 1. Build contracts
cd contracts
sui move build

# 2. Deploy to testnet
sui client publish --gas-budget 100000000

# 3. Note the package ID and create pool
sui client call \
  --package <PACKAGE_ID> \
  --module dark_pool \
  --function create_pool \
  --type-args 0x2::sui::SUI <USDC_TYPE> \
  --args <VK_BYTES> <POOL_ID> 1000000 1000000000000 100 \
  --gas-budget 50000000
```

### 6.2 Test Script

**File:** `scripts/test-flow.ts`

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { submitHiddenOrder } from '../frontend/src/lib/sui/dark-pool';

async function testFullFlow() {
  console.log('=== Zebra Dark Pool Test ===\n');

  // 1. Setup
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
  const keypair = Ed25519Keypair.deriveKeypair(process.env.MNEMONIC!);
  const address = keypair.toSuiAddress();
  console.log('Test address:', address);

  // 2. Get SUI coins
  const coins = await client.getCoins({ owner: address });
  console.log('Available coins:', coins.data.length);

  // 3. Submit a BUY order
  console.log('\n--- Submitting BUY order ---');
  const buyOrder = await submitHiddenOrder({
    side: 'buy',
    amount: BigInt(1000000000), // 1 SUI
    price: BigInt(100), // $1.00
    expiry: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour
    coinObjectId: coins.data[0].coinObjectId,
  }, keypair);
  console.log('BUY order submitted:', buyOrder.commitment);

  // 4. Submit a SELL order (different keypair)
  console.log('\n--- Submitting SELL order ---');
  // ... similar for sell order

  // 5. Check events
  console.log('\n--- Checking events ---');
  // ... query events

  console.log('\n=== Test Complete ===');
}

testFullFlow().catch(console.error);
```

---

## Phase 7: Implementation Order

### Step-by-Step Execution

| Step | Task | Files | Est. Complexity |
|------|------|-------|-----------------|
| 1 | Create project structure | Directories only | Low |
| 2 | Build ZK circuit | `circuits/order_commitment.circom` | Medium |
| 3 | Compile circuit & export keys | `circuits/scripts/*.js` | Medium |
| 4 | Write Move contracts | `contracts/sources/*.move` | High |
| 5 | Deploy to testnet | CLI commands | Medium |
| 6 | Add frontend dependencies | `package.json` | Low |
| 7 | Implement proof generation | `lib/zk/prover.ts` | High |
| 8 | Implement Sui client | `lib/sui/*.ts` | Medium |
| 9 | Create Zustand stores | `lib/stores/*.ts` | Low |
| 10 | Wire up wallet modal | Modify existing modal | Medium |
| 11 | Wire up order submission | Modify trade page | High |
| 12 | Build matching engine | `backend/src/*.ts` | Medium |
| 13 | End-to-end testing | `scripts/test-flow.ts` | Medium |

---

## Key Technical Decisions

### 1. Curve Selection: BN254
- Sui's groth16 module supports both BN254 and BLS12-381
- BN254 chosen for smaller proof size and faster verification
- Compatible with snarkjs/Circom ecosystem

### 2. Proof Format Conversion
- snarkjs outputs JSON proof format
- Need to convert to Arkworks canonical serialization for Sui
- pi_b coordinates need swapping (different representation)

### 3. Commitment Hash Function
- Circuit uses Poseidon (ZK-friendly)
- On-chain verification uses same hash
- Off-chain reveal verification uses blake2b256 for simplicity

### 4. Order Matching Strategy
- Off-chain matching engine monitors events
- Users can optionally encrypt order details to matcher
- Matches trigger reveal phase on-chain

---

## Dependencies Summary

### Frontend
```json
{
  "@mysten/sui": "^2.1.0",
  "@mysten/dapp-kit": "^1.0.1",
  "snarkjs": "^0.7.0",
  "circomlibjs": "^0.1.7",
  "zustand": "^4.5.0"
}
```

### Circuits
```json
{
  "circomlib": "^2.0.5",
  "snarkjs": "^0.7.0"
}
```

### Backend
```json
{
  "@mysten/sui": "^2.1.0",
  "express": "^4.18.0"
}
```

---

## Success Criteria

1. **Circuit compiles** without errors
2. **Proof generation** works in browser (<3s)
3. **Move contracts deploy** to testnet
4. **On-chain verification** passes for valid proofs
5. **Order submission** locks funds correctly
6. **Matching engine** finds price crosses
7. **Settlement** transfers funds atomically
8. **Full flow test** passes end-to-end

---

## Reference Code Mapping

| Zebra Component | Reference File |
|----------------|----------------|
| Sui Client | `playground-sui/lib/sui/client.ts` |
| DeepBook | `playground-sui/lib/sui/deepbook-v3.ts` |
| Balance Manager | `playground-sui/lib/sui/balance-manager.ts` |
| Trading | `playground-sui/lib/sui/trading.ts` |
| Nullifier Circuit | `zk/01-circom/circuits/nullifier.circom` |
| Private Transfer | `zk/01-circom/circuits/private_transfer.circom` |
| Merkle Tree | `zk/01-circom/scripts/compute_merkle_tree.js` |
| Proof Conversion | `zk/deployments/avalanche/scripts/convertProofs.js` |
| Verification Key | `zk/01-circom/build/nullifier_vkey.json` |
