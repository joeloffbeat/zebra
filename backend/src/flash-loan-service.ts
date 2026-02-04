import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { config } from './config.js';

export interface FlashLoanResult {
  success: boolean;
  txDigest?: string;
  borrowAmount: number;
  poolKey: string;
  error?: string;
}

export interface PoolInfo {
  poolKey: string;
  midPrice: number | null;
}

export class FlashLoanService {
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
        console.error('FlashLoanService: Failed to initialize keypair:', error);
      }
    }

    this.dbClient = new DeepBookClient({
      address: this.keypair?.toSuiAddress() ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
      network: 'testnet',
      client: this.suiClient,
    });

    console.log('FlashLoanService initialized');
  }

  async executeFlashLoanDemo(params: {
    poolKey: string;
    borrowAmount: number;
  }): Promise<FlashLoanResult> {
    const { poolKey, borrowAmount } = params;

    if (!this.keypair) {
      return { success: false, borrowAmount, poolKey, error: 'No keypair configured' };
    }

    try {
      // Build PTB with flash loan: borrow → return (hot potato pattern)
      const tx = new Transaction();
      tx.setGasBudget(10_000_000);

      // Borrow base asset from DeepBook pool (curried: returns fn that takes tx)
      const [baseAsset, flashLoan] = this.dbClient.flashLoans.borrowBaseAsset(
        poolKey,
        borrowAmount,
      )(tx as any);

      // Return immediately (demo — no intermediate operations)
      this.dbClient.flashLoans.returnBaseAsset(
        poolKey,
        borrowAmount,
        baseAsset,
        flashLoan,
      )(tx as any);

      const result = await this.suiClient.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        return {
          success: false,
          borrowAmount,
          poolKey,
          error: `Transaction failed: ${JSON.stringify(result.effects?.status)}`,
        };
      }

      console.log(`Flash loan demo succeeded: borrowed ${borrowAmount} from ${poolKey}, tx: ${result.digest}`);
      return {
        success: true,
        txDigest: result.digest,
        borrowAmount,
        poolKey,
      };
    } catch (error: any) {
      console.error('Flash loan failed:', error);
      return {
        success: false,
        borrowAmount,
        poolKey,
        error: error.message || String(error),
      };
    }
  }

  async getAvailablePools(): Promise<PoolInfo[]> {
    const poolKeys = ['SUI_DBUSDC'];
    const results: PoolInfo[] = [];

    for (const poolKey of poolKeys) {
      try {
        const midPrice = await this.dbClient.midPrice(poolKey);
        results.push({ poolKey, midPrice });
      } catch {
        results.push({ poolKey, midPrice: null });
      }
    }

    return results;
  }
}
