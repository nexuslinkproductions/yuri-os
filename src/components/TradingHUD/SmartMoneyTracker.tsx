/**
 * ⬡ YURI_TRADING :: SmartMoneyTracker
 * Panel C — Whale transaction tracker (full-width).
 * Displays: timestamp, asset symbol, USD amount, from → to, transaction type.
 */
import React from 'react';
import { type FeedState, type WhaleFeedResponse } from './useFeedPolling';
import { type WhaleTransaction } from '../../lib/tradingHudBridge';
import styles from './styles.module.css';

interface Props {
  state: FeedState<WhaleFeedResponse>;
}

function shortAddr(addr: string): string {
  if (!addr || addr === 'unknown') return '–';
  if (addr.length <= 12) return addr;
  return addr.slice(0, 5) + '…' + addr.slice(-4);
}

function typeClass(type: string): string {
  switch (type) {
    case 'EXCHANGE_DEPOSIT':    return styles.whaleDeposit;
    case 'EXCHANGE_WITHDRAWAL': return styles.whaleWithdrawal;
    default:                    return styles.whaleTransfer;
  }
}

function renderRow(tx: WhaleTransaction) {
  const time = tx.timestamp
    ? new Date(tx.timestamp).toLocaleTimeString('en-GB')
    : '–';
  const from = tx.fromOwner || shortAddr(tx.fromAddress);
  const to = tx.toOwner || shortAddr(tx.toAddress);

  return (
    <tr key={tx.id}>
      <td className={styles.muted}>{time}</td>
      <td><b>{tx.symbol}</b></td>
      <td className={styles.numCol}>${(tx.amountUsd / 1e6).toFixed(2)}M</td>
      <td className={styles.muted} title={tx.fromAddress}>{from}</td>
      <td className={styles.muted} title={tx.toAddress}>{to}</td>
      <td>
        <span className={`${styles.whaleType} ${typeClass(tx.type)}`}>
          {tx.type.replace(/_/g, ' ')}
        </span>
      </td>
    </tr>
  );
}

export function SmartMoneyTracker({ state }: Props) {
  const { data, status, error, lastUpdate } = state;
  const transactions = data?.transactions ?? [];
  const count = transactions.length;

  return (
    <div className={`${styles.panel} ${styles.panelFull}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <i>⟐</i> Smart Money Tracker
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
            <p className={styles.stateMessage}>loading whale data…</p>
          </div>
        ) : status === 'error' ? (
          <div className={`${styles.stateContainer} ${styles.stateError}`}>
            <i className={styles.stateIcon}>⚠</i>
            <p className={styles.stateMessage}>Whale: {error}</p>
          </div>
        ) : count === 0 ? (
          <div className={styles.stateContainer}>
            <i className={styles.stateIcon}>–</i>
            <p className={styles.stateMessage}>
              0 transactions
              {error?.includes('WHALE_ALERT_API_KEY') &&
                ' — WHALE_ALERT_API_KEY not set'}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Asset</th>
                <th className={styles.numCol}>Amount</th>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => renderRow(tx))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
