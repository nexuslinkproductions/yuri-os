import { ollamaContextGovernor, OllamaContextChunk } from '../services/ollamaContextGovernor';
import type { CompressionMode } from '../services/smartRouter';

declare const process: any;

const args = process.argv.slice(2);
const json = args.includes('--json');
const modes: CompressionMode[] = ['off', 'safe', 'aggressive'];

const chunks: OllamaContextChunk[] = Array.from({ length: 18 }, (_, index) => {
    const sourceId = Math.floor(index / 3) + 1;
    return {
        id: index + 1,
        sourceId,
        sourceTitle: `Bench Source ${sourceId}`,
        sourceType: sourceId % 2 === 0 ? 'obsidian' : 'pdf',
        sourceWordCount: 2200 + sourceId * 110,
        chunkIndex: index % 3,
        semanticScore: index % 4 === 0 ? 0.92 : 0.35,
        content: [
            `Source ${sourceId} describes local Ollama context routing, citations, manifests, and source-grounded document generation.`,
            `Chunk ${index + 1} includes repeated benchmark material for context budgeting and compression comparisons.`,
            'Yuri OS should keep source attribution intact while reducing prompt size before local model generation.'
        ].join(' ').repeat(index % 4 === 0 ? 24 : 12)
    };
});

async function main() {
    const rows = [];
    for (const mode of modes) {
        const result = await ollamaContextGovernor.govern({
            query: 'local ollama context compression citations source manifest',
            chunks,
            modelId: 'qwen2.5:7b',
            requestedNumCtx: 8192,
            compressionMode: mode,
            taskType: 'benchmark',
            maxContextChars: 9000,
            summarizeChunk: mode === 'aggressive'
                ? async (chunk) => `Compressed summary for ${chunk.sourceTitle}: local Ollama context routing, citations, and source budget facts preserved.`
                : undefined
        });

        rows.push({
            mode,
            input_chars: result.contextInputChars,
            output_chars: result.contextOutputChars,
            compression_ratio: result.compressionRatio,
            selected_chunks: result.selectedChunkIds.length,
            summarized_chunks: result.summarizedChunkIds.length,
            omitted_chunks: result.omittedChunkIds.length,
            recommended_num_ctx: result.recommendedNumCtx
        });
    }

    if (json) {
        console.log(JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
        return;
    }

    console.log('Ollama context governor benchmark');
    for (const row of rows) {
        console.log(
            `- ${row.mode}: ratio=${row.compression_ratio} output=${row.output_chars} selected=${row.selected_chunks} summarized=${row.summarized_chunks} omitted=${row.omitted_chunks} num_ctx=${row.recommended_num_ctx}`
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
