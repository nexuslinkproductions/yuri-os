import React, { useRef, useState } from 'react';
import { uploadSources, addUrlSource, addObsidianSource } from '../../../lib/notebookBridge';

export function SourceUploadZone({
    notebookId,
    onSourcesAdded
}: {
    notebookId: number;
    onSourcesAdded: () => void;
}) {
    const [dragging, setDragging] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [vaultInput, setVaultInput] = useState('');
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function handleFiles(files: File[]) {
        if (!files.length) return;
        setBusy(true);
        try {
            await uploadSources(notebookId, files);
            onSourcesAdded();
        } catch (e: any) {
            console.error('Upload error:', e.message);
        } finally {
            setBusy(false);
        }
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        handleFiles(Array.from(e.dataTransfer.files));
    }

    async function handleUrl() {
        if (!urlInput.trim()) return;
        setBusy(true);
        try {
            await addUrlSource(notebookId, urlInput.trim());
            setUrlInput('');
            onSourcesAdded();
        } catch (e: any) {
            console.error('URL ingest error:', e.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleVault() {
        if (!vaultInput.trim()) return;
        setBusy(true);
        try {
            await addObsidianSource(notebookId, vaultInput.trim());
            setVaultInput('');
            onSourcesAdded();
        } catch (e: any) {
            console.error('Vault ingest error:', e.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="nb-upload-zone">
            <div
                className={`nb-drop-area ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
            >
                {busy ? '⟳ Processing…' : dragging ? '⬡ Drop to add' : '+ Add PDF / DOCX / Audio'}
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.mp3,.mp4,.m4a,.wav,.ogg,.flac,.webm"
                    style={{ display: 'none' }}
                    onChange={e => handleFiles(Array.from(e.target.files || []))}
                />
            </div>

            <div className="nb-url-input-row">
                <input
                    className="nb-input"
                    type="text"
                    placeholder="https://... URL"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUrl()}
                    disabled={busy}
                />
                <button className="nb-btn-sm" onClick={handleUrl} disabled={busy || !urlInput.trim()}>
                    + URL
                </button>
            </div>

            <div className="nb-url-input-row">
                <input
                    className="nb-input"
                    type="text"
                    placeholder="NISABA/note.md"
                    value={vaultInput}
                    onChange={e => setVaultInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleVault()}
                    disabled={busy}
                />
                <button className="nb-btn-sm" onClick={handleVault} disabled={busy || !vaultInput.trim()}>
                    + Vault
                </button>
            </div>
        </div>
    );
}
