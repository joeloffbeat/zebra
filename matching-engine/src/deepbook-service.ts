import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config.js';
import { logService } from './log-service.js';

// DeepBook constants for mid-price calculation
const FLOAT_SCALAR = 1_000_000_000;
const SUI_SCALAR = 1_000_000_000;   // 9 decimals
const USDC_SCALAR = 1_000_000;       // 6 decimals

export class DeepBookService {
  private dbClient: DeepBookClient;
  private suiClient: SuiJsonRpcClient;
  private address: string;
  private initialized = false;

  constructor() {
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'mainnet' });

    this.address = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        this.address = Ed25519Keypair.fromSecretKey(secretKey).toSuiAddress();
      } catch {}
    }

    // Patch: DeepBook SDK's simulateTransaction needs a sender.
    const address = this.address;
    const originalSimulate = this.suiClient.core.simulateTransaction.bind(this.suiClient.core);
    this.suiClient.core.simulateTransaction = async (options: any) => {
      if (options.transaction && typeof options.transaction.setSenderIfNotSet === 'function') {
        options.transaction.setSenderIfNotSet(address);
      }
      return originalSimulate(options);
    };

    this.dbClient = new DeepBookClient({
      address: this.address,
      network: 'mainnet',
      client: this.suiClient,
    });

    this.initialized = true;
    console.log('DeepBookService initialized (mainnet)');
    logService.addLog('info', 'deepbook', 'DeepBookService initialized (mainnet)');
  }

  async getMidPrice(poolKey: string = 'SUI_USDC'): Promise<number | null> {
    try {
      // Build the same transaction the DeepBook SDK would build,
      // but use devInspectTransactionBlock instead of simulateTransaction.
      // The SDK's simulateTransaction path has a BCS serialization bug in
      // TransactionDataBuilder.restore().build() that corrupts CallArg objects.
      const tx = new Transaction();
      this.dbClient.deepBook.midPrice(poolKey)(tx);

      const result = await this.suiClient.devInspectTransactionBlock({
        sender: this.address,
        transactionBlock: tx,
      });

      if (!result.results?.[0]?.returnValues?.[0]) {
        console.log(`DeepBook mid-price returned no data for ${poolKey} — pool has no liquidity`);
        logService.addLog('warn', 'deepbook', `DeepBook mid-price returned no data for ${poolKey} — pool has no liquidity`);
        return null;
      }

      const [bytes] = result.results[0].returnValues[0];
      const rawValue = bcs.U64.parse(new Uint8Array(bytes));
      const adjustedMidPrice = Number(rawValue) * SUI_SCALAR / USDC_SCALAR / FLOAT_SCALAR;
      const midPrice = Number(adjustedMidPrice.toFixed(9));

      if (midPrice === 0) {
        console.log(`DeepBook mid-price is 0 (empty book) for ${poolKey} — no liquidity`);
        logService.addLog('warn', 'deepbook', `DeepBook mid-price is 0 (empty book) for ${poolKey} — no liquidity`);
        return null;
      }

      console.log(`DeepBook mid-price for ${poolKey}: ${midPrice}`);
      logService.addLog('info', 'deepbook', `DeepBook mid-price for ${poolKey}: ${midPrice}`);
      return midPrice;
    } catch (error) {
      console.error(`Failed to get mid-price for ${poolKey}:`, error);
      logService.addLog('error', 'deepbook', `Failed to get mid-price for ${poolKey}: ${error}`);
      return null;
    }
  }

  async getOrderBook(poolKey: string = 'SUI_USDC', priceLow: number = 0.01, priceHigh: number = 1000): Promise<{
    bids: { prices: number[]; quantities: number[] };
    asks: { prices: number[]; quantities: number[] };
  } | null> {
    try {
      const [bids, asks] = await Promise.all([
        this.dbClient.getLevel2Range(poolKey, priceLow, priceHigh, true),
        this.dbClient.getLevel2Range(poolKey, priceLow, priceHigh, false),
      ]);
      return { bids, asks };
    } catch (error) {
      console.error(`Failed to get order book for ${poolKey}:`, error);
      logService.addLog('error', 'deepbook', `Failed to get order book for ${poolKey}: ${error}`);
      return null;
    }
  }

  async getVaultBalances(poolKey: string = 'SUI_USDC'): Promise<{
    base: number;
    quote: number;
    deep: number;
  } | null> {
    try {
      const balances = await this.dbClient.vaultBalances(poolKey);
      console.log(`DeepBook vault balances for ${poolKey}:`, balances);
      logService.addLog('info', 'deepbook', `DeepBook vault balances for ${poolKey}`);
      return balances;
    } catch (error) {
      console.error(`Failed to get vault balances for ${poolKey}:`, error);
      logService.addLog('error', 'deepbook', `Failed to get vault balances for ${poolKey}: ${error}`);
      return null;
    }
  }
}
