import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { YuriDesignConfig, CATALOG_CATEGORIES, FUNCTION_TOGGLES, CatalogOption } from './types';

interface DesignCatalogProps {
  config: YuriDesignConfig;
  onUpdate: (key: string, value: string | string[]) => void;
  onContinue: () => void;
}

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const ROW_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] } },
};

const REQUIRED_KEYS = ['theme', 'motionIntensity', 'backgroundLife', 'layoutMode', 'componentStyle', 'auditTone'] as const;

function isComplete(config: YuriDesignConfig): boolean {
  return REQUIRED_KEYS.every((k) => config[k] !== '');
}

interface ChipProps {
  option: CatalogOption;
  selected: boolean;
  onSelect: () => void;
}

function Chip({ option, selected, onSelect }: ChipProps) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
      title={option.description}
      style={{
        background: selected ? 'rgba(150,220,120,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 4,
        color: selected ? 'var(--cyan-glow)' : 'var(--text-dim)',
        padding: '6px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        letterSpacing: '0.06em',
        cursor: 'pointer',
        boxShadow: selected ? '0 0 10px rgba(150,220,120,0.15)' : 'none',
        transition: 'border-color 0.18s, color 0.18s, background 0.18s, box-shadow 0.18s',
        whiteSpace: 'nowrap',
        outline: 'none',
        position: 'relative',
      }}
    >
      {selected && (
        <span style={{
          position: 'absolute',
          top: -1,
          right: -1,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--cyan-glow)',
          boxShadow: '0 0 6px var(--cyan-glow)',
        }} />
      )}
      {option.value}
    </motion.button>
  );
}

interface FunctionToggleProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}

function FunctionToggle({ label, enabled, onToggle }: FunctionToggleProps) {
  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 0',
        color: enabled ? 'var(--silver-albedo)' : 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.68rem',
        letterSpacing: '0.04em',
        textAlign: 'left',
        outline: 'none',
      }}
    >
      <span style={{
        width: 14,
        height: 14,
        border: `1px solid ${enabled ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.2)'}`,
        borderRadius: 2,
        background: enabled ? 'rgba(150,220,120,0.15)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'border-color 0.15s, background 0.15s',
      }}>
        {enabled && <span style={{ color: 'var(--cyan-glow)', fontSize: '0.55rem', lineHeight: 1 }}>✓</span>}
      </span>
      {label}
    </motion.button>
  );
}

export default function DesignCatalog({ config, onUpdate, onContinue }: DesignCatalogProps) {
  const [debugOpen, setDebugOpen] = useState(true);
  const complete = isComplete(config);

  const handleFunctionToggle = (fn: string) => {
    const current = config.enabledFunctions;
    const next = current.includes(fn) ? current.filter((f) => f !== fn) : [...current, fn];
    onUpdate('enabledFunctions', next);
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* MAIN CATALOG PANEL */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 32px 100px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(150,220,120,0.2) transparent',
      }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          style={{ marginBottom: 40 }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--cyan-glow)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            YURI // DESIGN ARCHITECT
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            fontWeight: 700,
            color: 'var(--silver-albedo)',
            margin: 0,
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
          }}>
            Customize Your Audit Interface
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-dim)',
            marginTop: 10,
            maxWidth: 480,
            lineHeight: 1.6,
          }}>
            Select a design configuration. Your choices shape the audit interface, motion behavior, and output payload.
          </p>
        </motion.div>

        {/* Category rows */}
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: 32 }}
        >
          {CATALOG_CATEGORIES.map((cat) => (
            <motion.div key={cat.key} variants={ROW_VARIANTS}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  color: 'var(--bg-void)',
                  background: config[cat.key] ? 'var(--cyan-glow)' : 'var(--text-dim)',
                  padding: '2px 6px',
                  borderRadius: 2,
                  letterSpacing: '0.12em',
                  transition: 'background 0.2s',
                }}>
                  {cat.code}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: config[cat.key] ? 'var(--silver-albedo)' : 'var(--text-dim)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  transition: 'color 0.2s',
                }}>
                  {cat.label}
                </span>
                {config[cat.key] && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6rem',
                      color: 'var(--cyan-glow)',
                      opacity: 0.7,
                    }}
                  >
                    → {config[cat.key]}
                  </motion.span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {cat.options.map((opt) => (
                  <Chip
                    key={opt.value}
                    option={opt}
                    selected={config[cat.key] === opt.value}
                    onSelect={() => onUpdate(cat.key, opt.value)}
                  />
                ))}
              </div>
            </motion.div>
          ))}

          {/* Function toggles section */}
          <motion.div variants={ROW_VARIANTS}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                color: 'var(--bg-void)',
                background: 'var(--gold-solar)',
                padding: '2px 6px',
                borderRadius: 2,
                letterSpacing: '0.12em',
              }}>
                FN
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--silver-albedo)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                Interactive Functions
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                color: 'var(--text-dim)',
              }}>
                {config.enabledFunctions.length}/{FUNCTION_TOGGLES.length} enabled
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px 24px',
            }}>
              {FUNCTION_TOGGLES.map((fn) => (
                <FunctionToggle
                  key={fn}
                  label={fn}
                  enabled={config.enabledFunctions.includes(fn)}
                  onToggle={() => handleFunctionToggle(fn)}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Progress indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {REQUIRED_KEYS.map((k) => (
            <div
              key={k}
              style={{
                width: 24,
                height: 3,
                borderRadius: 2,
                background: config[k] ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.25s',
              }}
            />
          ))}
          <span style={{
            marginLeft: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-dim)',
          }}>
            {REQUIRED_KEYS.filter((k) => config[k]).length}/{REQUIRED_KEYS.length} configured
          </span>
        </motion.div>
      </div>

      {/* RIGHT: DEBUG PANEL */}
      <div style={{
        width: 280,
        flexShrink: 0,
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0,0,0,0.4)',
      }}>
        <button
          onClick={() => setDebugOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.12em',
            padding: '12px 16px',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            outline: 'none',
          }}
        >
          YuriDesignConfig
          <span style={{ opacity: 0.5 }}>{debugOpen ? '▲' : '▼'}</span>
        </button>
        <AnimatePresence initial={false}>
          {debugOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <pre style={{
                margin: 0,
                padding: '16px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                lineHeight: 1.7,
                color: 'var(--text-dim)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {(() => {
                  const lines = JSON.stringify(config, null, 2).split('\n');
                  return lines.map((line, i) => {
                    const isKey = /"[^"]+":/.test(line);
                    const isValue = !isKey && (line.includes('true') || line.includes('false') || line.includes('"'));
                    return (
                      <span key={i}>
                        {isKey ? (
                          <>
                            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{line.replace(/: .+/, ': ')}</span>
                            <span style={{ color: 'var(--gold-solar)' }}>{line.replace(/^.*?: /, '')}</span>
                          </>
                        ) : (
                          <span>{line}</span>
                        )}
                        {'\n'}
                      </span>
                    );
                  });
                })()}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tooltip area */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          marginTop: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-dim)',
          lineHeight: 1.6,
        }}>
          <div style={{ color: 'var(--cyan-glow)', marginBottom: 4, letterSpacing: '0.1em' }}>PROTO · v1.0</div>
          Hover any chip for description. Select all 6 categories to continue.
        </div>

        {/* Continue CTA */}
        <motion.button
          onClick={complete ? onContinue : undefined}
          whileHover={complete ? { scale: 1.02 } : {}}
          whileTap={complete ? { scale: 0.98 } : {}}
          style={{
            margin: '16px',
            padding: '14px',
            background: complete ? 'rgba(150,220,120,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${complete ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            color: complete ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.2)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            cursor: complete ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            textTransform: 'uppercase',
            boxShadow: complete ? '0 0 20px rgba(150,220,120,0.08)' : 'none',
            outline: 'none',
          }}
        >
          {complete ? 'Continue →' : `Select ${REQUIRED_KEYS.filter((k) => !config[k]).length} more`}
        </motion.button>
      </div>
    </div>
  );
}
