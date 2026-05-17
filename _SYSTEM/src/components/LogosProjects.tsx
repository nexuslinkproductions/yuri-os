import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/runtime';
import { humanizeLabel } from '../lib/labels';

interface Task {
    id: number;
    title: string;
    status: string;
    priority?: string;
}

interface Project {
    id: number;
    ref: string;
    name: string;
    status: string;
    description: string;
    tasks: Task[];
    health?: number;
    phase?: string;
    assigned_agents?: string[];
}

const PHASES = ['IDEATION', 'DEVELOPMENT', 'REFINEMENT', 'DEPLOYMENT', 'MAINTENANCE'];
const PHASE_COLORS: Record<string, string> = {
    'IDEATION': 'var(--gold-solar)',
    'DEVELOPMENT': 'var(--cyan-glow)',
    'REFINEMENT': '#FFD700',
    'DEPLOYMENT': 'var(--red-fusion)',
    'MAINTENANCE': '#FFFFFF'
};
const PROJECT_STATUS_OPTIONS = ['ACTIVE', 'ON_HOLD', 'BLOCKED', 'COMPLETE'];

const readApiError = async (res: Response) => {
    try {
        const payload = await res.json();
        return payload?.error || payload?.message || res.statusText;
    } catch {
        return res.statusText || 'REQUEST_FAILED';
    }
};

const LogosProjects: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
    const [mutatingProjectId, setMutatingProjectId] = useState<number | null>(null);
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const refreshProjects = async (initialLoad = false) => {
        try {
            if (initialLoad) setLoading(true);
            setLoadError(null);

            const res = await apiFetch('/api/projects');
            if (!res.ok) {
                throw new Error(await readApiError(res));
            }

            const data = await res.json();

            // Enrich projects with simulated metadata if missing
            const enriched = data.map((p: Project) => {
                const completeTasks = p.tasks.filter(t => t.status === 'COMPLETE').length;
                const totalTasks = p.tasks.length;
                const progress = totalTasks > 0 ? (completeTasks / totalTasks) * 100 : 0;
                
                return {
                    ...p,
                    health: p.health || Math.floor(60 + Math.random() * 40),
                    phase: p.phase || (progress > 90 ? 'DEPLOYMENT' : progress > 50 ? 'REFINEMENT' : progress > 10 ? 'DEVELOPMENT' : 'IDEATION'),
                    assigned_agents: p.assigned_agents || ['CLAWDIIA', 'LOGOS']
                };
            });
            
            setProjects(enriched);

            setSelectedProject(current => {
                if (!current) return current;
                const updated = enriched.find((p: Project) => p.id === current.id);
                if (!updated) return current;

                const neuralInsight = (current as any).neuralInsight;
                return neuralInsight ? { ...updated, neuralInsight } : updated;
            });

        } catch (err) {
            console.error('⬡ LOGOS_FETCH_ERROR:', err);
            setLoadError(err instanceof Error ? err.message : 'PROJECTS_UNAVAILABLE');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshProjects(true);
        const interval = setInterval(() => refreshProjects(false), 5000); // Faster pulse for "live" feel
        return () => clearInterval(interval);
    }, []);

    const updateProjectStatus = async (projectId: number, nextStatus: string) => {
        setMutatingProjectId(projectId);
        try {
            const res = await apiFetch(`/api/projects/${projectId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: nextStatus })
            });

            if (!res.ok) {
                throw new Error(await readApiError(res));
            }

            setStatusDrafts(prev => {
                const next = { ...prev };
                delete next[projectId];
                return next;
            });

            await refreshProjects(false);
        } catch (err) {
            console.error('⬡ PROJECT_STATUS_UPDATE_FAILED:', err);
        } finally {
            setMutatingProjectId(null);
        }
    };

    const finalizeActiveProjects = async () => {
        setBulkUpdating(true);
        try {
            const activeProjectIds = projects
                .filter((project: Project) => project.status === 'ACTIVE')
                .map((project: Project) => project.id);

            const res = await apiFetch('/api/projects/active/status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'COMPLETE' })
            });

            if (!res.ok) {
                throw new Error(await readApiError(res));
            }

            setStatusDrafts(prev => {
                const next = { ...prev };
                activeProjectIds.forEach((projectId) => {
                    delete next[projectId];
                });
                return next;
            });

            await refreshProjects(false);
        } catch (err) {
            console.error('⬡ BULK_FINALIZE_FAILED:', err);
        } finally {
            setBulkUpdating(false);
        }
    };

    const totalProjects = projects.length;
    const activeProjects = projects.filter((project: Project) => project.status === 'ACTIVE').length;
    const completeProjects = projects.filter((project: Project) => project.status === 'COMPLETE').length;
    const projectsWithUnfinishedTasks = projects.filter((project: Project) =>
        project.tasks.some((task: Task) => task.status !== 'COMPLETE')
    ).length;
    const isEmptyState = !loading && !loadError && projects.length === 0;

    return (
        <div className="logos-container" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            <header style={{ marginBottom: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-mono glow-text" style={{ color: 'var(--cyan-glow)', letterSpacing: '0.28em', fontSize: '2.2rem', marginBottom: '8px', margin: 0 }}>
                        LOGOS // STRATEGIC BOARD
                    </h1>
                    <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        COGNITIVE PROJECT MATRIX // PHASE TRACKER 9.1
                        <span style={{ color: 'var(--cyan-glow)', opacity: 0.8 }}>[HIGH AUTONOMY ACTIVE]</span>
                    </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                    <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.3, letterSpacing: '0.1em' }}>TOTAL INITIATIVES</div>
                    <div className="text-mono" style={{ fontSize: '1.8rem', color: 'white', fontWeight: 900 }}>{projects.length}</div>
                </div>
            </header>

            <div className="neural-glass" style={{ marginBottom: '30px', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', flex: 1, minWidth: 'min(100%, 640px)' }}>
                    {[
                        { label: 'TOTAL', value: totalProjects },
                        { label: 'ACTIVE', value: activeProjects, tone: 'var(--cyan-glow)' },
                        { label: 'COMPLETE', value: completeProjects, tone: 'var(--gold-solar)' },
                        { label: 'UNFINISHED TASKS', value: projectsWithUnfinishedTasks, tone: 'var(--red-fusion)' }
                    ].map((item) => (
                        <div key={item.label} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}>
                            <div className="text-mono" style={{ fontSize: '0.52rem', opacity: 0.35, letterSpacing: '0.12em' }}>{item.label}</div>
                            <div className="text-mono" style={{ fontSize: '1.15rem', fontWeight: 900, color: item.tone || 'white', marginTop: '4px' }}>{item.value}</div>
                        </div>
                    ))}
                </div>

                <button
                    className="text-mono tactical-btn"
                    onClick={finalizeActiveProjects}
                    disabled={bulkUpdating || activeProjects === 0}
                    style={{
                        padding: '12px 16px',
                        background: bulkUpdating || activeProjects === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,184,0,0.08)',
                        border: '1px solid rgba(255,184,0,0.25)',
                        color: bulkUpdating || activeProjects === 0 ? 'rgba(255,255,255,0.35)' : 'var(--gold-solar)',
                        borderRadius: '4px',
                        cursor: bulkUpdating || activeProjects === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.65rem',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {bulkUpdating ? 'FINALIZING ACTIVE...' : 'FINALIZE ACTIVE PROJECTS'}
                </button>
            </div>

            {loading ? (
                <div className="neural-glass" style={{ padding: '56px 32px', textAlign: 'center', minHeight: '240px', display: 'grid', placeItems: 'center', gap: '12px' }}>
                    <div className="text-mono" style={{ opacity: 0.3, letterSpacing: '0.28em' }}>DECRYPTING DESTINY TABLETS</div>
                    <div style={{ width: '180px', height: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', borderRadius: '999px' }}>
                        <div style={{ width: '42%', height: '100%', background: 'linear-gradient(90deg, transparent, var(--cyan-glow), transparent)', animation: 'logos-pulse 1.4s ease-in-out infinite' }} />
                    </div>
                </div>
            ) : loadError ? (
                <div className="neural-glass" style={{ padding: '40px', borderLeft: '4px solid var(--red-fusion)', display: 'grid', gap: '14px', maxWidth: '720px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: 'var(--red-fusion)' }}>LOGOS OFFLINE</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Project data could not be loaded.</div>
                    <div style={{ fontSize: '0.86rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>
                        {loadError}
                    </div>
                    <button
                        className="text-mono tactical-btn"
                        onClick={() => refreshProjects(true)}
                        style={{
                            padding: '10px 14px',
                            background: 'rgba(0,242,255,0.06)',
                            border: '1px solid rgba(0,242,255,0.22)',
                            color: 'var(--cyan-glow)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.62rem',
                            width: 'fit-content'
                        }}
                    >
                        RETRY LOAD
                    </button>
                </div>
            ) : isEmptyState ? (
                <div className="neural-glass" style={{ padding: '40px', borderLeft: '4px solid var(--gold-solar)', display: 'grid', gap: '14px', maxWidth: '720px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.22em', color: 'var(--gold-solar)' }}>NO PROJECTS FOUND</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>The strategic board is empty right now.</div>
                    <div style={{ fontSize: '0.86rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>
                        Once projects exist in the backend database, they will appear here with live status controls and the finalize action.
                    </div>
                    <button
                        className="text-mono tactical-btn"
                        onClick={() => refreshProjects(true)}
                        style={{
                            padding: '10px 14px',
                            background: 'rgba(255,184,0,0.06)',
                            border: '1px solid rgba(255,184,0,0.22)',
                            color: 'var(--gold-solar)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.62rem',
                            width: 'fit-content'
                        }}
                    >
                        REFRESH BOARD
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '30px' }}>
                    <AnimatePresence>
                        {projects.map((project: Project, pIdx: number) => (
                            <motion.div 
                                key={project.id} 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: pIdx * 0.1 }}
                                className="neural-glass card-hover-effect" 
                                style={{ 
                                    padding: '30px', 
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    gap: '20px',
                                    borderLeft: `4px solid ${PHASE_COLORS[project.phase!] || 'var(--cyan-glow)'}`
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ color: 'var(--cyan-glow)', fontSize: '0.65rem', letterSpacing: '0.2em' }} className="text-mono">
                                            {project.ref}
                                        </span>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>{humanizeLabel(project.name)}</h2>
                                    </div>
                                    <div className="text-mono" style={{ 
                                        fontSize: '0.5rem', padding: '4px 10px', 
                                        background: `${PHASE_COLORS[project.phase!] || 'white'}22`,
                                        border: `1px solid ${PHASE_COLORS[project.phase!] || 'white'}44`,
                                        borderRadius: '2px', color: PHASE_COLORS[project.phase!] || 'white'
                                    }}>
                                        {project.phase}
                                    </div>
                                </div>

                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', margin: 0 }}>
                                    {humanizeLabel(project.description)}
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3 }}>STATUS CONTROL:</span>
                                    <select
                                        value={statusDrafts[project.id] || project.status}
                                        onChange={(event) => setStatusDrafts(prev => ({ ...prev, [project.id]: event.target.value }))}
                                        className="text-mono"
                                        style={{
                                            fontSize: '0.55rem',
                                            background: 'rgba(255,255,255,0.04)',
                                            color: 'white',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            borderRadius: '3px',
                                            padding: '6px 8px',
                                            outline: 'none'
                                        }}
                                    >
                                        {PROJECT_STATUS_OPTIONS.map((status) => (
                                            <option key={status} value={status}>{humanizeLabel(status)}</option>
                                        ))}
                                        {!PROJECT_STATUS_OPTIONS.includes(project.status) && (
                                            <option value={project.status}>{humanizeLabel(project.status)}</option>
                                        )}
                                    </select>
                                    <button
                                        className="text-mono tactical-btn"
                                        disabled={mutatingProjectId === project.id}
                                        onClick={() => updateProjectStatus(project.id, statusDrafts[project.id] || project.status)}
                                        style={{
                                            fontSize: '0.55rem',
                                            background: 'rgba(0,242,255,0.05)',
                                            color: mutatingProjectId === project.id ? 'rgba(255,255,255,0.35)' : 'var(--cyan-glow)',
                                            border: '1px solid rgba(0,242,255,0.2)',
                                            padding: '6px 10px',
                                            borderRadius: '3px',
                                            cursor: mutatingProjectId === project.id ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {mutatingProjectId === project.id ? 'UPDATING...' : 'APPLY_STATUS'}
                                    </button>
                                </div>

                                {/* Project Health Gauge */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', marginBottom: '8px' }} className="text-mono">
                                        <span style={{ opacity: 0.3 }}>INITIATIVE HEALTH</span>
                                        <span style={{ color: project.health! > 80 ? 'var(--cyan-glow)' : 'var(--gold-solar)' }}>{project.health}%</span>
                                    </div>
                                    <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '1px' }}>
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${project.health}%` }}
                                            style={{ height: '100%', background: project.health! > 80 ? 'var(--cyan-glow)' : 'var(--gold-solar)' }}
                                        />
                                    </div>
                                </div>

                                {/* Assigned Agents */}
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3 }}>AGENTS:</span>
                                    {project.assigned_agents?.map((agent: string) => (
                                        <span key={agent} className="text-mono" style={{ 
                                            fontSize: '0.5rem', background: 'rgba(255,255,255,0.05)', 
                                            padding: '2px 8px', borderRadius: '2px', opacity: 0.8
                                        }}>{agent}</span>
                                    ))}
                                </div>

                                {/* Task Inventory */}
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }} className="text-mono">
                                        <span style={{ fontSize: '0.6rem', opacity: 0.3 }}>SUBORDINATE TASKS</span>
                                        <span style={{ fontSize: '0.55rem', opacity: 0.3 }}>{project.tasks.filter(t => t.status === 'COMPLETE').length}/{project.tasks.length}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {project.tasks.slice(0, 3).map((task: Task) => (
                                            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: task.status === 'COMPLETE' ? 0.3 : 1 }}>
                                                <div style={{ 
                                                    width: '8px', height: '8px', borderRadius: '1px',
                                                    border: `1px solid ${task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.2)'}`,
                                                    background: task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'transparent'
                                                }} />
                                                <span className="text-mono" style={{ fontSize: '0.7rem', color: task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'white' }}>{task.title}</span>
                                            </div>
                                        ))}
                                        {project.tasks.length > 3 && (
                                            <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.2, marginLeft: '20px' }}>+ {project.tasks.length - 3} MORE TASKS</div>
                                        )}
                                    </div>
                                </div>

                                {/* Tactical Action */}
                                <button 
                                    className="text-mono tactical-btn" 
                                    onClick={() => setSelectedProject(project)}
                                    style={{ 
                                        marginTop: 'auto', width: '100%', padding: '12px', 
                                        background: 'rgba(0,242,255,0.05)', border: '1px solid rgba(0,242,255,0.2)',
                                        color: 'var(--cyan-glow)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem'
                                    }}
                                >
                                    ACCESS INITIATIVE DETAILS
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
            
            {/* Initiative Detail Sidebar */}
            <AnimatePresence>
                {selectedProject && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedProject(null)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, backdropFilter: 'blur(5px)' }}
                        />
                        <motion.div 
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            style={{ 
                                position: 'fixed', right: 0, top: 0, height: '100vh', width: '500px', 
                                background: '#0a0d1a', zIndex: 1001, borderLeft: '1px solid var(--cyan-glow)',
                                padding: '40px', display: 'flex', flexDirection: 'column', gap: '30px',
                                boxShadow: '-20px 0 50px rgba(0,0,0,0.5)',
                                overflowY: 'auto'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--cyan-glow)' }}>
                                    INITIATIVE_REPORT // {selectedProject.ref}
                                </div>
                                <button 
                                    onClick={() => setSelectedProject(null)}
                                    style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem' }}
                                >&times;</button>
                            </div>

                            <header>
                                <h2 style={{ fontSize: '2rem', margin: '0 0 10px 0', fontWeight: 900 }}>{humanizeLabel(selectedProject.name)}</h2>
                                <div className="text-mono" style={{ fontSize: '0.7rem', color: PHASE_COLORS[selectedProject.phase!] }}>
                                    STATUS: {selectedProject.status} // PHASE: {selectedProject.phase ? humanizeLabel(selectedProject.phase) : 'UNKNOWN'}
                                </div>
                            </header>

                            <div className="neural-glass" style={{ padding: '20px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6' }}>
                                {humanizeLabel(selectedProject.description)}
                            </div>

                            <section>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                                        <h3 className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--gold-solar)', margin: 0 }}>
                                        LIVE TASK INVENTORY
                                    </h3>
                                    <button 
                                        onClick={async () => {
                                            const btn = document.getElementById('neural-audit-btn');
                                            if (btn) btn.innerText = 'AUDITING...';
                                            try {
                                                const res = await apiFetch(`/api/projects/${selectedProject.id}/analyze`, {
                                                    method: 'POST'
                                                });
                                                const data = await res.json();
                                                setSelectedProject((current) => current ? { ...current, neuralInsight: data } : current);
                                            } catch (e: unknown) {
                                                console.error('⬡ NEURAL_AUDIT_FAILED', e);
                                            } finally {
                                                if (btn) btn.innerText = 'INITIATE_NEURAL_AUDIT';
                                            }
                                        }}
                                        id="neural-audit-btn"
                                        className="text-mono"
                                        style={{ 
                                            fontSize: '0.55rem', background: 'rgba(255, 184, 0, 0.1)', 
                                            color: 'var(--gold-solar)', border: '1px solid var(--gold-solar)44',
                                            padding: '4px 10px', borderRadius: '2px', cursor: 'pointer'
                                        }}
                                    >
                                        INITIATE NEURAL AUDIT
                                    </button>
                                </div>

                                {(selectedProject as any).neuralInsight && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="neural-glass"
                                        style={{ 
                                            padding: '20px', marginBottom: '25px', 
                                            borderLeft: '4px solid var(--gold-solar)',
                                            background: 'rgba(255, 184, 0, 0.03)'
                                        }}
                                    >
                                        <div className="text-mono" style={{ fontSize: '0.6rem', color: 'var(--gold-solar)', marginBottom: '10px' }}>NEURAL INSIGHT REPORT</div>
                                        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.4 }}>COMPLEXITY INDEX</div>
                                                <div className="text-mono" style={{ fontSize: '1.2rem', color: 'white' }}>{(selectedProject as any).neuralInsight.complexityScore}%</div>
                                            </div>
                                            <div style={{ flex: 2 }}>
                                                <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.4 }}>SUGGESTED ROUTING</div>
                                                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                                    {(selectedProject as any).neuralInsight.suggestedAgents.map((a: string) => (
                                                        <span key={a} className="text-mono" style={{ fontSize: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px' }}>{a}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', marginBottom: '10px' }}>
                                            "{(selectedProject as any).neuralInsight.summary}"
                                        </div>
                                        <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.4, marginBottom: '5px' }}>STRATEGIC BOTTLENECKS:</div>
                                        <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                                            {(selectedProject as any).neuralInsight.bottlenecks.map((b: string, i: number) => (
                                                <li key={i}>{b}</li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {selectedProject.tasks.map((task: Task) => (
                                        <div key={task.id} className="neural-glass" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '15px', borderLeft: `3px solid ${task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.1)'}` }}>
                                            <div style={{ 
                                                width: '16px', height: '16px', borderRadius: '2px', 
                                                background: task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'transparent',
                                                border: `1px solid ${task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.3)'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {task.status === 'COMPLETE' && <span style={{ color: 'black', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className="text-mono" style={{ fontSize: '0.75rem', color: task.status === 'COMPLETE' ? 'var(--cyan-glow)' : 'white', opacity: task.status === 'COMPLETE' ? 0.6 : 1 }}>
                                                    {task.title}
                                                </div>
                                                <div className="text-mono" style={{ fontSize: '0.5rem', opacity: 0.3, marginTop: '4px' }}>
                                                    ASSIGNED_TO: {(task as any).assigned_to || 'UNASSIGNED'} // PRIORITY: {task.priority || 'MEDIUM'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section style={{ marginTop: 'auto' }}>
                                <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.4, marginBottom: '10px' }}>STRATEGIC ALIGNMENT</div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {['KNOWLEDGE SYNC', 'SWARM ORCHESTRATION', 'DUE DILIGENCE'].map((tag: string) => (
                                        <span key={tag} className="text-mono" style={{ fontSize: '0.5rem', background: 'rgba(0,242,255,0.05)', color: 'var(--cyan-glow)', padding: '4px 10px', borderRadius: '2px' }}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </section>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <style>{`
                .logos-container::-webkit-scrollbar { width: 4px; }
                .logos-container::-webkit-scrollbar-track { background: transparent; }
                .logos-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
                
                .neural-glass {
                    backdrop-filter: blur(25px) saturate(180%);
                    background: rgba(17, 25, 40, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .card-hover-effect {
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .card-hover-effect:hover {
                    background: rgba(17, 25, 40, 0.8) !important;
                    transform: translateY(-5px);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0,255,255,0.1);
                    border-color: rgba(0,255,255,0.3) !important;
                }

                @keyframes logos-pulse {
                    0% { transform: translateX(-140%); }
                    50% { transform: translateX(140%); }
                    100% { transform: translateX(-140%); }
                }

                .tactical-btn:hover {
                    background: rgba(255,255,255,0.05) !important;
                    color: white !important;
                    border-color: var(--cyan-glow) !important;
                }
            `}</style>
        </div>
    );
};

export default LogosProjects;
