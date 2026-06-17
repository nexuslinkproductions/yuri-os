/**
 * api.ts — typed API client for the Brain Board.
 * All routes point to VITE_OBSERVATORY_BASE (http://127.0.0.1:4243) direct — no proxy.
 */

const HOST = (import.meta.env.VITE_OBSERVATORY_BASE as string | undefined) ?? '';
export const BASE = `${HOST}/api/observatory`;

// ── Shared types ─────────────────────────────────────────────────────────────

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  factorId: string;
  value: number;
  side: 'long' | 'short' | 'neutral';
  confidence: number;
  ts: number;
  source?: 'perp' | 'social';
  sampleCount?: number;
}

export interface PnlObject {
  equity: number;
  initialEquity: number;
  grossRealizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  totalFunding: number;
  totalReturnBps: number;
  maxDrawdownBps: number;
  circuitBreaker: string;
  openPositions: number;
  completedTrades: number;
  noTrades: number;
}

export interface PaperPosition {
  instrument: string;
  side: 'long' | 'short';
  quantity: number;
  avgEntryPrice: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  fundingPaid?: number;
  factorId?: string;
  openedTs?: number;
  entryCount?: number;
}

export interface MarketData {
  market: string;
  venue: string;
  updatedAt?: number;
  lastPrice?: number;
  lastTickTs?: number;
  bars?: OHLCVBar[];
  signals?: Signal[];
  paperPositions?: PaperPosition[];
  pnl?: PnlObject;
  drawdown?: number;
  regime?: {
    regimeShift?: boolean;
    layers?: Record<string, unknown>;
    reasons?: string[];
    recommendation?: string;
  };
  energyDeltaU?: { deltaU: number; accept: boolean; reason: string };
  qualityGate?: { pass: boolean; rejectCount?: number };
  circuit?: unknown;
  error?: string | null;
  question?: string; // polymarket
}

export interface MarketsResponse {
  [market: string]: MarketData;
}

// /paper per-market shape
export interface PaperMarketData {
  positions: PaperPosition[];
  pnl: PnlObject;
  drawdown: number;
}

export interface PaperResponse {
  [market: string]: PaperMarketData;
}

// /orderbook
export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookData {
  venue: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  mid: number;
  spreadBps: number;
}

export interface OrderBookResponse {
  market: string;
  book: OrderBookData;
  cachedMs: number;
}

// /candles
export interface CandlesResponse {
  market: string;
  tf: string;
  sec?: number;
  supported: boolean;
  candles: OHLCVBar[];
}

// /timeframes
export interface TimeframeEntry {
  id: string;
  label: string;
  sec: number;
  supported: boolean;
  reason?: string;
}

// /energy
export interface EnergyResponse {
  deltaU: number;
  accept: boolean;
  reason: string;
}

// /health
export interface HealthResponse {
  ok: boolean;
  cycleCount: number;
  lastCycle: number;
  lastTick?: number;
  marketCount: number;
  errorCount: number;
  uptime: number;
}

// /calibration — per-factor reliability scorecard (real shape from orchestrator.getCalibration)
export interface CalibrationFactor {
  factorId: string;
  n: number | null;
  sharpe: number | null;
  dsr: number | null;
  brier: number | null;
  meanReturn: number | null;
  promote: boolean | null;
  reasons?: string[];
}
export interface CalibrationResponse {
  evaluated: number;
  factors: CalibrationFactor[];
  advisory?: string;
}

// /graduation — R0→R3 reliability verdict (real shape from orchestrator.getGraduation)
export interface GradeGate {
  gate: string;
  need: string;
  have: string;
}
export interface FactorGrade {
  factorId: string;
  rung: 'R0' | 'R1' | 'R2' | 'R3';
  met?: string[];
  unmet?: GradeGate[];
}
export interface GraduationPortfolio {
  rung: 'R0' | 'R1' | 'R2' | 'R3';
  byRung?: Record<string, number>;
  factorCount?: number;
  blockers?: Array<{ factorId: string; nextRung?: string; unmet?: GradeGate[] }>;
}
export interface GraduationResponse {
  portfolio: GraduationPortfolio;
  factors?: FactorGrade[];
  generatedAt?: number | null;
  advisory?: string;
}

// /quantum — DISARMED A/B shadow verdict (orchestrator.getQuantum)
export interface QuantumVerdict {
  n: number;
  classicalHitRate: number | null;
  quantumHitRate: number | null;
  classicalMeanRet: number | null;
  quantumMeanRet: number | null;
  quantumLift: number | null;
  disagree?: { n: number; classicalHitRate: number | null; quantumHitRate: number | null };
}
export interface QuantumResponse {
  verdict: QuantumVerdict | null;
  advisory?: string;
  note?: string;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const api = {
  markets: () => safeFetch<MarketsResponse>(`${BASE}/markets`, {}),
  paper: () => safeFetch<PaperResponse>(`${BASE}/paper`, {}),
  energy: () => safeFetch<EnergyResponse | null>(`${BASE}/energy`, null),
  health: () => safeFetch<HealthResponse | null>(`${BASE}/health`, null),
  timeframes: () => safeFetch<TimeframeEntry[]>(`${BASE}/timeframes`, []),

  candles: (market: string, tf: string) =>
    safeFetch<CandlesResponse | null>(
      `${BASE}/candles?market=${encodeURIComponent(market)}&tf=${encodeURIComponent(tf)}`,
      null,
    ),

  orderbook: (market: string) =>
    safeFetch<OrderBookResponse | null>(
      `${BASE}/orderbook?market=${encodeURIComponent(market)}`,
      null,
    ),

  calibration: () =>
    safeFetch<CalibrationResponse | null>(`${BASE}/calibration`, null),

  graduation: () =>
    safeFetch<GraduationResponse | null>(`${BASE}/graduation`, null),

  quantum: () =>
    safeFetch<QuantumResponse | null>(`${BASE}/quantum`, null),
};
