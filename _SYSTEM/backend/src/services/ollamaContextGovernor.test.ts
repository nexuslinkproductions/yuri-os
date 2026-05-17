import { ollamaContextGovernor, OllamaContextChunk } from './ollamaContextGovernor';

declare const require: any;
declare const process: any;

const assert = require('assert').strict;

const chunks: OllamaContextChunk[] = [
    {
        id: 1,
        sourceId: 10,
        sourceTitle: 'Alpha Brief',
        sourceType: 'pdf',
        sourceWordCount: 1200,
        chunkIndex: 0,
        content: 'Alpha routing uses Ollama local models for notebook reasoning and source-grounded answers. '.repeat(8),
        semanticScore: 0.9
    },
    {
        id: 2,
        sourceId: 10,
        sourceTitle: 'Alpha Brief',
        sourceType: 'pdf',
        sourceWordCount: 1200,
        chunkIndex: 1,
        content: 'Alpha fallback text about unrelated styling and visual work. '.repeat(8),
        semanticScore: 0.1
    },
    {
        id: 3,
        sourceId: 20,
        sourceTitle: 'Beta Notes',
        sourceType: 'obsidian',
        sourceWordCount: 900,
        chunkIndex: 0,
        content: 'Beta retrieval notes describe citations, source manifests, and context budgets for local generation. '.repeat(8),
        semanticScore: 0.7
    }
];

async function run() {
    const first = await ollamaContextGovernor.govern({
        query: 'ollama local citations budget',
        chunks,
        modelId: 'qwen2.5:7b',
        requestedNumCtx: 2048,
        compressionMode: 'safe',
        taskType: 'rag_answer',
        maxContextChars: 450
    });

    const second = await ollamaContextGovernor.govern({
        query: 'ollama local citations budget',
        chunks,
        modelId: 'qwen2.5:7b',
        requestedNumCtx: 2048,
        compressionMode: 'safe',
        taskType: 'rag_answer',
        maxContextChars: 450
    });

    assert.deepEqual(first.selectedChunkIds, second.selectedChunkIds, 'ordering must be deterministic');
    assert.match(first.sourceManifest, /\[1\] "Alpha Brief"/, 'manifest keeps source 1');
    assert.match(first.sourceManifest, /\[2\] "Beta Notes"/, 'manifest keeps source 2');
    assert.ok(first.omittedChunkIds.length > 0, 'small budget should omit at least one chunk');
    for (const omittedId of first.omittedChunkIds) {
        assert.ok(!first.selectedChunkIds.includes(omittedId), 'omitted chunks are not selected');
    }
    assert.ok(first.contextOutputChars <= first.contextInputChars, 'safe mode should not increase context size');

    const off = await ollamaContextGovernor.govern({
        query: 'anything',
        chunks,
        modelId: 'qwen2.5:7b',
        compressionMode: 'off',
        taskType: 'rag_answer'
    });
    assert.deepEqual(off.selectedChunkIds, [1, 2, 3], 'off mode keeps all chunks');
    assert.deepEqual(off.omittedChunkIds, [], 'off mode omits nothing');

    const empty = await ollamaContextGovernor.govern({
        query: 'nothing',
        chunks: [],
        modelId: 'qwen2.5:7b',
        compressionMode: 'safe',
        taskType: 'rag_answer'
    });
    assert.equal(empty.contextText, '## SOURCE MANIFEST\n\n## SOURCE CONTENT', 'empty context preserves headings');

    const longChunk = {
        ...chunks[1],
        id: 4,
        sourceId: 30,
        sourceTitle: 'Gamma Long',
        content: 'Gamma local summary fact. '.repeat(140),
        semanticScore: -0.2
    };
    const aggressive = await ollamaContextGovernor.govern({
        query: 'ollama local citations budget',
        chunks: [
            {
                id: 99,
                sourceId: 99,
                sourceTitle: 'High Signal',
                content: 'ollama local citations budget '.repeat(20),
                semanticScore: 0.95
            },
            longChunk
        ],
        modelId: 'qwen2.5:7b',
        requestedNumCtx: 2048,
        compressionMode: 'aggressive',
        taskType: 'doc_generate',
        maxContextChars: 2200,
        summarizeChunk: async () => 'Gamma local summary fact preserved.'
    });
    assert.ok(aggressive.summarizedChunkIds.includes(4), 'aggressive mode summarizes low-ranked oversized chunks');
    assert.ok(!aggressive.omittedChunkIds.includes(4), 'summarized chunks are citable and not omitted');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
