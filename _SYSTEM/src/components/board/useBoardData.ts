/**
 * useBoardData.ts — board-specific fetch/poll hook.
 * Manages: candles (per active market+tf), orderbook (per active market, ~1.5s),
 * timeframes (once), calibration+graduation (15s, graceful 404).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api,
  type OHLCVBar,
  type OrderBookData,
  type TimeframeEntry,
  type CalibrationResponse,
  type GraduationResponse,
  type PaperResponse,
  type AccountResponse,
  type TradesResponse,
  type TrainerResponse,
} from './api';

// ── Indicator math (ported from mockup) ────────────────────────────────────

export function calcEma(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function calcBollinger(
  closes: number[],
  period = 20,
  mult = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - sma) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(sma + mult * sd);
    middle.push(sma);
    lower.push(sma - mult * sd);
  }
  return { upper, middle, lower };
}

export function calcRsi(closes: number[], period = 14): number[] {
  const result: number[] = [50];
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= period) {
      gains += g; losses += l;
      if (i === period) {
        gains /= period; losses /= period;
        result.push(100 - 100 / (1 + gains / (losses || 0.0001)));
      } else { result.push(50); }
    } else {
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      result.push(100 - 100 / (1 + gains / (losses || 0.0001)));
    }
  }
  return result;
}

export function calcMacd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const ef = calcEma(closes, fast);
  const es = calcEma(closes, slow);
  const macdLine = closes.map((_, i) => ef[i] - es[i]);
  const signalLine = calcEma(macdLine, signal);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export interface ComputedIndicators {
  ema12: number[];
  bb: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
  rsi: number[];
  macd: { macdLine: number[]; signalLine: number[]; histogram: number[] };
}

export function computeIndicators(candles: OHLCVBar[]): ComputedIndicators {
  const closes = candles.map(c => c.close);
  return {
    ema12: calcEma(closes, 12),
    bb: calcBollinger(closes, 20, 2),
    rsi: calcRsi(closes, 14),
    macd: calcMacd(closes, 12, 26, 9),
  };
}

// ── State shape ───────────────────────────────────────────────────────────────

export interface BoardDataState {
  candles: OHLCVBar[];
  indicators: ComputedIndicators | null;
  candlesLoading: boolean;
  orderbook: OrderBookData | null;
  orderbookLoading: boolean;
  timeframes: TimeframeEntry[];
  calibration: CalibrationResponse | null;
  graduation: GraduationResponse | null;
  paper: PaperResponse;
  account: AccountResponse | null;
  trades: TradesResponse;
  trainer: TrainerResponse | null;
}

const EMPTY_INDICATORS: ComputedIndicators = {
  ema12: [],
  bb: { upper: [], middle: [], lower: [] },
  rsi: [],
  macd: { macdLine: [], signalLine: [], histogram: [] },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBoardData(market: string, tf: string): BoardDataState {
  const [candles, setCandles] = useState<OHLCVBar[]>([]);
  const [indicators, setIndicators] = useState<ComputedIndicators | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [orderbook, setOrderbook] = useState<OrderBookData | null>(null);
  const [orderbookLoading, setOrderbookLoading] = useState(true);
  const [timeframes, setTimeframes] = useState<TimeframeEntry[]>([]);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [graduation, setGraduation] = useState<GraduationResponse | null>(null);
  const [paper, setPaper] = useState<PaperResponse>({});
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [trades, setTrades] = useState<TradesResponse>({ trades: [], total: 0 });
  const [trainer, setTrainer] = useState<TrainerResponse | null>(null);

  // Paper P&L + real account + live trade tape — authoritative REST, ~3s poll.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const [pp, ac, tr] = await Promise.all([api.paper(), api.account(), api.trades(40)]);
      if (!cancelled) { setPaper(pp); setAccount(ac); setTrades(tr); }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Fetch timeframes once
  useEffect(() => {
    api.timeframes().then(tfs => setTimeframes(tfs));
  }, []);

  // Calibration + graduation — 15s poll, graceful 404 (api returns null on 404)
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const [cal, grad] = await Promise.all([api.calibration(), api.graduation()]);
      if (!cancelled) {
        setCalibration(cal);
        setGraduation(grad);
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Trainer scorecard — 30s poll (snapshot data; no need for faster cadence)
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const res = await api.trainer();
      if (!cancelled) setTrainer(res);
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Candles — re-fetch when market or tf changes
  const fetchCandles = useCallback(async () => {
    setCandlesLoading(true);
    const res = await api.candles(market, tf);
    if (res?.candles && res.candles.length > 0) {
      const c = res.candles;
      setCandles(c);
      setIndicators(computeIndicators(c));
    } else {
      setCandles([]);
      setIndicators(EMPTY_INDICATORS);
    }
    setCandlesLoading(false);
  }, [market, tf]);

  useEffect(() => {
    fetchCandles();
    // Re-poll candles every 10s (candles update each bar interval)
    const id = setInterval(fetchCandles, 10000);
    return () => clearInterval(id);
  }, [fetchCandles]);

  // Orderbook — poll ~1.5s for active market
  const obRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      setOrderbookLoading(true);
      const res = await api.orderbook(market);
      if (!cancelled) {
        setOrderbook(res?.book ?? null);
        setOrderbookLoading(false);
      }
    };
    poll();
    obRef.current = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      if (obRef.current) clearInterval(obRef.current);
    };
  }, [market]);

  return {
    candles,
    indicators,
    candlesLoading,
    orderbook,
    orderbookLoading,
    timeframes,
    calibration,
    graduation,
    paper,
    account,
    trades,
    trainer,
  };
}
