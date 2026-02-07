import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config.js';
import { DecryptedOrderInfo } from './order-book.js';

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

  constructor() {
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });

    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
      } catch (error) {
        console.error('FlashLoanSettlementService: Failed to initialize keypair:', error);
      }
    }

    this.dbClient = new DeepBookClient({
      address: this.keypair?.toSuiAddress() ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      network: 'testnet',
      client: this.suiClient,
    });

    console.log('FlashLoanSettlementService initialized');
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
      return sells.map(s => ({
        success: false,
        commitment: s.commitment,
        sellerAddress: s.owner,
        amountSui: s.decryptedLockedAmount,
        error: 'Settlement not configured',
      }));
    }

    // Try batch PTB first (all sells in one transaction)
    try {
      const result = await this.buildAndExecuteBatchPtb(sells);
      if (result) return result;
    } catch (error) {
      console.warn('FlashLoanSettlement: Batch PTB failed, falling back to per-order:', error);
    }

    // Fallback: settle each order individually
    const results: FlashLoanSettlementResult[] = [];
    for (const sell of sells) {
      try {
        const result = await this.buildAndExecuteSinglePtb(sell);
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
  private async buildAndExecuteBatchPtb(sells: DecryptedOrderInfo[]): Promise<FlashLoanSettlementResult[] | null> {
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

      // 2. Swap SUI -> USDC on DeepBook
      const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
        poolKey: 'SUI_DBUSDC',
        amount: amountInSui,
        baseCoin: borrowedSui,
        deepAmount: 0,
        minOut: 0,
      })(tx as any);

      // 3. Extract seller's SUI from dark pool vault via settle_single
      const extractedSui = tx.moveCall({
        target: `${config.darkPoolPackage}::dark_pool::settle_single`,
        arguments: [
          tx.object(config.darkPoolObject),
          tx.object(config.matcherCapId),
          tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
        ],
        typeArguments: ['0x2::sui::SUI'],
      });

      // 4. Return flash loan using extracted SUI from vault
      // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
      const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
        'SUI_DBUSDC',
        amountInSui,
        extractedSui,
        flashLoan,
      )(tx as any);

      // 5. Transfer USDC to seller
      tx.transferObjects([usdcCoin], sell.owner);

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
      return null;
    }

    console.log(`FlashLoanSettlement: Batch PTB succeeded with ${sells.length} sells, tx: ${result.digest}`);

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
  private async buildAndExecuteSinglePtb(sell: DecryptedOrderInfo): Promise<FlashLoanSettlementResult> {
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

    // 2. Swap SUI -> USDC
    const [remBase, usdcCoin, deepRefund] = this.dbClient.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_DBUSDC',
      amount: amountInSui,
      baseCoin: borrowedSui,
      deepAmount: 0,
      minOut: 0,
    })(tx as any);

    // 3. Extract from vault
    const extractedSui = tx.moveCall({
      target: `${config.darkPoolPackage}::dark_pool::settle_single`,
      arguments: [
        tx.object(config.darkPoolObject),
        tx.object(config.matcherCapId),
        tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes)),
      ],
      typeArguments: ['0x2::sui::SUI'],
    });

    // 4. Repay flash loan
    // returnBaseAsset returns a remainder Coin (no drop ability) — must be consumed
    const remainderCoin = this.dbClient.flashLoans.returnBaseAsset(
      'SUI_DBUSDC',
      amountInSui,
      extractedSui,
      flashLoan,
    )(tx as any);

    // 5. Transfer USDC to seller
    tx.transferObjects([usdcCoin], sell.owner);

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
