import * as fs from 'fs';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

export interface SettlementAttestation {
  commitmentA: string;
  commitmentB: string;
  executionPrice: string;
  executionAmount: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

export interface RedactedAttestation {
  commitmentAPrefix: string;
  commitmentBPrefix: string;
  timestamp: number;
  signature: string;
  publicKey: string;
}

export interface TeeMetrics {
  mode: 'enclave' | 'local-dev';
  publicKey: string;
  uptime: number;
  ordersReceived: number;
  ordersDecrypted: number;
  decryptionFailures: number;
  matchesFound: number;
  settlementsExecuted: number;
  settlementsSignedByEnclave: number;
  totalVolumeSettled: string;
  flashLoansExecuted: number;
  attestationCount: number;
  lastAttestationTimestamp: number | null;
  lastSettlementDigest: string | null;
}

export interface OysterAttestation {
  raw: string | null;
  hex: string | null;
  cachedAt: number | null;
}

export class TeeAttestationService {
  private privateKey: Uint8Array | null = null;
  private publicKeyHex: string = '';
  private mode: 'enclave' | 'local-dev' = 'local-dev';
  private attestations: SettlementAttestation[] = [];
  private startTime: number = Date.now();

  // Metrics counters
  private _ordersReceived = 0;
  private _ordersDecrypted = 0;
  private _decryptionFailures = 0;
  private _matchesFound = 0;
  private _settlementsExecuted = 0;
  private _totalVolumeSettled = 0n;
  private _flashLoansExecuted = 0;
  private _lastSettlementDigest: string | null = null;

  // Oyster attestation cache
  private oysterCache: OysterAttestation = { raw: null, hex: null, cachedAt: null };
  private readonly OYSTER_CACHE_TTL = 60_000; // 60 seconds

  constructor(enclaveKeyPath: string, teeMode: string) {
    if (teeMode === 'enclave') {
      this.initEnclave(enclaveKeyPath);
    } else {
      this.initLocalDev();
    }
  }

  private initEnclave(keyPath: string) {
    try {
      const keyData = fs.readFileSync(keyPath);
      if (keyData.length !== 32) {
        throw new Error(`Expected 32-byte key, got ${keyData.length} bytes`);
      }
      this.privateKey = new Uint8Array(keyData);
      this.publicKeyHex = bytesToHex(secp256k1.getPublicKey(this.privateKey, true));
      this.mode = 'enclave';
      console.log('TEE: Enclave mode initialized');
      console.log('TEE: Public key:', this.publicKeyHex);
    } catch (error) {
      console.warn('TEE: Failed to read enclave key, falling back to local-dev mode:', error);
      this.initLocalDev();
    }
  }

  private initLocalDev() {
    this.privateKey = secp256k1.utils.randomPrivateKey();
    this.publicKeyHex = bytesToHex(secp256k1.getPublicKey(this.privateKey, true));
    this.mode = 'local-dev';
    console.warn('TEE: Running in local-dev mode (not inside enclave)');
    console.log('TEE: Ephemeral public key:', this.publicKeyHex);
  }

  isEnclave(): boolean {
    return this.mode === 'enclave';
  }

  getMode(): string {
    return this.mode;
  }

  getPublicKeyHex(): string {
    return this.publicKeyHex;
  }

  // ── Metrics increment methods ──────────────────────────────────────

  incrementOrdersReceived() {
    this._ordersReceived++;
  }

  incrementOrdersDecrypted() {
    this._ordersDecrypted++;
  }

  incrementDecryptionFailures() {
    this._decryptionFailures++;
  }

  incrementMatchesFound() {
    this._matchesFound++;
  }

  recordSettlement(digest: string, volume: bigint) {
    this._settlementsExecuted++;
    this._totalVolumeSettled += volume;
    this._lastSettlementDigest = digest;
  }

  incrementFlashLoans() {
    this._flashLoansExecuted++;
  }

  getMetrics(): TeeMetrics {
    return {
      mode: this.mode,
      publicKey: this.publicKeyHex,
      uptime: Date.now() - this.startTime,
      ordersReceived: this._ordersReceived,
      ordersDecrypted: this._ordersDecrypted,
      decryptionFailures: this._decryptionFailures,
      matchesFound: this._matchesFound,
      settlementsExecuted: this._settlementsExecuted,
      settlementsSignedByEnclave: this.attestations.length,
      totalVolumeSettled: this._totalVolumeSettled.toString(),
      flashLoansExecuted: this._flashLoansExecuted,
      attestationCount: this.attestations.length,
      lastAttestationTimestamp: this.attestations.length > 0
        ? this.attestations[this.attestations.length - 1].timestamp
        : null,
      lastSettlementDigest: this._lastSettlementDigest,
    };
  }

  // ── Attestation signing ────────────────────────────────────────────

  signSettlementAttestation(
    commitmentA: string,
    commitmentB: string,
    executionPrice: string,
    executionAmount: string,
  ): SettlementAttestation {
    if (!this.privateKey) {
      throw new Error('TEE attestation service not initialized');
    }

    const timestamp = Date.now();
    const message = `${commitmentA}:${commitmentB}:${executionPrice}:${executionAmount}:${timestamp}`;
    const messageHash = sha256(new TextEncoder().encode(message));
    const signature = secp256k1.sign(messageHash, this.privateKey);

    const attestation: SettlementAttestation = {
      commitmentA,
      commitmentB,
      executionPrice,
      executionAmount,
      timestamp,
      signature: signature.toCompactHex(),
      publicKey: this.publicKeyHex,
    };

    this.attestations.push(attestation);

    console.log('TEE Settlement Attestation:');
    console.log(`  A: ${commitmentA.slice(0, 16)}...`);
    console.log(`  B: ${commitmentB.slice(0, 16)}...`);
    console.log(`  Sig: ${signature.toCompactHex().slice(0, 32)}...`);

    return attestation;
  }

  getAttestationInfo(): {
    mode: string;
    publicKey: string;
    attestationCount: number;
  } {
    return {
      mode: this.mode,
      publicKey: this.publicKeyHex,
      attestationCount: this.attestations.length,
    };
  }

  /** Full attestations — internal use only (e.g. signature verification in tests). */
  getRecentAttestations(count: number = 10): SettlementAttestation[] {
    return this.attestations.slice(-count);
  }

  /** Redacted attestations — safe for public endpoints. */
  getRedactedAttestations(count: number = 10): RedactedAttestation[] {
    return this.attestations.slice(-count).map(a => ({
      commitmentAPrefix: a.commitmentA.slice(0, 16) + '...',
      commitmentBPrefix: a.commitmentB.slice(0, 16) + '...',
      timestamp: a.timestamp,
      signature: a.signature,
      publicKey: a.publicKey,
    }));
  }

  // ── Oyster attestation proxy ───────────────────────────────────────

  async fetchOysterAttestation(): Promise<OysterAttestation> {
    if (this.mode !== 'enclave') {
      return { raw: null, hex: null, cachedAt: null };
    }

    // Return cached if fresh
    if (this.oysterCache.cachedAt && (Date.now() - this.oysterCache.cachedAt) < this.OYSTER_CACHE_TTL) {
      return this.oysterCache;
    }

    try {
      const [rawResp, hexResp] = await Promise.all([
        fetch('http://127.0.0.1:1300/attestation/raw').then(r => r.ok ? r.text() : null).catch(() => null),
        fetch('http://127.0.0.1:1301/attestation/hex').then(r => r.ok ? r.text() : null).catch(() => null),
      ]);

      this.oysterCache = {
        raw: rawResp,
        hex: hexResp,
        cachedAt: Date.now(),
      };
    } catch {
      // Sidecar not available — return empty
    }

    return this.oysterCache;
  }
}

