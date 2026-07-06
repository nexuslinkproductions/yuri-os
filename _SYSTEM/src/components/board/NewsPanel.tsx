/**
 * NewsPanel.tsx — News & Catalysts panel.
 * Static placeholder content (no live news API yet).
 * When a news feed goes live, swap the static arrays for fetched data.
 */

const HEADLINES = [
  { time: '—', tag: 'neutral' as const, tagLabel: 'MARKET', text: 'Live news feed — wiring in progress. Real signal data active above.' },
  { time: '—', tag: 'bull' as const,    tagLabel: 'INFO',   text: 'Paper trading across 6 crypto markets + Polymarket active.' },
  { time: '—', tag: 'neutral' as const, tagLabel: 'SYS',    text: 'Energy conscience active · calibration accruing · graduation ladder building.' },
];

const EVENTS = [
  { date: 'TBD',   name: 'Fed FOMC Meeting',       impact: 'high' as const },
  { date: 'TBD',   name: 'BTC ETF Flow Report',    impact: 'med' as const },
  { date: 'TBD',   name: 'ETH Staking Update',     impact: 'low' as const },
];

const WHALES = [
  { time: '—', tag: 'neutral' as const, tagLabel: 'INFO', text: 'Whale alert feed — pending integration' },
  { time: '—', tag: 'neutral' as const, tagLabel: 'INFO', text: 'Large flows will appear here when wired' },
];

export default function NewsPanel() {
  return (
    <>
      <div className="bb-panel-head">
        <span className="bb-eyebrow">News &amp; Catalysts</span>
        <span className="bb-panel-sub">Information edge · feed pending</span>
      </div>
      <div className="bb-news-grid">
        <div>
          <div className="bb-news-col-head">Squawk Headlines</div>
          <div className="bb-headlines">
            {HEADLINES.map((h, i) => (
              <div key={i} className="bb-headline">
                <span className="bb-headline-time">{h.time}</span>
                <span className="bb-headline-text">
                  <span className={`bb-headline-tag ${h.tag}`}>{h.tagLabel}</span>
                  {h.text}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="bb-news-col-head">Event Calendar</div>
          <div className="bb-event-list">
            {EVENTS.map((e, i) => (
              <div key={i} className="bb-event-row">
                <span className="bb-event-date">{e.date}</span>
                <span className="bb-event-name">{e.name}</span>
                <span className={`bb-event-impact ${e.impact}`}>{e.impact}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="bb-news-col-head">Whale Alerts</div>
          <div className="bb-whale-list">
            {WHALES.map((w, i) => (
              <div key={i} className="bb-whale-row">
                <span className="bb-whale-time">{w.time}</span>
                <span className="bb-whale-text">
                  <span className={`bb-whale-tag ${w.tag}`}>{w.tagLabel}</span> {w.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
