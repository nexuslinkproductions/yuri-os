/**
 * ⬡ YURI_TRADING :: FundingTerminal
 * Panel B — Perpetual funding rates from Hyperliquid.
 * Displays: rank, asset, mark price, 1h rate, 8h rate, signal badge.
 */
import React from 'react';
import { type FeedState, type FundingFeedResponse } from './useFeedPolling';
import { type FundingAsset } from '../../lib/tradingHudBridge';
import styles from './styles.module.css';

interface Props {
  state: FeedState<FundingFeedResponse>;
}

function signalClass(signal: string): string {
  switch (signal) {
    case 'SHORT_BIAS': return styles.signalShort;
    case 'LONG_BIAS':  return styles.signalLong;
    default:           return styles.signalNeutral;
  }
}

function rateClass(rate: number): string {
  if (rate > 0.001) return styles.red;
  if (rate < -0.001) return styles.green;
  return '';
}

function renderRow(a: FundingAsset, i: number) {
  const r1h = (a.fundingRate * 100).toFixed(4);
  const r8h = (a.funding8h * 100).toFixed(4);

  return (
    <tr key={a.asset}>
      <td className={styles.muted}>{i + 1}</td>
      <td><b>{a.asset}</b></td>
      <td className={styles.numCol}>
        {a.markPx > 0 ? '$' + Number(a.markPx).toFixed(4) : '–'}
      </td>
      <td className={`${styles.numCol} ${rateClass(a.fundingRate)}`}>
        {r1h}%
      </td>
      <td className={`${styles.numCol} ${rateClass(a.fundingRate)}`}>
        {r8h}%
      </td>
      <td>
        <span className={`${styles.signalBadge} ${signalClass(a.signal)}`}>
          {a.signalEmoji} {a.signal.replace('_', ' ')}
        </span>
      </td>
    </tr>
  );
}

export function FundingTerminal({ state }: Props) {
  const { data, status, error, lastUpdate } = state;
  const assets = data?.assets ?? [];
  const count = assets.length;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <i>⟐</i> Funding Terminal
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
            <p className={styles.stateMessage}>loading funding data…</p>
          </div>
        ) : status === 'error' ? (
          <div className={`${styles.stateContainer} ${styles.stateError}`}>
            <i className={styles.stateIcon}>⚠</i>
            <p className={styles.stateMessage}>Funding: {error}</p>
          </div>
        ) : count === 0 ? (
          <div className={styles.stateContainer}>
            <i className={styles.stateIcon}>–</i>
            <p className={styles.stateMessage}>0 entries</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Asset</th>
                <th className={styles.numCol}>Mark</th>
                <th className={styles.numCol}>1h</th>
                <th className={styles.numCol}>8h</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => renderRow(a, i))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
