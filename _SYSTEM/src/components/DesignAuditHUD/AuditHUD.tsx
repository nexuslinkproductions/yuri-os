import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  YuriDesignConfig,
  AuditSection,
  AuditFinding,
  AuditSuggestion,
  YURI_DESIGN_HANDOFF,
  MOCK_AUDIT_SECTIONS,
  MOCK_SUGGESTIONS,
} from './types';

interface AuditHUDProps {
  config: YuriDesignConfig;
  onReset: () => void;
}

interface ScoreMeterProps {
  score: number;
  size?: 'lg' | 'sm';
  delay?: number;
}

function ScoreMeter({ score, size = 'sm', delay = 0 }: ScoreMeterProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (!barRef.current) return;
    if (shouldReduce) {
      barRef.current.style.transform = `scaleX(${score / 100})`;
      return;
    }
    const t = setTimeout(() => {
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${score / 100})`;
      }
    }, delay);
    return () => clearTimeout(t);
  }, [score, delay, shouldReduce]);

  const height = size === 'lg' ? 6 : 3;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.07)',
      borderRadius: 2,
      height,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div
        ref={barRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: score >= 80 ? 'var(--cyan-glow)' : score >= 70 ? 'var(--gold-solar)' : 'var(--red-fusion)',
          transform: 'scaleX(0)',
          transformOrigin: 'left center',
          transition: shouldReduce ? 'none' : 'transform 0.9s cubic-bezier(0.23,1,0.32,1)',
          borderRadius: 2,
          boxShadow: `0 0 8px ${score >= 80 ? 'rgba(150,220,120,0.3)' : score >= 70 ? 'rgba(101,163,13,0.3)' : 'rgba(239,93,46,0.3)'}`,
        }}
      />
    </div>
  );
}

const FINDING_ICONS: Record<string, string> = {
  strength: '✓',
  issue: '✕',
  note: '◈',
};

const FINDING_COLORS: Record<string, string> = {
  strength: 'var(--cyan-glow)',
  issue: 'var(--red-fusion)',
  note: 'var(--gold-solar)',
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'var(--red-fusion)',
  MED: 'var(--gold-solar)',
  LOW: 'var(--cyan-glow)',
};

interface FindingRowProps {
  finding: AuditFinding;
  onHover: (finding: AuditFinding | null) => void;
  isInspected: boolean;
}

function FindingRow({ finding, onHover, isInspected }: FindingRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onMouseEnter={() => onHover(finding)}
      onMouseLeave={() => onHover(null)}
      style={{
        borderRadius: 4,
        border: `1px solid ${isInspected ? 'rgba(150,220,120,0.3)' : 'transparent'}`,
        outline: isInspected ? '1px solid rgba(150,220,120,0.15)' : 'none',
        transition: 'border-color 0.15s, outline 0.15s',
        marginBottom: 4,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          width: '100%',
          background: isInspected ? 'rgba(150,220,120,0.04)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '10px 12px',
          textAlign: 'left',
          transition: 'background 0.15s',
          outline: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: FINDING_COLORS[finding.type],
          flexShrink: 0,
          marginTop: 1,
          fontWeight: 700,
        }}>
          {FINDING_ICONS[finding.type]}
        </span>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          color: 'var(--silver-albedo)',
          lineHeight: 1.5,
          flex: 1,
        }}>
          {finding.text}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          color: 'var(--text-dim)',
          flexShrink: 0,
          marginTop: 2,
          opacity: 0.5,
        }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 12px 10px 34px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              lineHeight: 1.6,
              borderTop: '1px solid rgba(255,255,255,0.04)',
              paddingTop: 8,
              marginLeft: -22,
              paddingLeft: 34,
            }}>
              {finding.detail}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AuditHUD({ config, onReset }: AuditHUDProps) {
  const [selectedSection, setSelectedSection] = useState<AuditSection>(MOCK_AUDIT_SECTIONS[0]);
  const [inspectedFinding, setInspectedFinding] = useState<AuditFinding | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const sessionId = useRef(`SID-${Date.now().toString(36).toUpperCase()}`);
  const generatedAt = useRef(new Date().toISOString());

  const overallScore = Math.round(
    MOCK_AUDIT_SECTIONS.reduce((acc, s) => acc + s.score, 0) / MOCK_AUDIT_SECTIONS.length
  );

  const strongest = MOCK_AUDIT_SECTIONS.reduce((a, b) => (a.score > b.score ? a : b));
  const weakest = MOCK_AUDIT_SECTIONS.reduce((a, b) => (a.score < b.score ? a : b));

  const buildHandoff = (): YURI_DESIGN_HANDOFF => ({
    schema: '1.0.0',
    generated: generatedAt.current,
    config,
    auditSummary: {
      overallScore,
      strongestSection: strongest.label,
      weakestSection: weakest.label,
      sectionScores: Object.fromEntries(MOCK_AUDIT_SECTIONS.map((s) => [s.id, s.score])),
    },
    suggestions: MOCK_SUGGESTIONS,
    styleDirection: `${config.theme} / ${config.componentStyle} / ${config.motionIntensity} motion`,
    nextBuildInstructions: [
      `Apply "${config.theme}" theme tokens to all surface components`,
      `Set motion duration based on "${config.motionIntensity}" profile`,
      `Implement "${config.backgroundLife}" background animation`,
      `Use "${config.layoutMode}" layout structure for audit views`,
      'Fix HIGH priority spacing inconsistency (4px base unit)',
      'Add aria-live="polite" to all score meter containers',
      'Apply --transition-master to all missing hover states',
    ],
  });

  const handleExport = () => {
    const payload = buildHandoff();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YURI_DESIGN_HANDOFF_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const payload = buildHandoff();
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* HEADER BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        height: 48,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
          DOC
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--silver-albedo)' }}>
          YURI HUD OS — Component Architecture v1
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          color: 'rgba(0,0,0,0.8)',
          background: 'var(--cyan-glow)',
          padding: '2px 8px',
          borderRadius: 3,
          letterSpacing: '0.06em',
        }}>
          {config.theme}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          color: 'var(--text-dim)',
          marginLeft: 4,
        }}>
          {sessionId.current}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <motion.button
            onClick={handleCopy}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 3,
              color: copied ? 'var(--cyan-glow)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              transition: 'color 0.2s, border-color 0.2s',
              outline: 'none',
            }}
          >
            {copied ? '✓ Copied' : 'Copy Handoff'}
          </motion.button>
          <motion.button
            onClick={handleExport}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: 'rgba(150,220,120,0.08)',
              border: '1px solid var(--cyan-glow)',
              borderRadius: 3,
              color: 'var(--cyan-glow)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              boxShadow: '0 0 12px rgba(150,220,120,0.08)',
              outline: 'none',
            }}
          >
            ↓ Export HANDOFF.json
          </motion.button>
          <button
            onClick={() => setDebugOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 3,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              padding: '5px 10px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              outline: 'none',
            }}
          >
            Config
          </button>
          <button
            onClick={onReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.25)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              padding: '5px 8px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflowY: 'auto',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(150,220,120,0.15) transparent',
        }}>
          {/* Overall score */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Overall Quality Score
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.4rem',
                fontWeight: 700,
                color: 'var(--silver-albedo)',
                lineHeight: 1,
              }}>
                {overallScore}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                /100
              </span>
            </div>
            <ScoreMeter score={overallScore} size="lg" delay={200} />
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 10,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
            }}>
              <span>↑ {strongest.label}</span>
              <span>↓ {weakest.label}</span>
            </div>
          </motion.div>

          {/* Section nav */}
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 10,
              padding: '0 4px',
            }}>
              Audit Sections
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {MOCK_AUDIT_SECTIONS.map((section, idx) => {
                const isActive = selectedSection.id === section.id;
                return (
                  <motion.button
                    key={section.id}
                    onClick={() => setSelectedSection(section)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.07, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    whileHover={{ x: 2 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: isActive ? 'rgba(150,220,120,0.06)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(150,220,120,0.2)' : 'transparent'}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                      textAlign: 'left',
                      outline: 'none',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.55rem',
                      color: isActive ? 'rgba(0,0,0,0.8)' : 'var(--text-dim)',
                      background: isActive ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.08)',
                      padding: '2px 5px',
                      borderRadius: 2,
                      letterSpacing: '0.08em',
                      flexShrink: 0,
                      transition: 'background 0.15s, color 0.15s',
                    }}>
                      {section.code}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.78rem',
                        color: isActive ? 'var(--silver-albedo)' : 'var(--text-dim)',
                        marginBottom: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        transition: 'color 0.15s',
                      }}>
                        {section.label}
                      </div>
                      <ScoreMeter score={section.score} size="sm" delay={idx * 100 + 400} />
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: section.score >= 80 ? 'var(--cyan-glow)' : section.score >= 70 ? 'var(--gold-solar)' : 'var(--red-fusion)',
                      flexShrink: 0,
                    }}>
                      {section.score}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Suggestions nav */}
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: 8,
              padding: '0 4px',
            }}>
              {MOCK_SUGGESTIONS.length} Suggestions
            </div>
            {MOCK_SUGGESTIONS.map((s) => (
              <div
                key={s.text}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '6px 8px',
                  alignItems: 'flex-start',
                  marginBottom: 4,
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  color: 'rgba(0,0,0,0.8)',
                  background: PRIORITY_COLORS[s.priority],
                  padding: '2px 5px',
                  borderRadius: 2,
                  flexShrink: 0,
                  marginTop: 1,
                  letterSpacing: '0.06em',
                }}>
                  {s.priority}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.72rem',
                  color: 'var(--text-dim)',
                  lineHeight: 1.4,
                }}>
                  {s.category}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Selected section detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedSection.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(150,220,120,0.15) transparent' }}
            >
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.55rem',
                      color: 'rgba(0,0,0,0.8)',
                      background: 'var(--cyan-glow)',
                      padding: '2px 6px',
                      borderRadius: 2,
                      letterSpacing: '0.12em',
                    }}>
                      {selectedSection.code}
                    </span>
                    <h2 style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: 'var(--silver-albedo)',
                      margin: 0,
                    }}>
                      {selectedSection.label}
                    </h2>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                      color: selectedSection.score >= 80 ? 'var(--cyan-glow)' : selectedSection.score >= 70 ? 'var(--gold-solar)' : 'var(--red-fusion)',
                      border: `1px solid currentColor`,
                      borderRadius: 3,
                      padding: '2px 8px',
                      letterSpacing: '0.1em',
                    }}>
                      {selectedSection.verdict}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '2rem',
                      fontWeight: 700,
                      color: 'var(--silver-albedo)',
                      lineHeight: 1,
                    }}>
                      {selectedSection.score}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      /100
                    </span>
                  </div>
                  <ScoreMeter score={selectedSection.score} size="lg" delay={0} />
                </div>
              </div>

              {/* Summary */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                padding: '14px 16px',
                marginBottom: 20,
                fontFamily: 'var(--font-body)',
                fontSize: '0.82rem',
                color: 'var(--text-dim)',
                lineHeight: 1.7,
              }}>
                {selectedSection.summary}
              </div>

              {/* Findings */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                Findings ({selectedSection.findings.length})
                <span style={{ marginLeft: 10, opacity: 0.5, fontSize: '0.55rem' }}>hover to inspect · click to expand</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {selectedSection.findings.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    onHover={setInspectedFinding}
                    isInspected={inspectedFinding?.id === finding.id}
                  />
                ))}
              </div>

              {/* Suggestions */}
              <div style={{ marginTop: 32 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}>
                  Improvement Suggestions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {MOCK_SUGGESTIONS.map((s) => (
                    <SuggestionCard key={s.text} suggestion={s} />
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* INSPECTOR BAR */}
          <div style={{
            height: 48,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.4)',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.58rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.12em',
              flexShrink: 0,
            }}>
              INSPECTOR
            </span>
            <AnimatePresence mode="wait">
              {inspectedFinding ? (
                <motion.div
                  key={inspectedFinding.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: FINDING_COLORS[inspectedFinding.type],
                    fontWeight: 700,
                  }}>
                    {FINDING_ICONS[inspectedFinding.type]}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    color: 'var(--text-dim)',
                    lineHeight: 1.4,
                  }}>
                    {inspectedFinding.detail}
                  </span>
                </motion.div>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.15)',
                    fontStyle: 'italic',
                  }}
                >
                  Hover a finding to inspect
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT: Debug panel (toggleable) */}
        <AnimatePresence initial={false}>
          {debugOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              style={{
                flexShrink: 0,
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.5)',
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'thin',
              }}
            >
              <div style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                color: 'var(--cyan-glow)',
                letterSpacing: '0.1em',
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                YuriDesignConfig
                <button
                  onClick={() => setDebugOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem', outline: 'none' }}
                >
                  ×
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                lineHeight: 1.7,
                color: 'var(--text-dim)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {JSON.stringify(config, null, 2)}
              </pre>
              <div style={{
                padding: '14px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                color: 'var(--gold-solar)',
                letterSpacing: '0.1em',
                marginTop: 4,
              }}>
                YURI_DESIGN_HANDOFF
              </div>
              <pre style={{
                margin: 0,
                padding: '0 14px 14px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.58rem',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {JSON.stringify({
                  schema: '1.0.0',
                  generated: generatedAt.current,
                  overallScore,
                  sections: MOCK_AUDIT_SECTIONS.length,
                  suggestions: MOCK_SUGGESTIONS.length,
                }, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: AuditSuggestion;
}

function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '12px 14px',
          textAlign: 'left',
          outline: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          color: 'rgba(0,0,0,0.85)',
          background: PRIORITY_COLORS[suggestion.priority],
          padding: '2px 6px',
          borderRadius: 2,
          flexShrink: 0,
          marginTop: 2,
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}>
          {suggestion.priority}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            color: 'var(--text-dim)',
            marginBottom: 3,
            letterSpacing: '0.08em',
          }}>
            {suggestion.category}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--silver-albedo)',
            lineHeight: 1.4,
          }}>
            {suggestion.text}
          </div>
        </div>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem', flexShrink: 0, marginTop: 2, opacity: 0.5 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 14px 12px 42px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              lineHeight: 1.6,
              borderTop: '1px solid rgba(255,255,255,0.04)',
              paddingTop: 8,
            }}>
              <span style={{ color: 'var(--gold-solar)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em' }}>
                IMPACT:{' '}
              </span>
              {suggestion.impact}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
