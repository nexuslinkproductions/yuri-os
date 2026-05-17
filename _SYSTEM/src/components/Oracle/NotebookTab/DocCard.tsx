import React, { useState } from 'react';
import { NotebookDoc, getPdfUrl, syncDocToObsidian, deleteDoc } from '../../../lib/notebookBridge';

const TYPE_LABELS: Record<string, string> = {
    summary: 'Summary',
    study_guide: 'Study Guide',
    faq: 'FAQ',
    timeline: 'Timeline',
    briefing: 'Briefing'
};

export function DocCard({ doc, onDelete }: { doc: NotebookDoc; onDelete: (id: number) => void }) {
    const [syncing, setSyncing] = useState(false);
    const [syncedPath, setSyncedPath] = useState(doc.obsidian_path || '');

    async function handleSync() {
        setSyncing(true);
        try {
            const vaultPath = await syncDocToObsidian(doc.id);
            setSyncedPath(vaultPath);
        } catch (e: any) {
            alert('Sync failed: ' + e.message);
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div className="nb-doc-card">
            <div className="nb-doc-header">
                <span className="nb-doc-type-badge">{TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                <div className="nb-doc-actions">
                    <a
                        href={getPdfUrl(doc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="nb-doc-btn"
                        title="Export PDF"
                    >
                        ⬇ PDF
                    </a>
                    <button
                        className="nb-doc-btn"
                        onClick={handleSync}
                        disabled={syncing}
                        title={syncedPath ? `Synced: ${syncedPath}` : 'Sync to Obsidian'}
                    >
                        {syncing ? '…' : syncedPath ? '✓ Vault' : '⬡ Vault'}
                    </button>
                    <button
                        className="nb-doc-btn nb-doc-btn--delete"
                        onClick={() => onDelete(doc.id)}
                        title="Delete document"
                    >
                        ✕
                    </button>
                </div>
            </div>
            <div className="nb-doc-preview">
                {doc.content.slice(0, 240)}{doc.content.length > 240 ? '…' : ''}
            </div>
            <div className="nb-doc-meta">
                {new Date(doc.created_at).toLocaleDateString()} · {doc.model_id || 'unknown'}
            </div>
        </div>
    );
}
