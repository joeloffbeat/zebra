import { OrderBook, DecryptedOrderInfo } from './order-book.js';
import { DeepBookService } from './deepbook-service.js';
import { logService } from './log-service.js';

export interface Match {
  buyer: DecryptedOrderInfo;
  seller: DecryptedOrderInfo;
  executionPrice: bigint;
  executionAmount: bigint;
  deepBookRefPrice: number | null;
  timestamp: number;
  settlementDigest?: string;
}

export class OrderMatcher {
  private orderBook: OrderBook;
  private deepBook: DeepBookService;
  private matches: Match[] = [];

  constructor(orderBook: OrderBook, deepBook: DeepBookService) {
    this.orderBook = orderBook;
    this.deepBook = deepBook;
  }

  async findMatches(): Promise<Match[]> {
    const newMatches: Match[] = [];
    const bids = this.orderBook.getBids(); // sorted desc by price
    const asks = this.orderBook.getAsks(); // sorted asc by price

    if (bids.length === 0 || asks.length === 0) return [];

    // Get DeepBook reference price for logging
    const refPrice = await this.deepBook.getMidPrice('SUI_DBUSDC');

    // Price-time priority matching
    let bidIdx = 0;
    let askIdx = 0;

    while (bidIdx < bids.length && askIdx < asks.length) {
      const bestBid = bids[bidIdx];
      const bestAsk = asks[askIdx];

      // Match when best bid price >= best ask price
      if (bestBid.decryptedPrice >= bestAsk.decryptedPrice) {
        // Execution price = midpoint of bid and ask
        const executionPrice = (bestBid.decryptedPrice + bestAsk.decryptedPrice) / 2n;

        // Execution amount = min(bid amount, ask amount)
        const executionAmount = bestBid.decryptedAmount < bestAsk.decryptedAmount
          ? bestBid.decryptedAmount
          : bestAsk.decryptedAmount;

        const match: Match = {
          buyer: bestBid,
          seller: bestAsk,
          executionPrice,
          executionAmount,
          deepBookRefPrice: refPrice,
          timestamp: Date.now(),
        };

        newMatches.push(match);
        this.matches.push(match);

        // Remove matched orders from book
        this.orderBook.removeOrder(bestBid.commitment);
        this.orderBook.removeOrder(bestAsk.commitment);

        console.log('--- MATCH FOUND ---');
        console.log(`  Buyer:  ${bestBid.commitment.slice(0, 16)}...`);
        console.log(`  Seller: ${bestAsk.commitment.slice(0, 16)}...`);
        console.log('-------------------');
        logService.addLog('info', 'matcher', `Match found: buyer=${bestBid.commitment.slice(0, 16)}... seller=${bestAsk.commitment.slice(0, 16)}...`);

        bidIdx++;
        askIdx++;
      } else {
        // No more crosses possible (bids are desc, asks are asc)
        break;
      }
    }

    return newMatches;
  }

  recordSettlementDigest(matchIndex: number, digest: string) {
    if (matchIndex >= 0 && matchIndex < this.matches.length) {
      this.matches[matchIndex].settlementDigest = digest;
    }
  }

  setSettlementDigestForMatch(buyerCommitment: string, sellerCommitment: string, digest: string) {
    for (let i = this.matches.length - 1; i >= 0; i--) {
      const m = this.matches[i];
      if (m.buyer.commitment === buyerCommitment && m.seller.commitment === sellerCommitment && !m.settlementDigest) {
        m.settlementDigest = digest;
        return;
      }
    }
  }

  /**
   * Record a flash loan settlement as a pseudo-match so it appears in /matches.
   * Uses "deepbook:..." sentinel for commitmentB to distinguish from internal matches.
   */
  recordFlashLoanSettlement(
    sell: { commitment: string; owner: string },
    txDigest: string,
  ) {
    const pseudoMatch: Match = {
      buyer: {
        commitment: sell.commitment,
        owner: sell.owner,
        timestamp: Date.now(),
        encryptedData: '',
        decryptedPrice: 0n,
        decryptedAmount: 0n,
        decryptedSide: 0,
        decryptedLockedAmount: 0n,
      } as any,
      seller: {
        commitment: `deepbook:${sell.commitment.slice(0, 32)}`,
        owner: sell.owner,
        timestamp: Date.now(),
        encryptedData: '',
        decryptedPrice: 0n,
        decryptedAmount: 0n,
        decryptedSide: 0,
        decryptedLockedAmount: 0n,
      } as any,
      executionPrice: 0n,
      executionAmount: 0n,
      deepBookRefPrice: null,
      timestamp: Date.now(),
      settlementDigest: txDigest,
    };
    this.matches.push(pseudoMatch);
  }

  getMatches(): Match[] {
    return this.matches;
  }

  getRecentMatches(count: number = 10): Match[] {
    return this.matches.slice(-count);
  }
}

