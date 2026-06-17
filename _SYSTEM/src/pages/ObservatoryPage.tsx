/**
 * ObservatoryPage.tsx
 *
 * YURI Observatory — Cognitive Trading Deck (Brain Board R2).
 * Mounts BrainBoard wired to real engine data from useObservatoryStream (SSE+REST).
 * The old tab UI (MarketsTab / MechanismTab / MindTab) is superseded by BrainBoard.
 */

import { useObservatoryStream } from '../hooks/useObservatoryStream';
import BrainBoard from '../components/board/BrainBoard';

export default function ObservatoryPage() {
  const obs = useObservatoryStream();

  // Loading splash — shown only before the first REST snapshot arrives
  if (obs.loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: '#04060d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        fontFamily: '"JetBrains Mono", "SF Mono", monospace',
        color: '#6e87a3',
      }}>
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <path d="M12 3 L12 21 M6 7 L18 17 M18 7 L6 17" stroke="#9df2ff" strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
          <circle cx={12} cy={12} r={2.4} fill="#00c8f0" opacity={0.85} />
        </svg>
        <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
          YURI · BRAIN BOARD · LOADING
        </div>
        {obs.error && (
          <div style={{ fontSize: 9, color: '#ff5470', marginTop: 8 }}>{obs.error}</div>
        )}
      </div>
    );
  }

  return <BrainBoard obs={obs} />;
}
