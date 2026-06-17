/**
 * OrderBook.tsx — live order book panel (polls /orderbook ~1.5s).
 * Shows asks (reversed, top), mid price+spread, bids, YURI entry overlay,
 * and the energy gate. Falls back gracefully when /orderbook 404s.
 */

import { useState } from 'react';
import type { OrderBookData } from './api';
import type { EnergyResponse } from './api';
import type { Signal } from './api';

interface Props {
  orderbook: OrderBookData | null;
  loading: boolean;
  energy: EnergyResponse | null;
  market: string;
  signal?: Signal;
}

function fmtPrice(p: number, market: string): string {
  // Small-price markets (SUI, WIF, AVAX < 10)
  if (p < 10) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtSize(s: number): string {
  if (s < 0.001) return s.toFixed(6);
  if (s < 1) return s.toFixed(4);
  if (s < 1000) return s.toFixed(3);
  return s.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtTotal(price: number, size: number): string {
  const t = price * size;
  if (t >= 1000) return '$' + (t / 1000).toFixed(1) + 'K';
  return '$' + t.toFixed(0);
}

function EnergyGate({ energy }: { energy: EnergyResponse | null }) {
  if (!energy) return (
    <div className="bb-energy-gate">
      <div className="bb-gate-body">
        <span className="bb-gate-reason" style={{ color: 'var(--mist)' }}>Energy gate — loading…</span>
      </div>
    </div>
  );

  const accepted = energy.accept;
  return (
    <div className="bb-energy-gate">
      <div className={`bb-gate-icon ${accepted ? 'accept' : 'veto'}`}>
        {accepted ? (
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12 L10 17 L19 7" stroke="#34e6a0" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 18 L18 6 M6 6 L18 18" stroke="#ff5470" strokeWidth={2.5} strokeLinecap="round" /></svg>
        )}
      </div>
      <div className="bb-gate-body">
        <div className="bb-gate-line1">
          <span className={`bb-gate-status ${accepted ? 'accept' : 'veto'}`}>{accepted ? 'ACCEPT' : 'VETO'}</span>
          <span className="bb-gate-du">ΔU {energy.deltaU.toFixed(6)}</span>
        </div>
        <span className="bb-gate-reason">{energy.reason}</span>
      </div>
    </div>
  );
}

export default function OrderBook({ orderbook, loading, energy, market, signal }: Props) {
  const [tab, setTab] = useState<'book' | 'trades'>('book');

  const hasBook = !!orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0;

  // Show up to 8 levels
  const asks = hasBook ? orderbook.asks.slice(0, 8) : [];
  const bids = hasBook ? orderbook.bids.slice(0, 8) : [];
  const maxTotal = hasBook
    ? Math.max(...asks.map(a => a.price * a.size), ...bids.map(b => b.price * b.size), 1)
    : 1;

  // YURI entry: if there's a signal for this market, show the avg entry from signal
  const yuriSide = signal?.side;
  const yuriConf = signal ? (signal.confidence * 100).toFixed(0) + '%' : null;

  const baseSym = market.replace('-USD', '');

  return (
    <div className="bb-book-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">Order Book</span>
        <div className="bb-book-tabs">
          <button className={`bb-book-tab ${tab === 'book' ? 'active' : ''}`} onClick={() => setTab('book')}>Book</button>
        </div>
      </div>

      {/* Column headers */}
      <div className="bb-book-cols">
        <span>Price (USD)</span>
        <span style={{ textAlign: 'right' }}>Amount ({baseSym})</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {!hasBook && (
        <div className="bb-empty" style={{ padding: '16px 0' }}>
          {loading ? 'Fetching order book…' : 'Order book unavailable — /orderbook endpoint pending'}
        </div>
      )}

      {hasBook && (
        <>
          {/* Asks — reversed so lowest ask is at bottom (closest to mid) */}
          <div className="bb-book-rows">
            {[...asks].reverse().map((a, idx) => {
              const totalVal = a.price * a.size;
              const pct = (totalVal / maxTotal * 100).toFixed(0);
              return (
                <div key={idx} className="bb-book-row ask">
                  <div className="depth" style={{ width: pct + '%' }} />
                  <span className="price">{fmtPrice(a.price, market)}</span>
                  <span className="amt">{fmtSize(a.size)}</span>
                  <span className="total">{fmtTotal(a.price, a.size)}</span>
                </div>
              );
            })}
          </div>

          {/* Mid */}
          <div className="bb-book-mid">
            <span className="bb-book-mid-price">{fmtPrice(orderbook.mid, market)}</span>
            <span className="bb-book-spread">spread {orderbook.spreadBps.toFixed(1)} bps</span>
          </div>

          {/* Bids */}
          <div className="bb-book-rows">
            {bids.map((b, idx) => {
              const totalVal = b.price * b.size;
              const pct = (totalVal / maxTotal * 100).toFixed(0);
              return (
                <div key={idx} className="bb-book-row bid">
                  <div className="depth" style={{ width: pct + '%' }} />
                  <span className="price">{fmtPrice(b.price, market)}</span>
                  <span className="amt">{fmtSize(b.size)}</span>
                  <span className="total">{fmtTotal(b.price, b.size)}</span>
                </div>
              );
            })}
          </div>

          {/* YURI entry overlay */}
          {yuriSide && yuriSide !== 'neutral' && (
            <div className="bb-book-yuri">
              <span className="bb-yuri-label">{yuriSide === 'long' ? '▲ YURI LONG' : '▼ YURI SHORT'}</span>
              <span className="bb-yuri-price">{fmtPrice(orderbook.mid, market)}</span>
              <span className="bb-yuri-detail">conv {yuriConf}</span>
            </div>
          )}
        </>
      )}

      {/* Energy gate */}
      <EnergyGate energy={energy} />
    </div>
  );
}
