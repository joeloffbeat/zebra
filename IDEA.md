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
