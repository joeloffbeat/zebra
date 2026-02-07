import { SealClient, SessionKey } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { config } from './config.js';
import { logService } from './log-service.js';

// Mainnet key server object IDs (update with real mainnet key server IDs)
const MAINNET_KEY_SERVERS = [
  'TODO_MAINNET_KEY_SERVER_1',
  'TODO_MAINNET_KEY_SERVER_2',
];

export interface DecryptedOrderData {
  side: number;
  price: bigint;
  amount: bigint;
  expiry: bigint;
  locked_amount?: bigint;
  receivers?: { address: string; percentage: number }[];
}

export class SealService {
  private sealClient: SealClient;
  private suiClient: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private address: string = '';
  private sessionKey: SessionKey | null = null;

  constructor() {
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'mainnet' });

    this.sealClient = new SealClient({
      suiClient: this.suiClient,
      serverConfigs: MAINNET_KEY_SERVERS.map((id: string) => ({
        objectId: id,
        weight: 1,
      })),
      verifyKeyServers: false,
    });

    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
        this.address = this.keypair.toSuiAddress();
        console.log('SealService initialized with address:', this.address);
        logService.addLog('info', 'seal', `SealService initialized with address: ${this.address}`);
      } catch (error) {
        console.error('SealService: Failed to initialize keypair:', error);
        logService.addLog('error', 'seal', `Failed to initialize keypair: ${error}`);
      }
    }
  }

  private async getSessionKey(): Promise<SessionKey> {
    if (!this.keypair) {
      throw new Error('Keypair not initialized');
    }

    // Reuse session key if still valid
    if (this.sessionKey && !this.sessionKey.isExpired()) {
      return this.sessionKey;
    }

    // Create session key (proven pattern from playground)
    this.sessionKey = await SessionKey.create({
      address: this.address,
      packageId: config.sealPackageId,
      ttlMin: 30,
      suiClient: this.suiClient,
    });

    // Sign the personal message
    const msg = this.sessionKey.getPersonalMessage();
    const sig = await this.keypair.signPersonalMessage(msg);
    this.sessionKey.setPersonalMessageSignature(sig.signature);

    return this.sessionKey;
  }

  async decryptOrderData(encryptedData: Uint8Array): Promise<DecryptedOrderData | null> {
    if (!this.keypair || !config.sealAllowlistId) {
      console.log('Seal decryption not configured, returning null');
      logService.addLog('warn', 'seal', 'Seal decryption not configured, returning null');
      return null;
    }

    try {
      const sessionKey = await this.getSessionKey();

      // Build seal_approve PTB with Allowlist object (CRITICAL: 2 args, not 1)
      const tx = new Transaction();
      const idBytes = Buffer.from(config.sealAllowlistId.replace('0x', ''), 'hex');
      tx.moveCall({
        target: `${config.sealPackageId}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', Array.from(idBytes)),
          tx.object(config.sealAllowlistId),
        ],
      });

      const txBytes = await tx.build({
        client: this.suiClient,
        onlyTransactionKind: true,
      });

      const decryptedBytes = await this.sealClient.decrypt({
        data: encryptedData,
        sessionKey,
        txBytes,
      });

      // Parse JSON data
      const dataStr = new TextDecoder().decode(decryptedBytes);
      const data = JSON.parse(dataStr);

      // Parse receivers if present and valid
      let receivers: { address: string; percentage: number }[] | undefined;
      if (Array.isArray(data.receivers) && data.receivers.length > 0) {
        const valid = data.receivers.every(
          (r: any) => typeof r.address === 'string' && r.address.startsWith('0x') && r.address.length === 66
            && typeof r.percentage === 'number' && r.percentage > 0
        );
        const sumPct = data.receivers.reduce((s: number, r: any) => s + (r.percentage || 0), 0);
        if (valid && sumPct === 100) {
          receivers = data.receivers;
        } else {
          console.warn('Invalid receivers in decrypted order, falling back to owner');
          logService.addLog('warn', 'seal', 'Invalid receivers in decrypted order, falling back to owner');
        }
      }

      return {
        side: data.side,
        price: BigInt(data.price),
        amount: BigInt(data.amount),
        expiry: data.expiry ? BigInt(data.expiry) : 0n,
        locked_amount: data.locked_amount ? BigInt(data.locked_amount) : undefined,
        receivers,
      };
    } catch (error) {
      console.error('Seal decryption failed:', error);
      logService.addLog('error', 'seal', `Seal decryption failed: ${error}`);
      return null;
    }
  }
}
