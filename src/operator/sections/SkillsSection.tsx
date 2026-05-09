import React, { useState, useMemo } from 'react';
import { SectionHeader, EmptyState } from '../components';
import { MOCK_SKILLS } from '../data/mock-skills';

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function primaryTrigger(s: { triggers: string[]; trigger?: string }): string {
  return s.trigger ?? s.triggers[0] ?? '';
}

export default function SkillsSection() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return MOCK_SKILLS;
    return MOCK_SKILLS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        primaryTrigger(s).toLowerCase().includes(q),
    );
  }, [search]);

  const maxCount = useMemo(
    () => Math.max(...MOCK_SKILLS.map((s) => s.invocationCount), 1),
    [],
  );

  const top5 = useMemo(
    () =>
      [...MOCK_SKILLS]
        .sort((a, b) => b.invocationCount - a.invocationCount)
        .slice(0, 5),
    [],
  );

  return (
    <div className="op-section">
      <SectionHeader title="Skills & Routing" />
      <input
        className="op-search-input"
        type="text"
        placeholder="Filter skills..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtered.length === 0 ? (
        <EmptyState title="No skills match" body="Try a different filter term." />
      ) : (
        <div className="op-table">
          {filtered.map((s) => (
            <div key={s.id} className="op-table-row">
              <div className="op-table-cell">{s.name}</div>
              <div className="op-table-cell op-mono">{primaryTrigger(s)}</div>
              <div
                className="op-table-cell op-mono"
                style={{
                  backgroundColor: `rgba(0,255,255,${s.invocationCount / maxCount})`,
                  color: 'cyan',
                }}
              >
                {s.invocationCount}
              </div>
              <div className="op-table-cell op-mono">{s.avgLatencyMs ?? '—'}ms</div>
              <div className="op-table-cell">{relativeTime(s.lastInvoked)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="op-chip-strip">
        {top5.map((s) => (
          <span key={s.id} className="op-chip">
            {primaryTrigger(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
