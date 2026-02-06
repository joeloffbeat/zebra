import { SealClient, SessionKey } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { config } from './config.js';

// Testnet key server object IDs (verified working in playground)
const TESTNET_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

export interface DecryptedOrderData {
  side: number;
  price: bigint;
  amount: bigint;
  expiry: bigint;
  locked_amount?: bigint;
}

export class SealService {
  private sealClient: SealClient;
  private suiClient: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private address: string = '';
  private sessionKey: SessionKey | null = null;

  constructor() {
    this.suiClient = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });

    this.sealClient = new SealClient({
      suiClient: this.suiClient,
      serverConfigs: TESTNET_KEY_SERVERS.map((id: string) => ({
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
      } catch (error) {
        console.error('SealService: Failed to initialize keypair:', error);
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

      return {
        side: data.side,
        price: BigInt(data.price),
        amount: BigInt(data.amount),
        expiry: BigInt(data.expiry),
        locked_amount: data.locked_amount ? BigInt(data.locked_amount) : undefined,
      };
    } catch (error) {
      console.error('Seal decryption failed:', error);
      return null;
    }
  }
}
