# Sponsor Integrations

## Sui

### Why we're applicable

Zebra is a ZK dark pool built exclusively on Sui, leveraging five distinct Sui-native capabilities that would not be possible on other chains: on-chain Groth16 proof verification via `sui::groth16`, Sui Seal threshold encryption for order privacy, DeepBook V3 flash loans for atomic settlement, Move smart contracts with generic dual-coin vaults, and Programmable Transaction Blocks to compose multi-step settlement flows into single atomic transactions. The project demonstrates deep technical integration across the Sui stack — from browser-side proof generation to on-chain verification to TEE-based matching — and is designed as a foundation for continued development in the Sui DeFi ecosystem.

### Code references

**Move Smart Contract — Dual-coin dark pool with ZK verification**
- DarkPool struct with generic BaseCoin/QuoteCoin and dual vaults: [contracts/sources/dark_pool.move#L26-L34](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L26-L34)
- `submit_sell_order` — locks SUI, verifies ZK proof, stores commitment: [contracts/sources/dark_pool.move#L121-L156](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L121-L156)
- `submit_buy_order` — locks USDC, verifies ZK proof: [contracts/sources/dark_pool.move#L159-L194](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L159-L194)
- `settle_match` — cross-type settlement with multi-receiver percentage splits: [contracts/sources/dark_pool.move#L229-L285](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L229-L285)
- `settle_single_base` / `settle_single_quote` — extract locked coins for flash loan repayment: [contracts/sources/dark_pool.move#L289-L339](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L289-L339)

**On-chain Groth16 ZK Proof Verification (sui::groth16)**
- `prepare_verifying_key` with BN254 curve: [contracts/sources/dark_pool.move#L432-L435](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L432-L435)
- `verify_groth16_proof` — native on-chain proof verification: [contracts/sources/dark_pool.move#L440-L445](https://github.com/gabrielantonyxaviour/zebra/blob/main/contracts/sources/dark_pool.move#L440-L445)

**Sui Seal Threshold Encryption**
- Frontend encryption — 2-of-3 threshold encryption of order params (price, amount, side, receivers): [frontend/src/lib/seal/client.ts#L58-L63](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/seal/client.ts#L58-L63)
- TEE decryption — `seal_approve` PTB + session key decryption in matching engine: [matching-engine/src/seal-service.ts#L96-L113](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/seal-service.ts#L96-L113)

**DeepBook V3 Flash Loans — Atomic settlement against existing liquidity**
- `borrowBaseAsset` — flash borrow SUI from DeepBook: [matching-engine/src/flash-loan-settlement.ts#L187-L190](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/flash-loan-settlement.ts#L187-L190)
- `swapExactBaseForQuote` — swap borrowed SUI to USDC on DeepBook: [matching-engine/src/flash-loan-settlement.ts#L198-L204](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/flash-loan-settlement.ts#L198-L204)
- `returnBaseAsset` — repay flash loan with seller's locked SUI from vault: [matching-engine/src/flash-loan-settlement.ts#L225-L230](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/flash-loan-settlement.ts#L225-L230)
- Slippage protection via splitCoins assertion (workaround for DeepBook testnet): [matching-engine/src/flash-loan-settlement.ts#L208-L210](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/flash-loan-settlement.ts#L208-L210)
- DeepBookClient initialization: [matching-engine/src/deepbook-service.ts#L42-L46](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/deepbook-service.ts#L42-L46)

**Browser-Side ZK Proof Generation (snarkjs + Circom)**
- Groth16 proof generation in browser via WASM: [frontend/src/lib/zk/prover.ts#L47-L51](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/zk/prover.ts#L47-L51)
- Proof conversion to Sui Arkworks format: [frontend/src/lib/zk/prover.ts#L105-L119](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/zk/prover.ts#L105-L119)
- Circom circuit — Poseidon commitment + nullifier + constraints: [circuits/order_commitment.circom](https://github.com/gabrielantonyxaviour/zebra/blob/main/circuits/order_commitment.circom)

**PTB Construction for Order Submission**
- Sell order PTB — splitCoins + moveCall: [frontend/src/lib/sui/dark-pool.ts#L87-L103](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/sui/dark-pool.ts#L87-L103)
- Buy order PTB — fetch USDC coins, merge, lock: [frontend/src/lib/sui/dark-pool.ts#L104-L143](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/sui/dark-pool.ts#L104-L143)

**Sui dapp-kit Provider**
- SuiClientProvider + WalletProvider setup: [frontend/src/providers/sui-provider.tsx#L33-L36](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/providers/sui-provider.tsx#L33-L36)

**TEE Matching Engine (Marlin Nautilus)**
- In-memory order book with price-time priority: [matching-engine/src/order-book.ts#L50-L65](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/order-book.ts#L50-L65)
- Batch matching engine (60s windows): [matching-engine/src/batch-engine.ts#L143-L265](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/batch-engine.ts#L143-L265)
- secp256k1 TEE attestation signing: [matching-engine/src/tee-attestation.ts#L170-L204](https://github.com/gabrielantonyxaviour/zebra/blob/main/matching-engine/src/tee-attestation.ts#L170-L204)

### Additional feedback

Zebra uses five distinct Sui primitives (`sui::groth16`, Sui Seal, DeepBook V3, Move generics, PTBs) working together in a single pipeline — this is not a surface-level integration. The flash loan settlement is particularly notable: a single PTB borrows from DeepBook, swaps, extracts locked coins from the dark pool vault, repays the loan, and routes proceeds to encrypted receiver addresses — all atomically. The ZK circuit compiles to ~2.6MB WASM and proves in-browser in under 3 seconds, with the resulting proof verified natively on Sui via `sui::groth16::verify_groth16_proof`. We plan to continue building Zebra beyond the hackathon, expanding to multi-asset pools and integrating zkLogin for fully anonymous order submission.

---

## LI.FI

### Why we're applicable

Zebra integrates LI.FI as a cross-chain deposit layer so users can fund their dark pool from any EVM chain without leaving the app. The deposit page supports bridging USDC from five EVM chains (Arbitrum, Ethereum, Base, Optimism, Polygon) to Sui in a single flow using the LI.FI SDK, solving the concrete UX problem of onboarding liquidity to a Sui-native DeFi protocol.

### Code references

**LI.FI SDK Initialization**
- SDK config with integrator name: [frontend/src/lib/lifi/sdk.ts#L1-L14](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/lifi/sdk.ts#L1-L14)
- Auto-initialization on app mount via Web3Provider: [frontend/src/providers/web3-provider.tsx#L34-L36](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/providers/web3-provider.tsx#L34-L36)

**Cross-Chain Bridge Logic**
- `getQuoteArbToSui` — fetches bridge quote via LI.FI: [frontend/src/lib/lifi/bridge.ts#L13-L40](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/lifi/bridge.ts#L13-L40)
- `executeBridge` — executes cross-chain bridge transaction: [frontend/src/lib/lifi/bridge.ts#L42-L51](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/lifi/bridge.ts#L42-L51)
- `getBridgeStatus` — polls bridge transaction status: [frontend/src/lib/lifi/bridge.ts#L53-L64](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/lifi/bridge.ts#L53-L64)

**Chain & Token Constants**
- `LIFI_CHAIN_IDS` for 6 supported chains + USDC addresses: [frontend/src/lib/constants.ts#L9-L20](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/constants.ts#L9-L20)

**Deposit Page UI**
- Quote fetching with LI.FI: [frontend/src/app/deposit/page.tsx#L57-L77](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/app/deposit/page.tsx#L57-L77)
- Bridge execution: [frontend/src/app/deposit/page.tsx#L79-L94](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/app/deposit/page.tsx#L79-L94)
- Chain selector with all 5 EVM source chains: [frontend/src/app/deposit/page.tsx#L21-L27](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/app/deposit/page.tsx#L21-L27)

**EVM Chain Support (Wagmi)**
- Wagmi config with transports for Arbitrum, Ethereum, Base, Optimism, Polygon: [frontend/src/lib/wagmi.ts#L1-L14](https://github.com/gabrielantonyxaviour/zebra/blob/main/frontend/src/lib/wagmi.ts#L1-L14)

### Additional feedback

LI.FI solves a real onboarding problem for Zebra — most DeFi users hold assets on EVM chains, not Sui. By integrating LI.FI's SDK, users can deposit USDC from any of five EVM chains directly into their Sui wallet to start trading on the dark pool, without needing to manually bridge or use a separate tool.
