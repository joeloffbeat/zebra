import { CommittedOrder } from './sui-listener.js';
import { logService } from './log-service.js';

export interface DecryptedOrderInfo extends CommittedOrder {
  decryptedPrice: bigint;
  decryptedAmount: bigint;
  decryptedSide: number; // 0 = sell, 1 = buy
  decryptedLockedAmount: bigint;
}

export class OrderBook {
  private bids: Map<string, DecryptedOrderInfo> = new Map();
  private asks: Map<string, DecryptedOrderInfo> = new Map();
  private pendingDecryption: Map<string, CommittedOrder> = new Map();

  addOrder(order: DecryptedOrderInfo) {
    if (order.decryptedSide === 1) {
      this.bids.set(order.commitment, order);
      console.log(`Added BID: ${order.commitment.slice(0, 16)}... | ts=${order.timestamp}`);
      logService.addLog('info', 'order-book', `Added BID: ${order.commitment.slice(0, 16)}... | ts=${order.timestamp}`);
    } else {
      this.asks.set(order.commitment, order);
      console.log(`Added ASK: ${order.commitment.slice(0, 16)}... | ts=${order.timestamp}`);
      logService.addLog('info', 'order-book', `Added ASK: ${order.commitment.slice(0, 16)}... | ts=${order.timestamp}`);
    }
  }

  addPendingOrder(order: CommittedOrder) {
    this.pendingDecryption.set(order.commitment, order);
    console.log(`Queued pending decryption: ${order.commitment.slice(0, 16)}...`);
    logService.addLog('info', 'order-book', `Queued pending decryption: ${order.commitment.slice(0, 16)}...`);
  }

  getPendingOrders(): CommittedOrder[] {
    return Array.from(this.pendingDecryption.values());
  }

  removePendingOrder(commitment: string) {
    this.pendingDecryption.delete(commitment);
  }

  removeOrder(commitment: string) {
    this.bids.delete(commitment);
    this.asks.delete(commitment);
  }

  // Bids sorted descending by price (highest first)
  getBids(): DecryptedOrderInfo[] {
    return Array.from(this.bids.values()).sort((a, b) => {
      if (a.decryptedPrice > b.decryptedPrice) return -1;
      if (a.decryptedPrice < b.decryptedPrice) return 1;
      return a.timestamp - b.timestamp; // time priority for same price
    });
  }

  // Asks sorted ascending by price (lowest first)
  getAsks(): DecryptedOrderInfo[] {
    return Array.from(this.asks.values()).sort((a, b) => {
      if (a.decryptedPrice < b.decryptedPrice) return -1;
      if (a.decryptedPrice > b.decryptedPrice) return 1;
      return a.timestamp - b.timestamp;
    });
  }

  getOrderCount(): { bids: number; asks: number; pendingDecryption: number } {
    return {
      bids: this.bids.size,
      asks: this.asks.size,
      pendingDecryption: this.pendingDecryption.size,
    };
  }
}

