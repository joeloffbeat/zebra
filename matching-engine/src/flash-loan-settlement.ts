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
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });

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
      network: 'testnet',
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
  async settleResidualSells(sells: DecryptedOrderInfo[]): Promise<FlashLoanSettlementResult[]> {
    if (sells.length === 0) return [];

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

    // Fetch mid-price for minOut calculation (uses devInspect — reliable)
    const midPrice = await this.deepBookService.getMidPrice('SUI_DBUSDC');
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
    const orderBook = await this.deepBookService.getOrderBook('SUI_DBUSDC');
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

    // Try batch PTB first (all sells in one transaction)
    try {
      const result = await this.buildAndExecuteBatchPtb(sells, midPrice);
      if (result) return result;
    } catch (error) {
      console.warn('FlashLoanSettlement: Batch PTB failed, falling back to per-order:', error);
      logService.addLog('warn', 'flash-loan', `FlashLoanSettlement: Batch PTB failed, falling back to per-order: ${error}`);
    }

    // Fallback: settle each order individually
    const results: FlashLoanSettlementResult[] = [];
    for (const sell of sells) {
      try {
        const result = await this.buildAndExecuteSinglePtb(sell, midPrice);
        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          commitment: sell.commitment,
          sellerAddress: sell.owner,
          amountSui: sell.decryptedLockedAmount,
          error: error.message || String(error),
        });
      }
    }
    return results;
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
        'SUI_DBUSDC',
        amountInSui,
      )(tx as any);

      // 2. Swap SUI -> USDC on DeepBook (with slippage protection)
      const expectedDbusdc = amountInSui * midPrice;
      const minDbusdc = expectedDbusdc * (1 - MAX_SLIPPAGE);
      console.log(`FlashLoanSettlement: Swap ${amountInSui} SUI → min ${minDbusdc.toFixed(6)} DBUSDC (expected ${expectedDbusdc.toFixed(6)})`);
      logService.addLog('info', 'flash-loan', `FlashLoanSettlement: Swap ${amountInSui} SUI → min ${minDbusdc.toFixed(6)} DBUSDC`);

      const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
        poolKey: 'SUI_DBUSDC',
        amount: amountInSui,
        baseCoin: borrowedSui,
        deepAmount: 0,
        minOut: minDbusdc,
      })(tx as any);

      // 3. Extract seller's SUI from dark pool vault via settle_single_base
      const extractedSui = tx.moveCall({
        target: `${config.darkPoolPackage}::dark_pool::settle_single_base`,
        arguments: [
          tx.object(config.darkPoolObject),
          tx.object(config.matcherCapId),
          tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
        ],
        typeArguments: ['0x2::sui::SUI', config.dbUsdcType],
      });

      // 4. Return flash loan using extracted SUI from vault
      // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
      const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
        'SUI_DBUSDC',
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
          typeArguments: [config.dbUsdcType],
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
      'SUI_DBUSDC',
      amountInSui,
    )(tx as any);

    // 2. Swap SUI -> USDC (with slippage protection)
    const expectedDbusdc = amountInSui * midPrice;
    const minDbusdc = expectedDbusdc * (1 - MAX_SLIPPAGE);

    const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_DBUSDC',
      amount: amountInSui,
      baseCoin: borrowedSui,
      deepAmount: 0,
      minOut: minDbusdc,
    })(tx as any);

    // 3. Extract from vault
    const extractedSui = tx.moveCall({
      target: `${config.darkPoolPackage}::dark_pool::settle_single_base`,
      arguments: [
        tx.object(config.darkPoolObject),
        tx.object(config.matcherCapId),
        tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
      ],
      typeArguments: ['0x2::sui::SUI', config.dbUsdcType],
    });

    // 4. Repay flash loan
    // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
    const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
      'SUI_DBUSDC',
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
        typeArguments: [config.dbUsdcType],
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

  private hexStringToBytes(hex: string): number[] {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.slice(i, i + 2), 16));
    }
    return bytes;
  }
}
