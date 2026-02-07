import { OrderBook, DecryptedOrderInfo } from './order-book.js';
import { OrderMatcher, Match } from './matcher.js';
import { SettlementService } from './settlement.js';
import { FlashLoanSettlementService, FlashLoanSettlementResult } from './flash-loan-settlement.js';
import { TeeAttestationService } from './tee-attestation.js';
import { logService } from './log-service.js';

export interface BatchResolution {
  batchId: number;
  timestamp: number;
  internalMatches: number;
  deepBookSettlements: number;
  deepBookFailures: number;
  carryOverBuys: number;
  totalOrders: number;
}

export interface BatchState {
  batchId: number;
  orderCount: number;
  status: 'accumulating' | 'resolving' | 'idle';
  timeRemainingMs: number;
  lastResolution: BatchResolution | null;
}

const BATCH_WINDOW_MS = 60_000; // 60 seconds
const BATCH_THRESHOLD = 10;     // Max orders before early resolution

export class BatchEngine {
  private orderBook: OrderBook;
  private matcher: OrderMatcher;
  private settlement: SettlementService;
  private flashLoanSettlement: FlashLoanSettlementService;
  private teeService: TeeAttestationService;

  private batchId = 0;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchStartTime: number | null = null;
  private status: 'accumulating' | 'resolving' | 'idle' = 'idle';
  private lastResolution: BatchResolution | null = null;
  private resolving = false;

  constructor(
    orderBook: OrderBook,
    matcher: OrderMatcher,
    settlement: SettlementService,
    flashLoanSettlement: FlashLoanSettlementService,
    teeService: TeeAttestationService,
  ) {
    this.orderBook = orderBook;
    this.matcher = matcher;
    this.settlement = settlement;
    this.flashLoanSettlement = flashLoanSettlement;
    this.teeService = teeService;

    console.log(`BatchEngine initialized (window=${BATCH_WINDOW_MS / 1000}s, threshold=${BATCH_THRESHOLD})`);
    logService.addLog('info', 'batch-engine', `BatchEngine initialized (window=${BATCH_WINDOW_MS / 1000}s, threshold=${BATCH_THRESHOLD})`);
  }

  /**
   * Add an order to the batch. Starts or extends the batch timer.
   */
  addOrder(order: DecryptedOrderInfo) {
    this.orderBook.addOrder(order);
    this.startOrExtendBatch();

    const counts = this.orderBook.getOrderCount();
    const totalOrders = counts.bids + counts.asks;

    console.log(`BatchEngine: Order added (total=${totalOrders}, batchId=${this.batchId})`);
    logService.addLog('info', 'batch-engine', `BatchEngine: Order added (total=${totalOrders}, batchId=${this.batchId})`);

    // Trigger early resolution if threshold reached
    if (totalOrders >= BATCH_THRESHOLD) {
      console.log(`BatchEngine: Threshold reached (${totalOrders} >= ${BATCH_THRESHOLD}), resolving early`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Threshold reached (${totalOrders} >= ${BATCH_THRESHOLD}), resolving early`);
      this.triggerResolution();
    }
  }

  /**
   * Get current batch state for API consumers.
   */
  getState(): BatchState {
    const counts = this.orderBook.getOrderCount();
    let timeRemainingMs = 0;

    if (this.batchStartTime && this.status === 'accumulating') {
      const elapsed = Date.now() - this.batchStartTime;
      timeRemainingMs = Math.max(0, BATCH_WINDOW_MS - elapsed);
    }

    return {
      batchId: this.batchId,
      orderCount: counts.bids + counts.asks,
      status: this.status,
      timeRemainingMs,
      lastResolution: this.lastResolution,
    };
  }

  private startOrExtendBatch() {
    if (this.status === 'resolving') return;

    if (!this.batchTimer) {
      // Start new batch window
      this.batchId++;
      this.batchStartTime = Date.now();
      this.status = 'accumulating';

      this.batchTimer = setTimeout(() => {
        this.triggerResolution();
      }, BATCH_WINDOW_MS);

      console.log(`BatchEngine: Batch #${this.batchId} started (${BATCH_WINDOW_MS / 1000}s window)`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Batch #${this.batchId} started (${BATCH_WINDOW_MS / 1000}s window)`);
    }
    // If timer already running, no action needed — window stays the same
  }

  private triggerResolution() {
    if (this.resolving) return;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.resolveBatch().catch(err => {
      console.error('BatchEngine: Resolution failed:', err);
      logService.addLog('error', 'batch-engine', `Resolution failed: ${err}`);
      this.status = 'idle';
      this.resolving = false;
    });
  }

  /**
   * Resolve the current batch:
   *   Phase A: Internal BUY<->SELL matching via existing matcher
   *   Phase B: Residual SELLs settled via DeepBook flash loans
   *   Phase C: Residual BUYs carry over to next batch
   */
  private async resolveBatch() {
    this.resolving = true;
    this.status = 'resolving';
    const currentBatchId = this.batchId;

    const counts = this.orderBook.getOrderCount();
    const totalOrders = counts.bids + counts.asks;

    if (totalOrders === 0) {
      console.log(`BatchEngine: Batch #${currentBatchId} — no orders to resolve`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Batch #${currentBatchId} — no orders to resolve`);
      this.status = 'idle';
      this.resolving = false;
      this.batchStartTime = null;
      return;
    }

    console.log(`BatchEngine: Resolving batch #${currentBatchId} (${counts.bids} bids, ${counts.asks} asks)`);
    logService.addLog('info', 'batch-engine', `BatchEngine: Resolving batch #${currentBatchId} (${counts.bids} bids, ${counts.asks} asks)`);

    // ── Phase A: Internal matching ─────────────────────────────────
    let internalMatches = 0;
    try {
      const matches = await this.matcher.findMatches();
      internalMatches = matches.length;

      for (const match of matches) {
        this.teeService.incrementMatchesFound();
      }

      for (const match of matches) {
        const digest = await this.settlement.settleMatch(match);
        if (digest) {
          this.teeService.recordSettlement(digest, match.executionAmount);
          this.matcher.setSettlementDigestForMatch(
            match.buyer.commitment,
            match.seller.commitment,
            digest,
          );
        }
      }

      console.log(`BatchEngine: Phase A complete — ${internalMatches} internal matches`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Phase A complete — ${internalMatches} internal matches`);
    } catch (err) {
      console.error('BatchEngine: Phase A (internal matching) error:', err);
      logService.addLog('error', 'batch-engine', `BatchEngine: Phase A (internal matching) error: ${err}`);
    }

    // ── Phase B: Flash loan settlement for residual SELLs ──────────
    let deepBookSettlements = 0;
    let deepBookFailures = 0;

    const residualSells = this.orderBook.getAsks();
    if (residualSells.length > 0) {
      console.log(`BatchEngine: Phase B — ${residualSells.length} residual SELLs to settle via DeepBook`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Phase B — ${residualSells.length} residual SELLs to settle via DeepBook`);

      try {
        const results = await this.flashLoanSettlement.settleResidualSells(residualSells);

        for (const result of results) {
          if (result.success) {
            deepBookSettlements++;
            this.teeService.incrementFlashLoans();
            if (result.txDigest) {
              this.teeService.recordSettlement(result.txDigest, result.amountSui);
            }
            // Record in matcher so it shows up in /matches endpoint
            this.matcher.recordFlashLoanSettlement(
              { commitment: result.commitment, owner: result.sellerAddress },
              result.txDigest || '',
            );
            // Remove settled order from book
            this.orderBook.removeOrder(result.commitment);
          } else {
            deepBookFailures++;
            console.warn(`BatchEngine: Flash loan failed for ${result.commitment.slice(0, 16)}...: ${result.error}`);
            logService.addLog('warn', 'batch-engine', `BatchEngine: Flash loan failed for ${result.commitment.slice(0, 16)}...: ${result.error}`);
            // Leave in order book — will carry to next batch
          }
        }
      } catch (err) {
        console.error('BatchEngine: Phase B (flash loan settlement) error:', err);
        logService.addLog('error', 'batch-engine', `BatchEngine: Phase B (flash loan settlement) error: ${err}`);
        deepBookFailures = residualSells.length;
      }

      console.log(`BatchEngine: Phase B complete — ${deepBookSettlements} settled, ${deepBookFailures} failed`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Phase B complete — ${deepBookSettlements} settled, ${deepBookFailures} failed`);
    }

    // ── Phase C: Residual BUYs carry over ──────────────────────────
    const carryOverBuys = this.orderBook.getOrderCount().bids;
    if (carryOverBuys > 0) {
      console.log(`BatchEngine: Phase C — ${carryOverBuys} residual BUYs carry to next batch`);
      logService.addLog('info', 'batch-engine', `BatchEngine: Phase C — ${carryOverBuys} residual BUYs carry to next batch`);
    }

    // Record resolution
    this.lastResolution = {
      batchId: currentBatchId,
      timestamp: Date.now(),
      internalMatches,
      deepBookSettlements,
      deepBookFailures,
      carryOverBuys,
      totalOrders,
    };

    console.log(`BatchEngine: Batch #${currentBatchId} resolved`, this.lastResolution);
    logService.addLog('info', 'batch-engine', `BatchEngine: Batch #${currentBatchId} resolved`);

    this.status = 'idle';
    this.resolving = false;
    this.batchStartTime = null;

    // If carry-over orders exist, start a new batch window automatically
    const remainingCounts = this.orderBook.getOrderCount();
    if (remainingCounts.bids + remainingCounts.asks > 0) {
      this.startOrExtendBatch();
    }
  }
}
