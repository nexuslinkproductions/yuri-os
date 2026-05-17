import React from 'react';
import { motion } from 'framer-motion';
import { YuriDesignConfig, CATALOG_CATEGORIES } from './types';

interface ConfirmScreenProps {
  config: YuriDesignConfig;
  onConfirm: () => void;
  onBack: () => void;
}

const MOTION_DURATION: Record<string, string> = {
  Calm: '0.5s — slow, content-first',
  Responsive: '0.25s — precise feedback',
  Energetic: '0.15s — bold momentum',
  Cinematic: '0.6s — dramatic timing',
};

const STYLE_RADIUS: Record<string, string> = {
  'Rounded glass': '12px radius, blur, layered light',
  'Sharp tactical': '0px radius, crisp borders',
  'Premium minimal': '4px radius, thin strokes',
  'Heavy arcade': '2px radius, chunky borders',
  'Terminal native': '0px radius, ASCII-style',
};

const TONE_ICON: Record<string, string> = {
  'Clean professional': '◈',
  'Strategic consultant': '◆',
  'Game mission report': '◉',
  'Creative director': '◎',
  'Technical audit': '◇',
};

export default function ConfirmScreen({ config, onConfirm, onBack }: ConfirmScreenProps) {
  const overallScore = 78;

  return (
    <motion.div
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -32 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: '40px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(150,220,120,0.2) transparent',
      }}
    >
      {/* Header */}
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--gold-solar)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          CONFIRM DESIGN CONFIGURATION
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.6rem',
          fontWeight: 700,
          color: 'var(--silver-albedo)',
          margin: '0 0 8px',
          letterSpacing: '-0.01em',
        }}>
          Your Interface Profile
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-dim)',
          margin: 0,
          lineHeight: 1.6,
        }}>
          Review your selections below. Confirm to generate the Document Audit HUD, or go back to adjust.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* LEFT: Config summary */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--cyan-glow)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            Selected Configuration
          </div>
          {CATALOG_CATEGORIES.map((cat, i) => (
            <div
              key={cat.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderBottom: i < CATALOG_CATEGORIES.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                gap: 12,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                color: 'rgba(0,0,0,0.8)',
                background: 'var(--cyan-glow)',
                padding: '2px 5px',
                borderRadius: 2,
                letterSpacing: '0.1em',
                flexShrink: 0,
                marginTop: 1,
              }}>
                {cat.code}
              </span>
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.08em',
                  marginBottom: 3,
                }}>
                  {cat.label}
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--silver-albedo)',
                }}>
                  {config[cat.key] || '—'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: Preview strip + functions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Token preview strip */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              color: 'var(--cyan-glow)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              Token Preview
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Accent color swatch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  background: 'var(--cyan-glow)',
                  boxShadow: '0 0 12px rgba(150,220,120,0.4)',
                  flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>Primary Accent</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--cyan-glow)' }}>--cyan-glow</div>
                </div>
              </div>
              {/* Font sample */}
              <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--silver-albedo)', lineHeight: 1.2 }}>
                  Display Bold
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>
                  MONO 700 · Bricolage Grotesque
                </div>
              </div>
              {/* Motion label */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>Motion easing</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--gold-solar)' }}>
                  {MOTION_DURATION[config.motionIntensity] || 'Not set'}
                </span>
              </div>
              {/* Style descriptor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>Surface style</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--silver-albedo)' }}>
                  {STYLE_RADIUS[config.componentStyle] || 'Not set'}
                </span>
              </div>
              {/* Audit tone badge */}
              {config.auditTone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1rem', color: 'var(--cyan-glow)' }}>
                    {TONE_ICON[config.auditTone] || '◇'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--silver-albedo)' }}>
                    {config.auditTone}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Enabled functions summary */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6,
            padding: '16px',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              color: 'var(--gold-solar)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              {config.enabledFunctions.length} Functions Active
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {config.enabledFunctions.length === 0 ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  No functions selected — all defaults active
                </span>
              ) : (
                config.enabledFunctions.map((fn) => (
                  <span
                    key={fn}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6rem',
                      color: 'var(--cyan-glow)',
                      background: 'rgba(150,220,120,0.06)',
                      border: '1px solid rgba(150,220,120,0.2)',
                      borderRadius: 3,
                      padding: '2px 8px',
                    }}
                  >
                    {fn}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 8 }}>
        <motion.button
          onClick={onConfirm}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '14px 32px',
            background: 'rgba(150,220,120,0.12)',
            border: '1px solid var(--cyan-glow)',
            borderRadius: 4,
            color: 'var(--cyan-glow)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            letterSpacing: '0.12em',
            cursor: 'pointer',
            textTransform: 'uppercase',
            boxShadow: '0 0 24px rgba(150,220,120,0.1)',
            outline: 'none',
            transition: 'box-shadow 0.2s',
          }}
        >
          Confirm and Generate Audit
        </motion.button>
        <motion.button
          onClick={onBack}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          style={{
            padding: '14px 24px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            textTransform: 'uppercase',
            outline: 'none',
          }}
        >
          ← Adjust Setup
        </motion.button>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-dim)',
          marginLeft: 'auto',
          opacity: 0.6,
        }}>
          Est. quality score: <span style={{ color: 'var(--gold-solar)' }}>{overallScore}/100</span>
        </span>
      </div>
    </motion.div>
  );
}
