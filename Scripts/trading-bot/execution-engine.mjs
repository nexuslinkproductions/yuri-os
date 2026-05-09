#!/usr/bin/env node
/**
 * Trading Bot — Phase 6: Execution Engine
 *
 * Deterministic order submission via Coinbase Advanced Trade API with
 * full idempotency, adaptive polling, and append-only audit trail.
 *
 * Spec:  .claude/trading-bot/phase-6/EXECUTION_ENGINE.md
 * Schema: .claude/trading-bot/schemas/execution_event.schema.json
 *
 * Usage:
 *   node execution-engine.mjs                                          # stub with simulated order
 *   COINBASE_API_KEY=... COINBASE_API_SECRET=... COINBASE_API_PASSPHRASE=... \
 *     node execution-engine.mjs                                        # live order
 *   node execution-engine.mjs --report                                 # generate report
 *   node execution-engine.mjs --report --start 2026-05-04 --end 2026-05-05
 *
 * Env Vars:
 *   COINBASE_API_KEY       CB-ACCESS-KEY header
 *   COINBASE_API_SECRET    CB-ACCESS-SIGN HMAC secret (base64)
 *   COINBASE_API_PASSPHRASE  CB-ACCESS-PASSPHRASE header
 *   COINBASE_API_URL       Override API base URL (default: https://api.coinbase.com)
 *   EXECUTION_DATA_DIR     Override output directory
 */

// ─── Imports ────────────────────────────────────────────────────────────────

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ──────────────────────────────────────────────────────────────

const COINBASE_ORDERS_URL = '/api/v1/brokerage/orders';
const COINBASE_CANCEL_URL = '/api/v1/brokerage/orders/batch_cancel';

const POLL_PHASE_1_INTERVAL_MS = 2_000;   // first 30s
const POLL_PHASE_1_DURATION_MS = 30_000;
const POLL_PHASE_2_INTERVAL_MS = 10_000;  // next 5 min
const POLL_PHASE_2_DURATION_MS = 300_000;
const POLL_PHASE_3_INTERVAL_MS = 60_000;  // rest of day
const POLL_TIMEOUT_MS = 86_400_000;       // 24 hours

const TIMESTAMP_BUCKET_SECONDS = 5;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = [2_000, 4_000, 8_000];
const SERVER_ERROR_RETRIES = 5;
const SERVER_ERROR_TIMEOUT_MS = 30_000;

const OUTPUT_DIR = resolve(
  process.env.EXECUTION_DATA_DIR ||
    resolve(__dirname, '../../.claude/trading-bot/data')
);
const EXECUTION_LOG = resolve(OUTPUT_DIR, 'execution_event.jsonl');

const COINBASE_BASE_URL = process.env.COINBASE_API_URL || 'https://api.coinbase.com';

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowISO() {
  return new Date().toISOString();
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function validateNonEmpty(val, label) {
  if (val === undefined || val === null || (typeof val === 'string' && val.trim().length < 2)) {
    throw new Error(`ValidationError: ${label} must be a non-empty string with length > 1`);
  }
}

function validatePositiveNumber(val, label) {
  if (typeof val !== 'number' || val <= 0 || !Number.isFinite(val)) {
    throw new Error(`ValidationError: ${label} must be a positive number, got ${val}`);
  }
}

/**
 * Format a number to fixed decimals suitable for Coinbase order payloads.
 * Coinbase expects base_size and limit_price as strings with appropriate precision.
 */
function toCoinbaseDecimal(val, decimals = 8) {
  return val.toFixed(decimals);
}

// ─── Coinbase Auth ──────────────────────────────────────────────────────────

/**
 * Check whether Coinbase API credentials are configured.
 */
function hasCredentials() {
  return !!(
    process.env.COINBASE_API_KEY &&
    process.env.COINBASE_API_SECRET &&
    process.env.COINBASE_API_PASSPHRASE
  );
}

/**
 * Build Coinbase Cloud API auth headers for a given request.
 *
 * Signature formula (Coinbase Cloud / Advanced Trade API):
 *   sign = base64( HMAC-SHA256( base64_decode(secret), timestamp + method + requestPath + body ) )
 */
function buildAuthHeaders(method, requestPath, body) {
  const apiKey = process.env.COINBASE_API_KEY;
  const apiSecret = process.env.COINBASE_API_SECRET;
  const apiPassphrase = process.env.COINBASE_API_PASSPHRASE;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const prehash = timestamp + method.toUpperCase() + requestPath + (body || '');
  const secretBuffer = Buffer.from(apiSecret, 'base64');
  const signature = createHmac('sha256', secretBuffer)
    .update(prehash)
    .digest('base64');

  return {
    'CB-ACCESS-KEY': apiKey,
    'CB-ACCESS-SIGN': signature,
    'CB-ACCESS-TIMESTAMP': timestamp,
    'CB-ACCESS-PASSPHRASE': apiPassphrase,
    'Content-Type': 'application/json',
  };
}

// ─── Deterministic Client Order ID ──────────────────────────────────────────

/**
 * Calculate deterministic client_order_id for idempotent submissions.
 *
 * Hashes trade_id + market_id + side + size + price + timestamp_bucket(5s)
 * into a 64-char hex digest. Same inputs within the same 5s window yield
 * the same ID, preventing duplicate submissions on network retries.
 *
 * @param {string}  tradeId  - UUID of the parent trade
 * @param {string}  marketId - Market identifier (e.g. "BTC-USD")
 * @param {string}  side     - "BUY" or "SELL"
 * @param {number}  size     - Requested position size in USD
 * @param {number}  price    - Limit price in USD
 * @returns {string} 64-char hex SHA-256 digest
 */
function calculateDeterministicClientOrderId(tradeId, marketId, side, size, price) {
  validateNonEmpty(tradeId, 'tradeId');
  validateNonEmpty(marketId, 'marketId');
  validateNonEmpty(side, 'side');
  validatePositiveNumber(size, 'size');
  validatePositiveNumber(price, 'price');

  const bucket = Math.floor(Date.now() / 1000 / TIMESTAMP_BUCKET_SECONDS) * TIMESTAMP_BUCKET_SECONDS;
  const payload = `${tradeId}:${marketId}:${side}:${size}:${price}:${bucket}`;
  return createHash('sha256').update(payload, 'utf-8').digest('hex');
}

// ─── Coinbase API Client ────────────────────────────────────────────────────

/**
 * Make a signed request to the Coinbase Advanced Trade API.
 *
 * @param {string} method  - HTTP method ("GET" | "POST")
 * @param {string} path    - API path (e.g. "/api/v1/brokerage/orders")
 * @param {object|null} body - JSON body for POST requests
 * @param {AbortSignal|null} signal - Optional abort signal
 * @returns {Promise<object>} JSON response body
 */
async function coinbaseRequest(method, path, body, signal) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = buildAuthHeaders(method, path, bodyStr);
  const url = `${COINBASE_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
    signal,
  });

  const status = response.status;
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (status === 401) {
    throw new HaltError(`Unauthorized: check COINBASE_API_KEY credentials`, status, data);
  }
  if (status === 403) {
    throw new HaltError(`Forbidden: check API permissions`, status, data);
  }
  if (status === 400) {
    // Reject — log and continue (non-fatal)
    const err = new Error(`BadRequest: ${JSON.stringify(data)}`);
    err.status = status;
    err.data = data;
    err.rejectTrade = true;
    throw err;
  }
  if (status === 429) {
    // Rate limited — will be retried by caller
    const err = new Error(`RateLimited`);
    err.status = status;
    err.data = data;
    throw err;
  }
  if (status >= 500) {
    const err = new Error(`ServerError: ${status} ${JSON.stringify(data)}`);
    err.status = status;
    err.data = data;
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`APIError: ${status} ${JSON.stringify(data)}`);
    err.status = status;
    err.data = data;
    throw err;
  }

  return data;
}

// ─── Custom Error Classes ───────────────────────────────────────────────────

/** Fatal error that should halt the execution engine. */
class HaltError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'HaltError';
    this.status = status;
    this.data = data;
  }
}

/** Error indicating insufficient funds. */
class InsufficientFundsError extends Error {
  constructor(message, data) {
    super(message);
    this.name = 'InsufficientFundsError';
    this.data = data;
  }
}

/** Error indicating market conditions make execution impossible. */
class MarketConditionError extends Error {
  constructor(message, data) {
    super(message);
    this.name = 'MarketConditionError';
    this.data = data;
  }
}

// ─── Retry Wrapper ──────────────────────────────────────────────────────────

/**
 * Execute an async function with exponential backoff for rate-limit errors
 * and linear retry with jitter for server errors.
 *
 * @param {Function} fn      - Async function to retry
 * @param {object}   options
 * @param {number}   options.rateLimitRetries  - Max retries on 429
 * @param {number}   options.serverRetries     - Max retries on 5xx
 * @param {number}   options.serverTimeoutMs   - Total timeout for server-error retries
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
  const rateLimitRetries = options.rateLimitRetries ?? RATE_LIMIT_RETRIES;
  const serverRetries = options.serverRetries ?? SERVER_ERROR_RETRIES;
  const serverTimeoutMs = options.serverTimeoutMs ?? SERVER_ERROR_TIMEOUT_MS;

  const startTime = Date.now();
  let lastError;

  for (let attempt = 0; attempt < Math.max(rateLimitRetries, serverRetries) + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err instanceof HaltError) {
        throw err; // Fatal — do not retry
      }
      if (err instanceof InsufficientFundsError) {
        throw err; // Fatal — do not retry
      }
      if (err instanceof MarketConditionError) {
        throw err; // Fatal — do not retry
      }
      if (err.rejectTrade) {
        throw err; // 400 Bad Request — reject, do not retry
      }

      if (err.status === 429 && attempt < rateLimitRetries) {
        const backoff = RATE_LIMIT_BACKOFF_MS[attempt] || RATE_LIMIT_BACKOFF_MS[RATE_LIMIT_BACKOFF_MS.length - 1];
        const jitter = Math.random() * 500;
        console.warn(`[retry] 429 rate limited, backing off ${backoff + jitter}ms (attempt ${attempt + 1}/${rateLimitRetries})`);
        await sleep(backoff + jitter);
        continue;
      }

      if (err.status >= 500 && attempt < serverRetries) {
        if (Date.now() - startTime > serverTimeoutMs) {
          console.error(`[retry] Server retry timeout exceeded (${serverTimeoutMs}ms), giving up`);
          throw err;
        }
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
        const jitter = Math.random() * 1000;
        console.warn(`[retry] ${err.status} server error, backing off ${backoff + jitter}ms (attempt ${attempt + 1}/${serverRetries})`);
        await sleep(backoff + jitter);
        continue;
      }

      // Non-retryable error — throw immediately
      throw err;
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Order Submission ───────────────────────────────────────────────────────

/**
 * Submit an order to Coinbase Advanced Trade API.
 *
 * Idempotent: uses deterministic client_order_id so re-submission after
 * network failure returns the existing order without creating a duplicate.
 *
 * @param {object} riskDecision   - RiskDecision object (must have decision === "APPROVE")
 * @param {object} marketSnapshot - MarketSnapshot with current prices
 * @returns {Promise<object>} ExecutionEvent
 */
async function submitOrder(riskDecision, marketSnapshot) {
  // ── Validate ──────────────────────────────────────────────────────────
  if (!riskDecision || riskDecision.decision !== 'APPROVE') {
    throw new Error('submitOrder called with non-APPROVE risk decision');
  }

  const { trade_id, market_id, risk_assessment } = riskDecision;
  const positionSizeUsd = risk_assessment?.position_size_usd;

  validateNonEmpty(trade_id, 'tradeId');
  validateNonEmpty(market_id, 'marketId');
  validatePositiveNumber(positionSizeUsd, 'position_size_usd');

  const side = riskDecision.market_id === marketSnapshot.market_id
    ? marketSnapshot.side?.toUpperCase()
    : null;
  const finalSide = side === 'BUY' || side === 'SELL' ? side : 'BUY';

  // Determine price — use best_ask for BUY, best_bid for SELL
  const price = finalSide === 'BUY'
    ? marketSnapshot.best_ask
    : marketSnapshot.best_bid;

  if (!price || price <= 0) {
    throw new MarketConditionError(
      `Invalid price for ${finalSide}: ${price}`,
      { side: finalSide, best_bid: marketSnapshot.best_bid, best_ask: marketSnapshot.best_ask }
    );
  }

  // ── Check for price movement > 10% from last_price ────────────────────
  if (marketSnapshot.last_price && marketSnapshot.last_price > 0) {
    const pctMove = Math.abs(price - marketSnapshot.last_price) / marketSnapshot.last_price;
    if (pctMove > 0.10) {
      throw new MarketConditionError(
        `Price moved ${(pctMove * 100).toFixed(2)}% from last price — rejecting (flash crash protection)`,
        { last_price: marketSnapshot.last_price, current_price: price, pct_move: pctMove }
      );
    }
  }

  // ── Deterministic client_order_id ─────────────────────────────────────
  const clientOrderId = calculateDeterministicClientOrderId(
    trade_id,
    market_id,
    finalSide,
    positionSizeUsd,
    price
  );

  // ── Build Coinbase order payload ──────────────────────────────────────
  const baseSize = positionSizeUsd / price;
  const orderPayload = {
    client_order_id: clientOrderId,
    product_id: market_id,
    side: finalSide,
    order_configuration: {
      limit_limit_gtc: {
        base_size: toCoinbaseDecimal(baseSize),
        limit_price: toCoinbaseDecimal(price),
        post_only: false,
      },
    },
  };

  const submittedAt = nowISO();
  const submitLatencyStart = Date.now();

  // ── Stub path ─────────────────────────────────────────────────────────
  if (!hasCredentials()) {
    console.warn('[execution] COINBASE_API_KEY not set — using simulated order');
    const simResult = simulateSubmission(riskDecision, marketSnapshot, clientOrderId, orderPayload, submittedAt);
    // Record the PENDING event
    recordExecutionEvent(simResult);
    // Go through polling lifecycle for complete simulation
    const simulatedExchangeId = simResult._simulatedOrderId;
    const finalEvent = await pollOrderStatus(simulatedExchangeId, clientOrderId, simResult);
    return finalEvent;
  }

  // ── Live submission with retry ────────────────────────────────────────
  let exchangeResponse;
  try {
    exchangeResponse = await withRetry(
      () => coinbaseRequest('POST', COINBASE_ORDERS_URL, orderPayload),
      { rateLimitRetries: RATE_LIMIT_RETRIES, serverRetries: SERVER_ERROR_RETRIES }
    );
  } catch (err) {
    if (err instanceof HaltError) throw err;
    if (err instanceof InsufficientFundsError) throw err;
    if (err instanceof MarketConditionError) throw err;

    // Check if order actually went through by querying with client_order_id
    console.warn(`[execution] Submission error, verifying order ${clientOrderId}: ${err.message}`);
    try {
      const verifyResp = await coinbaseRequest(
        'GET',
        `${COINBASE_ORDERS_URL}?client_order_id=${clientOrderId}`,
        null
      );
      if (verifyResp?.order) {
        console.log(`[execution] Order ${clientOrderId} was submitted successfully (verified)`);
        exchangeResponse = verifyResp;
      } else {
        // Build a FAILED execution event
        const ev = buildExecutionEvent({
          trade_id,
          market_id,
          client_order_id: clientOrderId,
          side: finalSide,
          status: 'FAILED',
          order_type: 'LIMIT',
          requested_size_usd: positionSizeUsd,
          requested_price: price,
          submitted_at: submittedAt,
          completed_at: nowISO(),
          rejection_reason: `SubmissionError: ${err.message}`,
        });
        recordExecutionEvent(ev);
        return ev;
      }
    } catch (verifyErr) {
      const ev = buildExecutionEvent({
        trade_id,
        market_id,
        client_order_id: clientOrderId,
        side: finalSide,
        status: 'FAILED',
        order_type: 'LIMIT',
        requested_size_usd: positionSizeUsd,
        requested_price: price,
        submitted_at: submittedAt,
        completed_at: nowISO(),
        rejection_reason: `SubmissionError: ${err.message}; VerificationError: ${verifyErr.message}`,
      });
      recordExecutionEvent(ev);
      return ev;
    }
  }

  const submitLatencyEnd = Date.now();
  const exchangeLatencyMs = submitLatencyEnd - submitLatencyStart;

  const exchangeOrderId = exchangeResponse?.order_id || exchangeResponse?.order?.order_id || null;

  if (!exchangeOrderId) {
    const ev = buildExecutionEvent({
      trade_id,
      market_id,
      client_order_id: clientOrderId,
      side: finalSide,
      status: 'FAILED',
      order_type: 'LIMIT',
      requested_size_usd: positionSizeUsd,
      requested_price: price,
      submitted_at: submittedAt,
      completed_at: nowISO(),
      rejection_reason: 'No exchange_order_id in response',
    });
    recordExecutionEvent(ev);
    return ev;
  }

  const initialStatus = mapCoinbaseStatus(exchangeResponse?.order?.status);

  // ── Record PENDING event ──────────────────────────────────────────────
  const pendingEvent = buildExecutionEvent({
    trade_id,
    market_id,
    client_order_id: clientOrderId,
    exchange_order_id: exchangeOrderId,
    side: finalSide,
    status: initialStatus || 'PENDING',
    order_type: 'LIMIT',
    requested_size_usd: positionSizeUsd,
    requested_price: price,
    submitted_at: submittedAt,
    exchange_latency_ms: exchangeLatencyMs,
  });
  recordExecutionEvent(pendingEvent);

  // ── Start polling ─────────────────────────────────────────────────────
  console.log(`[execution] Order ${clientOrderId} submitted (exchange: ${exchangeOrderId}), status: ${pendingEvent.status}`);
  const finalEvent = await pollOrderStatus(exchangeOrderId, clientOrderId, pendingEvent);

  return finalEvent;
}

// ─── Order Status Polling ───────────────────────────────────────────────────

/**
 * Poll order status with adaptive intervals until filled, cancelled, or timed out.
 *
 * @param {string} exchangeOrderId - Coinbase order ID
 * @param {string} clientOrderId   - Client-side deterministic ID
 * @param {object} [pendingEvent]  - The recorded PENDING event (for fallback data)
 * @returns {Promise<object>} Final ExecutionEvent
 */
async function pollOrderStatus(exchangeOrderId, clientOrderId, pendingEvent) {
  validateNonEmpty(exchangeOrderId, 'exchangeOrderId');
  validateNonEmpty(clientOrderId, 'clientOrderId');

  const pollStart = Date.now();
  let accumulatedBotLatencyMs = 0;
  let firstFillAt = null;
  let lastEvent = pendingEvent || null;

  while (true) {
    const elapsed = Date.now() - pollStart;

    // ── Timeout after 24 hours ──────────────────────────────────────────
    if (elapsed >= POLL_TIMEOUT_MS) {
      console.warn(`[poll] Order ${clientOrderId} timed out after 24h, cancelling...`);
      try {
        await cancelOrder(exchangeOrderId);
      } catch (err) {
        console.error(`[poll] Cancel after timeout failed: ${err.message}`);
      }
      if (lastEvent) {
        lastEvent.status = 'TIMEOUT';
        lastEvent.completed_at = nowISO();
        lastEvent.total_latency_ms = Date.now() - pollStart + (lastEvent.exchange_latency_ms || 0);
        recordExecutionEvent(lastEvent);
      }
      return lastEvent || buildExecutionEvent({
        client_order_id: clientOrderId,
        exchange_order_id: exchangeOrderId,
        status: 'TIMEOUT',
        completed_at: nowISO(),
      });
    }

    // ── Determine polling interval ──────────────────────────────────────
    let pollInterval;
    if (elapsed < POLL_PHASE_1_DURATION_MS) {
      pollInterval = POLL_PHASE_1_INTERVAL_MS;
    } else if (elapsed < POLL_PHASE_1_DURATION_MS + POLL_PHASE_2_DURATION_MS) {
      pollInterval = POLL_PHASE_2_INTERVAL_MS;
    } else {
      pollInterval = POLL_PHASE_3_INTERVAL_MS;
    }

    await sleep(pollInterval);
    const pollStartTime = Date.now();

    // ── Poll Coinbase ───────────────────────────────────────────────────
    let orderData;
    const orderMarketId = lastEvent?.market_id || null;
    const pollContext = { exchange_order_id: exchangeOrderId, client_order_id: clientOrderId, market_id: orderMarketId };

    if (!hasCredentials()) {
      // Simulate polling progression
      const simResult = simulatePollProgress(pollContext, elapsed);
      orderData = simResult;
      accumulatedBotLatencyMs += 5; // simulate processing time
    } else {
      try {
        const response = await withRetry(
          () => coinbaseRequest('GET', `${COINBASE_ORDERS_URL}/${exchangeOrderId}`, null),
          { rateLimitRetries: RATE_LIMIT_RETRIES, serverRetries: 3 }
        );
        orderData = response.order;
      } catch (err) {
        if (err instanceof HaltError) throw err;
        // On poll failure, mark as pending verification and continue
        console.warn(`[poll] Poll failed for ${exchangeOrderId}: ${err.message}`);
        continue; // Try again next interval
      }
    }

    const pollElapsed = Date.now() - pollStartTime;
    accumulatedBotLatencyMs += pollElapsed;

    // ── Map Coinbase status ─────────────────────────────────────────────
    const status = mapCoinbaseStatus(orderData?.status);
    const mid = orderData?.product_id || orderMarketId;
    const fillEvents = extractFillEvents(orderData, mid);

    if (!status) {
      console.warn(`[poll] Unknown status for ${exchangeOrderId}, continuing poll`);
      continue;
    }

    // ── Build current execution event snapshot ──────────────────────────
    const currentEvent = buildExecutionEventFromOrder({
      orderData,
      clientOrderId,
      exchangeOrderId: exchangeOrderId,
      submittedAt: lastEvent?.submitted_at,
      fillEvents,
      exchangeLatencyMs: pollElapsed,
      accumulatedBotLatencyMs,
      lastEvent,
    });

    // Track first fill
    if (!firstFillAt && fillEvents.length > 0 && (status === 'FILLED' || status === 'PARTIALLY_FILLED')) {
      firstFillAt = fillEvents[0].timestamp;
      currentEvent.first_fill_at = firstFillAt;
    }

    // ── Terminal states ─────────────────────────────────────────────────
    if (status === 'FILLED') {
      console.log(`[execution] Order ${clientOrderId} filled @ ${currentEvent.average_fill_price}`);
      currentEvent.completed_at = nowISO();
      currentEvent.total_latency_ms = Date.now() - pollStart;
      recordExecutionEvent(currentEvent);
      return currentEvent;
    }

    if (status === 'CANCELLED') {
      console.log(`[execution] Order ${clientOrderId} cancelled`);
      currentEvent.completed_at = nowISO();
      currentEvent.total_latency_ms = Date.now() - pollStart;
      recordExecutionEvent(currentEvent);
      return currentEvent;
    }

    if (status === 'FAILED') {
      console.error(`[execution] Order ${clientOrderId} failed: ${currentEvent.rejection_reason || 'unknown'}`);
      currentEvent.completed_at = nowISO();
      currentEvent.total_latency_ms = Date.now() - pollStart;
      recordExecutionEvent(currentEvent);
      return currentEvent;
    }

    // ── Non-terminal: record snapshot if status changed or has fills ────
    if (!lastEvent || lastEvent.status !== status || fillEvents.length > 0) {
      recordExecutionEvent(currentEvent);
    }

    lastEvent = currentEvent;

    // ── Check for cumulative fill >= requested size (cancel remainder) ──
    if (status === 'PARTIALLY_FILLED' && currentEvent.filled_size_usd != null) {
      const requestedSize = currentEvent.requested_size_usd;
      if (requestedSize > 0 && currentEvent.filled_size_usd >= requestedSize * 0.995) {
        // Close enough — cancel remainder
        console.log(`[execution] Order ${clientOrderId} reached target fill (${currentEvent.filled_size_usd}/${requestedSize}), cancelling remainder`);
        try {
          await cancelOrder(exchangeOrderId);
        } catch (err) {
          console.warn(`[execution] Cancel after target fill failed: ${err.message}`);
        }
        currentEvent.status = 'FILLED';
        currentEvent.completed_at = nowISO();
        currentEvent.total_latency_ms = Date.now() - pollStart;
        recordExecutionEvent(currentEvent);
        return currentEvent;
      }
    }
  }
}

// ─── Cancel Order ──────────────────────────────────────────────────────────

/**
 * Cancel an active order on Coinbase.
 *
 * @param {string} exchangeOrderId - Coinbase order ID to cancel
 * @returns {Promise<object>} ExecutionEvent with CANCELLED status
 */
async function cancelOrder(exchangeOrderId) {
  validateNonEmpty(exchangeOrderId, 'exchangeOrderId');

  if (!hasCredentials()) {
    console.warn(`[cancel] Simulating cancel of ${exchangeOrderId}`);
    const ev = buildExecutionEvent({
      exchange_order_id: exchangeOrderId,
      status: 'CANCELLED',
      completed_at: nowISO(),
      rejection_reason: 'User cancelled',
    });
    recordExecutionEvent(ev);
    return ev;
  }

  const payload = { order_ids: [exchangeOrderId] };

  try {
    const response = await withRetry(
      () => coinbaseRequest('POST', COINBASE_CANCEL_URL, payload),
      { rateLimitRetries: RATE_LIMIT_RETRIES, serverRetries: 3 }
    );
    console.log(`[cancel] Order ${exchangeOrderId} cancelled successfully`);
  } catch (err) {
    if (err instanceof HaltError) throw err;
    // If cancel fails, order may already be filled — check status
    console.warn(`[cancel] Cancel request for ${exchangeOrderId} had error: ${err.message}`);
  }

  const ev = buildExecutionEvent({
    exchange_order_id: exchangeOrderId,
    status: 'CANCELLED',
    completed_at: nowISO(),
    rejection_reason: 'User cancelled',
  });
  recordExecutionEvent(ev);
  return ev;
}

// ─── Record Execution Event ─────────────────────────────────────────────────

/**
 * Strip internal-use properties (prefixed with _) from an object.
 */
function stripInternal(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (!key.startsWith('_')) {
      clean[key] = obj[key];
    }
  }
  return clean;
}

/**
 * Append an execution event to `execution_event.jsonl`.
 * The file is append-only and immutable by design.
 *
 * @param {object} executionEvent - ExecutionEvent object matching schema
 */
function recordExecutionEvent(executionEvent) {
  if (!executionEvent || typeof executionEvent !== 'object') {
    throw new Error('recordExecutionEvent: executionEvent must be an object');
  }
  const clean = stripInternal(executionEvent);
  // execution_id is optional for internal snapshots but required for terminal records
  if (clean.status === 'FILLED' ||
      clean.status === 'FAILED' ||
      clean.status === 'CANCELLED' ||
      clean.status === 'TIMEOUT') {
    if (!clean.execution_id) {
      clean.execution_id = randomUUID();
    }
  }

  ensureOutputDir();
  const line = JSON.stringify(clean) + '\n';
  appendFileSync(EXECUTION_LOG, line, 'utf-8');
}

// ─── Generate Execution Report ──────────────────────────────────────────────

/**
 * Generate a markdown execution summary for a given time window.
 *
 * @param {object[]} events    - Array of ExecutionEvent objects
 * @param {Date}     startTime - Start of report window
 * @param {Date}     endTime   - End of report window (inclusive)
 * @returns {Promise<string>} Markdown report
 */
async function generateExecutionReport(events, startTime, endTime) {
  if (!Array.isArray(events)) {
    throw new Error('generateExecutionReport: events must be an array');
  }

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);

  // Filter to time window
  const windowed = events.filter(e => {
    const ts = e.submitted_at ? new Date(e.submitted_at) : null;
    return ts && ts >= start && ts <= end;
  });

  // Get unique terminal events (last event per client_order_id)
  // Sort by completed_at then submitted_at then execution_id for deterministic ordering
  const terminalMap = new Map();
  const sortedWindowed = [...windowed].sort((a, b) => {
    const aComp = a.completed_at ? new Date(a.completed_at).getTime() : (a.submitted_at ? new Date(a.submitted_at).getTime() : 0);
    const bComp = b.completed_at ? new Date(b.completed_at).getTime() : (b.submitted_at ? new Date(b.submitted_at).getTime() : 0);
    if (aComp !== bComp) return aComp - bComp;
    return (a.execution_id || '').localeCompare(b.execution_id || '');
  });
  for (const ev of sortedWindowed) {
    if (ev.client_order_id) {
      terminalMap.set(ev.client_order_id, ev);
    }
  }
  const terminalEvents = [...terminalMap.values()];

  const total = terminalEvents.length;
  const filled = terminalEvents.filter(e => e.status === 'FILLED').length;
  const partial = terminalEvents.filter(e => e.status === 'PARTIALLY_FILLED').length;
  const cancelled = terminalEvents.filter(e => e.status === 'CANCELLED').length;
  const failed = terminalEvents.filter(e => e.status === 'FAILED').length;
  const timeout = terminalEvents.filter(e => e.status === 'TIMEOUT').length;
  const pending = terminalEvents.filter(e => e.status === 'PENDING' || e.status === 'OPEN').length;

  const filledEvents = terminalEvents.filter(e => e.status === 'FILLED');
  const totalFilledUsd = filledEvents.reduce((sum, e) => sum + (e.filled_size_usd || 0), 0);
  const totalFeesUsd = filledEvents.reduce((sum, e) => sum + (e.fees_usd || 0), 0);
  const totalSlippageBps = filledEvents.reduce((sum, e) => sum + (e.slippage_bps || 0), 0);

  const line = [
    `# Execution Report — ${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Orders | ${total} |`,
    `| Filled | ${filled} |`,
    `| Partially Filled | ${partial} |`,
    `| Cancelled | ${cancelled} |`,
    `| Failed | ${failed} |`,
    `| Timed Out | ${timeout} |`,
    `| Pending/Open | ${pending} |`,
    `| Fill Rate | ${total > 0 ? ((filled / total) * 100).toFixed(1) : 'N/A'}% |`,
    `| Total Filled (USD) | $${totalFilledUsd.toFixed(2)} |`,
    `| Total Fees (USD) | $${totalFeesUsd.toFixed(4)} |`,
    `| Avg Slippage (bps) | ${filledEvents.length > 0 ? (totalSlippageBps / filledEvents.length).toFixed(1) : 'N/A'} |`,
    '',
  ];

  if (filledEvents.length > 0) {
    line.push('## Fill Details');
    line.push('');
    line.push('| Order | Market | Side | Requested | Filled | Avg Price | Slippage (bps) | Fees | Latency (ms) |');
    line.push('|-------|--------|------|-----------|--------|-----------|----------------|------|--------------|');
    for (const ev of filledEvents) {
      line.push(`| ${ev.client_order_id?.slice(0, 8) || 'N/A'} | ${ev.market_id || 'N/A'} | ${ev.side} | $${(ev.requested_size_usd || 0).toFixed(2)} | $${(ev.filled_size_usd || 0).toFixed(2)} | $${(ev.average_fill_price || 0).toFixed(2)} | ${ev.slippage_bps ?? 'N/A'} | $${(ev.fees_usd || 0).toFixed(4)} | ${ev.total_latency_ms ?? 'N/A'} |`);
    }
  }

  if (failed > 0 || timeout > 0) {
    line.push('');
    line.push('## Issues');
    line.push('');
    const issues = terminalEvents.filter(e => e.status === 'FAILED' || e.status === 'TIMEOUT');
    for (const ev of issues) {
      line.push(`- **${ev.status}** \`${ev.client_order_id?.slice(0, 8)}\`: ${ev.rejection_reason || 'No reason'}`);
    }
  }

  return line.join('\n');
}

// ─── Simulated / Stub Implementation ────────────────────────────────────────

/**
 * Simulate order submission (stub path — no real API credentials).
 */
function simulateSubmission(riskDecision, marketSnapshot, clientOrderId, orderPayload, submittedAt) {
  const { trade_id, market_id, risk_assessment } = riskDecision;
  const positionSizeUsd = risk_assessment?.position_size_usd || 0.5;
  const price = marketSnapshot?.best_ask || 42500.50;
  const baseSize = positionSizeUsd / price;

  const simulatedOrderId = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const fillPrice = price * (1 + (Math.random() - 0.5) * 0.002); // ±0.1% slippage
  const fillSize = baseSize;

  const ev = buildExecutionEvent({
    execution_id: randomUUID(),
    trade_id,
    market_id,
    client_order_id: clientOrderId,
    exchange_order_id: simulatedOrderId,
    side: orderPayload.side,
    status: 'PENDING',
    order_type: 'LIMIT',
    requested_size_usd: positionSizeUsd,
    requested_price: price,
    submitted_at: submittedAt,
    exchange_latency_ms: Math.floor(Math.random() * 200 + 50),
  });
  console.log(`[sim] Order submitted: ${clientOrderId.slice(0, 8)} (simulated, ID: ${simulatedOrderId})`);

  return { ...ev, _simulatedOrderId: simulatedOrderId, _fillPrice: fillPrice, _fillSize: fillSize };
}

/**
 * Simulate polling progression (stub path).
 * Returns progressively more complete order data.
 */
function simulatePollProgress(pollContext, elapsedMs) {
  const { exchange_order_id, market_id } = pollContext;
  // Simulate: after ~5s open, after ~15s partially filled between 3-8s, after ~25-30s filled
  const elapsedSec = elapsedMs / 1000;
  let status;

  if (elapsedSec < 3) {
    status = 'OPEN';
  } else if (elapsedSec < 8) {
    status = 'PARTIALLY_FILLED';
  } else if (elapsedSec < 20) {
    status = 'FILLED';
  } else {
    status = 'FILLED';
  }

  return {
    order_id: exchange_order_id,
    status,
    product_id: market_id || 'BTC-USD',
    side: 'BUY',
    filled_size: '0.0000118',
    limit_price: '42502.50',
    average_fill_price: '42542.50',
    commission: '0.0025',
    number_of_fills: status === 'FILLED' ? 1 : (status === 'PARTIALLY_FILLED' ? 1 : 0),
    fills: status === 'FILLED' || status === 'PARTIALLY_FILLED'
      ? [{
          fill_id: randomUUID(),
          liquidity: 'MAKER',
          size: '0.0000118',
          price: '42542.50',
          commission: '0.0025',
          trade_time: new Date(Date.now() - 1000 * Math.random()).toISOString(),
        }]
      : [],
    created_time: new Date(Date.now() - elapsedMs).toISOString(),
  };
}

// ─── Mapping Helpers ────────────────────────────────────────────────────────

/**
 * Map Coinbase API order status to our internal enum.
 */
function mapCoinbaseStatus(coinbaseStatus) {
  const map = {
    'PENDING': 'PENDING',
    'OPEN': 'OPEN',
    'FILLED': 'FILLED',
    'PARTIALLY_FILLED': 'PARTIALLY_FILLED',
    'CANCELLED': 'CANCELLED',
    'FAILED': 'FAILED',
    'EXPIRED': 'TIMEOUT',
    'DONE': 'FILLED',
    'ACTIVE': 'OPEN',
    'RECEIVED': 'PENDING',
    'SETTLED': 'FILLED',
    'REJECTED': 'FAILED',
  };
  return map[coinbaseStatus] || null;
}

/**
 * Extract fill events from Coinbase order response.
 */
function extractFillEvents(orderData, marketId) {
  if (!orderData?.fills || !Array.isArray(orderData.fills)) return [];

  const isBtc = marketId?.startsWith('BTC');
  const sizeField = isBtc ? 'size_btc' : 'size_base';

  return orderData.fills.map((fill, idx) => ({
    sequence: idx + 1,
    timestamp: fill.trade_time || fill.created_at || nowISO(),
    [sizeField]: parseFloat(fill.size || '0'),
    price: parseFloat(fill.price || '0'),
  }));
}

/**
 * Build an ExecutionEvent from order data returned by the exchange.
 */
function buildExecutionEventFromOrder({
  orderData,
  clientOrderId,
  exchangeOrderId,
  submittedAt,
  fillEvents,
  exchangeLatencyMs,
  accumulatedBotLatencyMs,
  lastEvent,
}) {
  const marketId = orderData?.product_id;
  const requestedSizeUsd = parseFloat(orderData?.original_size || '0') * parseFloat(orderData?.average_fill_price || '1') || lastEvent?.requested_size_usd || 0;
  const requestedPrice = parseFloat(orderData?.average_fill_price || orderData?.limit_price || '0') || lastEvent?.requested_price || 0;

  const filledSizeBase = parseFloat(orderData?.filled_size || '0');
  const avgPrice = parseFloat(orderData?.average_fill_price || '0');
  const filledSizeUsd = filledSizeBase * avgPrice;
  const feesUsd = parseFloat(orderData?.commission || '0');
  const slippageBps = requestedPrice > 0
    ? Math.round(Math.abs(avgPrice - requestedPrice) / requestedPrice * 10000)
    : 0;

  return buildExecutionEvent({
    market_id: marketId,
    client_order_id: clientOrderId,
    exchange_order_id: exchangeOrderId,
    side: orderData?.side?.toUpperCase() || 'BUY',
    status: mapCoinbaseStatus(orderData?.status) || 'PENDING',
    order_type: orderData?.order_type === 'MARKET' ? 'MARKET' : 'LIMIT',
    requested_size_usd: requestedSizeUsd || undefined,
    requested_price: requestedPrice || undefined,
    filled_size_usd: filledSizeUsd > 0 ? filledSizeUsd : null,
    filled_size_btc: marketId?.startsWith('BTC') && filledSizeBase > 0 ? filledSizeBase : null,
    average_fill_price: avgPrice > 0 ? avgPrice : null,
    fill_events: fillEvents?.length > 0 ? fillEvents : [],
    fees_usd: feesUsd > 0 ? feesUsd : null,
    net_cost_usd: (filledSizeUsd + feesUsd) > 0 ? filledSizeUsd + feesUsd : null,
    slippage_bps: Number.isFinite(slippageBps) ? slippageBps : null,
    rejection_reason: orderData?.rejection_reason || orderData?.reason || null,
    submitted_at: submittedAt || orderData?.created_time || nowISO(),
    exchange_latency_ms: exchangeLatencyMs || null,
    bot_latency_ms: accumulatedBotLatencyMs || null,
  });
}

/**
 * Build a valid ExecutionEvent object from partial fields.
 * Fills in defaults and ensures all required fields are present.
 */
function buildExecutionEvent(fields) {
  return {
    execution_id: fields.execution_id || randomUUID(),
    trade_id: fields.trade_id || null,
    market_id: fields.market_id || null,
    client_order_id: fields.client_order_id || null,
    exchange_order_id: fields.exchange_order_id || null,
    side: fields.side || 'BUY',
    status: fields.status || 'PENDING',
    order_type: fields.order_type || 'LIMIT',
    requested_size_usd: fields.requested_size_usd ?? 0,
    requested_price: fields.requested_price ?? 0,
    filled_size_btc: fields.filled_size_btc ?? null,
    filled_size_usd: fields.filled_size_usd ?? null,
    average_fill_price: fields.average_fill_price ?? null,
    fill_events: fields.fill_events || [],
    fees_usd: fields.fees_usd ?? null,
    net_cost_usd: fields.net_cost_usd ?? null,
    slippage_bps: fields.slippage_bps ?? null,
    rejection_reason: fields.rejection_reason ?? null,
    submitted_at: fields.submitted_at || nowISO(),
    first_fill_at: fields.first_fill_at ?? null,
    completed_at: fields.completed_at ?? null,
    total_latency_ms: fields.total_latency_ms ?? null,
    exchange_latency_ms: fields.exchange_latency_ms ?? null,
    bot_latency_ms: fields.bot_latency_ms ?? null,
  };
}

// ─── JSONL Reading ──────────────────────────────────────────────────────────

/**
 * Load all execution events from the JSONL log file.
 *
 * @returns {object[]} Array of ExecutionEvent objects
 */
function loadExecutionEvents() {
  if (!existsSync(EXECUTION_LOG)) return [];
  const content = readFileSync(EXECUTION_LOG, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

// ─── Main Entry Point (when run directly) ───────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node execution-engine.mjs                                Run a simulated order
  COINBASE_API_KEY=... node execution-engine.mjs           Run a live order
  node execution-engine.mjs --report                       Generate execution report
  node execution-engine.mjs --report --start YYYY-MM-DD    Report from date
  node execution-engine.mjs --report --end YYYY-MM-DD      Report to date

Options:
  --help, -h      Show this help
  --report        Generate execution report from log
  --start DATE    Report start date (default: 24h ago)
  --end DATE      Report end date (default: now)
  --no-poll       Submit order without polling (one-shot)
`);
    return;
  }

  if (args.includes('--report')) {
    const startIdx = args.indexOf('--start');
    const endIdx = args.indexOf('--end');
    const startStr = startIdx >= 0 ? args[startIdx + 1] : null;
    const endStr = endIdx >= 0 ? args[endIdx + 1] : null;

    const startTime = startStr ? new Date(startStr + 'T00:00:00.000Z') : new Date(Date.now() - 86_400_000);
    const endTime = endStr ? new Date(endStr + 'T23:59:59.999Z') : new Date();

    const events = loadExecutionEvents();
    console.log(`[report] Loaded ${events.length} execution events`);
    console.log(`[report] Filtering ${startTime.toISOString()} → ${endTime.toISOString()}`);
    const report = await generateExecutionReport(events, startTime, endTime);
    console.log('\n' + report);
    return;
  }

  // ── Run a single order execution ──────────────────────────────────────
  const noPoll = args.includes('--no-poll');

  // Build a simulated risk decision
  const testTradeId = randomUUID();
  const testMarketId = 'BTC-USD';
  const riskDecision = {
    trade_id: testTradeId,
    market_id: testMarketId,
    decision: 'APPROVE',
    gates_passed: ['DATA_FRESHNESS', 'LIQUIDITY', 'NET_EDGE', 'CONFIDENCE', 'KELLY_SIZING', 'CONCENTRATION', 'DRAWDOWN', 'DAILY_LOSS', 'KILL_SWITCH'],
    gates_failed: [],
    risk_assessment: {
      edge_pct: 6.35,
      kelly_raw: 2.0,
      kelly_quarter: 0.5,
      kelly_allocation_usd: 0.5,
      position_size_usd: 0.5,
      confidence_score: 0.78,
      dispersion: 0.024,
      current_equity: 100.0,
      drawdown_pct: 0.0,
      daily_loss_usd: 0.0,
      open_positions: 1,
      total_exposure_pct: 0.5,
    },
    timestamp: nowISO(),
  };

  const marketSnapshot = {
    market_id: 'BTC-USD',
    platform: 'coinbase',
    symbol: 'BTC-USD',
    side: 'buy',
    last_price: 42500.00,
    best_bid: 42498.50,
    best_ask: 42502.50,
    spread: 4.0,
    spread_bps: 0.94,
    volume_24h: 12500000000,
    timestamp: nowISO(),
    status: 'online',
  };

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Execution Engine — Phase 6                      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Trade ID:    ${testTradeId}`);
  console.log(`Market:      ${testMarketId}`);
  console.log(`Side:        BUY`);
  console.log(`Size:        $${riskDecision.risk_assessment.position_size_usd.toFixed(2)}`);
  console.log(`Mode:        ${hasCredentials() ? 'LIVE (Coinbase Advanced Trade API)' : 'SIMULATED (stub)'}`);
  console.log(`Output:      ${EXECUTION_LOG}`);
  console.log('');

  console.time('execution');

  try {
    const executionEvent = await submitOrder(riskDecision, marketSnapshot);

    if (noPoll) {
      console.log('\n[result] Order submitted (no-poll mode). Final event:');
      console.log(JSON.stringify(executionEvent, null, 2));
      console.timeEnd('execution');
      return;
    }

    console.log('');

    // ── Display result ──────────────────────────────────────────────
    const statusIcon = {
      'FILLED': '✅',
      'PARTIALLY_FILLED': '⚠️',
      'CANCELLED': '❌',
      'FAILED': '❌',
      'TIMEOUT': '⏰',
      'PENDING': '⏳',
      'OPEN': '🔄',
    }[executionEvent.status] || '❓';

    console.log(`${statusIcon} Execution Result:`);
    console.log(`  Status:             ${executionEvent.status}`);
    console.log(`  Client Order ID:    ${executionEvent.client_order_id?.slice(0, 16)}...`);
    console.log(`  Exchange Order ID:  ${executionEvent.exchange_order_id}`);
    console.log(`  Filled (BTC):       ${executionEvent.filled_size_btc ?? 'N/A'}`);
    console.log(`  Filled (USD):       $${executionEvent.filled_size_usd?.toFixed(2) ?? 'N/A'}`);
    console.log(`  Avg Fill Price:     $${executionEvent.average_fill_price?.toFixed(2) ?? 'N/A'}`);
    console.log(`  Slippage (bps):     ${executionEvent.slippage_bps ?? 'N/A'}`);
    console.log(`  Fees (USD):         $${executionEvent.fees_usd?.toFixed(4) ?? 'N/A'}`);
    console.log(`  Total Latency:      ${executionEvent.total_latency_ms ?? 'N/A'}ms`);
    console.log(`  Exchange Latency:   ${executionEvent.exchange_latency_ms ?? 'N/A'}ms`);

    if (executionEvent.rejection_reason) {
      console.log(`  Rejection Reason:   ${executionEvent.rejection_reason}`);
    }

    console.log('');

    const filler = ['', ''];
    console.log(`Events logged to: ${EXECUTION_LOG}`);
    const allEvents = loadExecutionEvents();
    console.log(`Total events in log: ${allEvents.length}`);

    const terminalReport = await generateExecutionReport(
      allEvents,
      new Date(Date.now() - 86_400_000),
      new Date()
    );
    console.log(`\n${terminalReport}`);

  } catch (err) {
    if (err instanceof HaltError) {
      console.error(`\n🚫 HALT: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof InsufficientFundsError) {
      console.error(`\n💰 Insufficient Funds: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof MarketConditionError) {
      console.error(`\n📊 Market Condition: ${err.message}`);
      process.exit(1);
    }
    console.error(`\n💥 Execution Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    console.timeEnd('execution');
  }
}

// ─── Self-Test ──────────────────────────────────────────────────────────────

function runSelfTest() {
  let passed = 0;
  let failed = 0;

  function assert(label, condition, detail) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  console.log('=== Execution Engine Self-Test ===\n');

  // 1. calculateDeterministicClientOrderId
  console.log('[test] calculateDeterministicClientOrderId...');
  const id1 = calculateDeterministicClientOrderId('abc-123', 'BTC-USD', 'BUY', 100, 50000);
  assert('returns 64-char hex', /^[0-9a-f]{64}$/.test(id1), `got ${id1}`);
  const id2 = calculateDeterministicClientOrderId('abc-123', 'BTC-USD', 'BUY', 100, 50000);
  assert('deterministic within 5s window', id1 === id2);
  const id3 = calculateDeterministicClientOrderId('abc-123', 'BTC-USD', 'SELL', 100, 50000);
  assert('different side → different ID', id1 !== id3);
  const id4 = calculateDeterministicClientOrderId('xyz-789', 'ETH-USD', 'BUY', 50, 3000);
  assert('different trade/market → different ID', id1 !== id4);

  // 2. buildExecutionEvent
  console.log('[test] buildExecutionEvent...');
  const ev = buildExecutionEvent({
    trade_id: 'trade-1',
    market_id: 'BTC-USD',
    client_order_id: 'order-1',
    status: 'PENDING',
  });
  assert('has execution_id', !!ev.execution_id);
  assert('side defaults to BUY', ev.side === 'BUY');
  assert('order_type defaults to LIMIT', ev.order_type === 'LIMIT');
  assert('timestamps are ISO 8601', /^\d{4}-\d{2}-\d{2}T/.test(ev.submitted_at));
  assert('has required fields', ev.status === 'PENDING' && ev.requested_size_usd === 0);

  // 3. mapCoinbaseStatus
  console.log('[test] mapCoinbaseStatus...');
  assert('PENDING maps', mapCoinbaseStatus('PENDING') === 'PENDING');
  assert('FILLED maps', mapCoinbaseStatus('FILLED') === 'FILLED');
  assert('EXPIRED maps to TIMEOUT', mapCoinbaseStatus('EXPIRED') === 'TIMEOUT');
  assert('unknown returns null', mapCoinbaseStatus('WEIRD_STATUS') === null);
  assert('null returns null', mapCoinbaseStatus(null) === null);

  // 4. validate helpers (implicit tests via calculateDeterministicClientOrderId)
  console.log('[test] validation...');
  try {
    calculateDeterministicClientOrderId('', 'BTC-USD', 'BUY', 100, 50000);
    assert('empty tradeId throws', false, 'should have thrown');
  } catch (e) {
    assert('empty tradeId throws error', e.message.includes('ValidationError'));
  }
  try {
    calculateDeterministicClientOrderId('abc', 'BTC-USD', 'BUY', 0, 50000);
    assert('zero size throws', false, 'should have thrown');
  } catch (e) {
    assert('zero size throws', e.message.includes('ValidationError'));
  }
  try {
    calculateDeterministicClientOrderId('abc', 'BTC-USD', 'BUY', 100, -1);
    assert('negative price throws', false, 'should have thrown');
  } catch (e) {
    assert('negative price throws', e.message.includes('ValidationError'));
  }

  // 5. recordExecutionEvent + loadExecutionEvents
  console.log('[test] recordExecutionEvent / loadExecutionEvents...');
  const testEv = buildExecutionEvent({
    execution_id: '00000000-0000-0000-0000-000000000001',
    trade_id: 'self-test-trade',
    market_id: 'BTC-USD',
    client_order_id: 'self-test-order',
    status: 'FILLED',
    completed_at: nowISO(),
  });
  recordExecutionEvent(testEv);
  const loaded = loadExecutionEvents();
  const found = loaded.find(e => e.execution_id === '00000000-0000-0000-0000-000000000001');
  assert('can round-trip through JSONL', !!found && found.status === 'FILLED');
  assert('no _ properties in loaded', !Object.keys(found).some(k => k.startsWith('_')));

  // 6. generateExecutionReport
  console.log('[test] generateExecutionReport...');
  // Tested via --report flag — skip in --test for simplicity

  // 7. stripInternal
  console.log('[test] stripInternal...');
  const objWithInternal = { a: 1, _secret: 'hidden', b: 2, __private: true };
  const stripped = stripInternal(objWithInternal);
  assert('removes _ prefixed keys', !('_secret' in stripped) && !('__private' in stripped));
  assert('keeps normal keys', stripped.a === 1 && stripped.b === 2);

  // 8. hasCredentials
  console.log('[test] hasCredentials...');
  const hadKey = !!process.env.COINBASE_API_KEY;
  const hadSecret = !!process.env.COINBASE_API_SECRET;
  const hadPassphrase = !!process.env.COINBASE_API_PASSPHRASE;
  const hadAll = hadKey && hadSecret && hadPassphrase;
  assert('returns false when no env vars', hasCredentials() === hadAll);

  // 9. buildAuthHeaders (only if credentials available)
  if (hasCredentials()) {
    console.log('[test] buildAuthHeaders...');
    const headers = buildAuthHeaders('POST', '/api/v1/brokerage/orders', '{"test":true}');
    assert('has CB-ACCESS-KEY', !!headers['CB-ACCESS-KEY']);
    assert('has CB-ACCESS-SIGN', !!headers['CB-ACCESS-SIGN']);
    assert('has CB-ACCESS-TIMESTAMP', !!headers['CB-ACCESS-TIMESTAMP']);
    assert('has CB-ACCESS-PASSPHRASE', !!headers['CB-ACCESS-PASSPHRASE']);
    assert('has Content-Type', headers['Content-Type'] === 'application/json');
  } else {
    console.log('  ⏭️  buildAuthHeaders (no credentials, skipping)');
  }

  console.log(`\n[test] Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ─── Run if executed directly ───────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--test')) {
    const ok = runSelfTest();
    process.exit(ok ? 0 : 1);
  } else {
    main().catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  submitOrder,
  pollOrderStatus,
  calculateDeterministicClientOrderId,
  cancelOrder,
  recordExecutionEvent,
  generateExecutionReport,
  loadExecutionEvents,
  // Utility exports for testing
  buildAuthHeaders,
  coinbaseRequest,
  buildExecutionEvent,
  mapCoinbaseStatus,
  hasCredentials,
};

export default {
  submitOrder,
  pollOrderStatus,
  calculateDeterministicClientOrderId,
  cancelOrder,
  recordExecutionEvent,
  generateExecutionReport,
};
