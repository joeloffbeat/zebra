import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config.js';
import { logService } from './log-service.js';
import { DecryptedOrderInfo } from './order-book.js';
import { Receiver, resolveReceivers } from './receiver-utils.js';
import { DeepBookService } from './deepbook-service.js';

// Maximum acceptable slippage for DeepBook swaps (10%)
const MAX_SLIPPAGE = 0.10;
// USDC has 6 decimals
const USDC_DECIMALS = 1_000_000;
// DEEP tokens required to pay DeepBook taker fees.
// Overestimate is safe — unused DEEP is refunded in the deepCoinResult.
// Typical taker fee is ~0.1% of trade value paid in DEEP.
const DEEP_FEE_PER_SWAP = 0.5; // 0.5 DEEP per swap (unused portion is refunded)
// DeepBook SUI/USDC pool minimum trade size (from on-chain min_size field)
const DEEPBOOK_MIN_SIZE_SUI = 1.0; // 1 SUI = 1,000,000,000 MIST

export interface FlashLoanSettlementResult {
  success: boolean;
  txDigest?: string;
  commitment: string;
  sellerAddress: string;
  amountSui: bigint;
  error?: string;
}

export class FlashLoanSettlementService {
  private dbClient: DeepBookClient;
  private suiClient: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private deepBookService: DeepBookService;

  constructor(deepBookService: DeepBookService) {
    this.deepBookService = deepBookService;
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'mainnet' });

    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
      } catch (error) {
        console.error('FlashLoanSettlementService: Failed to initialize keypair:', error);
        logService.addLog('error', 'flash-loan', `FlashLoanSettlementService: Failed to initialize keypair: ${error}`);
      }
    }

    this.dbClient = new DeepBookClient({
      address: this.keypair?.toSuiAddress() ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      network: 'mainnet',
      client: this.suiClient,
    });

    console.log('FlashLoanSettlementService initialized');
    logService.addLog('info', 'flash-loan', 'FlashLoanSettlementService initialized');
  }

  /**
   * Settle residual SELL orders via DeepBook flash loans.
   * Builds one PTB with sequential flash loan cycles for each sell order.
   * Falls back to per-order execution if batch PTB fails.
   */
  async settleResidualSells(inputSells: DecryptedOrderInfo[]): Promise<FlashLoanSettlementResult[]> {
    if (inputSells.length === 0) return [];
    let sells = inputSells;

    if (!this.keypair || !config.darkPoolPackage || !config.darkPoolObject || !config.matcherCapId) {
      console.log('FlashLoanSettlement: Not configured (missing package, pool, or matcherCapId)');
      logService.addLog('warn', 'flash-loan', 'FlashLoanSettlement: Not configured (missing package, pool, or matcherCapId)');
      return sells.map(s => ({
        success: false,
        commitment: s.commitment,
        sellerAddress: s.owner,
        amountSui: s.decryptedLockedAmount,
        error: 'Settlement not configured',
      }));
    }

    // Filter out orders below DeepBook's minimum trade size
    const validSells = sells.filter(s => {
      const amountSui = Number(s.decryptedLockedAmount) / 1e9;
      if (amountSui < DEEPBOOK_MIN_SIZE_SUI) {
        console.warn(`FlashLoanSettlement: Order ${s.commitment.slice(0, 16)}... amount ${amountSui} SUI is below DeepBook min_size ${DEEPBOOK_MIN_SIZE_SUI} SUI — skipping`);
        logService.addLog('warn', 'flash-loan', `Order ${s.commitment.slice(0, 16)}... (${amountSui} SUI) below DeepBook min_size (${DEEPBOOK_MIN_SIZE_SUI} SUI)`);
        return false;
      }
      return true;
    });

    const tooSmall = sells.filter(s => Number(s.decryptedLockedAmount) / 1e9 < DEEPBOOK_MIN_SIZE_SUI);
    const tooSmallResults: FlashLoanSettlementResult[] = tooSmall.map(s => ({
      success: false,
      commitment: s.commitment,
      sellerAddress: s.owner,
      amountSui: s.decryptedLockedAmount,
      error: `Order size ${(Number(s.decryptedLockedAmount) / 1e9).toFixed(4)} SUI below DeepBook minimum ${DEEPBOOK_MIN_SIZE_SUI} SUI`,
    }));

    if (validSells.length === 0) return tooSmallResults;
    sells = validSells;

    // Fetch mid-price for minOut calculation (uses devInspect — reliable)
    const midPrice = await this.deepBookService.getMidPrice('SUI_USDC');
    if (!midPrice || midPrice <= 0) {
      console.warn('FlashLoanSettlement: No mid-price available (pool has no liquidity), skipping settlement to protect sellers');
      logService.addLog('warn', 'flash-loan', 'FlashLoanSettlement: No mid-price available, skipping settlement to protect sellers');
      return sells.map(s => ({
        success: false,
        commitment: s.commitment,
        sellerAddress: s.owner,
        amountSui: s.decryptedLockedAmount,
        error: 'No mid-price available for slippage protection',
      }));
    }

    // Optional: check bid-side depth if order book query succeeds
    // (getLevel2Range uses simulateTransaction which has a BCS bug — may fail)
    const orderBook = await this.deepBookService.getOrderBook('SUI_USDC');
    if (orderBook) {
      const hasBids = orderBook.bids.prices.length > 0 &&
        orderBook.bids.quantities.some(q => q > 0);

      if (!hasBids) {
        const totalSui = sells.reduce((sum, s) => sum + Number(s.decryptedLockedAmount) / 1e9, 0);
        console.warn(`FlashLoanSettlement: No bid-side liquidity in DeepBook pool, skipping settlement of ${sells.length} sell(s) totaling ${totalSui.toFixed(4)} SUI`);
        logService.addLog('warn', 'flash-loan', `FlashLoanSettlement: No bid-side liquidity, skipping ${sells.length} sell(s) totaling ${totalSui.toFixed(4)} SUI — orders will retry next batch`);
        return sells.map(s => ({
          success: false,
          commitment: s.commitment,
          sellerAddress: s.owner,
          amountSui: s.decryptedLockedAmount,
          error: 'No bid-side liquidity in DeepBook pool',
        }));
      }

      const totalSuiToSwap = sells.reduce((sum, s) => sum + Number(s.decryptedLockedAmount) / 1e9, 0);
      const totalBidDepth = orderBook.bids.quantities.reduce((sum, q) => sum + q, 0);
      if (totalBidDepth < totalSuiToSwap * 0.5) {
        console.warn(`FlashLoanSettlement: Insufficient bid depth (${totalBidDepth.toFixed(4)} SUI) for ${totalSuiToSwap.toFixed(4)} SUI sell volume, skipping`);
        logService.addLog('warn', 'flash-loan', `FlashLoanSettlement: Insufficient bid depth (${totalBidDepth.toFixed(4)}) for ${totalSuiToSwap.toFixed(4)} SUI — orders will retry next batch`);
        return sells.map(s => ({
          success: false,
          commitment: s.commitment,
          sellerAddress: s.owner,
          amountSui: s.decryptedLockedAmount,
          error: `Insufficient bid depth: ${totalBidDepth.toFixed(4)} available vs ${totalSuiToSwap.toFixed(4)} needed`,
        }));
      }

      console.log(`FlashLoanSettlement: Using mid-price ${midPrice} with ${MAX_SLIPPAGE * 100}% max slippage, bid depth: ${totalBidDepth.toFixed(4)} SUI`);
      logService.addLog('info', 'flash-loan', `FlashLoanSettlement: mid-price ${midPrice}, ${MAX_SLIPPAGE * 100}% max slippage, bid depth: ${totalBidDepth.toFixed(4)} SUI`);
    } else {
      // Order book query failed (BCS bug) — proceed with mid-price + minOut protection
      console.log(`FlashLoanSettlement: Order book query failed, proceeding with mid-price ${midPrice} + minOut slippage protection`);
      logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Order book unavailable, using mid-price ${midPrice} + minOut protection`);
    }

    // Dry-run is skipped — it uses CoinWithBalance which fails client-side when the
    // wallet lacks DEEP tokens, producing a false "0 USDC" result even when the pool
    // has plenty of liquidity. The mid-price check above + on-chain minOut assertion
    // provide sufficient protection against actual low-liquidity scenarios.
    console.log(`FlashLoanSettlement: Proceeding with mid-price ${midPrice}, on-chain minOut will protect against slippage`);
    logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Proceeding with mid-price ${midPrice}, on-chain minOut protection`);

    // Execute batch PTB (all sells in one transaction)
    try {
      const result = await this.buildAndExecuteBatchPtb(sells, midPrice);
      if (result) return [...tooSmallResults, ...result];
    } catch (error) {
      console.warn('FlashLoanSettlement: Batch PTB failed:', error);
      logService.addLog('warn', 'flash-loan', `FlashLoanSettlement: Batch PTB failed: ${error}`);
    }

    // Don't fall back to per-order after an on-chain failure — the gas coin version
    // has changed, causing stale object references. Orders will retry next batch.
    return [...tooSmallResults, ...sells.map(s => ({
      success: false,
      commitment: s.commitment,
      sellerAddress: s.owner,
      amountSui: s.decryptedLockedAmount,
      error: 'Batch settlement failed — will retry next batch',
    }))];
  }

  /**
   * Build a batch PTB with sequential flash loan cycles for all sells.
   * Each cycle: borrow SUI -> swap SUI->USDC -> extract from vault -> repay -> transfer USDC
   */
  private async buildAndExecuteBatchPtb(sells: DecryptedOrderInfo[], midPrice: number): Promise<FlashLoanSettlementResult[] | null> {
    const tx = new Transaction();
    tx.setGasBudget(50_000_000);
    const teeAddress = this.keypair!.toSuiAddress();

    for (const sell of sells) {
      // Amount in SUI (DeepBook uses float-like amounts, we convert from MIST)
      const amountInSui = Number(sell.decryptedLockedAmount) / 1e9;
      const commitmentBytes = this.hexStringToBytes(sell.commitment);

      // 1. Borrow base asset (SUI) from DeepBook
      const [borrowedSui, flashLoan] = this.dbClient.flashLoans.borrowBaseAsset(
        'SUI_USDC',
        amountInSui,
      )(tx as any);

      // 2. Swap SUI -> USDC on DeepBook (with slippage protection)
      const expectedUsdc = amountInSui * midPrice;
      const minUsdc = expectedUsdc * (1 - MAX_SLIPPAGE);
      console.log(`FlashLoanSettlement: Swap ${amountInSui} SUI → min ${minUsdc.toFixed(6)} USDC (expected ${expectedUsdc.toFixed(6)})`);
      logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Swap ${amountInSui} SUI → min ${minUsdc.toFixed(6)} USDC`);

      const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
        poolKey: 'SUI_USDC',
        amount: amountInSui,
        baseCoin: borrowedSui,
        deepAmount: DEEP_FEE_PER_SWAP,
        minOut: minUsdc,
      })(tx as any);

      // 2b. Enforce minimum output (DeepBook testnet doesn't enforce minQuoteOut).
      //     Split minOut from the USDC coin — aborts if coin value < minOut.
      const minOutOnChain = Math.max(1, Math.round(minUsdc * USDC_DECIMALS));
      const [assertCoin] = tx.splitCoins(usdcCoin, [tx.pure.u64(minOutOnChain)]);
      tx.mergeCoins(usdcCoin, [assertCoin]);

      // 3. Extract seller's SUI from dark pool vault via settle_single_base
      const extractedSui = tx.moveCall({
        target: `${config.darkPoolPackage}::dark_pool::settle_single_base`,
        arguments: [
          tx.object(config.darkPoolObject),
          tx.object(config.matcherCapId),
          tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
        ],
        typeArguments: ['0x2::sui::SUI', config.usdcType],
      });

      // 4. Return flash loan using extracted SUI from vault
      // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
      const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
        'SUI_USDC',
        amountInSui,
        extractedSui,
        flashLoan,
      )(tx as any);

      // 5. Transfer USDC to seller's receivers
      const receivers = resolveReceivers(sell.decryptedReceivers, sell.owner);
      if (receivers.length === 1) {
        tx.transferObjects([usdcCoin], receivers[0].address);
      } else {
        tx.moveCall({
          target: `${config.darkPoolPackage}::dark_pool::split_and_distribute`,
          arguments: [
            usdcCoin,
            tx.pure.vector('address', receivers.map(r => r.address)),
            tx.pure.vector('u64', receivers.map(r => r.percentage)),
          ],
          typeArguments: [config.usdcType],
        });
      }

      // 6. Transfer remaining base + deep refund + remainder to TEE address
      tx.transferObjects([remBase, deepRefund, remainderCoin], teeAddress);
    }

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair!,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      console.error('FlashLoanSettlement: Batch PTB failed:', result.effects?.status);
      logService.addLog('error', 'flash-loan', `FlashLoanSettlement: Batch PTB failed: ${JSON.stringify(result.effects?.status)}`);
      return null;
    }

    console.log(`FlashLoanSettlement: Batch PTB succeeded with ${sells.length} sells, tx: ${result.digest}`);
    logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Batch PTB succeeded with ${sells.length} sells, tx: ${result.digest}`);

    return sells.map(sell => ({
      success: true,
      txDigest: result.digest,
      commitment: sell.commitment,
      sellerAddress: sell.owner,
      amountSui: sell.decryptedLockedAmount,
    }));
  }

  /**
   * Build and execute a single flash loan PTB for one sell order.
   */
  private async buildAndExecuteSinglePtb(sell: DecryptedOrderInfo, midPrice: number): Promise<FlashLoanSettlementResult> {
    const tx = new Transaction();
    tx.setGasBudget(20_000_000);
    const teeAddress = this.keypair!.toSuiAddress();
    const amountInSui = Number(sell.decryptedLockedAmount) / 1e9;
    const commitmentBytes = this.hexStringToBytes(sell.commitment);

    // 1. Borrow SUI
    const [borrowedSui, flashLoan] = this.dbClient.flashLoans.borrowBaseAsset(
      'SUI_USDC',
      amountInSui,
    )(tx as any);

    // 2. Swap SUI -> USDC (with slippage protection)
    const expectedUsdc = amountInSui * midPrice;
    const minUsdc = expectedUsdc * (1 - MAX_SLIPPAGE);

    const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_USDC',
      amount: amountInSui,
      baseCoin: borrowedSui,
      deepAmount: DEEP_FEE_PER_SWAP,
      minOut: minUsdc,
    })(tx as any);

    // 2b. Enforce minimum output (DeepBook testnet doesn't enforce minQuoteOut)
    const minOutOnChain = Math.max(1, Math.round(minUsdc * USDC_DECIMALS));
    const [assertCoin] = tx.splitCoins(usdcCoin, [tx.pure.u64(minOutOnChain)]);
    tx.mergeCoins(usdcCoin, [assertCoin]);

    // 3. Extract from vault
    const extractedSui = tx.moveCall({
      target: `${config.darkPoolPackage}::dark_pool::settle_single_base`,
      arguments: [
        tx.object(config.darkPoolObject),
        tx.object(config.matcherCapId),
        tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
      ],
      typeArguments: ['0x2::sui::SUI', config.usdcType],
    });

    // 4. Repay flash loan
    // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
    const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
      'SUI_USDC',
      amountInSui,
      extractedSui,
      flashLoan,
    )(tx as any);

    // 5. Transfer USDC to seller's receivers
    const receivers = resolveReceivers(sell.decryptedReceivers, sell.owner);
    if (receivers.length === 1) {
      tx.transferObjects([usdcCoin], receivers[0].address);
    } else {
      tx.moveCall({
        target: `${config.darkPoolPackage}::dark_pool::split_and_distribute`,
        arguments: [
          usdcCoin,
          tx.pure.vector('address', receivers.map(r => r.address)),
          tx.pure.vector('u64', receivers.map(r => r.percentage)),
        ],
        typeArguments: [config.usdcType],
      });
    }

    // 6. Transfer leftovers + remainder to TEE
    tx.transferObjects([remBase, deepRefund, remainderCoin], teeAddress);

    const result = await this.suiClient.signAndExecuteTransaction({
      signer: this.keypair!,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      return {
        success: false,
        commitment: sell.commitment,
        sellerAddress: sell.owner,
        amountSui: sell.decryptedLockedAmount,
        error: `Transaction failed: ${JSON.stringify(result.effects?.status)}`,
      };
    }

    console.log(`FlashLoanSettlement: Single PTB succeeded for ${sell.commitment.slice(0, 16)}..., tx: ${result.digest}`);
    logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Single PTB succeeded for ${sell.commitment.slice(0, 16)}..., tx: ${result.digest}`);

    return {
      success: true,
      txDigest: result.digest,
      commitment: sell.commitment,
      sellerAddress: sell.owner,
      amountSui: sell.decryptedLockedAmount,
    };
  }

  /**
   * Dry-run a swap to check if the pool actually fills orders.
   * Uses devInspectTransactionBlock (no gas, no signing) to simulate.
   */
  private async dryRunSwap(amountInSui: number, midPrice: number): Promise<boolean> {
    try {
      const tx = new Transaction();
      const teeAddress = this.keypair!.toSuiAddress();

      // Build a simple swap (no flash loan, just swap)
      const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
        poolKey: 'SUI_USDC',
        amount: amountInSui,
        deepAmount: DEEP_FEE_PER_SWAP,
        minOut: 0, // Don't enforce minimum in dry-run — we want to see what we get
      })(tx as any);

      tx.transferObjects([remBase, usdcCoin, deepRefund], teeAddress);

      const result = await this.suiClient.devInspectTransactionBlock({
        sender: teeAddress,
        transactionBlock: tx,
      });

      if (result.effects?.status?.status !== 'success') {
        console.log(`FlashLoanSettlement: Dry-run swap failed: ${JSON.stringify(result.effects?.status)}`);
        logService.addLog('warn', 'flash-loan', `Dry-run swap failed: ${JSON.stringify(result.effects?.status)}`);
        return false;
      }

      // Check balance changes for USDC output
      const balanceChanges = (result as any).balanceChanges;
      if (balanceChanges) {
        const usdcChange = balanceChanges.find((c: any) =>
          c.coinType?.includes('usdc::USDC') && Number(c.amount) > 0
        );
        if (usdcChange) {
          const usdcAmount = Number(usdcChange.amount) / USDC_DECIMALS;
          console.log(`FlashLoanSettlement: Dry-run swap would produce ${usdcAmount.toFixed(6)} USDC`);
          logService.addLog('info', 'flash-loan', `Dry-run swap would produce ${usdcAmount.toFixed(6)} USDC`);
          return usdcAmount > 0;
        }
      }

      console.log('FlashLoanSettlement: Dry-run swap produced 0 USDC (no bid liquidity)');
      logService.addLog('warn', 'flash-loan', 'Dry-run swap produced 0 USDC');
      return false;
    } catch (error) {
      console.warn('FlashLoanSettlement: Dry-run swap error:', error);
      logService.addLog('warn', 'flash-loan', `Dry-run swap error: ${error}`);
      // If dry-run fails, still attempt the real transaction — let on-chain assertion handle it
      return true;
    }
  }

  private hexStringToBytes(hex: string): number[] {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.slice(i, i + 2), 16));
    }
    return bytes;
  }
}
