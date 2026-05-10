import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface NavSection {
  path: string;
  label: string;
  icon: string;
}

const NAV_SECTIONS: NavSection[] = [
  { path: '/operator', label: 'Cockpit', icon: '◈' },
  { path: '/operator/agents', label: 'Agents', icon: '⬡' },
  { path: '/operator/sessions', label: 'Sessions', icon: '☰' },
  { path: '/operator/skills', label: 'Skills', icon: '◆' },
  { path: '/operator/tokenops', label: 'Token Ops', icon: '◎' },
  { path: '/operator/design-audit', label: 'Design Audit', icon: '⊡' },
  { path: '/operator/oracle', label: 'Reasoning', icon: '✦' },
  { path: '/operator/health', label: 'Health', icon: '⎔' },
  { path: '/operator/settings', label: 'Settings', icon: '⚙' },
];

export const OperatorNav: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const reducedMotion = useReducedMotion();

  const toggle = useCallback(() => setCollapsed(prev => !prev), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '[' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const width = collapsed ? 64 : 240;

  return (
    <motion.nav
      aria-label="Operator navigation"
      animate={{ width }}
      transition={{
        duration: reducedMotion ? 0 : 0.24,
        ease: [0.2, 0, 0, 1],
      }}
      style={{
        gridRow: 2,
        gridColumn: 1,
        height: '100%',
        background: 'var(--op-surface-elevated)',
        borderRight: '1px solid var(--op-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--op-text-secondary)',
          cursor: 'pointer',
          padding: '12px 16px',
          fontSize: 'var(--op-type-caption)',
          fontFamily: 'var(--op-font-mono)',
          letterSpacing: '0.05em',
          textAlign: 'left',
        }}
      >
        {collapsed ? '→' : '←'}
      </button>

      <ul style={{ listStyle: 'none', margin: 0, padding: '8px', flex: 1 }}>
        {NAV_SECTIONS.map(section => (
          <li key={section.path}>
            <NavLink
              to={section.path}
              end={section.path === '/operator'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '10px 12px' : '10px 16px',
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: 'none',
                color: isActive ? 'var(--op-text-primary)' : 'var(--op-text-secondary)',
                fontFamily: 'var(--op-font-sans)',
                fontSize: 'var(--op-type-body)',
                fontWeight: 500,
                background: isActive ? 'var(--op-accent-soft)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--op-accent)' : '3px solid transparent',
                transition: 'background var(--op-dur-micro) var(--op-ease-standard), color var(--op-dur-micro) var(--op-ease-standard)',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              })}
            >
              <span style={{ fontSize: '1.1rem', flexShrink: 0, width: 20, textAlign: 'center' }}>
                {section.icon}
              </span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.15 }}
                    style={{ overflow: 'hidden' }}
                  >
                    {section.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          </li>
        ))}
      </ul>

      {!collapsed && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--op-border)',
            color: 'var(--op-text-tertiary)',
            fontSize: 'var(--op-type-caption)',
            fontFamily: 'var(--op-font-mono)',
          }}
        >
          NUDIMMUD v1.0
        </div>
      )}
    </motion.nav>
  );
};
