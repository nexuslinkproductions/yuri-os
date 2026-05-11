/**
 * Ingest and verify the Yuri Enterprise AI OS research archive.
 *
 * Run:
 *   npm run research:rag
 */
import { initDatabase } from '../models/database';
import { NotebookService } from '../services/notebookService';
import { NotebookIngestService } from '../services/notebookIngestService';
import { NotebookRagService } from '../services/notebookRagService';

const NOTEBOOK_TITLE = 'Yuri Enterprise AI OS Research 2026-05';
const NOTEBOOK_DESCRIPTION = 'Dedicated RAG notebook for the approved Yuri enterprise AI OS research seed archive';
const NOTEBOOK_STABLE_KEY = 'yuri-os/enterprise-ai-os-research-2026-05';
const QUERY = 'Why was the enterprise AI OS research archive reference-only, and what is its current RAG approval status? Answer briefly.';

const SOURCES: string[] = [
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/00_manifest.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/01_source_registry.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/02_capture_pipeline.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/03_enterprise_governance_frameworks.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/04_security_prompt_injection_browser_agents.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/05_supply_chain_provenance.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/06_yuri_enterprise_research_seed_summary.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/07_scrapling_capture_integration.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/08_browser_capture_policy.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/09_professional_lens_matrix.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/10_yuri_adaptation_backlog.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/11_rag_ingestion_approval.md',
    '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05/12_rag_ingested.md'
];

type SourceSnapshot = {
    sourceId: number;
    relPath: string;
    chunkCount: number;
    embeddedCount: number;
    status: string | undefined;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEmbeddings(
    notebookSvc: NotebookService,
    snapshot: SourceSnapshot[],
    timeoutMs = 120000
): Promise<SourceSnapshot[]> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const next = snapshot.map((item) => {
            const source = notebookSvc.getSource(item.sourceId);
            const chunks = notebookSvc.getChunksForSource(item.sourceId);
            const embeddedCount = chunks.filter((chunk) => {
                return chunk.embedding != null && String(chunk.embedding).trim() !== '';
            }).length;

            return {
                ...item,
                embeddedCount,
                status: source?.status
            };
        });

        if (next.every((item) => item.status === 'ready' && item.chunkCount > 0 && item.embeddedCount === item.chunkCount)) {
            return next;
        }

        await sleep(3000);
        snapshot = next;
    }

    return snapshot;
}

async function getOrCreateNotebook(notebookSvc: NotebookService) {
    const existingByKey = notebookSvc.getNotebookByStableKey(NOTEBOOK_STABLE_KEY);
    const titleMatches = notebookSvc.listNotebooks().filter((n) => n.title === NOTEBOOK_TITLE);

    let notebook = existingByKey;
    if (!notebook) {
        if (titleMatches.length > 1) {
            throw new Error(`Multiple notebooks share title "${NOTEBOOK_TITLE}" but none use stable key ${NOTEBOOK_STABLE_KEY}`);
        }
        if (titleMatches.length === 1) {
            notebook = titleMatches[0];
            if (notebook.stable_key !== NOTEBOOK_STABLE_KEY) {
                notebookSvc.updateNotebook(notebook.id, { stable_key: NOTEBOOK_STABLE_KEY });
                notebook = notebookSvc.getNotebook(notebook.id) ?? notebook;
            }
        }
    }

    if (!notebook) {
        notebook = notebookSvc.createNotebook(NOTEBOOK_TITLE, NOTEBOOK_DESCRIPTION, 'qwen-liberated:latest', NOTEBOOK_STABLE_KEY);
        console.log(`NOTEBOOK_CREATED id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY}`);
        return notebook;
    }

    if (notebook.stable_key !== NOTEBOOK_STABLE_KEY) {
        notebookSvc.updateNotebook(notebook.id, { stable_key: NOTEBOOK_STABLE_KEY });
        notebook = notebookSvc.getNotebook(notebook.id) ?? notebook;
    }
    console.log(`NOTEBOOK_REUSED id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY}`);
    return notebook;
}

async function main() {
    process.env.OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    const db = initDatabase();
    const notebookSvc = new NotebookService(db);
    const ingestSvc = new NotebookIngestService(notebookSvc);
    const ragSvc = new NotebookRagService(notebookSvc);

    try {
        const notebook = await getOrCreateNotebook(notebookSvc);
        const results: SourceSnapshot[] = [];

        for (const relPath of SOURCES) {
            const ingestResult = await ingestSvc.ingestObsidianNote(notebook.id, relPath);
            const snapshot = {
                sourceId: ingestResult.sourceId,
                relPath,
                chunkCount: ingestResult.chunkCount,
                embeddedCount: 0,
                status: 'processing'
            };
            results.push(snapshot);
            console.log(`INGESTED ${relPath} sourceId=${ingestResult.sourceId} chunks=${ingestResult.chunkCount} words=${ingestResult.wordCount}`);
            await waitForEmbeddings(notebookSvc, [snapshot]);
        }

        const embedded = await waitForEmbeddings(notebookSvc, results);
        console.log('EMBEDDINGS_READY');
        console.log(JSON.stringify(embedded, null, 2));

        let answer = '';
        const citations: unknown[] = [];
        await ragSvc.streamAnswer({
            notebookId: notebook.id,
            query: QUERY,
            modelId: 'qwen-liberated:latest',
            onToken: (token) => {
                answer += token;
            },
            onCitation: (citation) => {
                citations.push(citation);
            },
            onDone: () => undefined,
            onError: (message) => {
                throw new Error(message);
            }
        });

        console.log('RESEARCH_RAG_QUERY_PASS');
        console.log(answer.trim());
        console.log(JSON.stringify(citations, null, 2));
        console.log(`NOTEBOOK_DETAIL id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY} sources=${notebookSvc.listSources(notebook.id).length} chunks=${notebookSvc.getEmbeddedChunks(notebook.id).length}`);
    } finally {
        db.close();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('RESEARCH_RAG_RUN_FAILED');
    console.error(message);
    process.exit(1);
});
