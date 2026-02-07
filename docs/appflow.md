# Zebra App Flow

## Architecture Overview

Zebra is a privacy-preserving ZK dark pool on the Sui blockchain. Users submit hidden limit orders with **Groth16 zero-knowledge proofs** for commitment validity, **Sui Seal threshold encryption** for order privacy, and a **TEE-based matching engine** that decrypts, matches, and settles trades. Unmatched orders are settled via **DeepBook V3 flash loans** using the hot potato pattern. Funds are routed to **encrypted receiver addresses** with percentage splits, breaking on-chain address linkability.

**Key principle:** On-chain, only commitment hashes and encrypted blobs are visible. The TEE is the only entity that can decrypt order details (side, price, amount, receivers). All settlement happens atomically on-chain via PTBs (Programmable Transaction Blocks).

---

## Problems Solved on Sui

### 1. DeepBook Order Book Transparency
All orders on DeepBook (Sui's native CLOB) are fully visible — prices, sizes, addresses. Anyone can query the order book and see exactly what you're doing. Zebra hides order prices and matching logic.

### 2. Large Order Market Impact
Placing a large order on a transparent order book signals intent and moves the market before the order fills. Traditional finance solved this with dark pools (IEX, Liquidnet). Sui has no equivalent — Zebra is that equivalent.

### 3. Strategy & Alpha Leakage
On-chain trading history is public. Competitors can track addresses, copy strategies, and trade against you. Zebra's encrypted orders prevent this.

### 4. Address Linkability
Even with hidden orders, settlement typically reveals who received funds. Zebra's encrypted receiver addresses with percentage splits break the link between order submission and fund receipt.

### 5. No Privacy DEX on Sui
Zebra is the first privacy-preserving trading mechanism on the Sui network. Every other DEX (DeepBook, Cetus, Turbos, Kriya) is fully transparent.

---

## Deployed Contracts (Sui Testnet)

| Component | Address |
|-----------|---------|
| Dark Pool Package | `0x381920f137dcbc01865fddb24d48b147d9caaa34b6c9a431e6081bbe0e31d84f` |
| Dark Pool Object | `0x97fd88d921bb0f70f93a03ff63d89a31aa08227cea0847413b06c2d5cba04344` |
| Admin Cap | `0x2b209ae407df99161ec437d31f0ebec95032cd75d63e647331adcb02a454bc21` |
| Matcher Cap | `0x6fda7708bc3c23e04a9628dfe0ca5c600e972e1f11b5aefcead46e5090958f33` |
| Seal Package | `0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82` |

---

## Components

### 1. Dark Pool Contract (Move)
**File:** `contracts/sources/dark_pool.move`

On-chain smart contract managing the dark pool. Currently deployed as `DarkPool<CoinType>` (single coin type — SUI). Target architecture is dual-coin `DarkPool<BaseCoin, QuoteCoin>` with two vaults.

**Handles:**
- Pool creation with Groth16 verifying key
- Order submission with on-chain ZK proof verification
- Coin locking in vault
- Nullifier tracking (replay prevention)
- Two-party settlement (`settle_match`) with arbitrary payout distribution
- Single-party settlement for flash loans (`settle_single`)
- Order cancellation with refund

**Key Types:**
- `DarkPool<CoinType>` — Shared object with vault, commitments table, nullifiers, config
- `OrderCommitment` — Stores commitment hash, nullifier, owner, locked amount, encrypted data
- `AdminCap` / `MatcherCap` — Capability objects for authorization

**Events (privacy-preserving):**
- `OrderCommitted { pool_id, commitment, encrypted_data, timestamp }` — NO amounts, NO addresses, NO side
- `OrderSettled { pool_id, commitment_a, commitment_b, timestamp }` — NO payouts, NO receivers
- `OrderCancelled { pool_id, commitment, timestamp }`

### 2. ZK Circuit (Circom)
**File:** `circuits/order_commitment.circom`

Groth16 circuit proving order validity without revealing details. Compiled to WASM for browser-side proof generation via snarkjs.

**Private Inputs:** secret, side, amount, price, expiry, nonce
**Public Inputs:** user_balance, current_time, pool_id
**Outputs:** commitment (Poseidon hash), nullifier (Poseidon(secret, pool_id))

**Constraints enforced:**
- `commitment = Poseidon(side, amount, price, expiry, nonce, secret)`
- `nullifier = Poseidon(secret, pool_id)`
- `side ∈ {0, 1}` (0=SELL, 1=BUY)
- `amount > 0`, `price > 0`
- `expiry > current_time`
- `amount ≤ user_balance`

**Proof format:** 128 bytes (G1 + G2 + G1, Arkworks compressed), verified on-chain via `sui::groth16::verify`.

### 3. Sui Seal Encryption
**File:** `frontend/src/lib/seal/client.ts`

Threshold encryption using Sui Seal (2-of-3 key servers). Encrypts order data so only the TEE matching engine can decrypt it.

**Key Servers (Testnet):**
- `0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75`
- `0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8`

**Current Encrypted Payload:**
```json
{ "side": 0, "price": 3500000000, "amount": 10000000000 }
```

**Target Encrypted Payload (with receivers):**
```json
{
  "side": 0,
  "price": 3500000000,
  "amount": 10000000000,
  "receivers": [
    { "address": "0xabc...", "percentage": 60 },
    { "address": "0xdef...", "percentage": 40 }
  ]
}
```

### 4. TEE Matching Engine
**Directory:** `matching-engine/src/`

Node.js/Express server (port 3001) running inside a TEE. Compatible with Marlin Oyster (Intel Nitro enclaves), currently running in local-dev mode with identical logic.

**Sub-components:**
| Module | File | Purpose |
|--------|------|---------|
| Event Listener | `sui-listener.ts` | Polls Sui for OrderCommitted events (every 2s) |
| Seal Decryption | `seal-service.ts` | Decrypts Seal-encrypted order data |
| Order Book | `order-book.ts` | In-memory book (bids desc, asks asc by price-time) |
| Matcher | `matcher.ts` | Price-time priority matching algorithm |
| Batch Engine | `batch-engine.ts` | 60s batch resolution with 3 phases |
| Settlement | `settlement.ts` | Executes settle_match PTBs on-chain |
| Flash Loan Settlement | `flash-loan-settlement.ts` | DeepBook flash loan PTBs for residuals |
| Flash Loan Service | `flash-loan-service.ts` | DeepBook V3 SDK wrapper for flash loans |
| DeepBook Service | `deepbook-service.ts` | Mid-price, vault balances, L2 book queries |
| TEE Attestation | `tee-attestation.ts` | secp256k1 signing, metrics, Oyster attestation |
| Config | `config.ts` | Environment configuration |

**TEE Modes:**
- `local-dev` — Ephemeral secp256k1 key (development/hackathon)
- `enclave` — Hardware-backed key from `/app/ecdsa.sec` (Marlin Oyster production)
- All matching/settlement logic is identical between modes

**REST API Endpoints:**
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Engine status + TEE mode + order counts |
| `/orders` | GET | Privacy-safe order list (commitment prefixes only) |
| `/matches` | GET | Recent matches (no execution details) |
| `/batch/status` | GET | Current batch state + resolution history |
| `/tee/metrics` | GET | TEE metrics dashboard + Oyster attestation |
| `/tee/attestations` | GET | Redacted attestations (sigs, no amounts) |
| `/tee/attestation/raw` | GET | Raw Oyster Nitro attestation |
| `/deepbook/midprice` | GET | DeepBook reference price |
| `/flash-loan/demo` | POST | Demo flash loan execution |
| `/logs` | GET | Recent engine logs (privacy-safe) |

### 5. DeepBook V3 Integration
**Pool:** `SUI_DBUSDC`
**SDK:** `@mysten/deepbook-v3`

Used for:
- Reference mid-price for market orders
- Flash loan borrowing (base asset SUI)
- SUI → USDC swaps for residual SELL settlement
- Hot potato pattern: borrow → swap → repay in single PTB

### 6. Frontend (Next.js)
**Directory:** `frontend/src/`

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | 240-frame scroll animation, branding |
| Trade | `/trade` | Order submission (side, amount, price, expiry, receivers) |
| TEE Dashboard | `/tee` | Metrics, attestations, privacy-safe logs |
| Orders | `/orders` | User order tracking with status filters |
| Deposit | `/deposit` | Cross-chain deposit UI (LI.FI placeholder) |

**Key Libraries:**
- `@mysten/dapp-kit` — Sui wallet integration
- `@mysten/seal` — Seal encryption client
- `snarkjs` + `circomlibjs` — Browser-side Groth16 proof generation
- `zustand` — Persisted state stores (wallet, orders)
- `@radix-ui` — Headless UI components

---

## Detailed User Flow

### Phase 1: Wallet Connection

```
User opens Zebra app
    │
    ▼
Connect Sui wallet via dapp-kit
    │
    ▼
Frontend fetches balances:
    ├─ SUI balance (native)
    └─ DBUSDC balance (DeepBook USDC)
    │
    ▼
Navbar displays: wallet address + balances
Trade page displays: AVAILABLE balance strip
```

### Phase 2: Order Submission

```
┌─ BROWSER ────────────────────────────────────────────────────────────────┐
│                                                                          │
│  User fills order form:                                                 │
│  ├─ SIDE: [BUY] or [SELL]                                              │
│  ├─ TYPE: [LIMIT] (manual price) or [MARKET] (DeepBook mid-price)      │
│  ├─ AMOUNT: e.g. 10 SUI                                                │
│  ├─ PRICE: e.g. $3.50 USD                                              │
│  ├─ EXPIRY: 1h / 6h / 24h / 7d                                        │
│  └─ RECEIVERS (optional, default = own wallet):                         │
│      ├─ 0xBBB... → 60%                                                 │
│      └─ 0xCCC... → 40%                                                 │
│                                                                          │
│  User clicks "HIDE IN THE HERD"                                        │
│  → OrderConfirmationModal opens showing 5-step process                  │
│  → User confirms                                                        │
│                                                                          │
│  Step 1: GENERATE ZK PROOF                                              │
│  ├─ Generate random secret (31 bytes) + nonce (timestamp)              │
│  ├─ Build circuit inputs:                                               │
│  │   { secret, side(0|1), amount(MIST), price(MIST),                   │
│  │     expiry(unix), nonce, userBalance, currentTime, poolId }         │
│  ├─ snarkjs.groth16.fullProve() in browser (WASM)                     │
│  └─ Returns: commitment hash, nullifier, proof (128 bytes)            │
│                                                                          │
│  Step 2: ENCRYPT WITH SEAL                                              │
│  ├─ Build payload: { side, price, amount, receivers }                  │
│  ├─ Seal.encrypt({ threshold: 2, packageId, id, data })               │
│  └─ Returns: encryptedBytes (only TEE can decrypt)                     │
│                                                                          │
│  Step 3: SUBMIT ON-CHAIN                                                │
│  ├─ Convert amount to MIST (× 1e9)                                    │
│  ├─ Build Sui transaction:                                              │
│  │   tx.splitCoins(tx.gas, [amount])     // lock coin                  │
│  │   tx.moveCall(dark_pool::submit_order<SUI>,                         │
│  │     [pool, lockCoin, proof, publicInputs,                           │
│  │      commitment, nullifier, encryptedData])                         │
│  ├─ User signs with wallet                                              │
│  └─ Transaction executed on Sui                                         │
│                                                                          │
│  Step 4: AWAIT MATCH (monitoring)                                       │
│  └─ Frontend polls matching engine for order status                    │
│                                                                          │
│  Step 5: SETTLEMENT (monitoring)                                        │
│  └─ Funds transferred to receiver address(es)                          │
│                                                                          │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌─ SUI BLOCKCHAIN ─────────────────────────────────────────────────────────┐
│                                                                          │
│  dark_pool::submit_order<CoinType>():                                   │
│  ├─ Verify Groth16 proof on-chain (sui::groth16::verify)               │
│  ├─ Check nullifier not already used (replay prevention)                │
│  ├─ Lock deposited coin in vault (coin → balance → join vault)         │
│  ├─ Store OrderCommitment:                                              │
│  │   { commitment, nullifier, owner, locked_amount,                    │
│  │     created_at, encrypted_data }                                    │
│  └─ Emit OrderCommitted event:                                          │
│      { commitment, encrypted_data, timestamp }                         │
│      (NO amount, NO owner address, NO side disclosed)                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: TEE Decryption & Order Book

```
┌─ MATCHING ENGINE (TEE, Port 3001) ───────────────────────────────────────┐
│                                                                          │
│  sui-listener.ts: Poll for OrderCommitted events (every 2s)             │
│  ├─ Detect new commitment on-chain                                      │
│  └─ Retrieve encrypted_data from event                                  │
│                                                                          │
│  seal-service.ts: Decrypt order                                         │
│  ├─ Build seal_approve PTB with allowlist object                        │
│  ├─ Seal.decrypt() with session key (2-of-3 threshold)                 │
│  └─ Parse JSON: { side, price, amount, receivers }                     │
│                                                                          │
│  order-book.ts: Add to in-memory book                                   │
│  ├─ side=1 (BUY) → BIDS (sorted descending by price, then time)       │
│  └─ side=0 (SELL) → ASKS (sorted ascending by price, then time)       │
│                                                                          │
│  batch-engine.ts: Check trigger conditions                              │
│  ├─ Time trigger: 60 seconds since first order in batch                │
│  └─ Count trigger: 10+ orders accumulated → resolve early              │
│                                                                          │
│  tee-attestation.ts: Log event (privacy-safe)                           │
│  └─ "Order received, commitment=0x1234abcd..."                         │
│     (NO decrypted data in any log)                                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Batch Resolution

```
┌─ BATCH ENGINE (Every 60s or 10 Orders) ──────────────────────────────────┐
│                                                                          │
│  ┌─ PHASE A: Internal Matching ───────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  matcher.ts: Price-time priority matching                          │  │
│  │  ├─ Best bid price >= best ask price?                              │  │
│  │  │   └─ YES → Match found                                         │  │
│  │  │       ├─ Execution price = midpoint(bid, ask)                  │  │
│  │  │       ├─ Execution amount = min(bid_amount, ask_amount)        │  │
│  │  │       └─ settlement.ts: Execute settle_match on-chain          │  │
│  │  │           ├─ Compute payouts based on execution price          │  │
│  │  │           ├─ Transfer to encrypted receiver addresses          │  │
│  │  │           └─ Sign TEE attestation (secp256k1)                  │  │
│  │  └─ Repeat until no more price crosses                            │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ PHASE B: Flash Loan Settlement (Residual SELLs) ─────────────────┐  │
│  │                                                                     │  │
│  │  For each unmatched SELL order:                                    │  │
│  │  ├─ Build single PTB (hot potato pattern):                        │  │
│  │  │   1. borrowBaseAsset(SUI_DBUSDC, amount) → [sui, flashLoan]   │  │
│  │  │   2. swapExactBaseForQuote(sui) → [remaining, usdc, refund]   │  │
│  │  │   3. dark_pool::settle_single(commitment) → extractedSui      │  │
│  │  │   4. returnBaseAsset(extractedSui, flashLoan) → remainder     │  │
│  │  │   5. transferObjects(usdc → seller's receiver addresses)      │  │
│  │  │   6. transferObjects(remainders → TEE address)                │  │
│  │  ├─ First attempt: batch all sells in one PTB                     │  │
│  │  └─ Fallback: individual PTB per sell order                       │  │
│  │                                                                     │  │
│  │  Successfully settled → removed from order book                   │  │
│  │  Failed → carried to next batch                                   │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ PHASE C: Carry-Over (Residual BUYs) ─────────────────────────────┐  │
│  │                                                                     │  │
│  │  Unmatched BUY orders remain in order book                        │  │
│  │  └─ Auto-start new batch window if residuals exist                │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Settlement & Encrypted Receiver Routing

```
┌─ SETTLEMENT ─────────────────────────────────────────────────────────────┐
│                                                                          │
│  For each settled order:                                                │
│                                                                          │
│  1. TEE reads encrypted receiver list from decrypted order data         │
│     ├─ If receivers specified: use them                                 │
│     └─ If not specified: default to order.owner (submitter address)     │
│                                                                          │
│  2. Compute payout amount for this order                                │
│     ├─ Internal match: based on execution price × amount               │
│     └─ Flash loan: USDC from DeepBook swap                             │
│                                                                          │
│  3. Split payout by percentages:                                        │
│     ├─ 60% of payout → Coin split → transfer to 0xBBB...              │
│     └─ 40% of payout → Coin split → transfer to 0xCCC...              │
│                                                                          │
│  4. Execute transfers on-chain (part of settlement PTB)                 │
│                                                                          │
│  5. Sign attestation:                                                    │
│     secp256k1(sha256(settlement_data))                                  │
│     (attestation includes commitment hashes only, no receiver info)     │
│                                                                          │
│  On-chain event (privacy-preserving):                                   │
│  OrderSettled { commitment_a, commitment_b, timestamp }                 │
│  (NO payouts, NO receivers, NO amounts)                                │
│                                                                          │
│  Observer sees:                                                          │
│    "0xAAA submitted order" → "0xBBB and 0xCCC received funds"          │
│    No visible link between submitter and recipients                     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Phase 6: Order Cancellation (Alternative Flow)

```
┌─ CANCELLATION ───────────────────────────────────────────────────────────┐
│                                                                          │
│  User clicks CANCEL on a pending order (Orders page)                    │
│  ├─ Build transaction: dark_pool::cancel_order(pool, commitment)        │
│  ├─ Only the original owner (order.owner) can cancel                    │
│  ├─ Contract removes commitment from table                              │
│  ├─ Contract refunds locked coin from vault to owner                    │
│  └─ Emit OrderCancelled event                                           │
│                                                                          │
│  Order status: pending → cancelled                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Privacy Model

### What's Hidden vs. Visible On-Chain

| Data | Visibility | Hidden By |
|------|-----------|-----------|
| Order price | **HIDDEN** | ZK private input + Seal encryption |
| Order expiry | **HIDDEN** | ZK private input + Seal encryption |
| Receiver addresses | **HIDDEN** | Seal encryption (TEE-only) |
| Receiver split percentages | **HIDDEN** | Seal encryption (TEE-only) |
| Matching logic | **HIDDEN** | TEE enclave (off-chain) |
| Who matched with whom | **HIDDEN** | TEE enclave (off-chain) |
| Execution price | **HIDDEN** | TEE enclave (off-chain) |
| Order side (buy/sell) | **PARTIALLY VISIBLE** | Coin type reveals side with single pair |
| Locked amount | **VISIBLE** | Coin value in transaction + stored in commitment |
| Pool/Pair | **VISIBLE** | Pool object ID (single pair currently) |

### Privacy Scaling with Multiple Pairs

With multiple trading pairs on a single unified pool:
- **Side** becomes hidden — depositing SUI could mean selling SUI/USDC or buying ETH/SUI
- **Pair** becomes hidden — coin type doesn't reveal which pair you're trading
- Only **locked amount** remains visible

### Address Linkability — BROKEN

**Without encrypted receivers (traditional DEX):**
```
Observer: "0xAAA submitted order → 0xAAA received funds" → trivially linked
```

**With encrypted receivers (Zebra):**
```
Observer: "0xAAA submitted order → 0xBBB got 60%, 0xCCC got 40%" → no link
```

Receiver addresses are inside the Seal-encrypted payload. Only the TEE knows where funds go. On-chain, there is no connection between order submission and settlement receipt.

---

## TEE Operations & Logging

### Metrics Tracked
- `ordersReceived` — Total orders detected on-chain
- `ordersDecrypted` — Successfully Seal-decrypted
- `decryptionFailures` — Failed decryptions
- `matchesFound` — Internal price crosses
- `settlementsExecuted` — On-chain settlements completed
- `totalVolumeSettled` — Cumulative SUI volume
- `flashLoansExecuted` — DeepBook flash loan settlements
- `attestationCount` — Signed attestations

### TEE Dashboard (Frontend `/tee` Page)
- **TEE Identity:** Mode (local-dev/enclave), uptime, public key, matcher address
- **Live Metrics:** Orders, matches, settlements, volume (4 metric boxes)
- **Order Book Status:** Bid count, ask count, pending decryptions
- **Trust Badges:** Tamper-proof matching, settlements signed, privacy preserved, hardware isolation
- **Recent Attestations:** Truncated commitment pairs + truncated signatures + time ago
- **Engine Logs:** Timestamp, level (INFO/WARN/ERROR), source, message

### Log Privacy
All logs shown in the UI are privacy-safe:
- Commitment hashes truncated (first 16 chars + "...")
- **NO** decrypted data (side, price, amount, receivers) in any log
- **NO** execution prices
- **NO** receiver addresses
- Only metadata: timestamps, log levels, source tags, status messages

---

## Flash Loan Mechanics

### Hot Potato Pattern (DeepBook V3)

The "hot potato" is the `flashLoan` object returned by `borrowBaseAsset`. It has no `drop` ability in Move — it MUST be consumed by calling `returnBaseAsset` in the same transaction. This guarantees atomicity.

```
Single PTB (Programmable Transaction Block):

  ┌─ borrowBaseAsset(SUI_DBUSDC, amount) ──────────────────────┐
  │  Returns: [borrowedSui, flashLoan (hot potato)]            │
  │                                                             │
  ├─ swapExactBaseForQuote(borrowedSui) ───────────────────────┤
  │  Returns: [remainingBase, usdcCoin, deepRefund]            │
  │                                                             │
  ├─ dark_pool::settle_single(commitment) ─────────────────────┤
  │  Returns: extractedSui (seller's locked SUI from vault)    │
  │                                                             │
  ├─ returnBaseAsset(extractedSui, flashLoan) ─────────────────┤
  │  Returns: remainderCoin (no drop → must be consumed)       │
  │                                                             │
  ├─ transferObjects(usdcCoin → receiver addresses w/ splits)  │
  └─ transferObjects(remainders → TEE address)                 │
  └─────────────────────────────────────────────────────────────┘

  If ANY step fails, the entire PTB reverts. Atomic.
```

### Batch vs. Per-Order Fallback
1. First attempt: all residual sells in **one PTB** (batch)
2. On failure: fall back to **individual PTB per sell** order
3. Failed individual orders carry to next batch window

### Current Limitation
- Flash loans only implemented for **residual SELL** orders (SUI → USDC via DeepBook)
- Residual **BUY** orders carry over to next batch (no flash loan path yet)
- BUY flash loans would need: borrow USDC → swap to SUI → repay with buyer's locked USDC

---

## Order Lifecycle

```
PENDING ──────────► MATCHED ──────────► SETTLED
   │                                        │
   │   (TEE finds price cross               │  (Funds transferred to
   │    or flash loan settles)              │   encrypted receivers)
   │                                        │
   ├──────────────► CANCELLED               │
   │   (User cancels,                       ▼
   │    funds refunded)              [VIEW TX] on SuiScan
   │
   └──────────────► EXPIRED
       (Expiry time passed)
```

**Frontend Orders Page (`/orders`):**
- Filter tabs: ALL / PENDING / MATCHED / SETTLED
- Pending orders show "HIDDEN" with pulsing dot (order details encrypted)
- Settled orders show transaction digest with link to SuiScan
- Cancel button available on pending orders

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Smart Contracts | Move (Sui) | Groth16 verification, Seal integration, generic coin types |
| ZK Proofs | Circom + snarkjs | Groth16 circuit, browser-side WASM proving |
| Order Encryption | Sui Seal | Threshold encryption (2-of-3 key servers) |
| Matching Engine | Node.js + Express | TypeScript, @mysten/sui SDK v2.1.0 |
| TEE Framework | Marlin Oyster | Intel Nitro enclaves, secp256k1 attestation |
| Flash Loans | DeepBook V3 | @mysten/deepbook-v3, hot potato PTBs |
| Frontend | Next.js 15 | React 19, App Router, Tailwind CSS |
| State Management | Zustand | Persisted stores (wallet, orders) |
| Wallet | @mysten/dapp-kit | Sui wallet connection + signing |
| Cross-Chain | LI.FI | EVM → Sui bridging (design phase) |

---

## What Is Implemented vs. What Needs Work

### Implemented (Working)
- [x] Dark pool contract: submit_order, cancel_order, settle_match, settle_single
- [x] On-chain Groth16 proof verification
- [x] Nullifier-based replay prevention
- [x] ZK circuit: order_commitment.circom compiled + trusted setup
- [x] Browser-side proof generation (snarkjs WASM)
- [x] Sui Seal encryption + TEE decryption
- [x] In-memory order book with price-time priority
- [x] Batch engine (60s windows, 10-order threshold)
- [x] Internal two-party matching
- [x] Settlement via settle_match on-chain
- [x] Flash loan settlement for residual SELL orders (DeepBook V3)
- [x] Hot potato pattern PTBs
- [x] TEE attestation signing (secp256k1)
- [x] TEE dashboard with metrics + logs + attestations
- [x] Privacy-safe API endpoints (redacted commitment hashes)
- [x] Order tracking UI with status filters
- [x] Order cancellation flow
- [x] Landing page with scroll animation
- [x] Event polling (SuiListener, 2s interval)

### Needs Work
- [ ] **Dual-coin pool** — Contract currently single-coin (SUI only). Need two vaults for base/quote
- [ ] **Encrypted receiver addresses** — Not in Seal payload, contract, or engine yet
- [ ] **Multi-address percentage splits** — Settlement, contract, and UI needed
- [ ] **Proper settlement payouts** — Internal matching currently returns locked amounts (no real swap)
- [ ] **Flash loans for BUY orders** — Only SELL residuals settled via flash loans
- [ ] **DBUSDC balance display** — UI only shows SUI balance
- [ ] **Cross-chain deposit** — LI.FI UI exists but bridging not implemented
- [ ] **Amount privacy** — Locked coin amount visible on-chain (stretch goal)

---

## Security Model

### Trust Assumptions

1. **TEE is honest** — The matching engine has access to decrypted orders. In production, Marlin Oyster Nitro attestation provides hardware-backed tamper-proof guarantees. In local-dev mode, this is trust-based.
2. **Groth16 proofs are sound** — ZK proofs prevent invalid orders (negative amounts, expired orders, insufficient balance). Circuit constraints enforced mathematically.
3. **Seal encryption is secure** — 2-of-3 threshold key servers. Compromise requires collusion of 2+ servers.
4. **MatcherCap is controlled** — Only the TEE holds the capability object to call settle_match/settle_single. No other entity can trigger settlement.

### On-Chain Guarantees

- **Solvency:** `payout_a + payout_b <= locked_a + locked_b` enforced in settle_match
- **Replay prevention:** Nullifiers tracked in table, same nullifier rejected on second use
- **Authorization:** MatcherCap capability required for all settlement functions
- **Proof validity:** Every order submission requires valid Groth16 proof
- **Atomic settlement:** Flash loan PTBs revert entirely on any failure

### What Cannot Be Guaranteed

- **Order front-running by TEE:** The TEE sees all decrypted orders. A malicious TEE operator could exploit this. Mitigation: hardware attestation in production.
- **Amount privacy:** The locked coin value is visible on-chain. Mitigation: could use fixed deposit sizes or decoy amounts (not implemented).
- **Side privacy (single pair):** With one pair, coin type reveals buy/sell intent. Mitigation: multiple pairs on unified pool.
