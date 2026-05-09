/**
 * Trading Bot Implementation Overview
 * Shows the 8-phase trading bot implementation status.
 */

import React from 'react';

const phases = [
  { phase: 'P3', name: 'Evidence Collector', lines: '1,146', color: '#00e5bf', desc: 'News feeds, social signals, dedup, confidence scoring' },
  { phase: 'P4', name: 'Ensemble Inference', lines: '935', color: '#76b900', desc: '5-model ensemble (Claude/Grok/GPT-4o/DeepSeek/Gemini), Brier calibration' },
  { phase: 'P5', name: 'Risk Engine', lines: '1,344', color: '#ff5252', desc: '9 deterministic gates, Kelly sizing, drawdown/daily loss halts' },
  { phase: 'P6', name: 'Execution Engine', lines: '1,440', color: '#7c4dff', desc: 'Coinbase API, HMAC-SHA256 auth, idempotent orders, adaptive polling' },
  { phase: 'P7', name: 'Paper Trading', lines: '1,555', color: '#00e676', desc: 'Full pipeline cycles, failure taxonomy (A/B/C/D), Brier gating' },
  { phase: 'P8', name: 'Live Rollout', lines: '885', color: '#ff1744', desc: 'Kill-switch, staging gates (S0-S2), manual approval, audit log' },
];

export default function TradingHUD() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '32px 36px', background: 'linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(3,5,10,1) 100%)' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.55rem', color: '#76b900', letterSpacing: '0.3em' }}>
          PREDICTION MARKET BOT // ARCHITECTURE
        </span>
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontWeight: 800 }}>Trading Bot Pipeline</h1>
      <p style={{ opacity: 0.5, marginBottom: 32, fontSize: '0.85rem', maxWidth: 600, fontFamily: '"DM Sans", system-ui, sans-serif', lineHeight: 1.6 }}>
        All 6 implementation phases complete. Live trading feeds require the feed-aggregator service. Run phases via npm scripts.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {phases.map(p => (
          <div key={p.phase} style={{
            background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            padding: 20, borderLeft: '3px solid ' + p.color
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.5rem', color: p.color, letterSpacing: '0.15em' }}>{p.phase}</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.45rem', opacity: 0.35 }}>{p.lines} lines</span>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.65, lineHeight: 1.5, fontFamily: '"DM Sans", system-ui, sans-serif' }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 20
      }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.55rem', color: '#00e5bf', marginBottom: 12 }}>USAGE</div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.7rem', opacity: 0.7, lineHeight: 2 }}>
          npm run trading-bot:phase-3    # Evidence collection<br/>
          npm run trading-bot:phase-4    # Ensemble inference<br/>
          npm run trading-bot:phase-5    # Risk evaluation<br/>
          npm run trading-bot:phase-6    # Order execution<br/>
          npm run trading-bot:phase-7    # Paper trading (50+ cycles)<br/>
          npm run trading-bot:phase-8    # Live rollout<br/>
          npm run trading-bot:kill-switch  # Arm/disarm/audit<br/>
        </div>
      </div>
    </div>
  );
}
