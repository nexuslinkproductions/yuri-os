import React, { useEffect, useState } from 'react';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { NetworkGraph } from './NetworkGraph';
import { SentimentGauge } from './SentimentGauge';
import * as nb from '../../../lib/notebookBridge';

type VizTab = 'entities' | 'temporal' | 'topics' | 'sentiment';

export function VizPanel({ notebookId }: { notebookId: number }) {
    const [tab, setTab] = useState<VizTab>('entities');
    const [loading, setLoading] = useState(false);
    const [entities, setEntities] = useState<any[]>([]);
    const [temporal, setTemporal] = useState<any[]>([]);
    const [topics, setTopics] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
    const [sentiment, setSentiment] = useState<any>(null);

    useEffect(() => {
        if (tab === 'entities' && !entities.length) load('entities');
        if (tab === 'temporal' && !temporal.length) load('temporal');
        if (tab === 'topics' && !topics.nodes.length) load('topics');
        if (tab === 'sentiment' && !sentiment) load('sentiment');
    }, [tab, notebookId]);

    async function load(t: VizTab) {
        setLoading(true);
        try {
            if (t === 'entities') setEntities(await nb.getEntityFrequencies(notebookId));
            else if (t === 'temporal') setTemporal(await nb.getTemporalSeries(notebookId));
            else if (t === 'topics') setTopics(await nb.getTopicGraph(notebookId));
            else if (t === 'sentiment') setSentiment(await nb.getSentiment(notebookId));
        } catch (e: any) {
            console.error('VizPanel load error:', e.message);
        } finally {
            setLoading(false);
        }
    }

    const VIZ_TABS: { id: VizTab; label: string }[] = [
        { id: 'entities', label: 'Entities' },
        { id: 'temporal', label: 'Timeline' },
        { id: 'topics', label: 'Topics' },
        { id: 'sentiment', label: 'Sentiment' }
    ];

    return (
        <div className="nb-viz-panel">
            <div className="nb-viz-tabs">
                {VIZ_TABS.map(t => (
                    <button
                        key={t.id}
                        className={`nb-viz-tab ${tab === t.id ? 'active' : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
                <button
                    className="nb-viz-refresh"
                    onClick={() => load(tab)}
                    disabled={loading}
                    title="Refresh"
                >
                    {loading ? '⟳' : '↻'}
                </button>
            </div>
            <div className="nb-viz-content">
                {loading && <div className="nb-viz-loading">⬡ Analyzing sources…</div>}
                {!loading && tab === 'entities' && (
                    entities.length ? <BarChart data={entities} /> : <div className="nb-viz-empty">No entity data yet — add and process sources first.</div>
                )}
                {!loading && tab === 'temporal' && (
                    temporal.length ? <LineChart data={temporal} /> : <div className="nb-viz-empty">No temporal data found in sources.</div>
                )}
                {!loading && tab === 'topics' && (
                    topics.nodes.length ? <NetworkGraph nodes={topics.nodes} edges={topics.edges} /> : <div className="nb-viz-empty">No topic clusters extracted yet.</div>
                )}
                {!loading && tab === 'sentiment' && (
                    sentiment ? <SentimentGauge data={sentiment} /> : <div className="nb-viz-empty">No sentiment data yet.</div>
                )}
            </div>
        </div>
    );
}
