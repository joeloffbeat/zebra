import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { SuiEventListener, CommittedOrder } from './sui-listener.js';
import { OrderBook, DecryptedOrderInfo } from './order-book.js';
import { OrderMatcher } from './matcher.js';
import { SettlementService } from './settlement.js';
import { SealService } from './seal-service.js';
import { DeepBookService } from './deepbook-service.js';
import { TeeAttestationService } from './tee-attestation.js';
import { FlashLoanService } from './flash-loan-service.js';
import { FlashLoanSettlementService } from './flash-loan-settlement.js';
import { BatchEngine } from './batch-engine.js';
import { logService } from './log-service.js';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize components
const listener = new SuiEventListener();
const orderBook = new OrderBook();
const sealService = new SealService();
const deepBookService = new DeepBookService();
const matcher = new OrderMatcher(orderBook, deepBookService);
const settlement = new SettlementService();
const teeService = new TeeAttestationService(config.enclaveKeyPath, config.teeMode);
const flashLoanService = new FlashLoanService();
const flashLoanSettlement = new FlashLoanSettlementService(deepBookService);

// Wire TEE service into settlement
settlement.setTeeService(teeService);

// Batch engine replaces immediate two-party matching
const batchEngine = new BatchEngine(orderBook, matcher, settlement, flashLoanSettlement, teeService);

// Handle new orders — Seal decryption is MANDATORY (no demo mode)
listener.on('orderCommitted', async (order: CommittedOrder) => {
  teeService.incrementOrdersReceived();

  if (order.encryptedData.length === 0) {
    teeService.incrementDecryptionFailures();
    console.log(`No encrypted data for ${order.commitment.slice(0, 16)}..., queuing for retry`);
    logService.addLog('warn', 'engine', `No encrypted data for ${order.commitment.slice(0, 16)}..., queuing for retry`);
    orderBook.addPendingOrder(order);
    return;
  }

  const decrypted = await sealService.decryptOrderData(order.encryptedData);
  if (decrypted) {
    teeService.incrementOrdersDecrypted();
    console.log(`Decrypted order: ${order.commitment.slice(0, 16)}... | side=${decrypted.side}`);
    logService.addLog('info', 'engine', `Decrypted order: ${order.commitment.slice(0, 16)}... | side=${decrypted.side}`);

    const enrichedOrder: DecryptedOrderInfo = {
      ...order,
      decryptedPrice: decrypted.price,
      decryptedAmount: decrypted.amount,
      decryptedSide: decrypted.side,
      decryptedLockedAmount: decrypted.amount, // use decrypted amount as locked
      decryptedReceivers: decrypted.receivers ?? [],
    };

    batchEngine.addOrder(enrichedOrder);
  } else {
    teeService.incrementDecryptionFailures();
    console.log(`Seal decryption failed for ${order.commitment.slice(0, 16)}..., queuing for retry`);
    logService.addLog('warn', 'engine', `Seal decryption failed for ${order.commitment.slice(0, 16)}..., queuing for retry`);
    orderBook.addPendingOrder(order);
  }
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
    tee: {
      mode: teeInfo.mode,
      publicKey: teeInfo.publicKey,
      attestationCount: teeInfo.attestationCount,
    },
    matcherAddress: settlement.getMatcherAddress(),
    orderBook: orderCounts,
    recentMatches: matcher.getRecentMatches(5).length,
    batch: batchEngine.getState(),
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
  // Merge bids + asks into single array — no side distinction exposed
  const allOrders = [
    ...orderBook.getBids().map(o => ({
      commitmentPrefix: o.commitment.slice(0, 16) + '...',
      timestamp: o.timestamp,
    })),
    ...orderBook.getAsks().map(o => ({
      commitmentPrefix: o.commitment.slice(0, 16) + '...',
      timestamp: o.timestamp,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  res.json({
    counts,
    orders: allOrders,
  });
});

// ── Privacy-hardened matches endpoint ────────────────────────────────
app.get('/matches', (req, res) => {
  res.json({
    matches: matcher.getRecentMatches().map(m => ({
      commitmentAPrefix: m.buyer.commitment.slice(0, 16) + '...',
      commitmentBPrefix: m.seller.commitment.slice(0, 16) + '...',
      timestamp: m.timestamp,
      settled: !!m.settlementDigest,
      settlementDigest: m.settlementDigest ?? null,
    })),
  });
});

// ── Batch status endpoint ─────────────────────────────────────────────
app.get('/batch/status', (req, res) => {
  res.json(batchEngine.getState());
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
  const m = teeService.getMetrics();
  const oyster = await teeService.fetchOysterAttestation();
  const orderCounts = orderBook.getOrderCount();
  // Shape response to match frontend TeeMetrics interface
  res.json({
    teeMode: m.mode,
    publicKey: m.publicKey,
    matcherAddress: settlement.getMatcherAddress(),
    uptime: m.uptime,
    metrics: {
      ordersReceived: m.ordersReceived,
      ordersDecrypted: m.ordersDecrypted,
      decryptionFailures: m.decryptionFailures,
      matchesFound: m.matchesFound,
      settlementsExecuted: m.settlementsExecuted,
      totalVolumeSettled: Number(m.totalVolumeSettled),
      flashLoansExecuted: m.flashLoansExecuted,
    },
    orderBook: orderCounts,
    oysterAttestation: oyster,
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

app.get('/logs', (req, res) => {
  res.json({ logs: logService.getRecentLogs(100) });
});

// ── Start server ─────────────────────────────────────────────────────
app.listen(config.port, async () => {
  console.log(`Zebra Matching Engine running on port ${config.port}`);
  logService.addLog('info', 'engine', `Zebra Matching Engine running on port ${config.port}`);
  console.log(`TEE mode: ${teeService.getMode()}`);
  logService.addLog('info', 'engine', `TEE mode: ${teeService.getMode()}`);
  console.log(`TEE public key: ${teeService.getPublicKeyHex()}`);
  logService.addLog('info', 'engine', `TEE public key: ${teeService.getPublicKeyHex()}`);

  if (!config.sealAllowlistId) {
    console.error('FATAL: SEAL_ALLOWLIST_ID not set — Seal encryption is mandatory');
    console.error('Run: npx tsx scripts/setup-seal.ts');
    process.exit(1);
  }
  console.log('Seal encryption: enabled');
  logService.addLog('info', 'engine', 'Seal encryption: enabled');

  console.log(`Sui RPC: ${config.suiRpcUrl}`);
  logService.addLog('info', 'engine', `Sui RPC: ${config.suiRpcUrl}`);
  console.log(`Package: ${config.darkPoolPackage}`);
  logService.addLog('info', 'engine', `Package: ${config.darkPoolPackage}`);
  console.log(`Pool: ${config.darkPoolObject}`);
  logService.addLog('info', 'engine', `Pool: ${config.darkPoolObject}`);
  console.log(`MatcherCap: ${config.matcherCapId}`);
  logService.addLog('info', 'engine', `MatcherCap: ${config.matcherCapId}`);

  // Start listening for events
  await listener.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  logService.addLog('info', 'engine', 'Shutting down...');
  listener.stop();
  process.exit(0);
});
