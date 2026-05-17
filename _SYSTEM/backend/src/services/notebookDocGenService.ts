import { NotebookService, DocType } from './notebookService';
import { ollamaProvider } from './providers/ollamaProvider';
import type { CompressionMode } from './smartRouter';
import { ollamaContextGovernor } from './ollamaContextGovernor';
import type { OllamaContextGovernorResult } from './ollamaContextGovernor';

const MAX_CONTEXT_CHARS = 80_000;

interface SourceContext {
    sourceContext: string;
    sourceCount: number;
    totalWords: number;
    governor: OllamaContextGovernorResult;
}

async function buildSourceContext(
    chunks: Array<{ id: number; content: string; source_title: string; source_type: string; source_word_count: number; source_id?: number; chunk_index?: number; created_at?: string }>,
    options: {
        docType: DocType;
        modelId: string;
        compressionMode: CompressionMode;
    }
): Promise<SourceContext> {
    const bySource = new Map<string, { words: number }>();
    for (const c of chunks) {
        const key = c.source_title;
        if (!bySource.has(key)) bySource.set(key, { words: c.source_word_count });
    }

    const governor = await ollamaContextGovernor.govern({
        query: `Create a ${options.docType} document from the notebook sources.`,
        modelId: options.modelId,
        requestedNumCtx: 32768,
        compressionMode: options.compressionMode,
        taskType: 'doc_generate',
        promptOverheadChars: 6000,
        maxContextChars: MAX_CONTEXT_CHARS,
        chunks: chunks.map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            sourceTitle: chunk.source_title,
            sourceType: chunk.source_type,
            sourceWordCount: chunk.source_word_count,
            sourceId: chunk.source_id,
            chunkIndex: chunk.chunk_index,
            createdAt: chunk.created_at
        })),
        summarizeChunk: options.compressionMode === 'aggressive'
            ? async (chunk) => summarizeChunkWithOllama(chunk.content, options.modelId)
            : undefined
    });

    return {
        sourceContext: governor.contextText,
        sourceCount: bySource.size,
        totalWords: Array.from(bySource.values()).reduce((sum, m) => sum + m.words, 0),
        governor
    };
}

function buildPrompt(docType: DocType, ctx: SourceContext): string {
    const intro = `You have access to ${ctx.sourceCount} source${ctx.sourceCount !== 1 ? 's' : ''} totaling approximately ${ctx.totalWords.toLocaleString()} words.\n\n${ctx.sourceContext}\n\n---\n`;

    const citationRule = `\n\n**Citation rules:** Every factual claim MUST be cited using [N] format. Cite only sources that have SOURCE CONTENT or compressed SOURCE SUMMARY in the prompt. Use multiple citations [1][2] when supported. Do not make any claim without a grounding citation.`;

    const tasks: Record<DocType, string> = {
        summary: `${intro}## TASK: COMPREHENSIVE EXECUTIVE SUMMARY

Write a thorough, citation-grounded executive summary (minimum 1,000 words). Structure as follows:

## Executive Summary

### Overview
Synthesize the core subject matter across all sources in 3–5 sentences. What is the central theme, system, or argument? Cite every source you draw from.

### Key Findings
List 10–15 specific, evidence-backed findings. Each bullet must include at least one citation. Go deep — surface-level observations are not acceptable.

### Major Themes & Patterns
Identify 4–6 recurring themes across sources. For each theme, explain how multiple sources address it, with cross-referenced citations like [1][3].

### Critical Insights
Your analysis: what do the sources collectively reveal that isn't obvious? What tensions or contradictions exist between sources? What is missing?

### Implications & Applications
What are the practical implications of what these sources describe? Who is affected and how?

### Source Reliability & Coverage
Briefly assess each source's contribution and any limitations.

## References
[1] [Full title and type]
[2] ...${citationRule}`,

        study_guide: `${intro}## TASK: COMPREHENSIVE STUDY GUIDE

Create a thorough, citation-rich study guide (minimum 1,200 words) for deep mastery of this material.

## Study Guide

### Core Concepts (Definitions & Explanations)
Define and explain every key concept, term, and framework found in the sources. For each entry: term, definition, context, and at least one citation. Aim for 15+ entries.

### Conceptual Map
How do the key concepts relate to each other? Describe the structure of the knowledge domain. Use inline citations throughout.

### Core Arguments & Theses
What are the central claims or propositions in the material? List them clearly with supporting citations.

### Critical Details & Data Points
List specific facts, statistics, dates, names, and quantitative data found across sources — each with a precise citation.

### Common Misconceptions
Based on the sources, what ideas are commonly misunderstood? What does the material clarify or correct?

### Exam / Review Questions (with Answers)
Write 15 substantive questions that test deep understanding. Include detailed answers with citations.

### Glossary
Alphabetical glossary of 20+ domain-specific terms found in the sources.

## References
[1] [Full title and type]
[2] ...${citationRule}`,

        faq: `${intro}## TASK: COMPREHENSIVE FAQ DOCUMENT

Create an authoritative, thoroughly cited FAQ (minimum 20 questions). Each answer must be substantive — 3–8 sentences minimum, grounded in the source material.

## Frequently Asked Questions

For each question use this format:
**Q: [Specific, thoughtful question a practitioner would ask]**
A: [Thorough answer drawing directly from source material. Every factual statement must cite its source.]

Cover: definitions and basics, how things work, why things are designed the way they are, edge cases and limitations, comparisons and alternatives, practical applications, common problems and solutions, future directions.

Aim for questions that require synthesizing across multiple sources — those are the most valuable.

## References
[1] [Full title and type]
[2] ...${citationRule}`,

        timeline: `${intro}## TASK: CHRONOLOGICAL TIMELINE

Extract and reconstruct a full chronological timeline (as long as the material supports). Include every event, date, milestone, version, or temporal reference found across all sources.

## Timeline

Use this format for each entry:

### [Date / Period / Version]
**Event:** [What happened]
**Details:** [Context, significance, key actors or components involved]
**Source:** [Citation]

Group entries by era or phase where appropriate. If sources conflict on dates, note the discrepancy. If no explicit dates exist, construct a logical developmental sequence with reasoning.

Include: founding events, key milestones, version releases, research breakthroughs, deployment events, failures and pivots, current state, and projected future steps if described.

## References
[1] [Full title and type]
[2] ...${citationRule}`,

        briefing: `${intro}## TASK: INTELLIGENCE BRIEFING

Produce a concise, high-density briefing document (minimum 800 words) in the style of an intelligence or executive brief. Every assertion must be source-grounded.

## Intelligence Briefing

### SITUATION OVERVIEW
3–4 sentences establishing what this material is about and why it matters. What is the current state? [Citations]

### KEY FINDINGS
Numbered list of 10–15 critical findings. Each must be a discrete, actionable piece of intelligence with a citation. Prioritize by impact.

### TECHNICAL DETAILS
Specific technical facts, specifications, architectures, or methodologies described in the sources. Be precise. [Citations]

### RISKS & CONCERNS
What vulnerabilities, failure modes, open questions, or risks does the material identify or imply? [Citations]

### OPPORTUNITIES & RECOMMENDATIONS
What does the material suggest should be done? What leverage points exist? [Citations]

### BACKGROUND CONTEXT
What is the broader context from which this material emerges? Historical precedents, related systems, prior work. [Citations]

### CONFIDENCE ASSESSMENT
Rate the reliability of the key findings based on source quality and consistency across sources.

## References
[1] [Full title and type]
[2] ...${citationRule}`
    };

    return tasks[docType];
}

const DOC_TITLES: Record<DocType, string> = {
    summary: 'Executive Summary',
    study_guide: 'Study Guide',
    faq: 'FAQ Document',
    timeline: 'Timeline',
    briefing: 'Intelligence Briefing'
};

export interface DocGenStreamOptions {
    notebookId: number;
    docType: DocType;
    modelId: string;
    onToken: (token: string) => void;
    onDone: (docId: number) => void;
    onError: (msg: string) => void;
    compressionMode?: CompressionMode;
    signal?: AbortSignal;
}

export class NotebookDocGenService {
    private notebookService: NotebookService;

    constructor(notebookService: NotebookService) {
        this.notebookService = notebookService;
    }

    async streamGenerate(opts: DocGenStreamOptions): Promise<void> {
        const { notebookId, docType, modelId, onToken, onDone, onError, compressionMode = 'safe', signal } = opts;

        const allChunks = this.notebookService.getAllChunksWithSource(notebookId);
        if (!allChunks.length) {
            onError('No source content found. Add sources and wait for ingestion to complete (status: ready).');
            return;
        }

        const ctx = await this.buildGovernedSourceContext(allChunks, { docType, modelId, compressionMode });
        const prompt = buildPrompt(docType, ctx);

        console.log(`⬡ NOTEBOOK_DOCGEN :: type=${docType} sources=${ctx.sourceCount} words=${ctx.totalWords} promptChars=${prompt.length} compression=${ctx.governor.compressionMode}:${ctx.governor.compressionRatio}`);

        try {
            const result = await ollamaProvider.streamChat({
                model: modelId,
                system: 'You are an expert research analyst. You produce thorough, citation-grounded documents. You cite every factual claim using [N] notation. You write in professional, clear prose. You never truncate output — you always complete the full document as requested.',
                messages: [{ role: 'user', content: prompt }],
                runtime: 'local',
                signal,
                options: {
                    num_ctx: ctx.governor.recommendedNumCtx,
                    temperature: 0.3
                },
                operationType: 'notebook_doc_generate',
                metadata: {
                    doc_type: docType,
                    source_count: ctx.sourceCount,
                    source_words: ctx.totalWords,
                    compression_mode: ctx.governor.compressionMode,
                    context_input_chars: ctx.governor.contextInputChars,
                    context_output_chars: ctx.governor.contextOutputChars,
                    compression_ratio: ctx.governor.compressionRatio,
                    selected_chunks: ctx.governor.selectedChunkIds,
                    summarized_chunks: ctx.governor.summarizedChunkIds,
                    omitted_chunks: ctx.governor.omittedChunkIds,
                    num_ctx: ctx.governor.recommendedNumCtx
                },
                onToken
            });
            const fullContent = result.content;

            if (!fullContent.trim()) throw new Error('Model returned empty response — is Ollama running with the selected model?');

            const doc = this.notebookService.createDoc(
                notebookId, docType,
                DOC_TITLES[docType],
                fullContent,
                modelId
            );
            onDone(doc.id);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                onError(e.message || 'DOC_GEN_FAILED');
            }
        }
    }

    private async buildGovernedSourceContext(
        chunks: Array<{ id: number; content: string; source_title: string; source_type: string; source_word_count: number; source_id?: number; chunk_index?: number; created_at?: string }>,
        options: { docType: DocType; modelId: string; compressionMode: CompressionMode }
    ): Promise<SourceContext> {
        try {
            return await buildSourceContext(chunks, options);
        } catch (error: any) {
            console.warn(`⬡ OLLAMA_CONTEXT_GOVERNOR_FALLBACK :: doc_generate :: ${error.message}`);
            return buildSourceContext(chunks, { ...options, compressionMode: 'off' });
        }
    }
}

async function summarizeChunkWithOllama(content: string, modelId: string): Promise<string> {
    const result = await ollamaProvider.chat({
        model: 'qwen3.5:4b',
        system: 'Return a source-grounded extractive summary in 4 bullets. Preserve names, dates, numbers, and claims. Do not add facts.',
        messages: [{ role: 'user', content: content.slice(0, 6000) }],
        runtime: 'local',
        options: {
            num_ctx: 4096,
            num_predict: 180,
            temperature: 0
        },
        operationType: 'ollama_context_summary',
        metadata: {
            source_model: modelId,
            compression_mode: 'aggressive'
        }
    });
    return result.content || '';
}
