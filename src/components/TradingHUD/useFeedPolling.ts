/**
 * ⬡ YURI_TRADING :: useFeedPolling.ts
 *
 * Reactive polling hook for the Trading HUD.
 * Each feed polls independently on its own interval —
 * a failure in one feed does not affect the others.
 *
 * Intervals (matching _SYSTEM/yuri-trading-hud.md doctrine):
 *   DEX:    30 seconds   |   Funding: 15 seconds
 *   Whale:  60 seconds   |   Health:  15 seconds
 */

import { useEffect, useState, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  fetchDexFeed,
  fetchFundingFeed,
  fetchWhaleFeed,
  fetchHealth,
  type DexFeedResponse,
  type FundingFeedResponse,
  type WhaleFeedResponse,
  type HealthResponse,
} from '../../lib/tradingHudBridge';

export type {
  DexFeedResponse,
  FundingFeedResponse,
  WhaleFeedResponse,
  HealthResponse,
} from '../../lib/tradingHudBridge';

export type FeedStatus = 'loading' | 'active' | 'error' | 'starting';

export interface FeedState<T> {
  data: T | null;
  status: FeedStatus;
  lastUpdate: string | null;
  error: string | null;
}

export interface AllFeeds {
  dex: FeedState<DexFeedResponse>;
  funding: FeedState<FundingFeedResponse>;
  whale: FeedState<WhaleFeedResponse>;
  health: FeedState<HealthResponse>;
  lastUpdate: Date | null;
}

const mkInitial = <T>(): FeedState<T> => ({
  data: null,
  status: 'starting',
  lastUpdate: null,
  error: null,
});

const INTERVALS = {
  dex: 30_000,
  funding: 15_000,
  whale: 60_000,
  health: 15_000,
} as const;

export function useFeedPolling(): AllFeeds {
  const [dex, setDex] = useState<FeedState<DexFeedResponse>>(mkInitial);
  const [funding, setFunding] = useState<FeedState<FundingFeedResponse>>(mkInitial);
  const [whale, setWhale] = useState<FeedState<WhaleFeedResponse>>(mkInitial);
  const [health, setHealth] = useState<FeedState<HealthResponse>>(mkInitial);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Keep a ref to prevent stale closure issues when intervals fire
  const cancelledRef = useRef(false);

  const updateLast = useCallback(() => setLastUpdate(new Date()), []);

  const wrap = useCallback(
    async <T>(
      fetcher: () => Promise<T>,
      setter: Dispatch<SetStateAction<FeedState<T>>>,
    ) => {
      setter((prev) => ({
        ...prev,
        status: prev.data ? 'loading' : prev.status,
        error: null,
      }));
      try {
        const data = await fetcher();
        if (cancelledRef.current) return;
        setter({
          data,
          status: 'active',
          lastUpdate: new Date().toISOString(),
          error: null,
        });
        updateLast();
      } catch (err: unknown) {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : 'Feed error';
        setter((prev) => ({
          ...prev,
          status: 'error',
          error: message,
        }));
      }
    },
    [updateLast],
  );

  useEffect(() => {
    cancelledRef.current = false;

    // Bootstrap: check health first, then fire all feeds
    wrap(fetchHealth, setHealth).then(() => {
      if (cancelledRef.current) return;
      wrap(fetchDexFeed, setDex);
      wrap(fetchFundingFeed, setFunding);
      wrap(fetchWhaleFeed, setWhale);
    });

    const dexTimer = window.setInterval(
      () => wrap(fetchDexFeed, setDex),
      INTERVALS.dex,
    );
    const fundingTimer = window.setInterval(
      () => wrap(fetchFundingFeed, setFunding),
      INTERVALS.funding,
    );
    const whaleTimer = window.setInterval(
      () => wrap(fetchWhaleFeed, setWhale),
      INTERVALS.whale,
    );
    const healthTimer = window.setInterval(
      () => wrap(fetchHealth, setHealth),
      INTERVALS.health,
    );

    return () => {
      cancelledRef.current = true;
      window.clearInterval(dexTimer);
      window.clearInterval(fundingTimer);
      window.clearInterval(whaleTimer);
      window.clearInterval(healthTimer);
    };
  }, [wrap]);

  return { dex, funding, whale, health, lastUpdate };
}
