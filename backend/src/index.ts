import express from 'express';
import { config } from './config.js';
import { SuiEventListener, CommittedOrder } from './sui-listener.js';
import { OrderBook, DecryptedOrderInfo } from './order-book.js';
import { OrderMatcher } from './matcher.js';
import { SettlementService } from './settlement.js';
import { SealService } from './seal-service.js';
import { DeepBookService } from './deepbook-service.js';
import { TeeAttestationService } from './tee-attestation.js';
import { FlashLoanService } from './flash-loan-service.js';

const app = express();
app.use(express.json());

// Determine if Seal encryption is configured
const sealConfigured = !!config.sealAllowlistId;

// Initialize components
const listener = new SuiEventListener();
const orderBook = new OrderBook();
const sealService = new SealService();
const deepBookService = new DeepBookService();
const matcher = new OrderMatcher(orderBook, deepBookService);
const settlement = new SettlementService();
const teeService = new TeeAttestationService(config.enclaveKeyPath, config.teeMode);
const flashLoanService = new FlashLoanService();

// Wire TEE service into settlement
settlement.setTeeService(teeService);

// Simple matching mutex to prevent concurrent matching
let matchingInProgress = false;
const pendingMatchQueue: (() => void)[] = [];

async function tryMatchAndSettle() {
  if (matchingInProgress) return;
  matchingInProgress = true;

  try {
    const matches = await matcher.findMatches();

    for (const match of matches) {
      teeService.incrementMatchesFound();
    }

    for (const match of matches) {
      const digest = await settlement.settleMatch(match);
      if (digest) {
        teeService.recordSettlement(digest, match.executionAmount);
        matcher.setSettlementDigestForMatch(match.buyer.commitment, match.seller.commitment, digest);
      }
    }
  } finally {
    matchingInProgress = false;
    // Process any queued match requests
    const next = pendingMatchQueue.shift();
    if (next) next();
  }
}

function scheduleMatch() {
  if (matchingInProgress) {
    pendingMatchQueue.push(() => tryMatchAndSettle());
  } else {
    tryMatchAndSettle();
  }
}

// Handle new orders
listener.on('orderCommitted', async (order: CommittedOrder) => {
  teeService.incrementOrdersReceived();

  let decryptedPrice = 0n;
  let decryptedAmount = 0n;
  let decryptedSide = order.isBid ? 1 : 0;

  if (order.encryptedData.length > 0 && sealConfigured) {
    // Production mode: Seal is configured, try to decrypt
    const decrypted = await sealService.decryptOrderData(order.encryptedData);
    if (decrypted) {
      decryptedPrice = decrypted.price;
      decryptedAmount = decrypted.amount;
      decryptedSide = decrypted.side;
      teeService.incrementOrdersDecrypted();
      console.log(`Decrypted order: ${order.commitment.slice(0, 16)}... | side=${decryptedSide}`);
    } else {
      // Seal decryption failed — queue for retry
      teeService.incrementDecryptionFailures();
      console.log(`Seal decryption failed for ${order.commitment.slice(0, 16)}..., queuing for retry`);
      orderBook.addPendingOrder(order);
      return;
    }
  } else if (!sealConfigured) {
    // Demo mode: Seal NOT configured — use on-chain data for matching
    // WARNING: This is NOT private — only for testing/demo
    decryptedPrice = order.lockedAmount;
    decryptedAmount = order.lockedAmount;
    decryptedSide = order.isBid ? 1 : 0;
    teeService.incrementOrdersDecrypted();
    console.log(`[DEMO MODE] Order from on-chain data: ${order.commitment.slice(0, 16)}... | side=${decryptedSide}`);
  } else {
    // Seal configured but no encrypted data — queue
    teeService.incrementDecryptionFailures();
    console.log(`No encrypted data for ${order.commitment.slice(0, 16)}..., queuing for retry`);
    orderBook.addPendingOrder(order);
    return;
  }

  const enrichedOrder: DecryptedOrderInfo = {
    ...order,
    decryptedPrice,
    decryptedAmount,
    decryptedSide,
  };

  orderBook.addOrder(enrichedOrder);
  scheduleMatch();
});

// ── REST API endpoints ───────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/status', (req, res) => {
  const teeInfo = teeService.getAttestationInfo();
  const orderCounts = orderBook.getOrderCount();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    sealConfigured,
    tee: {
      mode: teeInfo.mode,
      publicKey: teeInfo.publicKey,
      attestationCount: teeInfo.attestationCount,
    },
    matcherAddress: settlement.getMatcherAddress(),
    orderBook: orderCounts,
    recentMatches: matcher.getRecentMatches(5).length,
  });
});

// ── Internal attestation endpoint (full data for signature verification) ──
app.get('/attestation', (req, res) => {
  const info = teeService.getAttestationInfo();
  res.json({
    mode: info.mode,
    publicKey: info.publicKey,
    matcherAddress: settlement.getMatcherAddress(),
    attestationCount: info.attestationCount,
    recentAttestations: teeService.getRecentAttestations(5),
  });
});

// ── Privacy-hardened orders endpoint ─────────────────────────────────
app.get('/orders', (req, res) => {
  const counts = orderBook.getOrderCount();
  res.json({
    counts,
    bids: orderBook.getBids().map(o => ({
      commitmentPrefix: o.commitment.slice(0, 16) + '...',
      owner: o.owner,
      timestamp: o.timestamp,
      side: 'bid',
    })),
    asks: orderBook.getAsks().map(o => ({
      commitmentPrefix: o.commitment.slice(0, 16) + '...',
      owner: o.owner,
      timestamp: o.timestamp,
      side: 'ask',
    })),
  });
});

// ── Privacy-hardened matches endpoint ────────────────────────────────
app.get('/matches', (req, res) => {
  res.json({
    matches: matcher.getRecentMatches().map(m => ({
      buyerCommitmentPrefix: m.buyer.commitment.slice(0, 16) + '...',
      sellerCommitmentPrefix: m.seller.commitment.slice(0, 16) + '...',
      timestamp: m.timestamp,
      settled: !!m.settlementDigest,
      settlementDigest: m.settlementDigest ?? null,
    })),
  });
});

app.get('/deepbook/midprice', async (req, res) => {
  const pool = (req.query.pool as string) || 'SUI_DBUSDC';
  const midPrice = await deepBookService.getMidPrice(pool);
  res.json({ pool, midPrice });
});

// ── Flash loan endpoints ─────────────────────────────────────────────
app.post('/flash-loan/demo', async (req, res) => {
  const { poolKey = 'SUI_DBUSDC', borrowAmount = 0.001 } = req.body || {};
  const result = await flashLoanService.executeFlashLoanDemo({ poolKey, borrowAmount });
  if (result.success) {
    teeService.incrementFlashLoans();
  }
  res.json(result);
});

app.get('/flash-loan/pools', async (req, res) => {
  const pools = await flashLoanService.getAvailablePools();
  res.json({ pools });
});

// ── TEE metrics & attestation endpoints ──────────────────────────────
app.get('/tee/metrics', async (req, res) => {
  const metrics = teeService.getMetrics();
  const oyster = await teeService.fetchOysterAttestation();
  const orderCounts = orderBook.getOrderCount();
  res.json({
    ...metrics,
    sealConfigured,
    oysterAttestation: oyster,
    orderBook: orderCounts,
  });
});

app.get('/tee/attestation/raw', async (req, res) => {
  const oyster = await teeService.fetchOysterAttestation();
  if (!oyster.raw) {
    res.json({ error: 'Oyster attestation not available (not in enclave mode or sidecar unreachable)' });
    return;
  }
  res.json({ raw: oyster.raw, cachedAt: oyster.cachedAt });
});

app.get('/tee/attestations', (req, res) => {
  res.json({
    attestations: teeService.getRedactedAttestations(10),
  });
});

// ── Start server ─────────────────────────────────────────────────────
app.listen(config.port, async () => {
  console.log(`Zebra Matching Engine running on port ${config.port}`);
  console.log(`TEE mode: ${teeService.getMode()}`);
  console.log(`TEE public key: ${teeService.getPublicKeyHex()}`);
  if (!sealConfigured) {
    console.warn('WARNING: SEAL_ALLOWLIST_ID not set — running in DEMO MODE (no order privacy)');
  } else {
    console.log('Seal encryption: enabled');
  }
  console.log(`Sui RPC: ${config.suiRpcUrl}`);
  console.log(`Package: ${config.darkPoolPackage}`);
  console.log(`Pool: ${config.darkPoolObject}`);
  console.log(`MatcherCap: ${config.matcherCapId}`);

  // Start listening for events
  await listener.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  listener.stop();
  process.exit(0);
});
