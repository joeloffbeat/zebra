# ZEBRA

> Hidden limit orders with on-chain Groth16 verification. Stripes hide in plain sight.

A Sui-native ZK dark pool for private order matching with on-chain proof verification — built for HackMoney 2026.

---

## Overview

Zebra is a dark pool protocol on Sui where:

- **Orders are hidden** — Submitted as hash commitments with ZK proofs
- **Proofs are verified on-chain** — Groth16 verification in Move smart contracts
- **Matching is private** — Backend matches sealed orders without seeing contents
- **Settlement is atomic** — DeepBook v3 executes matched trades in a single PTB

---

## Tech Stack

### Contracts & ZK
| Component | Technology |
|-----------|-----------|
| **Smart Contracts** | Move (Sui) |
| **ZK Proofs** | Groth16 via Circom + snarkjs |
| **Settlement** | DeepBook v3 |
| **Order Privacy** | Sui Seal encryption |
| **Cross-chain Deposits** | LI.FI |

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Sui SDK:** @mysten/sui.js

### Backend
- **Runtime:** Node.js + Express
- **Matching Engine:** Custom order book with encrypted order support
- **TEE Attestation:** For matcher integrity

---

## How It Works

1. **Deposit** — User deposits from any EVM chain via LI.FI bridge to Sui
2. **Create Order** — Client generates ZK proof of valid order parameters
3. **Submit** — Hash commitment + proof submitted on-chain, encrypted order sent to matcher
4. **Match** — Backend finds matching orders based on sealed parameters
5. **Reveal** — Both parties reveal order details for verification
6. **Settle** — DeepBook v3 executes the trade atomically via Sui PTB

---

## Project Structure

```
zebra/
├── contracts/               # Move smart contracts
│   ├── sources/            # dark_pool.move
│   └── tests/              # Move tests
├── circuits/               # Circom ZK circuits
│   ├── order_commitment.circom
│   └── scripts/            # Build and export scripts
├── frontend/               # Next.js application
│   └── src/
│       ├── app/            # Pages (trade, deposit, orders)
│       ├── components/     # UI + zebra-themed components
│       ├── hooks/          # use-dark-pool, use-wallet
│       └── lib/            # Sui client, ZK prover, Seal client
├── matching-engine/        # TEE matching engine (Marlin Oyster)
│   └── src/
│       ├── matcher.ts      # Order matching logic
│       ├── order-book.ts   # Order book management
│       ├── settlement.ts   # DeepBook settlement
│       └── seal-service.ts # Sui Seal integration
├── scripts/                # Deploy and test scripts
├── IDEA.md                 # Detailed concept
├── IMPLEMENTATION_PLAN.md  # Technical implementation plan
└── README.md               # This file
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Sui CLI
- circom + snarkjs (for ZK circuit compilation)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Matching Engine (TEE)
```bash
cd matching-engine
npm install
npm run dev
```

### Contracts
```bash
cd contracts
sui move build
sui move test
```

---

## Documentation

- [IDEA.md](./IDEA.md) — Full concept and architecture
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — Technical implementation details
- [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md) — Design system
- [WIREFRAMES.md](./WIREFRAMES.md) — Page wireframes

---

## License

MIT
