import { SuiJsonRpcClient, SuiEventFilter, SuiEvent } from '@mysten/sui/jsonRpc';
import { EventEmitter } from 'events';
import { config } from './config.js';

// Privacy-stripped event — no isBid, no lockedAmount, no owner, no nullifier
export interface CommittedOrder {
  commitment: string;
  owner: string;        // from on-chain tx sender, NOT from event
  timestamp: number;
  poolId: string;
  encryptedData: Uint8Array;
}

/** Convert a vector<u8> from parsedJson (array of numbers or hex string) to a 0x-prefixed hex string. */
function toHexString(value: any): string {
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value : '0x' + value;
  }
  if (Array.isArray(value)) {
    return '0x' + value.map((b: number) => b.toString(16).padStart(2, '0')).join('');
  }
  return String(value);
}

export class SuiEventListener extends EventEmitter {
  private client: SuiJsonRpcClient;
  private polling = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastCursor: { txDigest: string; eventSeq: string } | null = null;

  constructor() {
    super();
    this.client = new SuiJsonRpcClient({ url: config.suiRpcUrl, network: 'testnet' });
  }

  async start() {
    if (!config.darkPoolPackage) {
      console.log('Warning: DARK_POOL_PACKAGE not set, skipping event subscription');
      return;
    }

    this.polling = true;

    // Skip past historical events — advance cursor to latest
    await this.advanceCursorToLatest();
    console.log('Polling for new OrderCommitted events...');

    // Poll every 2 seconds
    this.pollInterval = setInterval(() => {
      this.pollEvents().catch((error) => {
        console.error('Error polling events:', error);
      });
    }, 2000);
  }

  /** Query the most recent event (descending) to set cursor past all historical data. */
  private async advanceCursorToLatest() {
    if (!config.darkPoolPackage) return;
    try {
      const filter: SuiEventFilter = {
        MoveEventType: `${config.darkPoolPackage}::dark_pool::OrderCommitted`,
      };
      const result = await this.client.queryEvents({
        query: filter,
        limit: 1,
        order: 'descending',
      });
      if (result.data.length > 0 && result.nextCursor) {
        const latest = result.data[0];
        this.lastCursor = { txDigest: latest.id.txDigest, eventSeq: latest.id.eventSeq };
        console.log(`Skipped past historical events (cursor: ${this.lastCursor.txDigest.slice(0, 12)}...)`);
      } else {
        console.log('No historical events found, starting from beginning.');
      }
    } catch (error) {
      console.error('Failed to advance cursor:', error);
    }
  }

  private async pollEvents() {
    if (!this.polling || !config.darkPoolPackage) return;

    try {
      const filter: SuiEventFilter = {
        MoveEventType: `${config.darkPoolPackage}::dark_pool::OrderCommitted`,
      };

      const result = await this.client.queryEvents({
        query: filter,
        cursor: this.lastCursor ?? undefined,
        limit: 50,
        order: 'ascending',
      });

      for (const event of result.data) {
        const data = event.parsedJson as any;

        // Parse encrypted_data from event (comes as array of numbers)
        let encryptedData = new Uint8Array(0);
        if (data.encrypted_data && Array.isArray(data.encrypted_data)) {
          encryptedData = new Uint8Array(data.encrypted_data);
        }

        // New privacy-preserving event: only commitment, encrypted_data, timestamp
        // Owner comes from the transaction sender, queried separately if needed
        const order: CommittedOrder = {
          commitment: toHexString(data.commitment),
          owner: event.sender || '',  // tx sender, not in event fields
          timestamp: data.timestamp,
          poolId: toHexString(data.pool_id),
          encryptedData,
        };
        this.emit('orderCommitted', order);
        console.log(`Order committed: ${order.commitment.slice(0, 16)}...`);
      }

      // Update cursor if there are results
      if (result.data.length > 0 && result.nextCursor) {
        this.lastCursor = result.nextCursor;
      }
    } catch (error) {
      console.error('Failed to query events:', error);
    }
  }

  stop() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
