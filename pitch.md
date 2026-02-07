# Zebra — ZK Dark Pool on Sui

**ETHGlobal HackMoney 2026 | Solo Build**

---

## Problem

Every trade on Sui is fully transparent. When you place an order on DeepBook — Sui's native order book — your limit price, order size, wallet address, and trade history are visible to the entire network. A whale placing a large sell order moves the market before it fills. A profitable trader's strategy can be copied in real-time by anyone watching on-chain. Settlement reveals exactly who received what, making every trading relationship trivially traceable.

In traditional finance, this problem was solved decades ago with dark pools — private trading venues where order details are hidden until execution. Over $3 trillion in annual volume flows through dark pools like IEX and Liquidnet. On Sui, no equivalent exists. DeepBook, Cetus, Turbos, Kriya — every DEX is an open book.

Zebra brings dark pool infrastructure to Sui.

---

## Solution

Zebra is the first ZK dark pool on Sui. It enables private limit orders where prices are hidden, matching happens inside a secure enclave, and settlement routes funds to encrypted receiver addresses — breaking every link between order placement and fund receipt.

A user placing an order on Zebra goes through a pipeline of six privacy layers:

1. A **Groth16 ZK proof** is generated in the browser proving the order is valid (positive amount, sufficient balance, non-expired) without revealing any order parameters
2. The order details (side, price, amount, receiver addresses with percentage splits) are **encrypted with Sui Seal** — threshold encryption where only the TEE can decrypt using 2-of-3 key servers
3. The commitment hash, encrypted blob, and ZK proof are submitted on-chain. The **Move contract verifies the Groth16 proof** natively using `sui::groth16::verify`, checks the nullifier for replay prevention, and locks the user's coins in a vault
4. The on-chain event contains **only the commitment hash and encrypted data** — no amounts, no addresses, no side information
5. The **TEE matching engine** (running on Nautilus) decrypts the order via Seal, adds it to an in-memory order book, and runs price-time priority matching in 60-second batch windows. Matched pairs are settled on-chain. Unmatched orders are **automatically filled via DeepBook V3 flash loans** using the hot potato pattern — borrow, swap, repay, and settle in a single atomic PTB
6. Funds are transferred to **encrypted receiver addresses** specified inside the Seal payload. A user can split settlement across multiple wallets by percentage — 60% to one address, 40% to another. Only the TEE knows where the funds go

The result: an on-chain observer sees a commitment hash go in and funds arrive at unrelated addresses. There is no visible connection between the trader, the order, and the settlement.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          BROWSER                                     │
│  ZK Proof (snarkjs/Circom)  ·  Sui Seal Encryption  ·  dapp-kit    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   ┌───────────────┐   ┌────────────────┐   ┌─────────────────────┐
   │  DARK POOL    │   │  DEEPBOOK V3   │   │  TEE MATCHING       │
   │  CONTRACT     │   │                │   │  ENGINE             │
   │  (Move)       │   │  Flash loans   │   │  (Nautilus)         │
   │               │   │  SUI ↔ USDC    │   │                     │
   │  · ZK verify  │   │  Swaps         │   │  · Seal decrypt     │
   │  · Vault lock │   │  Mid-price     │   │  · Order book       │
   │  · Nullifiers │   │  reference     │   │  · Batch matching   │
   │  · Settlement │   │                │   │  · Flash loan PTBs  │
   │  · Receiver   │   │                │   │  · Attestation      │
   │    routing    │   │                │   │    signing          │
   └───────────────┘   └────────────────┘   └─────────────────────┘
```

The entire stack is built on Sui-native primitives. The Move contract uses Sui's built-in Groth16 verifier. Seal provides threshold encryption without third-party key management. DeepBook provides flash loan liquidity for settling unmatched orders. The TEE runs on Nautilus with secp256k1 attestation signing for verifiable execution. **Privy** provides multi-chain authentication with embedded wallets for EVM, Solana, SUI, and BTC — enabling seamless onboarding across ecosystems.

---

## Encrypted Receiver Routing

This is Zebra's core differentiator. Most privacy DEX designs stop at hiding the order — but settlement still reveals the recipient. If `0xAAA` places an order and `0xAAA` receives funds, the link is trivial.

Zebra breaks this entirely. Receiver addresses and split percentages live inside the Seal-encrypted payload. The TEE reads them at settlement time and routes funds accordingly:

```
Without Zebra:   0xAAA places order  →  0xAAA receives funds    (trivially linked)

With Zebra:      0xAAA places order  →  0xBBB receives 60%      (no link)
                                        0xCCC receives 40%      (no link)
```

On-chain settlement events contain only commitment hashes — no receiver addresses, no payout amounts, no side. The connection between the order submitter and the fund recipients is completely severed.

This enables use cases beyond simple trading privacy: private treasury distribution, multi-wallet portfolio management, and untraceable OTC settlement — all in a single atomic transaction.

---

## Deep Sui Ecosystem Integration

Zebra is built entirely on Sui-native infrastructure with cross-chain onboarding via LiFi. Every core component leverages a specific Sui primitive or best-in-class integration:

**Sui Move + Groth16** — The dark pool contract verifies Groth16 ZK proofs on-chain using Sui's native `sui::groth16` module. No external verifier contracts, no precompile hacks. Order commitments are Poseidon hashes with nullifier tracking for replay prevention. The contract uses Move's capability pattern (`MatcherCap`) to authorize only the TEE for settlement operations.

**Sui Seal** — Order data (price, side, amount, receiver addresses) is encrypted using Sui Seal's threshold encryption with 2-of-3 key servers on mainnet. The encryption is tied to a Seal allowlist, meaning only authorized TEE instances can build the `seal_approve` PTB needed for decryption. No centralized key server, no single point of failure.

**DeepBook V3** — Unmatched orders after batch resolution are settled via DeepBook V3 flash loans. The TEE builds a Programmable Transaction Block using the hot potato pattern: `borrowBaseAsset` → `swapExactBaseForQuote` → `settle_single` (extract locked coins from vault) → `returnBaseAsset` → transfer output to receivers. The flash loan object has no `drop` ability in Move, forcing atomic execution — if any step fails, the entire PTB reverts. DeepBook also provides the reference mid-price for market orders.

**Nautilus TEE** — The matching engine runs inside a Nautilus TEE enclave with secp256k1 key management. Every settlement produces a signed attestation that can be verified on-chain. The TEE dashboard on the frontend displays live metrics (orders, matches, settlements, volume), trust badges, and engine logs — all privacy-safe with no decrypted data exposed. In local-dev mode, the enclave uses an ephemeral key with identical logic for development. In production, Nautilus provides hardware-backed attestation via Intel Nitro sidecars.

---

## LiFi Cross-Chain Bridging

Zebra supports cross-chain deposits via LiFi, enabling users from any supported ecosystem — EVM, Solana, and BTC — to bridge assets directly to Sui USDC for trading on the dark pool.

**Cross-chain deposit flow** — Users can bridge USDC from Arbitrum, Ethereum, Optimism, Solana, or any LiFi-supported chain directly into Sui USDC. The bridged funds are immediately available for placing private orders on Zebra. No manual token swaps or multi-step bridging required.

**Working demo pair** — ARB mainnet to SUI mainnet is the working demo pair. Users bridge USDC from Arbitrum to Sui in a single transaction, then trade privately on Zebra. This demonstrates the full cross-chain onboarding flow from an EVM chain to Sui's dark pool infrastructure.

**Multi-chain reach** — By integrating LiFi's aggregation layer, Zebra taps into liquidity and users from across the entire crypto ecosystem. Traders on Ethereum, Arbitrum, Optimism, Solana, and other chains can onboard to Sui-native private trading without leaving the Zebra interface.

---

## What's Novel

**First privacy DEX on Sui** — No dark pool or privacy-preserving trading mechanism exists on the Sui network today.

**Six-layer privacy pipeline** — ZK proofs, Seal encryption, TEE matching, commitment-only events, flash loan settlement, and encrypted receiver routing. Each layer addresses a different privacy vector. Together they cover order validity, data confidentiality, execution privacy, on-chain opacity, liquidity availability, and settlement unlinkability.

**Encrypted receiver routing with percentage splits** — Goes beyond hidden orders. The entire settlement path — from order to fund receipt — is private. Users specify receiver addresses and split percentages inside the encrypted payload. Only the TEE knows the routing.

**Flash loan auto-settlement** — Orders don't wait for counterparties indefinitely. After 60-second batch matching, residual orders are automatically filled against DeepBook liquidity via flash loans. The hot potato pattern ensures atomicity — no partial fills, no stuck funds.

**Cross-Chain Onboarding via LiFi** — Users from EVM chains, Solana, and BTC can bridge USDC directly to Sui for private trading. ARB mainnet to SUI mainnet is the working demo pair. LiFi aggregation removes the friction of manual bridging and multi-step onboarding, making Zebra accessible to traders across the entire crypto ecosystem.

**Full Sui-native stack** — Every privacy primitive (Groth16, Seal, Nautilus, DeepBook) is native to Sui. Cross-chain onboarding via LiFi and multi-chain auth via Privy extend reach without compromising the Sui-native core.

---

## Demo

The live demo walks through a complete private trade:

1. Login via Privy — embedded wallets for EVM, Solana, SUI, BTC auto-created. SUI and USDC balances displayed
2. Place a SELL order with a custom receiver address — watch the ZK proof generate in-browser, Seal encrypt the order data, and submit the commitment on-chain. Check the explorer: only a hash and encrypted blob visible
3. Place a BUY order from a second wallet — same pipeline
4. Open the TEE dashboard — watch the orders get detected, decrypted inside the enclave, and matched in the batch window. Logs show processing metadata only, zero decrypted data
5. Settlement executes — funds arrive at the specified receiver address, not the submitter's wallet. Check the on-chain event: only commitment hashes, no receiver info
6. Submit an unmatched order — watch the flash loan auto-settle via DeepBook. Borrow, swap, repay, transfer — all in one PTB, visible as a single transaction on-chain
