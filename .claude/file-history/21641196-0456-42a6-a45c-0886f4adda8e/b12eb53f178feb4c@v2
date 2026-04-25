import React from 'react';
import { NotebookSource } from '../../../lib/notebookBridge';

const TYPE_ICONS: Record<string, string> = {
    pdf: '◎',
    docx: '◈',
    audio: '◆',
    video: '◆',
    url: '⬡',
    obsidian: '◉'
};

const STATUS_COLORS: Record<string, string> = {
    pending: 'var(--text-dim)',
    processing: 'var(--gold-solar)',
    ready: 'var(--cyan-glow)',
    error: 'var(--red-fusion)'
};

export function SourceCard({ source, onDelete }: { source: NotebookSource; onDelete: (id: number) => void }) {
    return (
        <div className="nb-source-card">
            <span className="nb-source-icon" style={{ color: STATUS_COLORS[source.status] }}>
                {TYPE_ICONS[source.source_type] || '◎'}
            </span>
            <div className="nb-source-info">
                <div className="nb-source-title" title={source.title}>
                    {source.title.slice(0, 36)}{source.title.length > 36 ? '…' : ''}
                </div>
                <div className="nb-source-meta">
                    <span style={{ color: STATUS_COLORS[source.status] }}>{source.status}</span>
                    {source.word_count > 0 && <span> · {source.word_count.toLocaleString()}w</span>}
                </div>
                {source.status === 'error' && source.error_msg && (
                    <div className="nb-source-error">{source.error_msg.slice(0, 60)}</div>
                )}
            </div>
            <button
                className="nb-source-delete"
                onClick={() => onDelete(source.id)}
                title="Remove source"
            >
                ✕
            </button>
        </div>
    );
}
