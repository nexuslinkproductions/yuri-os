/**
 * Ingest and verify the Yuri wiki control-plane lane.
 *
 * Repeatable lane runner:
 * - creates or reuses a dedicated notebook
 * - ingests only the wiki control-plane sources
 * - waits for embeddings to finish
 * - performs a retrieval query as a verification step
 *
 * Run:
 *   npm run wiki:rag
 */
import { initDatabase } from '../models/database';
import { NotebookService } from '../services/notebookService';
import { NotebookIngestService } from '../services/notebookIngestService';
import { NotebookRagService } from '../services/notebookRagService';

const NOTEBOOK_TITLE = 'Yuri Wiki Control Plane';
const NOTEBOOK_DESCRIPTION = 'Dedicated RAG notebook for the Yuri wiki control plane';
const NOTEBOOK_STABLE_KEY = 'yuri-os/wiki-control-plane';
const QUERY = 'What is the current status of the wiki control-plane RAG gate and ingestion? Answer briefly.';

const SOURCES: string[] = [
    '_SYSTEM/yuri-wiki/index.md',
    '_SYSTEM/yuri-wiki/log.md',
    '_SYSTEM/yuri-wiki/source-registry.md',
    '_SYSTEM/yuri-wiki/wiki/concepts/09c-llm-wiki-compiled-memory.md',
    '_SYSTEM/yuri-wiki/reports/lint/09c-fixture-lint-report.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-deferred.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-gate-open.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-ingested.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-runner.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-watcher.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-launchd-teardown.md',
    '_SYSTEM/yuri-wiki/reports/staleness/09c-rag-health.md',
    '_SYSTEM/yuri-wiki/schema/page.schema.md',
    '_SYSTEM/yuri-wiki/schema/lint-contract.md',
    'Scripts/wiki-rag-health.mjs'
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

async function main() {
    process.env.OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    const db = initDatabase();
    const notebookSvc = new NotebookService(db);
    const ingestSvc = new NotebookIngestService(notebookSvc);
    const ragSvc = new NotebookRagService(notebookSvc);

    try {
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
        } else {
            if (notebook.stable_key !== NOTEBOOK_STABLE_KEY) {
                notebookSvc.updateNotebook(notebook.id, { stable_key: NOTEBOOK_STABLE_KEY });
                notebook = notebookSvc.getNotebook(notebook.id) ?? notebook;
            }
            console.log(`NOTEBOOK_REUSED id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY}`);
        }

        const results: SourceSnapshot[] = [];
        for (const relPath of SOURCES) {
            const ingestResult = await ingestSvc.ingestObsidianNote(notebook.id, relPath);
            results.push({
                sourceId: ingestResult.sourceId,
                relPath,
                chunkCount: ingestResult.chunkCount,
                embeddedCount: 0,
                status: 'processing'
            });
            console.log(`INGESTED ${relPath} sourceId=${ingestResult.sourceId} chunks=${ingestResult.chunkCount} words=${ingestResult.wordCount}`);
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

        console.log('RAG_QUERY_PASS');
        console.log(answer.trim());
        console.log(JSON.stringify(citations, null, 2));
        console.log(`NOTEBOOK_DETAIL id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY} sources=${notebookSvc.listSources(notebook.id).length} chunks=${notebookSvc.getEmbeddedChunks(notebook.id).length}`);
    } finally {
        db.close();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('RAG_CONTROL_PLANE_RUN_FAILED');
    console.error(message);
    process.exit(1);
});
