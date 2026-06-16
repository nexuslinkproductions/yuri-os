/**
 * useObservatoryStream.ts
 *
 * SSE + REST snapshot hook for the YURI Observatory dashboard.
 *
 * Protocol (from observatory-server.mjs):
 *   - REST GET /api/observatory/{markets,factors,paper,regime,energy,health} for initial snapshot
 *   - SSE GET /api/observatory/stream — event type lives in the JSON payload (e.data → JSON.parse → .type)
 *     NOT in the SSE `event:` field. Use source.onmessage, never addEventListener per-type.
 *
 * SSE event types in payload:
 *   market.tick   { type, market, venue, updatedAt, lastBar, qualityGate, error, ts }
 *   factor.signal { type, factorId, value, side, confidence, ts, market? }
 *   paper.fill    { type, market, positions, pnl, drawdown, ts }
 *   regime.shift  { type, market, recommendation, reasons, layers, ts }
 *   energy.state  { type, deltaU, accept, reason, ts }
 *   cycle.start   { type, cycleCount, ts }
 *   cycle.end     { type, cycleCount, ts }
 *   connected     { type, ...health }
 */

import { useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OHLCVBar {
  timestamp: number; // unix seconds — matches lightweight-charts UTCTimestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QualityGate {
  pass: boolean;
  reason?: string;
}

/** Raw position shape emitted by the server (afl-paper.mjs positions()). */
export interface RawServerPosition {
  instrument: string;
  side: 'long' | 'short';
  quantity: number;
  avgEntryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
}

export interface MarketSnapshot {
  market: string;
  venue: string;
  updatedAt?: number;
  lastBar?: OHLCVBar;
  bars?: OHLCVBar[];
  qualityGate?: QualityGate;
  /** positions from /markets REST snapshot — raw server shape, normalised in hook */
  paperPositions?: RawServerPosition[];
  pnl?: number;
  drawdown?: number;
  regime?: Record<string, string>;
  energyDeltaU?: number;
  signals?: FactorSignal[];
  error?: string;
}

export interface FactorSignal {
  factorId: string;
  value: number;
  side: 'long' | 'short' | 'neutral';
  confidence: number;
  ts: number;
  market?: string;
  deltaU?: number;
}

export interface PaperPosition {
  market: string;
  qty: number;
  entryPrice: number;
  currentPrice?: number;
  unrealisedPnl?: number;
  side: 'long' | 'short';
}

export interface PaperState {
  positions?: Record<string, PaperPosition>;
  pnl?: number;
  drawdown?: number;
  noTrades?: string[];
  ts?: number;
  fills?: PaperFill[];
}

export interface PaperFill {
  market: string;
  positions?: Record<string, PaperPosition>;
  pnl?: number;
  drawdown?: number;
  ts: number;
}

export interface RegimeState {
  market?: string;
  recommendation?: string;
  reasons?: string[];
  layers?: Record<string, string>;
  ts?: number;
}

export interface EnergyState {
  deltaU?: number;
  accept?: boolean;
  reason?: string;
  ts?: number;
}

export interface HealthState {
  status?: string;
  cycleCount?: number;
  uptime?: number;
  ts?: number;
}

export interface ObservatoryState {
  markets: Record<string, MarketSnapshot>;
  factors: FactorSignal[];
  paper: PaperState;
  regime: RegimeState;
  energy: EnergyState;
  health: HealthState;
  connected: boolean;
  loading: boolean;
  error: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = '/api/observatory';
const RECONNECT_DELAY_MS = 3000;
const MAX_FACTORS = 50;
const MAX_FILLS = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * normalizePosition — maps server-side afl-paper field names to the frontend's
 * render fields. Applied to positions from both /markets.paperPositions and
 * SSE paper.fill events (BUG-5 fix).
 *
 * Server shape (afl-paper.mjs positions()):
 *   { instrument, side, quantity, avgEntryPrice, currentPrice?, unrealizedPnl? }
 * Frontend render shape (PaperPosition):
 *   { market, side, qty, entryPrice, currentPrice?, unrealisedPnl? }
 */
export function normalizePosition(raw: RawServerPosition): PaperPosition {
  return {
    market: raw.instrument,
    side: raw.side,
    qty: raw.quantity,
    entryPrice: raw.avgEntryPrice,
    currentPrice: raw.currentPrice,
    unrealisedPnl: raw.unrealizedPnl,
  };
}

/**
 * normalizePaperFill — takes a raw SSE paper.fill payload whose `positions`
 * field is an array of RawServerPosition and returns a normalized PaperFill
 * with positions keyed by market and values normalized to PaperPosition.
 */
function normalizePaperFillPositions(
  rawPositions: RawServerPosition[] | undefined,
): Record<string, PaperPosition> | undefined {
  if (!rawPositions || !Array.isArray(rawPositions)) return undefined;
  const out: Record<string, PaperPosition> = {};
  for (const raw of rawPositions) {
    if (raw?.instrument) {
      const norm = normalizePosition(raw);
      out[norm.market] = norm;
    }
  }
  return out;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useObservatoryStream(): ObservatoryState {
  const [state, setState] = useState<ObservatoryState>({
    markets: {},
    factors: [],
    paper: {},
    regime: {},
    energy: {},
    health: {},
    connected: false,
    loading: true,
    error: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Initial REST snapshot ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // /paper and /regime return per-market wrappers: { "<market>": { ... } }
      // Use unknown for the raw fetch so we can do safe narrowing below.
      const [marketsRaw, factors, paperRaw, regimeRaw, energy, health] = await Promise.all([
        safeFetch<Record<string, MarketSnapshot> | MarketSnapshot[]>(`${BASE}/markets`, {}),
        safeFetch<FactorSignal[]>(`${BASE}/factors`, []),
        safeFetch<unknown>(`${BASE}/paper`, {}),
        safeFetch<unknown>(`${BASE}/regime`, {}),
        safeFetch<EnergyState>(`${BASE}/energy`, {}),
        safeFetch<HealthState>(`${BASE}/health`, {}),
      ]);

      if (cancelled) return;

      // /markets — comes back as object keyed by market (canonical server shape)
      // but also handle legacy array case for resilience
      const markets: Record<string, MarketSnapshot> = {};
      if (Array.isArray(marketsRaw)) {
        for (const m of marketsRaw) {
          if (m?.market) markets[m.market] = m;
        }
      } else if (marketsRaw && typeof marketsRaw === 'object') {
        Object.assign(markets, marketsRaw);
      }

      // BUG-2 fix: /paper returns { "<market>": {positions, pnl, drawdown} }
      // Extract aggregate paper state: merge positions from all markets and
      // take the first market's pnl/drawdown (markets are independent engines).
      // The /markets snapshot already carries paperPositions per market, so we
      // use those as the canonical source and build a combined PaperState here
      // for the PaperTable (which shows all markets' positions aggregated).
      const paper: PaperState = (() => {
        const paperMap = (
          paperRaw && typeof paperRaw === 'object' && !Array.isArray(paperRaw)
            ? paperRaw as Record<string, { positions?: RawServerPosition[]; pnl?: number; drawdown?: number }>
            : {}
        );
        const allPositions: Record<string, PaperPosition> = {};
        let totalPnl = 0;
        let maxDrawdown = 0;
        for (const mktData of Object.values(paperMap)) {
          if (Array.isArray(mktData?.positions)) {
            for (const raw of mktData.positions) {
              if (raw?.instrument) {
                const norm = normalizePosition(raw);
                allPositions[norm.market] = norm;
              }
            }
          }
          if (typeof mktData?.pnl === 'number') totalPnl += mktData.pnl;
          if (typeof mktData?.drawdown === 'number' && mktData.drawdown > maxDrawdown) {
            maxDrawdown = mktData.drawdown;
          }
        }
        // Also fold in paperPositions from the /markets snapshot (same source, belt-and-suspenders)
        for (const snap of Object.values(markets)) {
          if (Array.isArray(snap.paperPositions)) {
            for (const raw of snap.paperPositions) {
              if (raw?.instrument && !allPositions[raw.instrument]) {
                allPositions[raw.instrument] = normalizePosition(raw);
              }
            }
          }
        }
        return {
          positions: Object.keys(allPositions).length > 0 ? allPositions : undefined,
          pnl: totalPnl,
          drawdown: maxDrawdown || undefined,
        };
      })();

      // BUG-3 fix: /regime returns { "<market>": {regimeShift, layers, reasons, recommendation} }
      // Pick the first market's regime for the flat RegimeState (MechanismTab shows one regime).
      const regime: RegimeState = (() => {
        if (!regimeRaw || typeof regimeRaw !== 'object' || Array.isArray(regimeRaw)) return {};
        const regimeMap = regimeRaw as Record<string, RegimeState>;
        const entries = Object.entries(regimeMap);
        if (entries.length === 0) return {};
        const [market, r] = entries[0];
        return { ...r, market };
      })();

      setState(prev => ({
        ...prev,
        markets,
        factors: Array.isArray(factors) ? factors : [],
        paper,
        regime,
        energy,
        health,
        loading: false,
      }));
    })();

    return () => { cancelled = true; };
  }, []);

  // ── SSE subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const es = new EventSource(`${BASE}/stream`);
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setState(prev => ({ ...prev, connected: true, error: null }));
      };

      // Type lives in the JSON payload — onmessage, NOT addEventListener per-type
      es.onmessage = (e: MessageEvent) => {
        if (!mountedRef.current) return;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(e.data as string);
        } catch {
          return;
        }

        const type = ev.type as string | undefined;

        setState(prev => {
          switch (type) {
            case 'connected':
              return {
                ...prev,
                connected: true,
                health: { ...prev.health, ...(ev as HealthState) },
              };

            case 'market.tick': {
              const tick = ev as unknown as MarketSnapshot;
              const key = tick.market || 'unknown';
              return {
                ...prev,
                markets: {
                  ...prev.markets,
                  [key]: {
                    ...(prev.markets[key] ?? {}),
                    ...tick,
                    // accumulate bars array from successive ticks
                    bars: (() => {
                      const existing = prev.markets[key]?.bars ?? [];
                      if (!tick.lastBar) return existing;
                      // deduplicate by timestamp
                      const last = existing[existing.length - 1];
                      if (last && last.timestamp === tick.lastBar.timestamp) {
                        return [...existing.slice(0, -1), tick.lastBar];
                      }
                      return [...existing, tick.lastBar];
                    })(),
                  },
                },
              };
            }

            case 'factor.signal': {
              const sig = ev as unknown as FactorSignal;
              const next = [sig, ...prev.factors.filter(f => f.factorId !== sig.factorId)];
              return { ...prev, factors: next.slice(0, MAX_FACTORS) };
            }

            case 'paper.fill': {
              // BUG-5 fix (SSE path): server emits positions as RawServerPosition[]
              // (instrument/quantity/avgEntryPrice/unrealizedPnl); normalize to PaperPosition.
              const fillRaw = ev as unknown as {
                type: string; market?: string;
                positions?: RawServerPosition[]; pnl?: number; drawdown?: number; ts: number;
              };
              const normalizedPositions = normalizePaperFillPositions(fillRaw.positions);
              const fill: PaperFill = {
                market: fillRaw.market ?? 'unknown',
                positions: normalizedPositions,
                pnl: fillRaw.pnl,
                drawdown: fillRaw.drawdown,
                ts: fillRaw.ts,
              };
              // Merge normalized positions into the aggregate paper state
              const mergedPositions: Record<string, PaperPosition> = {
                ...(prev.paper.positions ?? {}),
                ...(normalizedPositions ?? {}),
              };
              return {
                ...prev,
                paper: {
                  ...prev.paper,
                  positions: mergedPositions,
                  pnl: fill.pnl ?? prev.paper.pnl,
                  drawdown: fill.drawdown ?? prev.paper.drawdown,
                  fills: [fill, ...(prev.paper.fills ?? [])].slice(0, MAX_FILLS),
                },
              };
            }

            case 'regime.shift':
              return { ...prev, regime: ev as unknown as RegimeState };

            case 'energy.state':
              return { ...prev, energy: ev as unknown as EnergyState };

            case 'cycle.start':
            case 'cycle.end':
              // heartbeat — update health cycleCount if present
              if (ev.cycleCount != null) {
                return {
                  ...prev,
                  health: { ...prev.health, cycleCount: ev.cycleCount as number },
                };
              }
              return prev;

            default:
              return prev;
          }
        });
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        esRef.current = null;
        setState(prev => ({ ...prev, connected: false }));
        // Reconnect after delay
        reconnectRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, []);

  return state;
}
