# ZEBRA - Complete Integration Handoff Document

## Project Summary

**ZEBRA** is a privacy-preserving ZK dark pool on Sui for hidden limit orders. Users submit orders with Groth16 ZK proofs, encrypt order details with Sui Seal, and a TEE (Trusted Execution Environment) matching engine decrypts, matches, and settles orders on-chain.

**The key integration task**: Replace the current two-party matching system with a **zero-counterparty settlement architecture** using DeepBook V3 flash loans. Instead of waiting for a matching counterparty, the TEE uses DeepBook flash loans to fill orders against DeepBook liquidity while preserving user privacy.

---

## Repository Structure

```
zebra/
  contracts/          # Sui Move smart contracts (dark_pool module)
  matching-engine/    # Node.js/TypeScript TEE matching engine (port 3001)
  frontend/           # Next.js 16 frontend application
```

---

## 1. CURRENT ARCHITECTURE (What Exists Now)

### Data Flow (Current)
```
User submits order on frontend
  -> ZK proof generated in browser (snarkjs Groth16)
  -> Order encrypted with Sui Seal (threshold encryption)
  -> Transaction submitted: dark_pool::submit_order (locks SUI in vault)
  -> On-chain OrderCommitted event emitted
  -> Matching engine polls for events (every 2s)
  -> Seal decryption reveals: side, price, amount
  -> Order added to in-memory order book
  -> Matcher runs price-time priority matching
  -> When bid >= ask: match found
  -> Settlement: dark_pool::settle_match (redistributes locked SUI)
  -> TEE signs attestation of settlement
```

### Problem with Current Architecture
The current system requires TWO traders with crossing prices (bid >= ask) to match. For a hackathon demo, this is impractical because you need two separate wallets submitting complementary orders. The settlement is also SUI/SUI only (single token model) - it just redistributes locked SUI amounts.

---

## 2. TARGET ARCHITECTURE (What Needs To Be Built)

### Zero-Counterparty Settlement via DeepBook V3 Flash Loans

Instead of matching two traders, each order is independently filled using DeepBook liquidity:

#### SELL Order Flow (User wants to sell SUI for USDC)
```
1. User locks SUI in dark pool vault (existing - works today)
2. TEE detects order via event + Seal decryption (existing - works today)
3. TEE builds a single PTB (Programmable Transaction Block):
   a. Flash borrow SUI from DeepBook (borrowBaseAsset)
   b. Sell borrowed SUI on DeepBook for USDC (swapExactBaseForQuote)
   c. Repay flash loan with user's locked SUI from vault (returnBaseAsset)
   d. Send USDC to user
4. TEE signs attestation
```

#### BUY Order Flow (User wants to buy SUI with USDC)
```
1. User locks USDC in dark pool vault (REQUIRES CONTRACT CHANGES - see below)
2. TEE detects order via event + Seal decryption (existing - works today)
3. TEE builds a single PTB:
   a. Flash borrow USDC from DeepBook (borrowQuoteAsset)
   b. Buy SUI on DeepBook with borrowed USDC (swapExactQuoteForBase)
   c. Repay flash loan with user's locked USDC from vault (returnQuoteAsset)
   d. Send SUI to user
4. TEE signs attestation
```

### Why This Works
- **Privacy preserved**: External observers see a DeepBook swap from the TEE address, not from the user. The user's intent (buy/sell) is never publicly linked to the DeepBook trade.
- **No counterparty needed**: Each order fills independently against DeepBook liquidity.
- **Atomic**: Flash loan + swap + repay + payout all happen in one PTB. If any step fails, everything reverts.
- **Price tradeoff**: User gets DeepBook market price instead of their limit price. This is acceptable as "the price of privacy."

### DeepBook V3 SDK Confirmation
The DeepBook V3 SDK (`@mysten/deepbook-v3@^1.0.3`) supports BOTH base and quote flash loans:

```typescript
// Base asset (SUI) flash loans - CONFIRMED WORKING (demo exists)
dbClient.flashLoans.borrowBaseAsset(poolKey, amount)(tx)
dbClient.flashLoans.returnBaseAsset(poolKey, amount, coinInput, flashLoan)(tx)

// Quote asset (USDC) flash loans - CONFIRMED IN SDK
dbClient.flashLoans.borrowQuoteAsset(poolKey, amount)(tx)
dbClient.flashLoans.returnQuoteAsset(poolKey, amount, coinInput, flashLoan)(tx)

// Swap methods (for trading borrowed assets)
dbClient.deepbook.swapExactBaseForQuote(params)(tx)  // SUI -> USDC
dbClient.deepbook.swapExactQuoteForBase(params)(tx)  // USDC -> SUI
```

All methods use a **currying pattern**: they return a function `(tx: Transaction) => result` that you apply to a Transaction object.

---

## 3. SMART CONTRACT (Move)

### File: `contracts/sources/dark_pool.move`
### Module: `zebra::dark_pool`
### Network: Sui Testnet

### Deployed Addresses
```
DARK_POOL_PACKAGE=0x3c6a4a56672936382afbfa4c74d21373f25eefaa38b4b809c69fb9488a6b2417
DARK_POOL_OBJECT=0x96ff4e93a6737673e712caa4f3e3df437a6ed5c83d1e74bf180dac84fdb6012e
ADMIN_CAP_ID=0x43037c9d9e9f8efab53e1956754decfefcd2cc32e9ce6b05aa35a34466857a3d
MATCHER_CAP_ID=0xb15d1db9c3516bbdf16430c4fef1a270bb35582345cc13fb7004f4d7d506e71e
```

### Current Contract Design
```move
public struct DarkPool<phantom CoinType> has key {
    id: UID,
    vk_bytes: vector<u8>,              // Groth16 verification key
    commitments: Table<vector<u8>, OrderCommitment>,
    nullifiers: Table<vector<u8>, bool>,
    vault: Balance<CoinType>,           // Locked funds
    config: PoolConfig,
}

public struct OrderCommitment has store, drop {
    commitment: vector<u8>,
    nullifier: vector<u8>,
    owner: address,
    locked_amount: u64,
    created_at: u64,
    encrypted_data: vector<u8>,
}
```

### Key Functions
```move
// User submits order with ZK proof + encrypted data + locked coins
public fun submit_order<CoinType>(
    pool: &mut DarkPool<CoinType>,
    coin: Coin<CoinType>,           // Locked in vault
    proof_points: vector<u8>,       // 128 bytes: G1(A) + G2(B) + G1(C)
    public_inputs: vector<u8>,      // Commitment + nullifier as 32-byte LE scalars
    commitment: vector<u8>,
    nullifier: vector<u8>,
    encrypted_data: vector<u8>,     // Seal-encrypted order params
    ctx: &mut TxContext
)

// TEE settles matched orders (current: redistributes locked SUI)
public fun settle_match<CoinType>(
    pool: &mut DarkPool<CoinType>,
    _matcher_cap: &MatcherCap,      // Only TEE can call this
    commitment_a: vector<u8>,
    commitment_b: vector<u8>,
    payout_a: u64,
    payout_b: u64,
    ctx: &mut TxContext
)

// User cancels their own order
public fun cancel_order<CoinType>(
    pool: &mut DarkPool<CoinType>,
    commitment: vector<u8>,
    ctx: &mut TxContext
): Coin<CoinType>
```

### CRITICAL CONTRACT LIMITATIONS FOR NEW ARCHITECTURE

1. **Single CoinType**: The pool is `DarkPool<SUI>` - it can only hold SUI in its vault. For BUY orders (user locks USDC), you need either:
   - A separate `DarkPool<USDC>` pool, OR
   - A new contract that holds multiple coin types (e.g., `vault_sui: Balance<SUI>` + `vault_usdc: Balance<USDC>`)

2. **settle_match requires TWO commitments**: Current `settle_match` takes `commitment_a` and `commitment_b`. For zero-counterparty settlement, you only have ONE order. You need a new function like:
   ```move
   public fun settle_single<CoinType>(
       pool: &mut DarkPool<CoinType>,
       _matcher_cap: &MatcherCap,
       commitment: vector<u8>,
       payout: Coin<OutputCoinType>,  // The coin the user receives
       ctx: &mut TxContext
   )
   ```

3. **Vault withdrawal**: The TEE needs to extract locked coins from the vault to repay the flash loan. Current contract only allows withdrawal through `settle_match` or `cancel_order`. A new function is needed for the TEE to withdraw a specific order's locked amount.

### Suggested Contract Changes
You will likely need a new function or modified settlement flow:
```move
// Option A: New settle_with_flash_loan function
public fun settle_with_flash_loan<LockCoinType, PayoutCoinType>(
    pool: &mut DarkPool<LockCoinType>,
    _matcher_cap: &MatcherCap,
    commitment: vector<u8>,
    payout_coin: Coin<PayoutCoinType>,  // Received from DeepBook swap
    ctx: &mut TxContext
): Coin<LockCoinType>  // Returns locked coins for flash loan repayment

// Option B: Extract locked coins + settle separately
public fun extract_locked_for_settlement<CoinType>(
    pool: &mut DarkPool<CoinType>,
    _matcher_cap: &MatcherCap,
    commitment: vector<u8>,
    ctx: &mut TxContext
): Coin<CoinType>  // TEE gets locked coins to repay flash loan
```

The key insight: in a single PTB, you can:
1. Call `extract_locked_for_settlement` to get the user's locked SUI from vault
2. Flash borrow SUI from DeepBook
3. Swap on DeepBook (SUI -> USDC)
4. Repay flash loan with the extracted locked SUI
5. Transfer USDC to user

---

## 4. MATCHING ENGINE (TEE Backend)

### Location: `matching-engine/`
### Entry Point: `src/index.ts`
### Port: 3001
### Runtime: Node.js with tsx

### Dependencies
```json
{
  "@mysten/deepbook-v3": "^1.0.3",
  "@mysten/seal": "^1.0.0",
  "@mysten/sui": "^2.1.0",
  "@noble/curves": "^1.4.0",
  "@noble/hashes": "^1.4.0",
  "cors": "^2.8.6",
  "dotenv": "^16.4.0",
  "express": "^4.18.0"
}
```

### Environment Variables (from .env at project root or matching-engine/)
```
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PRIVATE_KEY=<suiprivkey1...>
DARK_POOL_PACKAGE=0x3c6a4a56672936382afbfa4c74d21373f25eefaa38b4b809c69fb9488a6b2417
DARK_POOL_OBJECT=0x96ff4e93a6737673e712caa4f3e3df437a6ed5c83d1e74bf180dac84fdb6012e
MATCHER_CAP_ID=0xb15d1db9c3516bbdf16430c4fef1a270bb35582345cc13fb7004f4d7d506e71e
SEAL_PACKAGE_ID=0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82
SEAL_ALLOWLIST_ID=0xba6fda6cbedd1938debcec8883b07f1c7d2d1b9d744fe57c98c48e75cf05acf8
PORT=3001
TEE_MODE=local-dev
ENCLAVE_KEY_PATH=/app/ecdsa.sec
```

### Source Files

#### `src/index.ts` - Main server
- Initializes all services
- Wires event listener -> Seal decryption -> order book -> matcher -> settlement
- REST API endpoints
- Matching mutex for concurrency safety

**Current event handler (the code you need to modify):**
```typescript
listener.on('orderCommitted', async (order: CommittedOrder) => {
  teeService.incrementOrdersReceived();
  const decrypted = await sealService.decryptOrderData(order.encryptedData);
  if (decrypted) {
    const enrichedOrder: DecryptedOrderInfo = {
      ...order,
      decryptedPrice: decrypted.price,
      decryptedAmount: decrypted.amount,
      decryptedSide: decrypted.side,        // 0 = sell, 1 = buy
      decryptedLockedAmount: decrypted.amount,
    };
    orderBook.addOrder(enrichedOrder);
    scheduleMatch();   // <-- THIS triggers two-party matching. Replace with flash loan settlement.
  }
});
```

#### `src/flash-loan-service.ts` - DeepBook flash loans (EXISTING, working)
Currently only has a demo method that borrows and immediately returns. This is your starting point for building the real settlement.

```typescript
// Current demo implementation
const tx = new Transaction();
tx.setGasBudget(10_000_000);

const [baseAsset, flashLoan] = this.dbClient.flashLoans.borrowBaseAsset(poolKey, borrowAmount)(tx as any);
this.dbClient.flashLoans.returnBaseAsset(poolKey, borrowAmount, baseAsset, flashLoan)(tx as any);

const result = await this.suiClient.signAndExecuteTransaction({
  signer: this.keypair,
  transaction: tx,
  options: { showEffects: true },
});
```

#### `src/settlement.ts` - Current settlement (needs replacement)
Currently calls `dark_pool::settle_match` with TWO commitments. This needs to be replaced with the flash loan settlement.

```typescript
// Current settlement call
tx.moveCall({
  target: `${config.darkPoolPackage}::dark_pool::settle_match`,
  arguments: [
    tx.object(config.darkPoolObject),                                   // pool
    tx.object(config.matcherCapId),                                     // matcher_cap
    tx.pure(bcs.vector(bcs.u8()).serialize(commitmentABytes)),          // commitment_a
    tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBBytes)),          // commitment_b
    tx.pure(bcs.u64().serialize(payoutBuyer)),                          // payout_a
    tx.pure(bcs.u64().serialize(payoutSeller)),                         // payout_b
  ],
  typeArguments: ['0x2::sui::SUI'],
});
```

#### `src/matcher.ts` - Two-party matcher (may become simpler or removable)
Currently does price-time priority matching: bids sorted DESC, asks sorted ASC, matches when best_bid >= best_ask. With zero-counterparty settlement, matching is simpler - each order can be settled independently as soon as it arrives.

#### `src/deepbook-service.ts` - Price reference
Gets mid-price from DeepBook. Has a fallback of $3.50 when DeepBook returns null.

```typescript
async getMidPrice(poolKey: string = 'SUI_DBUSDC'): Promise<number | null>
```

#### `src/order-book.ts` - In-memory order storage
```typescript
interface DecryptedOrderInfo extends CommittedOrder {
  decryptedPrice: bigint;
  decryptedAmount: bigint;
  decryptedSide: number;    // 0 = sell, 1 = buy
  decryptedLockedAmount: bigint;
}
```
Side encoding: `0 = sell (ask), 1 = buy (bid)`

#### `src/seal-service.ts` - Seal decryption
Decrypts order data using Sui Seal with session keys. Returns:
```typescript
interface DecryptedOrderData {
  side: number;        // 0 = sell, 1 = buy
  price: bigint;       // In MIST (1 SUI = 1e9 MIST)
  amount: bigint;      // In MIST
  expiry: bigint;
  locked_amount?: bigint;
}
```

#### `src/sui-listener.ts` - Blockchain event polling
Polls for `{darkPoolPackage}::dark_pool::OrderCommitted` events every 2 seconds. Skips historical events on startup.

#### `src/tee-attestation.ts` - TEE attestation signing
Signs settlement attestations with secp256k1. Tracks metrics (orders, matches, settlements, volume).

#### `src/config.ts` - Environment config loader
Loads from `.env` files at project root, parent dir, or CWD.

---

## 5. DEEPBOOK V3 SDK REFERENCE

### Pool Key
The testnet pool is `SUI_DBUSDC`. This is the primary pool for both flash loans and swaps.

### Flash Loan Methods (all use currying pattern)
```typescript
// Borrow base asset (SUI)
borrowBaseAsset(poolKey: string, borrowAmount: number) => (tx: Transaction) => [baseCoin, flashLoan]

// Return base asset
returnBaseAsset(poolKey: string, borrowAmount: number, baseCoinInput, flashLoan) => (tx: Transaction) => void

// Borrow quote asset (USDC/DBUSDC)
borrowQuoteAsset(poolKey: string, borrowAmount: number) => (tx: Transaction) => [quoteCoin, flashLoan]

// Return quote asset
returnQuoteAsset(poolKey: string, borrowAmount: number, quoteCoinInput, flashLoan) => (tx: Transaction) => void
```

### Swap Methods
```typescript
// Sell base for quote (SUI -> USDC)
swapExactBaseForQuote(params: SwapParams) => (tx: Transaction) => [baseCoin, quoteCoin, deepCoin]

// Buy base with quote (USDC -> SUI)
swapExactQuoteForBase(params: SwapParams) => (tx: Transaction) => [baseCoin, quoteCoin, deepCoin]
```

### SwapParams Interface
```typescript
interface SwapParams {
  poolKey: string;
  amount: number;           // Amount to swap
  deepAmount?: number;      // DEEP token fee amount
  minOut?: number;          // Minimum output (slippage protection)
}
```

### Precision & Scalars
- SUI scalar: `1e9` (1 SUI = 1,000,000,000 MIST)
- DBUSDC scalar: `1e6` (1 USDC = 1,000,000)
- DEEP scalar: `1e6`
- FLOAT_SCALAR: `1e9` (for price encoding)

### DeepBook Client Initialization
```typescript
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const suiClient = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' });
const dbClient = new DeepBookClient({
  address: keypair.toSuiAddress(),
  network: 'testnet',
  client: suiClient,
});
```

### Available Testnet Pools
- `SUI_DBUSDC` (main pool, confirmed working)
- `DEEP_SUI`
- `DEEP_DBUSDC`

---

## 6. FRONTEND INTEGRATION LAYER

### Key Files

#### `frontend/src/lib/sui/dark-pool.ts` - Order submission
Builds the PTB for `dark_pool::submit_order`. Generates ZK proof, encrypts with Seal, locks SUI.

#### `frontend/src/hooks/use-dark-pool.ts` - React hook for order operations
Uses `useSignTransaction` + `suiClient.executeTransactionBlock` pattern (not `useSignAndExecuteTransaction` which has bugs).

#### `frontend/src/hooks/use-backend.ts` - Backend communication
All backend calls go through Next.js API routes (NOT direct to matching engine):
```
/api/status          -> localhost:3001/status
/api/orders          -> localhost:3001/orders
/api/matches         -> localhost:3001/matches
/api/deepbook/midprice -> localhost:3001/deepbook/midprice
/api/tee/metrics     -> localhost:3001/tee/metrics
/api/tee/attestations -> localhost:3001/tee/attestations
/api/flash-loan/demo -> localhost:3001/flash-loan/demo
/api/flash-loan/pools -> localhost:3001/flash-loan/pools
```

#### `frontend/src/lib/zk/prover.ts` - ZK proof generation
Uses snarkjs Groth16 with circuit files from `/public/circuits/`:
- `order_commitment.wasm`
- `order_commitment_0000.zkey`

Proof is compressed to 128 bytes (Arkworks format): G1(A)=32 + G2(B)=64 + G1(C)=32

#### `frontend/src/lib/seal/client.ts` - Seal encryption
Encrypts `{side, price, amount}` as JSON string using threshold encryption (2-of-2 key servers).

#### `frontend/src/app/trade/page.tsx` - Trade form
Supports LIMIT and MARKET orders. Market orders auto-fill DeepBook mid-price. All amounts in MIST (multiply by 1e9).

### Frontend Environment (`.env.local`)
```
NEXT_PUBLIC_DARK_POOL_PACKAGE=0x3c6a4a56672936382afbfa4c74d21373f25eefaa38b4b809c69fb9488a6b2417
NEXT_PUBLIC_DARK_POOL_OBJECT=0x96ff4e93a6737673e712caa4f3e3df437a6ed5c83d1e74bf180dac84fdb6012e
NEXT_PUBLIC_SEAL_ALLOWLIST_ID=0xba6fda6cbedd1938debcec8883b07f1c7d2d1b9d744fe57c98c48e75cf05acf8
NEXT_PUBLIC_SEAL_PACKAGE_ID=0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## 7. SEAL ENCRYPTION DETAILS

### Package & IDs
```
SEAL_PACKAGE_ID=0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82
SEAL_ALLOWLIST_ID=0xba6fda6cbedd1938debcec8883b07f1c7d2d1b9d744fe57c98c48e75cf05acf8
```

### Testnet Key Servers
```
0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75
0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8
```

### Encryption (Frontend)
```typescript
const { encryptedObject, key } = await sealClient.encrypt({
  threshold: 2,
  packageId: SEAL_PACKAGE_ID,
  id: allowlistId,
  data: dataBytes,  // JSON-encoded {side, price, amount}
});
```

### Decryption (Matching Engine)
```typescript
// Build seal_approve PTB
const tx = new Transaction();
tx.moveCall({
  target: `${sealPackageId}::allowlist::seal_approve`,
  arguments: [
    tx.pure.vector('u8', Array.from(idBytes)),  // allowlist ID as bytes
    tx.object(sealAllowlistId),                  // allowlist object
  ],
});
const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

// Decrypt with session key
const decryptedBytes = await sealClient.decrypt({ data: encryptedData, sessionKey, txBytes });
const data = JSON.parse(new TextDecoder().decode(decryptedBytes));
// data = { side: 0|1, price: "...", amount: "..." }
```

---

## 8. IMPLEMENTATION PLAN FOR ZERO-COUNTERPARTY SETTLEMENT

### Phase 1: Contract Changes
The Move contract needs modification to support single-order settlement with flash loans.

**Option A (Minimal Change)**: Add a new `settle_single` function:
```move
public fun settle_single<CoinType>(
    pool: &mut DarkPool<CoinType>,
    _matcher_cap: &MatcherCap,
    commitment: vector<u8>,
    ctx: &mut TxContext
): Coin<CoinType> {
    // Verify order exists
    assert!(table::contains(&pool.commitments, commitment), EOrderNotFound);
    let order = table::remove(&mut pool.commitments, commitment);

    // Extract locked funds from vault (for flash loan repayment)
    let coin = coin::from_balance(
        balance::split(&mut pool.vault, order.locked_amount),
        ctx
    );

    // Emit settlement event
    event::emit(OrderSettled { ... });

    return coin  // TEE uses this to repay the flash loan
}
```

**Option B (Multi-CoinType for BUY orders)**: Create a new pool type that can hold both SUI and USDC. This is more complex but supports both BUY and SELL natively.

### Phase 2: Flash Loan Settlement Service (Matching Engine)
Replace or augment `settlement.ts` with flash loan settlement logic.

**SELL order settlement PTB:**
```typescript
const tx = new Transaction();
tx.setGasBudget(50_000_000);

// 1. Flash borrow SUI from DeepBook
const [borrowedSui, flashLoan] = dbClient.flashLoans.borrowBaseAsset('SUI_DBUSDC', sellAmount)(tx);

// 2. Swap borrowed SUI for USDC on DeepBook
const [remainingBase, receivedUsdc, deepCoin] = dbClient.deepbook.swapExactBaseForQuote({
  poolKey: 'SUI_DBUSDC',
  amount: sellAmount,
  minOut: 0,  // Set appropriate slippage protection
})(tx);

// 3. Extract user's locked SUI from dark pool vault
tx.moveCall({
  target: `${darkPoolPackage}::dark_pool::settle_single`,
  arguments: [
    tx.object(darkPoolObject),
    tx.object(matcherCapId),
    tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
  ],
  typeArguments: ['0x2::sui::SUI'],
});
// Returns: Coin<SUI> (the user's locked amount)

// 4. Repay flash loan with user's locked SUI
dbClient.flashLoans.returnBaseAsset('SUI_DBUSDC', sellAmount, lockedSuiCoin, flashLoan)(tx);

// 5. Transfer USDC to user
tx.transferObjects([receivedUsdc], userAddress);

// Execute
await suiClient.signAndExecuteTransaction({ signer: keypair, transaction: tx });
```

**BUY order settlement PTB (requires USDC vault support):**
```typescript
const tx = new Transaction();
tx.setGasBudget(50_000_000);

// 1. Flash borrow USDC from DeepBook
const [borrowedUsdc, flashLoan] = dbClient.flashLoans.borrowQuoteAsset('SUI_DBUSDC', buyAmountUsdc)(tx);

// 2. Swap borrowed USDC for SUI on DeepBook
const [receivedSui, remainingQuote, deepCoin] = dbClient.deepbook.swapExactQuoteForBase({
  poolKey: 'SUI_DBUSDC',
  amount: buyAmountUsdc,
  minOut: 0,
})(tx);

// 3. Extract user's locked USDC from dark pool vault
// (Requires USDC vault in contract)

// 4. Repay flash loan with user's locked USDC
dbClient.flashLoans.returnQuoteAsset('SUI_DBUSDC', buyAmountUsdc, lockedUsdcCoin, flashLoan)(tx);

// 5. Transfer SUI to user
tx.transferObjects([receivedSui], userAddress);
```

### Phase 3: Modify Event Handler
In `src/index.ts`, change the `orderCommitted` handler to settle each order individually:

```typescript
listener.on('orderCommitted', async (order: CommittedOrder) => {
  const decrypted = await sealService.decryptOrderData(order.encryptedData);
  if (decrypted) {
    // Instead of adding to order book and waiting for match,
    // settle immediately via flash loan
    const result = await flashLoanSettlement.settleOrder({
      commitment: order.commitment,
      owner: order.owner,
      side: decrypted.side,      // 0 = sell, 1 = buy
      amount: decrypted.amount,
      price: decrypted.price,
    });
  }
});
```

### Phase 4: Frontend Updates
- Update order confirmation modal steps (remove "AWAIT MATCH" step)
- Update order status tracking (no more "matched" intermediate state)
- Show actual received amount (USDC for sells, SUI for buys)

---

## 9. KNOWN GOTCHAS & EDGE CASES

1. **Hot Potato Pattern**: Flash loan objects MUST be returned in the same PTB. You cannot store them or pass them across transactions.

2. **Type Arguments**: The `(tx as any)` cast is used because DeepBook SDK types don't perfectly align with the Sui SDK Transaction type. This works fine at runtime.

3. **Gas Budget**: Flash loan + swap transactions are more complex. Use at least 50M gas budget (vs 10M for simple operations).

4. **Slippage**: Set `minOut` in swap params to protect against unfavorable prices. For a hackathon, `0` is acceptable but production should use real slippage limits.

5. **DEEP Token Fees**: DeepBook charges fees in DEEP token. The swap methods have a `deepAmount` parameter. On testnet this may be 0 or negligible.

6. **Amount Scaling**: DeepBook SDK automatically scales amounts by the coin's scalar. When you pass `borrowAmount = 1.0`, it borrows 1 SUI (1e9 MIST internally). But your dark pool contract works in MIST (raw u64). Make sure to convert correctly.

7. **Order Owner Address**: The matching engine needs the user's address (stored in the commitment's `owner` field on-chain) to send them the swapped tokens. This is available in the `CommittedOrder.owner` field from the event listener.

8. **Contract Upgrade**: If you modify the Move contract, you'll need to redeploy and update all address references (DARK_POOL_PACKAGE, DARK_POOL_OBJECT) in both `.env` files and the frontend's `.env.local`.

9. **Testnet DBUSDC vs USDC**: On testnet, the quote asset is `DBUSDC` (DeepBook's test USDC), not real USDC. The coin type will be different on mainnet.

10. **settle_match requires BCS encoding**: Commitment bytes are serialized as `bcs.vector(bcs.u8()).serialize(bytes)`. Don't forget this BCS wrapper.

---

## 10. RUNNING THE PROJECT

### Start Matching Engine
```bash
cd matching-engine
npm install
npm run dev
# Runs on port 3001
```

### Start Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on port 3000
```

### Deploy Contracts (if modified)
```bash
cd contracts
sui move build
sui client publish --gas-budget 100000000
# Update all address references after deployment
```

### Environment Setup
1. Create `.env` at project root with all required variables
2. Create `frontend/.env.local` with NEXT_PUBLIC_ prefixed variables
3. Ensure you have a funded Sui testnet wallet for the matching engine

---

## 11. FILE QUICK REFERENCE

| What | File |
|------|------|
| Move contract | `contracts/sources/dark_pool.move` |
| Main server | `matching-engine/src/index.ts` |
| Flash loan service | `matching-engine/src/flash-loan-service.ts` |
| Current settlement | `matching-engine/src/settlement.ts` |
| Order matcher | `matching-engine/src/matcher.ts` |
| Order book | `matching-engine/src/order-book.ts` |
| Seal decryption | `matching-engine/src/seal-service.ts` |
| DeepBook pricing | `matching-engine/src/deepbook-service.ts` |
| Event listener | `matching-engine/src/sui-listener.ts` |
| TEE attestation | `matching-engine/src/tee-attestation.ts` |
| Config | `matching-engine/src/config.ts` |
| Frontend order submit | `frontend/src/lib/sui/dark-pool.ts` |
| ZK prover | `frontend/src/lib/zk/prover.ts` |
| Seal encryption | `frontend/src/lib/seal/client.ts` |
| Sui client config | `frontend/src/lib/sui/client.ts` |
| Types | `frontend/src/lib/sui/types.ts` |
| Dark pool hook | `frontend/src/hooks/use-dark-pool.ts` |
| Backend hook | `frontend/src/hooks/use-backend.ts` |
| Trade page | `frontend/src/app/trade/page.tsx` |
| API proxy routes | `frontend/src/app/api/*/route.ts` |
