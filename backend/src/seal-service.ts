import { SealClient, SessionKey } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/bcs';
import { config } from './config.js';

const SEAL_PACKAGE_ID = '0x8afa5d31dbaa0a8fb07082692940ca3d56b5e856c5126cb5a3693f0a4de63b82';

// Testnet key server object IDs (from Seal docs: https://seal-docs.wal.app/UsingSeal/)
const TESTNET_KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

export interface DecryptedOrderData {
  side: number;
  price: bigint;
  amount: bigint;
  expiry: bigint;
}

export class SealService {
  private sealClient: SealClient;
  private suiClient: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
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
        console.log('SealService initialized with address:', this.keypair.toSuiAddress());
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

    const address = this.keypair.toSuiAddress();

    this.sessionKey = await SessionKey.create({
      address,
      packageId: SEAL_PACKAGE_ID,
      ttlMin: 30, // 30 minute session
      signer: this.keypair,
      suiClient: this.suiClient,
    });

    // Sign the personal message
    const message = this.sessionKey.getPersonalMessage();
    const { signature } = await this.keypair.signPersonalMessage(message);
    this.sessionKey.setPersonalMessageSignature(signature);

    return this.sessionKey;
  }

  async decryptOrderData(encryptedData: Uint8Array): Promise<DecryptedOrderData | null> {
    if (!this.keypair || !config.sealAllowlistId) {
      console.log('Seal decryption not configured, returning null');
      return null;
    }

    try {
      const sessionKey = await this.getSessionKey();

      // Build transaction for seal_approve (dry run only)
      const tx = new Transaction();
      tx.moveCall({
        target: `${SEAL_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [
          tx.pure.vector('u8', fromHex(config.sealAllowlistId.startsWith('0x') ? config.sealAllowlistId.slice(2) : config.sealAllowlistId)),
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
      const decoder = new TextDecoder();
      const dataStr = decoder.decode(decryptedBytes);
      const data = JSON.parse(dataStr);

      return {
        side: data.side,
        price: BigInt(data.price),
        amount: BigInt(data.amount),
        expiry: BigInt(data.expiry),
      };
    } catch (error) {
      console.error('Seal decryption failed:', error);
      return null;
    }
  }
}
