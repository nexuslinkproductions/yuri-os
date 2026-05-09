import React from 'react';
import { SectionHeader } from '../components/SectionHeader';

/* ── inline Toggle ─────────────────────────────────────────── */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 36,
      cursor: 'pointer',
      userSelect: 'none',
    }}
  >
    <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)' }}>{label}</span>
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--op-accent)' : 'var(--op-border)',
        position: 'relative',
        transition: 'background var(--op-dur-micro) var(--op-ease-standard)',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left var(--op-dur-micro) var(--op-ease-standard)',
          boxShadow: '0 1px 3px rgba(0,0,0,.18)',
        }}
      />
    </button>
  </label>
);

/* ── Density switcher (glance / scan / focus) ──────────────── */
const DENSITIES: Array<'glance' | 'scan' | 'focus'> = ['glance', 'scan', 'focus'];

const DensitySwitcher: React.FC<{
  density: 'glance' | 'scan' | 'focus';
  onChange: (d: 'glance' | 'scan' | 'focus') => void;
}> = ({ density, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 36 }}>
    <span style={{ fontSize: 'var(--op-type-body)', color: 'var(--op-text-primary)' }}>Density</span>
    <div style={{ display: 'flex', gap: 2, background: 'var(--op-surface)', borderRadius: 6, padding: 2 }}>
      {DENSITIES.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: '3px 10px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--op-font-mono)',
            fontSize: 'var(--op-type-caption)',
            fontWeight: density === d ? 600 : 400,
            color: density === d ? 'var(--op-text-primary)' : 'var(--op-text-tertiary)',
            background: density === d ? 'var(--op-accent-soft)' : 'transparent',
            transition: 'all var(--op-dur-micro) var(--op-ease-standard)',
          }}
        >
          {d}
        </button>
      ))}
    </div>
  </div>
);

/* ── helpers ───────────────────────────────────────────────── */
const ROOT_ID = 'operator-root';

function applyTheme(theme: 'dark' | 'light'): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  localStorage.setItem('operator.prefs.theme', theme);
}

function applyDensity(density: 'glance' | 'scan' | 'focus'): void {
  const root = document.getElementById(ROOT_ID);
  if (root) root.setAttribute('data-density', density);
  localStorage.setItem('operator.prefs.density', density);
}

function applyAnimations(on: boolean): void {
  const root = document.getElementById(ROOT_ID);
  if (root) root.setAttribute('data-animations', on ? 'on' : 'off');
  localStorage.setItem('operator.prefs.animations', on ? 'on' : 'off');
}

/* ── section ───────────────────────────────────────────────── */
export const SettingsSection: React.FC = () => {
  const [name, setName] = React.useState<string>(
    () => localStorage.getItem('operator.name') ?? 'Marcel Spatz',
  );

  const [theme, setTheme] = React.useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('operator.prefs.theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  const [density, setDensity] = React.useState<'glance' | 'scan' | 'focus'>(() => {
    const stored = localStorage.getItem('operator.prefs.density');
    return stored === 'scan' || stored === 'focus' ? stored : 'glance';
  });

  const [animations, setAnimations] = React.useState<boolean>(() => {
    return localStorage.getItem('operator.prefs.animations') !== 'off';
  });

  /* bootstrap stored prefs on mount (in case no toggle was ever touched) */
  React.useEffect(() => {
    applyTheme(theme);
    applyDensity(density);
    applyAnimations(animations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTheme = (dark: boolean) => {
    const next = dark ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  };

  const handleDensity = (d: 'glance' | 'scan' | 'focus') => {
    setDensity(d);
    applyDensity(d);
  };

  const handleAnimations = (on: boolean) => {
    setAnimations(on);
    applyAnimations(on);
  };

  return (
    <section className="op-section">
      <SectionHeader title="Settings" />

      {/* ProfileCard */}
      <div
        style={{
          background: 'var(--op-surface)',
          border: '1px solid var(--op-border)',
          borderRadius: 10,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--op-font-heading)',
            fontWeight: 600,
            fontSize: 'var(--op-type-h3)',
            color: 'var(--op-text-primary)',
            margin: '0 0 4px 0',
          }}
        >
          Profile
        </h3>
        <p
          style={{
            color: 'var(--op-text-secondary)',
            fontSize: 'var(--op-type-caption)',
            margin: '0 0 14px 0',
          }}
        >
          Your operator handle
        </p>
        <input
          type="text"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onBlur={() => localStorage.setItem('operator.name', name)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: 40,
            padding: '0 12px',
            borderRadius: 6,
            border: '1px solid var(--op-border)',
            background: 'var(--op-surface-elevated)',
            fontFamily: 'var(--op-font-mono)',
            fontSize: 'var(--op-type-body)',
            color: 'var(--op-text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* PreferencePanel */}
      <div
        style={{
          background: 'var(--op-surface)',
          border: '1px solid var(--op-border)',
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--op-font-heading)',
            fontWeight: 600,
            fontSize: 'var(--op-type-h3)',
            color: 'var(--op-text-primary)',
            margin: '0 0 4px 0',
          }}
        >
          Preferences
        </h3>
        <p
          style={{
            color: 'var(--op-text-secondary)',
            fontSize: 'var(--op-type-caption)',
            margin: '0 0 14px 0',
          }}
        >
          Tailor the operator experience
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Toggle label="Theme (dark)" checked={theme === 'dark'} onChange={handleTheme} />
          <DensitySwitcher density={density} onChange={handleDensity} />
          <Toggle label="Animations" checked={animations} onChange={handleAnimations} />
        </div>
      </div>
    </section>
  );
};

export default SettingsSection;
