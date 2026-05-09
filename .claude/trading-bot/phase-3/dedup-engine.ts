/**
 * Phase 3 — Deduplication Engine
 *
 * Purpose: Detect duplicate evidence packets via content hashing.
 * Two packets with identical headline + source + calendar day produce
 * the same SHA-256 hash and are flagged as duplicates.
 *
 * Deterministic: same inputs → same hash, same dedup decisions.
 */

import { createHash } from "node:crypto";
import {
  EvidencePacket,
  DedupResult,
  SourceSignal,
  DEDUP_WINDOW_MS,
} from "./types";

// ---------------------------------------------------------------------------
// In-memory cache (production would use a DB with TTL)
// ---------------------------------------------------------------------------

const hashRegistry = new Map<string, number>(); // hash → first-seen epoch ms
let registryCleanupLast = 0;
const CLEANUP_INTERVAL_MS = 300_000; // every 5 min

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

/**
 * Normalise a headline for hashing: lowercase, collapse whitespace,
 * strip excessive punctuation that bots often vary.
 */
export function normaliseHeadline(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Produce a deterministic content hash from a SourceSignal.
 *
 * Hash inputs:
 *   normalised_headline + "|" + source + "|" + ISO-date-prefix
 *
 * Using ISO-date-prefix (not full timestamp) ensures two publishing
 * systems showing the same article on the same day merge.
 */
export function signalContentHash(signal: SourceSignal): string {
  const day = signal.timestamp.slice(0, 10); // YYYY-MM-DD
  const normalised = normaliseHeadline(signal.headline);
  const payload = `${normalised}|${signal.source}|${day}`;
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function pruneRegistry(now: number): void {
  if (now - registryCleanupLast < CLEANUP_INTERVAL_MS) return;
  for (const [hash, ts] of hashRegistry) {
    if (now - ts > DEDUP_WINDOW_MS) hashRegistry.delete(hash);
  }
  registryCleanupLast = now;
}

/**
 * Check-and-register: returns true if the hash was already seen inside
 * the dedup window (i.e. it IS a duplicate).
 *
 * If it is new, register it and return false.
 */
export function isDuplicate(hash: string, now: number = Date.now()): DedupResult {
  pruneRegistry(now);

  const firstSeen = hashRegistry.get(hash);
  if (firstSeen !== undefined && now - firstSeen <= DEDUP_WINDOW_MS) {
    return {
      is_duplicate: true,
      duplicate_hash: hash,
      first_seen: new Date(firstSeen).toISOString(),
      age_seconds: Math.round((now - firstSeen) / 1000),
    };
  }

  hashRegistry.set(hash, now);
  return {
    is_duplicate: false,
    duplicate_hash: null,
    first_seen: null,
    age_seconds: null,
  };
}

// ---------------------------------------------------------------------------
// Packet-level dedup
// ---------------------------------------------------------------------------

/**
 * Build a compound hash covering every signal in the packet.
 * Two packets with the same market_id, same calendar day, and identical
 * signal-set (order-independent) produce the same compound hash.
 */
export function packetCompoundHash(packet: Omit<EvidencePacket, "evidence_id" | "is_duplicate" | "dedup">): string {
  const day = packet.timestamp.slice(0, 10);
  const signalHashes = packet.sources
    .map((s) => signalContentHash(s))
    .sort(); // order-independent
  const payload = `${packet.market_id}|${day}|${signalHashes.join(",")}`;
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function dedupStats(): { registry_size: number; oldest_entry_age_ms: number | null } {
  const now = Date.now();
  let oldest = Infinity;
  for (const [, ts] of hashRegistry) {
    if (ts < oldest) oldest = ts;
  }
  return {
    registry_size: hashRegistry.size,
    oldest_entry_age_ms: oldest === Infinity ? null : now - oldest,
  };
}

/**
 * Reset for testing / replay.
 */
export function resetDedupRegistry(): void {
  hashRegistry.clear();
  registryCleanupLast = 0;
}
