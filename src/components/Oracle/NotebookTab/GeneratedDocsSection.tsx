import React, { useState } from 'react';
import { NotebookDoc, DocType, deleteDoc } from '../../../lib/notebookBridge';
import { DocCard } from './DocCard';

const DOC_TYPES: { type: DocType; label: string; icon: string }[] = [
    { type: 'summary', label: 'Summary', icon: '◎' },
    { type: 'study_guide', label: 'Study Guide', icon: '◈' },
    { type: 'faq', label: 'FAQ', icon: '◆' },
    { type: 'timeline', label: 'Timeline', icon: '◉' },
    { type: 'briefing', label: 'Briefing', icon: '⬡' }
];

export function GeneratedDocsSection({
    docs,
    generating,
    generatePreview,
    onGenerate,
    onDocsChanged
}: {
    docs: NotebookDoc[];
    generating: boolean;
    generatePreview: string;
    onGenerate: (docType: DocType) => void;
    onDocsChanged: () => void;
}) {
    const [collapsed, setCollapsed] = useState(false);

    async function handleDelete(docId: number) {
        try {
            await deleteDoc(docId);
            onDocsChanged();
        } catch (e: any) {
            console.error('Delete doc error:', e.message);
        }
    }

    return (
        <div className="nb-docs-section">
            <div className="nb-docs-header" onClick={() => setCollapsed(c => !c)}>
                <span className="nb-docs-toggle">{collapsed ? '▶' : '▼'}</span>
                <span className="nb-docs-title">Generated Documents ({docs.length})</span>
                <div className="nb-generate-btns" onClick={e => e.stopPropagation()}>
                    {DOC_TYPES.map(dt => (
                        <button
                            key={dt.type}
                            className="nb-gen-btn"
                            onClick={() => onGenerate(dt.type)}
                            disabled={generating}
                            title={`Generate ${dt.label}`}
                        >
                            {dt.icon} {dt.label}
                        </button>
                    ))}
                </div>
            </div>

            {generating && (
                <div className="nb-generating-preview">
                    <span className="nb-gen-spinner">⟳</span>
                    <span className="nb-gen-text">{generatePreview || 'Generating…'}</span>
                </div>
            )}

            {!collapsed && (
                <div className="nb-docs-list">
                    {docs.length === 0 && !generating && (
                        <div className="nb-docs-empty">
                            Generate summaries, study guides, FAQs, timelines, or briefings from your sources.
                        </div>
                    )}
                    {docs.map(doc => (
                        <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}
