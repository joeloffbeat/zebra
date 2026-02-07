import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { config } from './config.js';
import { logService } from './log-service.js';

export class DeepBookService {
  private dbClient: DeepBookClient;
  private initialized = false;

  constructor() {
    const suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });

    let address = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        address = Ed25519Keypair.fromSecretKey(secretKey).toSuiAddress();
      } catch {}
    }

    this.dbClient = new DeepBookClient({
      address,
      network: 'testnet',
      client: suiClient,
    });

    this.initialized = true;
    console.log('DeepBookService initialized (testnet)');
    logService.addLog('info', 'deepbook', 'DeepBookService initialized (testnet)');
  }

  async getMidPrice(poolKey: string = 'SUI_DBUSDC'): Promise<number | null> {
    // Fallback price for demo when DeepBook pool is empty or unavailable
    const FALLBACK_SUI_PRICE = 3.50;

    try {
      const midPrice = await this.dbClient.midPrice(poolKey);
      console.log(`DeepBook mid-price for ${poolKey}: ${midPrice}`);
      logService.addLog('info', 'deepbook', `DeepBook mid-price for ${poolKey}: ${midPrice}`);

      // Return fallback if DeepBook returns null (empty order book)
      if (midPrice === null || midPrice === undefined) {
        console.log(`Using fallback price: ${FALLBACK_SUI_PRICE}`);
        logService.addLog('warn', 'deepbook', `Using fallback price: ${FALLBACK_SUI_PRICE}`);
        return FALLBACK_SUI_PRICE;
      }

      return midPrice;
    } catch (error) {
      console.error(`Failed to get mid-price for ${poolKey}:`, error);
      logService.addLog('error', 'deepbook', `Failed to get mid-price for ${poolKey}: ${error}`);
      console.log(`Using fallback price: ${FALLBACK_SUI_PRICE}`);
      logService.addLog('warn', 'deepbook', `Using fallback price: ${FALLBACK_SUI_PRICE}`);
      return FALLBACK_SUI_PRICE;
    }
  }

  async getOrderBook(poolKey: string = 'SUI_DBUSDC', priceLow: number = 0.01, priceHigh: number = 1000): Promise<{
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

  async getVaultBalances(poolKey: string = 'SUI_DBUSDC'): Promise<{
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
