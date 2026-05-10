import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface PaletteItem {
  id: string;
  label: string;
  section: string;
  path: string;
  keywords: string[];
}

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'cockpit', label: 'Cockpit', section: 'Dashboard', path: '/operator', keywords: ['home', 'kpi', 'dashboard'] },
  { id: 'agents', label: 'Agents & Swarm', section: 'Operations', path: '/operator/agents', keywords: ['swarm', 'lane', 'model'] },
  { id: 'sessions', label: 'Sessions', section: 'Operations', path: '/operator/sessions', keywords: ['transcript', 'history'] },
  { id: 'skills', label: 'Skills & Routing', section: 'Operations', path: '/operator/skills', keywords: ['catalog', 'trigger'] },
  { id: 'tokenops', label: 'Token Ops / FinOps', section: 'Finance', path: '/operator/tokenops', keywords: ['spend', 'budget', 'cost'] },
  { id: 'design-audit', label: 'Design Audit HUD', section: 'Quality', path: '/operator/design-audit', keywords: ['audit', 'design'] },
  { id: 'oracle', label: 'Reasoning Surface', section: 'AI', path: '/operator/oracle', keywords: ['oracle', 'query', 'reasoning', 'council', 'voice', 'wake', 'transcript'] },
  { id: 'health', label: 'Deployment & Health', section: 'Infra', path: '/operator/health', keywords: ['service', 'port', 'uptime'] },
  { id: 'settings', label: 'Settings / Profile', section: 'System', path: '/operator/settings', keywords: ['theme', 'preferences'] },
];

function fuzzyMatch(query: string, item: PaletteItem): number {
  const q = query.toLowerCase();
  const searchText = `${item.label} ${item.section} ${item.keywords.join(' ')}`.toLowerCase();
  if (searchText.includes(q)) return 100 - searchText.indexOf(q);
  const words = q.split(/\s+/);
  let score = 0;
  for (const word of words) {
    if (searchText.includes(word)) score += 50;
  }
  return score;
}

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();

  const results = useMemo(() => {
    if (!query.trim()) return PALETTE_ITEMS;
    return PALETTE_ITEMS
      .map(item => ({ item, score: fuzzyMatch(query, item) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item);
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIdx(0);
  }, []);

  const activate = useCallback(
    (item: PaletteItem) => {
      navigate(item.path);
      close();
    },
    [navigate, close],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        return;
      }
      if (e.key === '/' && !open && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setSelectedIdx(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIdx]) activate(results[selectedIdx]);
    }
  };

  const spring = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 400, damping: 35 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '15vh',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={close}
          role="dialog"
          aria-label="Command palette"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={spring}
            onClick={e => e.stopPropagation()}
            style={{
              width: 560,
              maxHeight: 400,
              borderRadius: 12,
              background: 'var(--op-surface-overlay)',
              border: '1px solid var(--op-border-strong)',
              boxShadow: 'var(--op-shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search sections, commands..."
              aria-label="Search commands"
              style={{
                width: '100%',
                padding: '14px 18px',
                border: 'none',
                borderBottom: '1px solid var(--op-border)',
                background: 'transparent',
                color: 'var(--op-text-primary)',
                fontSize: 'var(--op-type-body)',
                fontFamily: 'var(--op-font-sans)',
                outline: 'none',
              }}
            />
            <ul
              role="listbox"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: '8px',
                overflowY: 'auto',
                flex: 1,
              }}
            >
              {results.map((item, idx) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={idx === selectedIdx}
                  onClick={() => activate(item)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: idx === selectedIdx ? 'var(--op-accent-soft)' : 'transparent',
                    color: 'var(--op-text-primary)',
                    fontFamily: 'var(--op-font-sans)',
                    fontSize: 'var(--op-type-body)',
                    transition: 'background var(--op-dur-micro) var(--op-ease-standard)',
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: 'var(--op-text-tertiary)', fontSize: 'var(--op-type-caption)' }}>
                    {item.section}
                  </span>
                </li>
              ))}
              {results.length === 0 && (
                <li
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--op-text-tertiary)',
                    fontSize: 'var(--op-type-caption)',
                  }}
                >
                  No results
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
