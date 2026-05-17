import React from 'react';
import { Notebook, NotebookSource, deleteSource } from '../../../lib/notebookBridge';
import { SourceCard } from './SourceCard';
import { SourceUploadZone } from './SourceUploadZone';

export function SourcesPanel({
    notebooks,
    selectedId,
    sources,
    onSelectNotebook,
    onCreateNotebook,
    onDeleteNotebook,
    onSourcesChanged
}: {
    notebooks: Notebook[];
    selectedId: number | null;
    sources: NotebookSource[];
    onSelectNotebook: (id: number) => void;
    onCreateNotebook: () => void;
    onDeleteNotebook: (id: number) => void;
    onSourcesChanged: () => void;
}) {

    async function handleDeleteSource(sourceId: number) {
        try {
            await deleteSource(sourceId);
            onSourcesChanged();
        } catch (e: any) {
            console.error('Delete source error:', e.message);
        }
    }

    return (
        <div className="nb-sources-panel">
            <div className="nb-notebook-selector">
                <select
                    className="nb-select"
                    value={selectedId ?? ''}
                    onChange={e => onSelectNotebook(Number(e.target.value))}
                >
                    {notebooks.map(nb => (
                        <option key={nb.id} value={nb.id}>{nb.title}</option>
                    ))}
                </select>
                <button className="nb-btn-sm" onClick={onCreateNotebook} title="New notebook">+</button>
                {selectedId && (
                    <button
                        className="nb-btn-sm nb-btn-danger"
                        onClick={() => onDeleteNotebook(selectedId)}
                        title="Delete notebook"
                    >
                        ✕
                    </button>
                )}
            </div>

            {selectedId != null && (
                <SourceUploadZone notebookId={selectedId} onSourcesAdded={onSourcesChanged} />
            )}

            <div className="nb-sources-list">
                {sources.length === 0 && (
                    <div className="nb-sources-empty">
                        No sources yet. Upload PDFs, audio, URLs, or vault notes.
                    </div>
                )}
                {sources.map(s => (
                    <SourceCard key={s.id} source={s} onDelete={handleDeleteSource} />
                ))}
            </div>
        </div>
    );
}
