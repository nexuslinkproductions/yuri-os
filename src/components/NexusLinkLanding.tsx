import React from 'react';
import {
    designRadarSources,
    independenceData,
    launchOrder,
    navItems,
    researchChecklist,
    researchQueue
} from '../lib/nexuslinkLandingData';

interface NexusLinkLandingProps {
    surfaceLabel?: string;
}

const services = [
    {
        title: 'Video',
        body: 'Cinematic capture, edit finishing, and delivery that matches the job instead of hiding it.'
    },
    {
        title: 'Motion / Design',
        body: 'Titles, motion systems, and clean brand layers that keep the shell legible.'
    },
    {
        title: 'Social',
        body: 'Content rhythm and platform-native output for a public-facing presence that stays active.'
    },
    {
        title: 'Web',
        body: 'Fast landing surfaces with a clear first screen and no clutter on the path to action.'
    },
    {
        title: 'IT / Cybersecurity',
        body: 'Practical infrastructure support that keeps client work safe and operational.'
    },
    {
        title: 'Ad Management',
        body: 'Targeted campaigns and measurement, not spray-and-pray budget burn.'
    }
];

const routeMap: Record<string, string> = {
    NexusLink: 'NEXUSLINK',
    Research: 'RESEARCH',
    Sources: 'SEARCH'
};

export default function NexusLinkLanding({ surfaceLabel = 'NexusLink' }: NexusLinkLandingProps) {
    const go = (moduleName: string) => {
        (window as any).nudimmudEngine?.go(moduleName);
    };

    return (
        <div
            style={{
                minHeight: '100%',
                height: '100%',
                overflowY: 'auto',
                padding: '28px',
                background: 'radial-gradient(circle at top, rgba(220,20,60,0.16), transparent 34%), linear-gradient(180deg, #050505 0%, #090909 52%, #050505 100%)',
                color: '#f3f3f3'
            }}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'grid', gap: '22px' }}>
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '18px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        padding: '16px 18px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '18px',
                        background: 'rgba(255,255,255,0.03)',
                        backdropFilter: 'blur(18px)'
                    }}
                >
                    <div>
                        <div
                            className="text-mono"
                            style={{
                                fontSize: '0.56rem',
                                letterSpacing: '0.36em',
                                color: 'rgba(255,255,255,0.45)',
                                marginBottom: '8px'
                            }}
                        >
                            NUDIMMUD / {surfaceLabel}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                            Public landing module
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {navItems.map((item) => (
                            <button
                                key={item.href}
                                type="button"
                                onClick={() => go(routeMap[item.label] || 'NEXUSLINK')}
                                className="text-mono"
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'rgba(255,255,255,0.78)',
                                    letterSpacing: '0.16em',
                                    fontSize: '0.55rem'
                                }}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </header>

                <section
                    style={{
                        display: 'grid',
                        gap: '22px',
                        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
                        alignItems: 'start'
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: '28px',
                            padding: '34px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))'
                        }}
                    >
                        <div
                            className="text-mono"
                            style={{
                                fontSize: '0.58rem',
                                letterSpacing: '0.4em',
                                color: 'rgba(220,20,60,0.9)',
                                marginBottom: '14px'
                            }}
                        >
                            PUBLIC FACE
                        </div>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: 'clamp(2.8rem, 7vw, 5.8rem)',
                                lineHeight: 0.94,
                                letterSpacing: '-0.06em',
                                maxWidth: '11ch'
                            }}
                        >
                            NexusLink is the public face.
                            <br />
                            Research is the working face.
                        </h1>
                        <p
                            style={{
                                margin: '18px 0 0',
                                maxWidth: '62ch',
                                fontSize: 'clamp(1rem, 1.35vw, 1.3rem)',
                                lineHeight: 1.65,
                                color: 'rgba(255,255,255,0.68)'
                            }}
                        >
                            One shell. One navigation layer. Public landing, internal research, and the design radar stay legible from the first screen.
                        </p>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px' }}>
                            <button
                                type="button"
                                onClick={() => go('RESEARCH')}
                                style={{
                                    padding: '14px 18px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(220,20,60,0.4)',
                                    background: 'rgba(220,20,60,0.16)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em'
                                }}
                            >
                                Open research workspace
                            </button>
                            <button
                                type="button"
                                onClick={() => go('SEARCH')}
                                style={{
                                    padding: '14px 18px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'rgba(255,255,255,0.88)',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em'
                                }}
                            >
                                View sources
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginTop: '28px' }}>
                            {[
                                ['Launch order', launchOrder.length],
                                ['Active briefs', researchQueue.length],
                                ['Brief standard', researchChecklist.length]
                            ].map(([label, value]) => (
                                <div
                                    key={label as string}
                                    style={{
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '18px',
                                        padding: '14px 16px',
                                        background: 'rgba(0,0,0,0.24)'
                                    }}
                                >
                                    <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.34)' }}>
                                        {label}
                                    </div>
                                    <div style={{ marginTop: '8px', fontSize: '1.4rem', fontWeight: 800 }}>{value as number}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: '14px' }}>
                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '24px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                                NAVIGATION
                            </div>
                            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                                {launchOrder.map((item, index) => (
                                    <div
                                        key={item}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 14px',
                                            borderRadius: '16px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: index === 0 ? 'rgba(220,20,60,0.08)' : 'rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        <span
                                            className="text-mono"
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '999px',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                fontSize: '0.56rem',
                                                color: 'rgba(255,255,255,0.7)'
                                            }}
                                        >
                                            0{index + 1}
                                        </span>
                                        <div style={{ fontWeight: 700 }}>{item}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '24px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                                REFERENCE SHELF
                            </div>
                            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                                {designRadarSources.map((source) => (
                                    <div
                                        key={source.name}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '16px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: 'rgba(0,0,0,0.18)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
                                            <div style={{ fontWeight: 800 }}>{source.name}</div>
                                            <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.34)' }}>
                                                {source.file}
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.66)', lineHeight: 1.5, fontSize: '0.92rem' }}>
                                            {source.signal}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                        gap: '12px'
                    }}
                >
                    {services.map((service) => (
                        <div
                            key={service.title}
                            style={{
                                minHeight: '160px',
                                padding: '18px',
                                borderRadius: '22px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.24))'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.52rem', letterSpacing: '0.26em', color: 'rgba(220,20,60,0.86)' }}>
                                SERVICE
                            </div>
                            <div style={{ marginTop: '12px', fontSize: '1.1rem', fontWeight: 800 }}>{service.title}</div>
                            <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.66)', lineHeight: 1.55, fontSize: '0.92rem' }}>
                                {service.body}
                            </p>
                        </div>
                    ))}
                </section>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 0.92fr) minmax(0, 1.08fr)',
                        gap: '14px'
                    }}
                >
                    <div
                        style={{
                            padding: '22px',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.03)'
                        }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                            ACTIVE BRIEFS
                        </div>
                        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                            {researchQueue.map((brief) => (
                                <div
                                    key={brief.name}
                                    style={{
                                        padding: '14px 16px',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(0,0,0,0.2)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 800 }}>{brief.name}</div>
                                        <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.36)' }}>
                                            {brief.status}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.66)', lineHeight: 1.5 }}>
                                        {brief.note}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        style={{
                            padding: '22px',
                            borderRadius: '24px',
                            border: '1px solid rgba(220,20,60,0.22)',
                            background: 'linear-gradient(180deg, rgba(220,20,60,0.12), rgba(255,255,255,0.03))'
                        }}
                    >
                        <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.5)' }}>
                            BRIEF STANDARD
                        </div>
                        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
                            {researchChecklist.map((item) => (
                                <div
                                    key={item}
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(0,0,0,0.2)',
                                        fontWeight: 700
                                    }}
                                >
                                    {item}
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: '20px', color: 'rgba(255,255,255,0.68)', lineHeight: 1.65 }}>
                            Keep the workspace narrow and legible. One source of truth, one clear next step.
                        </div>
                    </div>
                </section>

                {/* Symbiotic Independence — Packet 14 */}
                <section
                    style={{
                        padding: '26px',
                        borderRadius: '28px',
                        border: '1px solid rgba(56,200,100,0.22)',
                        background: 'linear-gradient(180deg, rgba(56,200,100,0.07), rgba(0,0,0,0.28))'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '18px' }}>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(56,200,100,0.8)', marginBottom: '10px' }}>
                                SYMBIOTIC INDEPENDENCE
                            </div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                                {independenceData.tagline}
                            </div>
                            <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.54)', fontSize: '0.88rem' }}>
                                Target ≥{independenceData.target}/100 by {independenceData.deadline} · Current: {independenceData.score}/100 · Fails: {independenceData.failCount}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                            <div style={{ padding: '10px 16px', borderRadius: '999px', border: '1px solid rgba(56,200,100,0.3)', background: 'rgba(56,200,100,0.1)', color: 'rgba(56,200,100,0.9)', fontWeight: 700, fontSize: '0.82rem' }}>
                                {independenceData.score} / 100
                            </div>
                            <div style={{ padding: '10px 16px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'rgba(255,255,255,0.54)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                                {independenceData.verifyCommand}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', marginTop: '20px' }}>
                        {independenceData.activeLanes.map((lane) => (
                            <div
                                key={lane.id}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    background: 'rgba(0,0,0,0.22)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '10px'
                                }}
                            >
                                <div>
                                    <div className="text-mono" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>{lane.id}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.48)', marginTop: '3px' }}>{lane.role}</div>
                                </div>
                                <div
                                    className="text-mono"
                                    style={{
                                        fontSize: '0.46rem',
                                        letterSpacing: '0.2em',
                                        padding: '4px 8px',
                                        borderRadius: '999px',
                                        border: `1px solid ${lane.tier === 'local' ? 'rgba(56,200,100,0.35)' : 'rgba(100,160,255,0.25)'}`,
                                        color: lane.tier === 'local' ? 'rgba(56,200,100,0.8)' : 'rgba(100,160,255,0.7)',
                                        flexShrink: 0
                                    }}
                                >
                                    {lane.tier.toUpperCase()}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
