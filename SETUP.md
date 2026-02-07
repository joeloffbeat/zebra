# Zebra Dark Pool - Setup & Run Guide

## Prerequisites

- Node.js 22+
- Sui CLI (optional, for contract deployment)
- Testnet SUI tokens (get from https://faucet.sui.io)

## Project Structure

```
zebra/
  contracts/     # Move smart contract (dark_pool.move)
  circuits/      # Circom ZK circuit + build artifacts (wasm, zkey, vkey)
  matching-engine/  # TEE matching engine (Marlin Oyster)
  frontend/      # Next.js frontend
  scripts/       # Deploy, test, and utility scripts
  .env           # Environment config (not committed)
```

## Quick Start (Demo Mode)

### 1. Environment Setup

```bash
cp .env.example .env
```

Fill in `.env`:
```
SUI_PRIVATE_KEY=suiprivkey1...          # Your Sui testnet private key
DARK_POOL_PACKAGE=0x9e4fc5a...          # Already deployed (see below)
DARK_POOL_OBJECT=0x7934c4fd...          # Already deployed
MATCHER_CAP_ID=0x94adaf31...            # Already deployed
```

Current deployed addresses:
```
DARK_POOL_PACKAGE=0x9e4fc5a3129441e3a964bdbf2776ec332a375a46d1a0bac624731abbf7874ebf
DARK_POOL_OBJECT=0x7934c4fd0158a853a81313d9a6a0573a1b3d041dd6a2ae17b3487472d0f70374
MATCHER_CAP_ID=0x94adaf3185e314a7391ed3f7ead89e10fcbf1fa65f8abd94b39c3abf2dbb37c7
```

### 2. Install Dependencies

```bash
# Matching Engine
cd matching-engine && npm install && cd ..

# Scripts (for E2E tests)
cd scripts && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 3. Start Matching Engine (TEE)

```bash
cd matching-engine && npm run dev
```

Expected output:
```
Zebra Matching Engine running on port 3001
TEE mode: local-dev
WARNING: SEAL_ALLOWLIST_ID not set — running in DEMO MODE (no order privacy)
Skipped past historical events (cursor: ...)
Polling for new OrderCommitted events...
```

### 4. Verify Matching Engine

```bash
# Health check
curl http://localhost:3001/health

# Status (TEE info + order counts)
curl http://localhost:3001/status

# TEE metrics
curl http://localhost:3001/tee/metrics
```

### 5. Run E2E Test (Full Flow)

With the matching engine running in another terminal:

```bash
npx tsx scripts/test-e2e-tee.ts
```

This runs 10 phases:
1. Matching engine health + TEE check
2. Submit BUY order on-chain (ZK proof)
3. Submit SELL order on-chain (ZK proof)
4. Poll for match + settlement
5. TEE attestation signature verification
6. Multi-order submission (2 buys + 1 sell)
7. Poll for multi-order settlements
8. Flash loan demo
9. Privacy validation (no data leaks)
10. TEE metrics dashboard

Expected: **26/26 PASS**

### 6. Start Frontend

```bash
cd frontend && npm run dev
```

Frontend reads from `frontend/.env.local` (already configured).

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Matching engine status + TEE info + order counts |
| `/orders` | GET | Privacy-safe order list (commitment prefixes only) |
| `/matches` | GET | Privacy-safe match list (no execution details) |
| `/tee/metrics` | GET | Full TEE metrics dashboard data |
| `/tee/attestations` | GET | Redacted attestation list (sigs, no amounts) |
| `/tee/attestation/raw` | GET | Oyster Nitro attestation (enclave mode only) |
| `/attestation` | GET | Internal: full attestation data (for tests) |
| `/deepbook/midprice` | GET | DeepBook reference price |
| `/flash-loan/demo` | POST | Execute flash loan demo |
| `/flash-loan/pools` | GET | Available DeepBook pools |

---

## TEE Modes

### local-dev (default)
- `TEE_MODE=local-dev` or unset
- Random ephemeral secp256k1 key generated at startup
- All signing, matching, settlement logic is **identical to enclave mode**
- Only difference: key is not hardware-protected
- No Oyster attestation sidecar

### enclave (Marlin Oyster)
- `TEE_MODE=enclave`
- Reads secp256k1 private key from `/app/ecdsa.sec` (injected by Oyster)
- Oyster attestation sidecar on ports 1300/1301
- Hardware-backed key storage + Nitro attestation
- Zero code changes from local-dev

---

## Demo Mode vs Production

| | Demo Mode | Production |
|---|-----------|------------|
| **Trigger** | `SEAL_ALLOWLIST_ID` not set | `SEAL_ALLOWLIST_ID` set |
| **Order privacy** | None (uses on-chain `lockedAmount`) | Seal-encrypted order data |
| **Matching** | Works on public amounts | Works on decrypted private data |
| **Settlement** | Real on-chain | Real on-chain |
| **TEE attestations** | Real signatures | Real signatures |

---

## Redeploying Contracts (if needed)

```bash
# 1. Deploy package
npx tsx scripts/deploy.ts

# 2. Create pool (uses deployed package)
npx tsx scripts/create-pool.ts

# 3. Update .env with new addresses from output
```

---

## Known Issues

1. **DeepBook midPrice**: Fails with "Missing transaction sender" — SDK bug, non-blocking (matcher uses null refPrice)
2. **Flash loan**: `UnusedValueWithoutDrop` on testnet — DeepBook PTB hot potato pattern issue
3. **Testnet faucet**: Rate-limited. Use https://faucet.sui.io web UI if CLI/API blocked
4. **Historical events**: Matching engine skips them on startup. If you need to reprocess, restart the engine

---

## Wallet Balance

The E2E test needs ~0.1 SUI minimum. Each order locks 3M MIST (0.003 SUI) + ~3M gas. Check balance:

```bash
curl -s -X POST https://fullnode.testnet.sui.io:443 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"suix_getBalance","params":["YOUR_ADDRESS","0x2::sui::SUI"]}'
```

Get tokens: https://faucet.sui.io/?address=YOUR_ADDRESS
