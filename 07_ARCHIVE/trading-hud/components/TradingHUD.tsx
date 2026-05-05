/**
 * ⬡ YURI_TRADING :: TradingHUD
 *
 * Main container — Palantir-grade trading signal dashboard.
 * Three panels: SignalRadar (DEX), FundingTerminal (perps), SmartMoneyTracker (whales).
 *
 * Architecture:
 *   useFeedPolling() → FeedStatusBar + three data panels
 *   TradingHUDBridge.ts → backend :3004 proxy → feed-aggregator :4201
 */
import React from 'react';
import { useFeedPolling } from './useFeedPolling';
import { FeedStatusBar } from './FeedStatusBar';
import { SignalRadar } from './SignalRadar';
import { FundingTerminal } from './FundingTerminal';
import { SmartMoneyTracker } from './SmartMoneyTracker';
import ScoredCenterPanel from './ScoredCenterPanel';
import styles from './styles.module.css';

export default function TradingHUD() {
  const feeds = useFeedPolling();

  return (
    <div className={styles.tradingHudGrid}>
      <FeedStatusBar health={feeds.health} lastUpdate={feeds.lastUpdate} />
      <ScoredCenterPanel />
      <div className={styles.panels}>
        <SignalRadar state={feeds.dex} />
        <FundingTerminal state={feeds.funding} />
        <SmartMoneyTracker state={feeds.whale} />
      </div>
    </div>
  );
}
