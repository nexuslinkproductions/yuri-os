/**
 * ⬡ YURI_TRADING :: SignalRadar
 * Panel A — DEX new token pairs with volume spikes.
 * Displays: chain, pair, age, liquidity, volume, volume spike %, price, DEX.
 */
import React from 'react';
import { type FeedState, type DexFeedResponse } from './useFeedPolling';
import { type DexPair } from '../../lib/tradingHudBridge';
import styles from './styles.module.css';

interface Props {
  state: FeedState<DexFeedResponse>;
}

function fmtNum(n: number): string {
  if (!n || n === 0) return '-';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k';
  return '$' + Number(n).toFixed(0);
}

function fmtAge(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function spikeClass(pct: number): string {
  if (pct > 500) return styles.green;
  if (pct > 200) return '';
  return styles.muted;
}

function renderRow(p: DexPair, i: number) {
  return (
    <tr key={p.pairAddress || i}>
      <td className={styles.muted}>{p.chainId}</td>
      <td><b>{p.baseToken}</b>/{p.quoteToken}</td>
      <td className={styles.muted}>{fmtAge(p.age)}</td>
      <td className={styles.numCol}>{fmtNum(p.liquidity)}</td>
      <td className={styles.numCol}>{fmtNum(p.volume1h)}</td>
      <td className={`${styles.numCol} ${spikeClass(p.volumeSpikePct)}`}>
        {p.volumeSpikePct > 0 ? '+' : ''}{p.volumeSpikePct}%
      </td>
      <td className={styles.numCol}>${Number(p.priceUsd).toFixed(8)}</td>
      <td className={styles.muted}>{p.dex}</td>
    </tr>
  );
}

export function SignalRadar({ state }: Props) {
  const { data, status, error, lastUpdate } = state;
  const pairs = data?.pairs ?? [];
  const count = pairs.length;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <i className={styles.panelTitle}>⟐</i> Signal Radar
          <span className={styles.panelCount}>{count}</span>
        </div>
        <div className={styles.panelMeta}>
          {lastUpdate
            ? 'updated ' + new Date(lastUpdate).toLocaleTimeString('en-GB')
            : 'waiting…'}
        </div>
      </div>

      <div className={styles.panelBody}>
        {status === 'starting' || status === 'loading' ? (
          <div className={`${styles.stateContainer} ${styles.shimmer}`}>
            <i className={styles.stateIcon}>⬡</i>
            <p className={styles.stateMessage}>connecting to aggregator…</p>
          </div>
        ) : status === 'error' ? (
          <div className={`${styles.stateContainer} ${styles.stateError}`}>
            <i className={styles.stateIcon}>⚠</i>
            <p className={styles.stateMessage}>DEX: {error}</p>
          </div>
        ) : count === 0 ? (
          <div className={styles.stateContainer}>
            <i className={styles.stateIcon}>–</i>
            <p className={styles.stateMessage}>0 pairs matched filters</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Chain</th>
                <th>Pair</th>
                <th>Age</th>
                <th className={styles.numCol}>Liq</th>
                <th className={styles.numCol}>Vol</th>
                <th className={styles.numCol}>Δ1h</th>
                <th className={styles.numCol}>Price</th>
                <th>DEX</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => renderRow(p, i))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
