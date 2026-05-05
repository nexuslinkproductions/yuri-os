/**
 * ⬡ YURI_TRADING :: FeedStatusBar
 * Top-header bar showing feed health indicators and last update timestamp.
 */
import React from 'react';
import { type FeedState, type AllFeeds } from './useFeedPolling';
import styles from './styles.module.css';

interface Props {
  health: AllFeeds['health'];
  lastUpdate: AllFeeds['lastUpdate'];
}

function dotClass(status: string): string {
  switch (status) {
    case 'active': return styles.dotActive;
    case 'error': return styles.dotError;
    default: return styles.dotLoading;
  }
}

export function FeedStatusBar({ health, lastUpdate }: Props) {
  const feeds = health.data?.feeds;
  const uptime = health.data?.uptime ?? 0;

  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('en-GB')
    : '--:--:--';

  return (
    <div className={styles.headerBar}>
      <div className={styles.headerLeft}>
        <span className={styles.headerTitle}>⬡ YURI TRADING HUD</span>
        <span className={styles.headerBadge}>v1</span>
      </div>

      <div className={styles.headerRight}>
        <div className={styles.feedIndicators}>
          <span className={styles.feedDot}>
            <span className={`${styles.dot} ${dotClass(feeds?.dex ?? 'loading')}`} />
            DEX
          </span>
          <span className={styles.feedDot}>
            <span className={`${styles.dot} ${dotClass(feeds?.funding ?? 'loading')}`} />
            FUND
          </span>
          <span className={styles.feedDot}>
            <span className={`${styles.dot} ${dotClass(feeds?.whale ?? 'loading')}`} />
            WHALE
          </span>
          <span className={styles.feedDot}>
            <span className={`${styles.dot} ${health.status === 'active' ? styles.dotActive : styles.dotLoading}`} />
            AGG
          </span>
        </div>
        <span className={styles.lastUpdate}>{timeStr}</span>
      </div>
    </div>
  );
}
