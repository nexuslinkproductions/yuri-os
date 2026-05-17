import React, { useMemo, useState } from 'react';
import {
    VIENNA_BRIEFING_COPY,
    VIENNA_CLIENTS,
    VIENNA_GAP_LABELS,
    VIENNA_TIER_LABELS,
    VIENNA_TIER_ORDER,
    type ViennaClientResearchItem,
    type ViennaClientTier
} from '../lib/viennaClientResearchData';

interface ViennaClientResearchProps {
    surfaceLabel?: string;
}

type ViewMode = 'grid' | 'pipeline';
type TierFilter = 'ALL' | ViennaClientTier;

const sectorTone: Record<string, string> = {
    Automotive: 'rgba(255,184,0,0.9)',
    Security: 'rgba(118,185,0,0.95)',
    'Real Estate': 'rgba(0,242,255,0.85)',
    Dental: 'rgba(255,255,255,0.86)',
    Fashion: 'rgba(255,110,180,0.88)',
    'B2B Services': 'rgba(255,184,0,0.82)',
    Finance: 'rgba(255,120,120,0.9)',
    'SaaS / Startup': 'rgba(118,185,0,0.9)',
    'PR / Agency': 'rgba(0,242,255,0.82)',
    Logistics: 'rgba(255,184,0,0.78)',
    'E-Commerce': 'rgba(255,255,255,0.78)'
};

const defaultClient = VIENNA_CLIENTS[0];

export default function ViennaClientResearch({ surfaceLabel = 'Research' }: ViennaClientResearchProps) {
    const [query, setQuery] = useState('');
    const [tierFilter, setTierFilter] = useState<TierFilter>('ALL');
    const [sectorFilter, setSectorFilter] = useState<string>('ALL');
    const [districtFilter, setDistrictFilter] = useState<string>('ALL');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedId, setSelectedId] = useState<number>(defaultClient.n);

    const sectors = useMemo(() => {
        return ['ALL', ...Array.from(new Set(VIENNA_CLIENTS.map((client) => client.sector))).sort((a, b) => a.localeCompare(b))];
    }, []);

    const districts = useMemo(() => {
        return ['ALL', ...Array.from(new Set(VIENNA_CLIENTS.map((client) => client.district))).sort((a, b) => a.localeCompare(b))];
    }, []);

    const filteredClients = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return VIENNA_CLIENTS.filter((client) => {
            if (tierFilter !== 'ALL' && client.tier !== tierFilter) return false;
            if (sectorFilter !== 'ALL' && client.sector !== sectorFilter) return false;
            if (districtFilter !== 'ALL' && client.district !== districtFilter) return false;

            if (!normalized) return true;

            const haystack = [
                client.name,
                client.url,
                client.district,
                client.sector,
                client.tier,
                client.rev,
                client.web,
                client.social,
                client.contact,
                client.pitch,
                client.why,
                ...(client.priorities || []),
                ...(client.gaps || [])
            ].join(' ').toLowerCase();

            return haystack.includes(normalized);
        });
    }, [query, tierFilter, sectorFilter, districtFilter]);

    const selectedClient = useMemo(() => {
        return filteredClients.find((client) => client.n === selectedId) || filteredClients[0] || VIENNA_CLIENTS.find((client) => client.n === selectedId) || defaultClient;
    }, [filteredClients, selectedId]);

    const totals = useMemo(() => {
        const byTier = VIENNA_TIER_ORDER.reduce((acc, tier) => {
            acc[tier] = VIENNA_CLIENTS.filter((client) => client.tier === tier).length;
            return acc;
        }, {} as Record<ViennaClientTier, number>);

        return {
            total: VIENNA_CLIENTS.length,
            sectors: sectors.length - 1,
            districts: districts.length - 1,
            byTier
        };
    }, [districts.length, sectors.length]);

    const resetFilters = () => {
        setQuery('');
        setTierFilter('ALL');
        setSectorFilter('ALL');
        setDistrictFilter('ALL');
    };

    const openWebsite = (url: string) => {
        const href = url.startsWith('http') ? url : `https://${url}`;
        window.open(href, '_blank', 'noopener,noreferrer');
    };

    const renderClientCard = (client: ViennaClientResearchItem) => {
        const active = client.n === selectedId;

        return (
            <button
                key={client.n}
                type="button"
                onClick={() => setSelectedId(client.n)}
                style={{
                    textAlign: 'left',
                    padding: '16px',
                    borderRadius: '18px',
                    border: `1px solid ${active ? 'rgba(220,20,60,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(220,20,60,0.08)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                    cursor: 'pointer',
                    transition: 'transform 0.16s ease, border-color 0.16s ease, background 0.16s ease',
                    transform: active ? 'translateY(-1px)' : 'translateY(0)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                    <div>
                        <div className="text-mono" style={{ fontSize: '0.5rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.35)' }}>
                            {String(client.n).padStart(2, '0')} · {client.tier} · {VIENNA_TIER_LABELS[client.tier]}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '1rem', fontWeight: 800, lineHeight: 1.2 }}>
                            {client.name}
                        </div>
                    </div>
                    {client.star ? (
                        <div className="text-mono" style={{ fontSize: '0.5rem', letterSpacing: '0.18em', color: 'rgba(220,20,60,0.95)' }}>
                            TOP
                        </div>
                    ) : null}
                </div>

                <div style={{ marginTop: '10px', color: 'rgba(255,255,255,0.66)', lineHeight: 1.5, fontSize: '0.9rem' }}>
                    {client.sector} · {client.district}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                    {client.gaps.slice(0, 5).map((gap) => (
                        <span
                            key={gap}
                            className="text-mono"
                            style={{
                                padding: '4px 7px',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                fontSize: '0.5rem',
                                color: 'rgba(255,255,255,0.72)'
                            }}
                        >
                            {gap} {VIENNA_GAP_LABELS[gap] || gap}
                        </span>
                    ))}
                </div>

                <div style={{ marginTop: '12px', fontSize: '0.88rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>
                    {client.pitch}
                </div>
            </button>
        );
    };

    return (
        <div
            style={{
                height: '100%',
                minHeight: '100%',
                overflow: 'auto',
                padding: '18px',
                background: 'linear-gradient(180deg, rgba(4,4,4,0.98), rgba(10,10,10,0.98))',
                color: '#f3f3f3'
            }}
        >
            <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'grid', gap: '16px' }}>
                <header
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '16px',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        padding: '18px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '20px',
                        background: 'rgba(255,255,255,0.03)'
                    }}
                >
                    <div style={{ maxWidth: '900px' }}>
                        <div className="text-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.36em', color: 'rgba(255,255,255,0.42)', marginBottom: '10px' }}>
                            YURI / {surfaceLabel}
                        </div>
                        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.4rem)', lineHeight: 0.96, letterSpacing: '-0.05em' }}>
                            {VIENNA_BRIEFING_COPY.title}
                        </h1>
                        <p style={{ margin: '10px 0 0', maxWidth: '72ch', fontSize: '1rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.68)' }}>
                            {VIENNA_BRIEFING_COPY.subtitle}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))' }}>
                        {[
                            { label: 'Targets', value: totals.total, tone: 'var(--red-fusion)' },
                            { label: 'Sectors', value: totals.sectors, tone: sectorTone['SaaS / Startup'] },
                            { label: 'Districts', value: totals.districts, tone: 'var(--gold-solar)' },
                            { label: 'Focus', value: 'Vienna', tone: 'rgba(255,255,255,0.88)' }
                        ].map((item) => (
                            <div
                                key={item.label}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(0,0,0,0.2)'
                                }}
                            >
                                <div className="text-mono" style={{ fontSize: '0.48rem', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.34)' }}>
                                    {item.label}
                                </div>
                                <div className="text-mono" style={{ marginTop: '8px', fontSize: '1.2rem', fontWeight: 800, color: item.tone }}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </header>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
                        gap: '14px',
                        alignItems: 'start'
                    }}
                >
                    <div style={{ display: 'grid', gap: '14px' }}>
                        <div
                            style={{
                                display: 'flex',
                                gap: '10px',
                                flexWrap: 'wrap',
                                padding: '14px 16px',
                                borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)',
                                alignItems: 'center'
                            }}
                        >
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search company, sector, district, contact, pitch..."
                                className="text-mono"
                                style={{
                                    flex: '1 1 240px',
                                    minWidth: 0,
                                    background: 'transparent',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    letterSpacing: '0.08em'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {(['grid', 'pipeline'] as ViewMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setViewMode(mode)}
                                        className="text-mono"
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '999px',
                                            border: `1px solid ${viewMode === mode ? 'rgba(220,20,60,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                            background: viewMode === mode ? 'rgba(220,20,60,0.12)' : 'rgba(255,255,255,0.03)',
                                            color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.68)',
                                            letterSpacing: '0.16em',
                                            fontSize: '0.52rem'
                                        }}
                                    >
                                        {mode.toUpperCase()}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="text-mono"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: 'rgba(255,255,255,0.68)',
                                        letterSpacing: '0.16em',
                                        fontSize: '0.52rem'
                                    }}
                                >
                                    RESET
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setTierFilter('ALL')}
                                className="text-mono"
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    border: `1px solid ${tierFilter === 'ALL' ? 'rgba(220,20,60,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                    background: tierFilter === 'ALL' ? 'rgba(220,20,60,0.12)' : 'rgba(255,255,255,0.03)',
                                    color: tierFilter === 'ALL' ? '#fff' : 'rgba(255,255,255,0.72)',
                                    letterSpacing: '0.16em',
                                    fontSize: '0.52rem'
                                }}
                            >
                                ALL TIERS
                            </button>
                            {VIENNA_TIER_ORDER.map((tier) => (
                                <button
                                    type="button"
                                    key={tier}
                                    onClick={() => setTierFilter(tier)}
                                    className="text-mono"
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '999px',
                                        border: `1px solid ${tierFilter === tier ? 'rgba(220,20,60,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                        background: tierFilter === tier ? 'rgba(220,20,60,0.12)' : 'rgba(255,255,255,0.03)',
                                        color: tierFilter === tier ? '#fff' : 'rgba(255,255,255,0.72)',
                                        letterSpacing: '0.16em',
                                        fontSize: '0.52rem'
                                    }}
                                >
                                    {tier} · {VIENNA_TIER_LABELS[tier]}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                            <select
                                value={sectorFilter}
                                onChange={(e) => setSectorFilter(e.target.value)}
                                className="text-mono"
                                style={{
                                    padding: '11px 12px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: '#fff',
                                    outline: 'none'
                                }}
                            >
                                {sectors.map((sector) => (
                                    <option key={sector} value={sector}>
                                        {sector === 'ALL' ? 'All sectors' : sector}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={districtFilter}
                                onChange={(e) => setDistrictFilter(e.target.value)}
                                className="text-mono"
                                style={{
                                    padding: '11px 12px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: '#fff',
                                    outline: 'none'
                                }}
                            >
                                {districts.map((district) => (
                                    <option key={district} value={district}>
                                        {district === 'ALL' ? 'All districts' : district}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gap: '10px',
                                gridTemplateColumns:
                                    viewMode === 'grid'
                                        ? 'repeat(auto-fit, minmax(280px, 1fr))'
                                        : 'repeat(auto-fit, minmax(240px, 1fr))'
                            }}
                        >
                            {filteredClients.length > 0 ? (
                                (viewMode === 'grid' ? filteredClients : filteredClients).map((client) => renderClientCard(client))
                            ) : (
                                <div
                                    style={{
                                        gridColumn: '1 / -1',
                                        padding: '28px',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.03)'
                                    }}
                                >
                                    <div className="text-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.42)', marginBottom: '10px' }}>
                                        EMPTY STATE
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>No clients match the current filters.</div>
                                    <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.66)', lineHeight: 1.6 }}>
                                        Clear one or more filters to reopen the Vienna set.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        style={{
                                            marginTop: '14px',
                                            padding: '10px 14px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: '#fff'
                                        }}
                                    >
                                        Reset filters
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <aside
                        style={{
                            position: 'sticky',
                            top: '18px',
                            display: 'grid',
                            gap: '14px'
                        }}
                    >
                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '20px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                                CURRENT BRIEF
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '1.3rem', fontWeight: 800 }}>
                                {selectedClient.name}
                            </div>
                            <div className="text-mono" style={{ marginTop: '6px', fontSize: '0.58rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.38)' }}>
                                {selectedClient.sector} / {selectedClient.district} / {selectedClient.tier}
                            </div>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.48)' }}>Revenue</span>
                                    <span style={{ fontWeight: 700 }}>{selectedClient.rev}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.48)' }}>Web quality</span>
                                    <span style={{ fontWeight: 700 }}>{selectedClient.web}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.48)' }}>Social</span>
                                    <span style={{ fontWeight: 700 }}>{selectedClient.social}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.48)' }}>Contact</span>
                                    <span style={{ fontWeight: 700, textAlign: 'right' }}>{selectedClient.contact}</span>
                                </div>
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '20px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                                PITCH
                            </div>
                            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                                {selectedClient.pitch}
                            </p>
                        </div>

                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '20px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.42)' }}>
                                WHY THIS TARGET
                            </div>
                            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.72)', lineHeight: 1.65 }}>
                                {selectedClient.why}
                            </p>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                                {selectedClient.gaps.map((gap) => (
                                    <span
                                        key={gap}
                                        className="text-mono"
                                        style={{
                                            padding: '5px 8px',
                                            borderRadius: '999px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            fontSize: '0.5rem',
                                            color: 'rgba(255,255,255,0.72)'
                                        }}
                                    >
                                        {gap} {VIENNA_GAP_LABELS[gap] || gap}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div
                            style={{
                                padding: '18px',
                                borderRadius: '20px',
                                border: '1px solid rgba(220,20,60,0.24)',
                                background: 'linear-gradient(180deg, rgba(220,20,60,0.12), rgba(255,255,255,0.03))'
                            }}
                        >
                            <div className="text-mono" style={{ fontSize: '0.55rem', letterSpacing: '0.34em', color: 'rgba(255,255,255,0.5)' }}>
                                NEXT ACTIONS
                            </div>
                            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                                {selectedClient.priorities.map((priority, index) => (
                                    <div
                                        key={priority}
                                        style={{
                                            display: 'flex',
                                            gap: '10px',
                                            alignItems: 'flex-start',
                                            padding: '10px 12px',
                                            borderRadius: '14px',
                                            background: 'rgba(0,0,0,0.22)',
                                            border: '1px solid rgba(255,255,255,0.06)'
                                        }}
                                    >
                                        <span
                                            className="text-mono"
                                            style={{
                                                color: 'rgba(220,20,60,0.92)',
                                                fontSize: '0.55rem',
                                                letterSpacing: '0.18em'
                                            }}
                                        >
                                            0{index + 1}
                                        </span>
                                        <span style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{priority}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => openWebsite(selectedClient.url)}
                            style={{
                                padding: '13px 16px',
                                borderRadius: '999px',
                                border: '1px solid rgba(220,20,60,0.35)',
                                background: 'rgba(220,20,60,0.14)',
                                color: '#fff',
                                fontWeight: 800,
                                letterSpacing: '0.08em'
                            }}
                        >
                            Open target website
                        </button>
                    </aside>
                </section>
            </div>
        </div>
    );
}
