import React, { useState } from 'react';
import { motion } from 'framer-motion';

type TabId = 'context' | 'research' | 'code' | 'visual' | 'ops';

interface OrbDef {
    id: string;
    label: string;
    summary: string;
    type: 'skill' | 'tool' | 'danger';
    tab: TabId[];
    icon: string;
}

const ORBS: OrbDef[] = [
    // Context
    { id: 'memory',   label: 'Memory',      summary: 'Active project memory — session facts, user patterns, aversion nodes.',                  type: 'skill',  tab: ['context'], icon: '◈' },
    { id: 'graph',    label: 'Graph',        summary: 'GitNexus knowledge graph — symbol map, execution flows, impact radius.',                  type: 'tool',   tab: ['context', 'code'], icon: '⬡' },
    { id: 'session',  label: 'Session',      summary: 'Current session state — token budget, phase, active tasks.',                              type: 'skill',  tab: ['context', 'ops'], icon: '◉' },
    { id: 'vault',    label: 'Vault',        summary: 'Obsidian vault sync — live note retrieval and ingestion status.',                          type: 'tool',   tab: ['context'], icon: '◎' },

    // Research
    { id: 'search',   label: 'Web Search',   summary: 'Live web research through approved browser and source tools. Routes through Comet for browser tasks.', type: 'tool',   tab: ['research'], icon: '⊕' },
    { id: 'albedo',   label: 'Albedo',       summary: 'Semantic knowledge search across the YURI vault and project corpus.',                   type: 'skill',  tab: ['research'], icon: '◎' },
    { id: 'corpus',   label: 'Corpus',       summary: 'Oracle research corpus — curated papers, transcripts, and reference documents.',            type: 'skill',  tab: ['research'], icon: '▣' },
    { id: 'ingest',   label: 'Ingest',       summary: 'Pull new documents, videos, or URLs into the vault for RAG indexing.',                     type: 'tool',   tab: ['research'], icon: '↓' },

    // Code
    { id: 'impact',   label: 'Impact',       summary: 'GitNexus impact analysis — blast radius for any symbol before edits.',                     type: 'tool',   tab: ['code'], icon: '⬡' },
    { id: 'context2', label: 'Code Context', summary: 'Full symbol context: callers, callees, execution flows, and dependency map.',              type: 'tool',   tab: ['code'], icon: '◆' },
    { id: 'rename',   label: 'Rename',       summary: 'Safe symbol rename via GitNexus call-graph awareness. Never find-and-replace.',            type: 'tool',   tab: ['code'], icon: '↔' },
    { id: 'forge',    label: 'Neural Forge', summary: 'Multi-model reasoning engine — direct or Aeonic Council deliberation mode.',              type: 'skill',  tab: ['code', 'context'], icon: '◈' },

    // Visual
    { id: 'kie',      label: 'KIE.ai',       summary: 'Primary image generation via api.kie.ai — GPT-4o, Flux Pro, Ideogram, Recraft.',          type: 'tool',   tab: ['visual'], icon: '◆' },
    { id: 'chatgpt',  label: 'ChatGPT Img',  summary: 'Browser-automated image gen via ChatGPT Images 2.0 — DALL-E 3 and GPT-image-1.',         type: 'tool',   tab: ['visual'], icon: '◎' },
    { id: 'gemini',   label: 'Gemini',       summary: 'Remote-controlled Gemini app for Imagen 3 image gen and Veo 2 video generation.',          type: 'tool',   tab: ['visual'], icon: '⊕' },

    // Ops
    { id: 'swarm',    label: 'Swarm',        summary: 'Ruflo-backed swarm — fan-out tasks to parallel agent lanes with shared memory state.',     type: 'skill',  tab: ['ops'], icon: '◉' },
    { id: 'offload',  label: 'Offload',      summary: 'Route heavy tasks to local lanes: Deepseek, Qwen, GPT-OSS, Kimi (cloud).',                type: 'skill',  tab: ['ops'], icon: '↑' },
    { id: 'health',   label: 'Health',       summary: 'System stability — backend heartbeat, swarm sync %, cognitive load, risk band.',           type: 'tool',   tab: ['ops'], icon: '◈' },
    { id: 'tokens',   label: 'Tokens',       summary: 'Token economy dashboard — session and weekly spend, cost per task, ROI routing.',          type: 'tool',   tab: ['ops', 'context'], icon: '▣' },
    { id: 'execute',  label: 'Execute',      summary: 'Controlled shell execution — allowlisted commands only, local workspace boundary.',        type: 'danger', tab: ['ops'], icon: '⚡' },
];

const TYPE_COLOR: Record<OrbDef['type'], string> = {
    skill:  'var(--cyan-glow)',
    tool:   'var(--gold-solar)',
    danger: 'var(--red-fusion)'
};

const TYPE_BG: Record<OrbDef['type'], string> = {
    skill:  'rgba(159,232,115,0.08)',
    tool:   'rgba(118,185,0,0.08)',
    danger: 'rgba(217,112,72,0.1)'
};

interface Props { activeTab: TabId; }

export default function OracleToolOrbs({ activeTab }: Props) {
    const [tooltip, setTooltip] = useState<{ id: string; x: number; y: number } | null>(null);

    const visible = ORBS.filter(o => o.tab.includes(activeTab));

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '8px 4px',
                alignContent: 'flex-start'
            }}>
                {visible.map((orb, i) => (
                    <motion.div key={orb.id}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.04, type: 'spring', stiffness: 300 }}
                        style={{
                            width: 68, height: 68,
                            borderRadius: '50%',
                            background: TYPE_BG[orb.type],
                            border: `1.5px solid ${TYPE_COLOR[orb.type]}`,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            position: 'relative',
                            boxShadow: `0 0 12px ${TYPE_COLOR[orb.type]}22`,
                            flexShrink: 0
                        }}
                        whileHover={{ scale: 1.12, boxShadow: `0 0 20px ${TYPE_COLOR[orb.type]}55` }}
                        onMouseEnter={(e) => setTooltip({ id: orb.id, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                    >
                        {/* Orbit ring */}
                        <motion.div style={{
                            position: 'absolute',
                            inset: -6,
                            borderRadius: '50%',
                            border: `1px solid ${TYPE_COLOR[orb.type]}30`,
                            pointerEvents: 'none'
                        }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                        />
                        <span style={{ fontSize: 18, color: TYPE_COLOR[orb.type] }}>{orb.icon}</span>
                        <span style={{
                            fontSize: 8,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: TYPE_COLOR[orb.type],
                            marginTop: 3,
                            opacity: 0.8,
                            textAlign: 'center',
                            maxWidth: 52
                        }}>{orb.label}</span>
                    </motion.div>
                ))}
            </div>

            {/* Tooltip */}
            {tooltip && (() => {
                const orb = ORBS.find(o => o.id === tooltip.id);
                if (!orb) return null;
                return (
                    <div style={{
                        position: 'fixed',
                        left: Math.min(tooltip.x + 12, window.innerWidth - 260),
                        top: tooltip.y - 10,
                        width: 240,
                        background: 'rgba(10,10,10,0.96)',
                        border: `1px solid ${TYPE_COLOR[orb.type]}44`,
                        borderRadius: 2,
                        padding: '8px 12px',
                        zIndex: 9999,
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: 10, color: TYPE_COLOR[orb.type], letterSpacing: '0.1em', marginBottom: 4 }}>
                            {orb.type.toUpperCase()} — {orb.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(247,247,247,0.75)', lineHeight: 1.5 }}>
                            {orb.summary}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
