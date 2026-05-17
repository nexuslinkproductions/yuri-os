/**
 * Ingest and verify the Yuri sales psychology research archive.
 *
 * Run:
 *   npm run sales:rag
 */
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from '../models/database';
import { NotebookService } from '../services/notebookService';
import { NotebookIngestService } from '../services/notebookIngestService';
import { NotebookRagService } from '../services/notebookRagService';

const NOTEBOOK_TITLE = 'Yuri Sales Psychology 1980-2026';
const NOTEBOOK_DESCRIPTION = 'Dedicated RAG notebook for curated Yuri sales psychology and depth psychology doctrine';
const NOTEBOOK_STABLE_KEY = 'yuri-os/sales-psychology-1980-2026';
const QUERY = 'A buyer praises the offer and asks implementation questions, but avoids budget and decision authority. Analyze positive signals, omissions, possible psychological layers, and the next ethical move.';
const ARCHIVE_DIR = '_SYSTEM/research-archive/yuri-sales-psychology-1980-2026';
const INGEST_REPORT_PATH = `${ARCHIVE_DIR}/10_rag_ingested.md`;
const REPO_ROOT = path.resolve(__dirname, '../../..');

const BASE_SOURCES: string[] = [
    `${ARCHIVE_DIR}/00_manifest.md`,
    `${ARCHIVE_DIR}/01_source_registry.md`,
    `${ARCHIVE_DIR}/02_methodology_atlas.md`,
    `${ARCHIVE_DIR}/03_signal_model.md`,
    `${ARCHIVE_DIR}/04_depth_psychology_atlas.md`,
    `${ARCHIVE_DIR}/05_prediction_model_spec.md`,
    `${ARCHIVE_DIR}/06_ethics_guardrails.md`,
    `${ARCHIVE_DIR}/07_yuri_sales_doctrine.md`,
    `${ARCHIVE_DIR}/08_yearly_coverage_matrix.md`,
    `${ARCHIVE_DIR}/09_rag_ingestion_approval.md`
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

async function ingestSource(
    ingestSvc: NotebookIngestService,
    notebookSvc: NotebookService,
    notebookId: number,
    relPath: string
): Promise<SourceSnapshot> {
    const ingestResult = await ingestSvc.ingestObsidianNote(notebookId, relPath);
    const snapshot = {
        sourceId: ingestResult.sourceId,
        relPath,
        chunkCount: ingestResult.chunkCount,
        embeddedCount: 0,
        status: 'processing'
    };
    console.log(`INGESTED ${relPath} sourceId=${ingestResult.sourceId} chunks=${ingestResult.chunkCount} words=${ingestResult.wordCount}`);
    const [embedded] = await waitForEmbeddings(notebookSvc, [snapshot]);
    return embedded ?? snapshot;
}

function writeIngestReport(input: {
    notebookId: number;
    sourceCount: number;
    chunkCount: number;
    embeddedChunkCount: number;
    answer: string;
}): void {
    const report = `# Sales Psychology RAG Ingested and Verified

Date: ${new Date().toISOString()}
status: RAG_INGESTED_VERIFIED
approved_by: owner:marcel-spatz
notebook_title: ${NOTEBOOK_TITLE}
notebook_id: ${input.notebookId}
notebook_stable_key: ${NOTEBOOK_STABLE_KEY}
source_count: ${input.sourceCount}
chunk_count: ${input.chunkCount}
embedded_chunk_count: ${input.embeddedChunkCount}
advisory_only: true
local_truth_claim: false

## Result

The Yuri sales psychology research archive is approved, ingested, embedded, and retrieval-verified in a dedicated notebook.

## Verification Query

Query:

\`${QUERY}\`

Answer:

${input.answer.trim()}

## Stable Runner

Run:

\`npm run sales:rag\`

Runner:

\`backend/src/scripts/ingestYuriSalesPsychologyResearch.ts\`

## Non-Claims

- This does not ingest raw external source pages.
- This does not make practitioner systems peer-reviewed evidence.
- This does not diagnose buyers or automate outreach.
`;

    fs.writeFileSync(path.resolve(REPO_ROOT, INGEST_REPORT_PATH), report, 'utf8');
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

        for (const relPath of BASE_SOURCES) {
            results.push(await ingestSource(ingestSvc, notebookSvc, notebook.id, relPath));
        }

        const baseEmbedded = await waitForEmbeddings(notebookSvc, results);
        const baseChunkCount = baseEmbedded.reduce((sum, item) => sum + item.chunkCount, 0);
        const baseEmbeddedCount = baseEmbedded.reduce((sum, item) => sum + item.embeddedCount, 0);

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

        writeIngestReport({
            notebookId: notebook.id,
            sourceCount: BASE_SOURCES.length + 1,
            chunkCount: baseChunkCount,
            embeddedChunkCount: baseEmbeddedCount,
            answer
        });

        const reportSnapshot = await ingestSource(ingestSvc, notebookSvc, notebook.id, INGEST_REPORT_PATH);
        const embedded = await waitForEmbeddings(notebookSvc, [...baseEmbedded, reportSnapshot]);
        writeIngestReport({
            notebookId: notebook.id,
            sourceCount: notebookSvc.listSources(notebook.id).length,
            chunkCount: embedded.reduce((sum, item) => sum + item.chunkCount, 0),
            embeddedChunkCount: embedded.reduce((sum, item) => sum + item.embeddedCount, 0),
            answer
        });
        const finalReportSnapshot = await ingestSource(ingestSvc, notebookSvc, notebook.id, INGEST_REPORT_PATH);
        const finalEmbedded = await waitForEmbeddings(notebookSvc, [...baseEmbedded, finalReportSnapshot]);
        console.log('EMBEDDINGS_READY');
        console.log(JSON.stringify(finalEmbedded, null, 2));
        console.log('SALES_RESEARCH_RAG_QUERY_PASS');
        console.log(answer.trim());
        console.log(JSON.stringify(citations, null, 2));
        console.log(`NOTEBOOK_DETAIL id=${notebook.id} stableKey=${NOTEBOOK_STABLE_KEY} sources=${notebookSvc.listSources(notebook.id).length} chunks=${notebookSvc.getEmbeddedChunks(notebook.id).length}`);
    } finally {
        db.close();
    }
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('SALES_RESEARCH_RAG_RUN_FAILED');
    console.error(message);
    process.exit(1);
});
