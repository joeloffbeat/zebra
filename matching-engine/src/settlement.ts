import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { config } from './config.js';
import { Match } from './matcher.js';
import { TeeAttestationService } from './tee-attestation.js';
import { logService } from './log-service.js';

export class SettlementService {
  private client: SuiJsonRpcClient;
  private keypair: Ed25519Keypair | null = null;
  private teeService: TeeAttestationService | null = null;

  constructor() {
    this.client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });

    if (config.suiPrivateKey) {
      try {
        const { secretKey } = decodeSuiPrivateKey(config.suiPrivateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
        console.log('Settlement service initialized with address:', this.keypair.toSuiAddress());
        logService.addLog('info', 'settlement', `Settlement service initialized with address: ${this.keypair.toSuiAddress()}`);
      } catch (error) {
        console.error('Failed to initialize keypair:', error);
        logService.addLog('error', 'settlement', `Failed to initialize keypair: ${error}`);
      }
    }
  }

  setTeeService(teeService: TeeAttestationService) {
    this.teeService = teeService;
  }

  getMatcherAddress(): string | null {
    return this.keypair?.toSuiAddress() ?? null;
  }

  async settleMatch(match: Match): Promise<string | null> {
    if (!this.keypair || !config.darkPoolPackage || !config.darkPoolObject || !config.matcherCapId) {
      console.log('Settlement not configured (missing package, pool, or matcherCapId), skipping...');
      logService.addLog('warn', 'settlement', `Settlement not configured (missing package, pool, or matcherCapId), skipping...`);
      return null;
    }

    try {
      const tx = new Transaction();
      tx.setGasBudget(10_000_000);

      // Convert commitment strings to byte vectors
      const commitmentABytes = this.hexStringToBytes(match.buyer.commitment);
      const commitmentBBytes = this.hexStringToBytes(match.seller.commitment);

      // Calculate payouts (TEE computes, contract enforces solvency)
      // Single-CoinType model (SUI/SUI): both sides lock the same token.
      // Price is used for matching priority, not for cross-token exchange.
      // Settlement redistributes locked SUI: each party gets back their locked amount.
      // The "trade" is recorded on-chain via events — the matching is the value, not token swap.
      const buyerLocked = match.buyer.decryptedLockedAmount;
      const sellerLocked = match.seller.decryptedLockedAmount;

      // Solvency guaranteed: payoutA + payoutB == lockedA + lockedB
      const payoutBuyer = buyerLocked;
      const payoutSeller = sellerLocked;

      tx.moveCall({
        target: `${config.darkPoolPackage}::dark_pool::settle_match`,
        arguments: [
          tx.object(config.darkPoolObject),                                           // pool
          tx.object(config.matcherCapId),                                             // matcher_cap
          tx.pure(bcs.vector(bcs.u8()).serialize(commitmentABytes)),                  // commitment_a
          tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBBytes)),                  // commitment_b
          tx.pure(bcs.u64().serialize(payoutBuyer)),                                  // payout_a
          tx.pure(bcs.u64().serialize(payoutSeller)),                                 // payout_b
        ],
        typeArguments: [
          '0x2::sui::SUI',
        ],
      });

      const result = await this.client.signAndExecuteTransaction({
        signer: this.keypair,
        transaction: tx,
        options: {
          showEffects: true,
        },
      });

      if (result.effects?.status?.status !== 'success') {
        console.error('Settlement tx failed:', result.effects?.status);
        logService.addLog('error', 'settlement', `Settlement tx failed: ${JSON.stringify(result.effects?.status)}`);
        return null;
      }

      console.log(`Settlement executed: ${result.digest} | a=${match.buyer.commitment.slice(0, 16)}... b=${match.seller.commitment.slice(0, 16)}...`);
      logService.addLog('info', 'settlement', `Settlement executed: ${result.digest} | a=${match.buyer.commitment.slice(0, 16)}... b=${match.seller.commitment.slice(0, 16)}...`);

      // Sign TEE attestation after successful settlement
      if (this.teeService) {
        this.teeService.signSettlementAttestation(
          match.buyer.commitment,
          match.seller.commitment,
          match.executionPrice.toString(),
          match.executionAmount.toString(),
        );
      }

      return result.digest;
    } catch (error) {
      console.error('Settlement failed:', error);
      logService.addLog('error', 'settlement', `Settlement failed: ${error}`);
      return null;
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
