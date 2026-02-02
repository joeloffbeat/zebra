# Zebra — Sui-Native ZK Dark Pool

> Hidden limit orders with on-chain Groth16 verification. Stripes hide in plain sight.

**Target Sponsors:** Sui ($10k) + LI.FI ($6k) = **$16k potential**

---

## Problem

Every limit order you place is visible. Visibility is a liability.

- **Order hunting**: You place a $100k buy at $1,800. Market makers push price to $1,801. Your order never fills.
- **MEV extraction**: Bots watch pending orders. Sandwich your trade. Extract value.
- **Information asymmetry**: Institutions have dark pools. Retail traders are exposed.

Your order is information that works against you.

---

## Solution

**Zebra** is a Sui-native ZK dark pool where limit orders are hidden until matched.

1. **Commit**: Submit a hash commitment of your order (side, token, amount, price, secret)
2. **Prove**: Generate a Groth16 ZK proof that your order is valid (verified on-chain by Sui)
3. **Match**: Off-chain matching engine finds order crosses
4. **Reveal**: Both parties reveal orders, proofs verify commitments
5. **Settle**: DeepBook v3 executes the trade atomically

**Key differentiator**: ZK proofs are verified **on-chain** using Sui's native `groth16::verify_groth16_proof` Move primitive. No trusted third party.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER (Browser)                                  │
│                                                                              │
│  1. Create order locally                                                    │
│  2. Generate commitment = hash(side, token, amount, price, expiry, secret)  │
│  3. Generate Groth16 ZK proof (proves: valid order, sufficient balance)     │
│  4. Submit commitment + proof to Sui                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZEBRA MOVE CONTRACT (Sui)                           │
│                                                                              │
│  • Receives commitment + ZK proof                                           │
│  • Verifies proof on-chain: sui::groth16::verify_groth16_proof()            │
│  • Stores valid commitments in shared object                                │
│  • Locks user funds against commitment                                      │
│  • Emits events for matching engine                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MATCHING ENGINE (Off-chain)                         │
│                                                                              │
│  • Monitors commitment events                                               │
│  • Users optionally encrypt order details to matching engine                │
│  • Finds crosses: buy_price >= sell_price                                   │
│  • Triggers reveal phase for matched orders                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REVEAL & SETTLE                                │
│                                                                              │
│  • Both parties submit reveals (order details + secret)                     │
│  • Contract verifies: hash(reveal) == commitment                            │
│  • DeepBook v3 executes atomic swap                                         │
│  • Funds transfer between parties                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              LI.FI DEPOSITS                                 │
│                                                                              │
│  • Cross-chain deposits from any EVM chain                                  │
│  • Swap + Bridge + Deposit to Sui in one transaction                        │
│  • Powered by LI.FI Composer API                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ZK Circuit (Groth16)

The user generates a proof that:

```
Public Inputs:
  - commitment (hash)
  - user_address
  - balance_root (Merkle root of user balances)

Private Inputs:
  - side (BUY or SELL)
  - token_pair
  - amount
  - price
  - expiry
  - secret

Constraints:
  1. commitment == hash(side || token_pair || amount || price || expiry || secret)
  2. amount > 0
  3. price > 0
  4. expiry > current_epoch
  5. user has sufficient balance (Merkle proof against balance_root)
```

**Curve**: BN254 or BLS12-381 (both supported by Sui's groth16 module)

---

## Sui Integration

### On-Chain Groth16 Verification

```move
module zebra::dark_pool {
    use sui::groth16;

    public fun submit_order(
        commitment: vector<u8>,
        proof_points: vector<u8>,
        public_inputs: vector<u8>,
        ctx: &mut TxContext
    ) {
        // Prepare verification key (pre-computed, stored on-chain)
        let pvk = groth16::prepare_verifying_key(&groth16::bn254(), &VK_BYTES);

        // Verify the ZK proof on-chain
        let valid = groth16::verify_groth16_proof(
            &groth16::bn254(),
            &pvk,
            &public_inputs,
            &proof_points
        );

        assert!(valid, EInvalidProof);

        // Store commitment, lock funds
        // ...
    }
}
```

### DeepBook v3 Settlement

```move
module zebra::settlement {
    use deepbook::pool;
    use deepbook::balance_manager;

    public fun settle_match(
        pool: &mut Pool<BaseAsset, QuoteAsset>,
        buyer_reveal: OrderReveal,
        seller_reveal: OrderReveal,
        // ...
    ) {
        // Verify reveals match commitments
        assert!(hash(buyer_reveal) == buyer_commitment, ERevealMismatch);
        assert!(hash(seller_reveal) == seller_commitment, ERevealMismatch);

        // Calculate execution price (midpoint)
        let exec_price = (buyer_reveal.price + seller_reveal.price) / 2;

        // Execute via DeepBook
        pool::place_market_order(pool, ...);
    }
}
```

---

## Cross-Chain Deposits (LI.FI)

Users can deposit from any EVM chain:

```typescript
import { getQuote, executeRoute } from '@lifi/sdk';

async function depositToZebra(fromChain: string, token: string, amount: string) {
    const quote = await getQuote({
        fromChain,
        toChain: 'sui',
        fromToken: token,
        toToken: 'USDC', // Sui USDC
        fromAmount: amount,
        toAddress: userSuiAddress,
    });

    // Execute swap + bridge + deposit in one transaction
    await executeRoute(quote);
}
```

---

## Order Flow

### 1. Place Hidden Order

```
User                          Zebra Contract              Matching Engine
  │                                  │                            │
  │ 1. Generate secret locally       │                            │
  │ 2. Create commitment             │                            │
  │ 3. Generate ZK proof             │                            │
  │                                  │                            │
  │ ─── submit(commitment, proof) ──▶│                            │
  │                                  │                            │
  │                    4. Verify proof on-chain                   │
  │                    5. Lock funds                              │
  │                    6. Store commitment                        │
  │                                  │                            │
  │                                  │ ─── OrderCommitted event ──▶│
  │                                  │                            │
  │ ◀─────── confirmation ───────────│                            │
```

### 2. Order Matching

```
Matching Engine                    Zebra Contract
      │                                  │
      │ 1. Monitor commitments           │
      │ 2. Receive encrypted orders      │
      │    (optional, for matching)      │
      │ 3. Find cross:                   │
      │    buy_price >= sell_price       │
      │                                  │
      │ ─── triggerReveal(buyer, seller) ─▶│
      │                                  │
      │                    4. Notify both parties
```

### 3. Reveal & Settle

```
Buyer                 Seller              Zebra Contract           DeepBook
  │                      │                       │                     │
  │ ─── reveal(order, secret) ──────────────────▶│                     │
  │                      │                       │                     │
  │                      │ ─── reveal(order, secret) ─▶│              │
  │                      │                       │                     │
  │                      │          5. Verify both reveals            │
  │                      │          6. Calculate exec price           │
  │                      │                       │                     │
  │                      │                       │ ── settle(trade) ──▶│
  │                      │                       │                     │
  │                      │                       │ ◀── confirmation ───│
  │                      │                       │                     │
  │ ◀────────────── funds transferred ──────────▶│                     │
```

---

## Privacy Properties

| Property | Guarantee |
|----------|-----------|
| Order price hidden | Until reveal (after match) |
| Order size hidden | Until reveal (after match) |
| Order direction hidden | Until reveal (after match) |
| User identity | Public (Sui address) |
| Proof of validity | On-chain (trustless) |

**What's NOT hidden:**
- That you placed an order (commitment is public)
- Your Sui address
- Approximate timing

**Future enhancement:** zkLogin integration for anonymous order submission

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Sui |
| Smart Contracts | Move |
| ZK Proofs | Groth16 (Circom + snarkjs) |
| On-chain Verification | sui::groth16 |
| Orderbook | DeepBook v3 |
| Cross-chain | LI.FI Composer |
| Frontend | React + Next.js |
| Sui SDK | @mysten/sui.js |

---

## Sponsor Alignment

### Sui ($10k)

- **Best Overall Project** ($3k): Meaningful use of Sui capabilities
- **Notable Projects** ($1k each): Working prototype with clear strength

**Why we qualify:**
- Native Groth16 verification (sui::groth16 module)
- DeepBook v3 integration for settlement
- Move smart contracts
- PTBs for atomic operations

### LI.FI ($6k)

- **Best Use of LI.FI Composer in DeFi** ($2.5k): Cross-chain deposits

**Why we qualify:**
- Users deposit from any EVM chain to Sui
- Swap + Bridge + Deposit in one transaction
- Solves real UX problem (onboarding to Sui)

---

## Roadmap

### Hackathon MVP
- [ ] Groth16 circuit for order validity
- [ ] Move contract with on-chain verification
- [ ] Basic matching engine
- [ ] DeepBook v3 settlement
- [ ] LI.FI deposit integration
- [ ] React frontend

### Post-Hackathon
- [ ] zkLogin integration for anonymous orders
- [ ] Multi-asset support
- [ ] Partial fills
- [ ] Order modification (cancel + re-submit)
- [ ] Mobile app

---

## Team

- **Gabriel** - Full Stack + Smart Contracts

---

## Links

- GitHub: github.com/gabrielantonyxaviour/zebra
- Twitter: @gabrielaxy
- ENS: gabrielaxy.eth
