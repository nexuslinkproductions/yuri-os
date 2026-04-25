import { NotebookService, DocType } from './notebookService';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MAX_CONTEXT_CHARS = 80_000;

const TYPE_ICONS: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', audio: 'Audio', video: 'Video', url: 'Web', obsidian: 'Vault Note' };

interface SourceContext {
    manifest: string;
    attributedContent: string;
    sourceCount: number;
    totalWords: number;
}

function buildSourceContext(chunks: Array<{ content: string; source_title: string; source_type: string; source_word_count: number; source_id?: number }>): SourceContext {
    // Group chunks by source
    const bySource = new Map<string, { type: string; words: number; chunks: string[] }>();
    for (const c of chunks) {
        const key = c.source_title;
        if (!bySource.has(key)) bySource.set(key, { type: c.source_type, words: c.source_word_count, chunks: [] });
        bySource.get(key)!.chunks.push(c.content);
    }

    const sources = Array.from(bySource.entries());
    const manifest = sources.map(([title, meta], i) =>
        `[${i + 1}] "${title}" (${TYPE_ICONS[meta.type] || meta.type}, ~${meta.words.toLocaleString()} words)`
    ).join('\n');

    // Build attributed content, respecting MAX_CONTEXT_CHARS
    let used = manifest.length;
    const sections: string[] = [];
    for (let i = 0; i < sources.length; i++) {
        const [title, meta] = sources[i];
        const header = `\n### [SOURCE ${i + 1}: "${title}"]\n`;
        const joined = meta.chunks.join('\n\n');
        const available = MAX_CONTEXT_CHARS - used - header.length;
        if (available <= 200) break;
        const content = joined.length > available ? joined.slice(0, available) + '\n…[truncated]' : joined;
        sections.push(header + content);
        used += header.length + content.length;
    }

    return {
        manifest,
        attributedContent: sections.join('\n'),
        sourceCount: sources.length,
        totalWords: sources.reduce((sum, [, m]) => sum + m.words, 0)
    };
}

function buildPrompt(docType: DocType, ctx: SourceContext): string {
    const intro = `You have access to ${ctx.sourceCount} source${ctx.sourceCount !== 1 ? 's' : ''} totaling approximately ${ctx.totalWords.toLocaleString()} words.\n\n## SOURCE MANIFEST\n${ctx.manifest}\n\n## SOURCE CONTENT\n${ctx.attributedContent}\n\n---\n`;

    const citationRule = `\n\n**Citation rules:** Every factual claim MUST be cited using [N] format referencing the source manifest above. Use multiple citations [1][2] when a claim is supported by multiple sources. Do not make any claim without a grounding citation.`;

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
    signal?: AbortSignal;
}

export class NotebookDocGenService {
    private notebookService: NotebookService;

    constructor(notebookService: NotebookService) {
        this.notebookService = notebookService;
    }

    async streamGenerate(opts: DocGenStreamOptions): Promise<void> {
        const { notebookId, docType, modelId, onToken, onDone, onError, signal } = opts;

        const allChunks = this.notebookService.getAllChunksWithSource(notebookId);
        if (!allChunks.length) {
            onError('No source content found. Add sources and wait for ingestion to complete (status: ready).');
            return;
        }

        const ctx = buildSourceContext(allChunks);
        const prompt = buildPrompt(docType, ctx);

        console.log(`⬡ NOTEBOOK_DOCGEN :: type=${docType} sources=${ctx.sourceCount} words=${ctx.totalWords} promptChars=${prompt.length}`);

        try {
            const upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert research analyst. You produce thorough, citation-grounded documents. You cite every factual claim using [N] notation. You write in professional, clear prose. You never truncate output — you always complete the full document as requested.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    stream: true,
                    options: {
                        num_ctx: 32768,
                        temperature: 0.3
                    }
                }),
                signal
            });

            if (!upstream.ok) throw new Error(`Ollama HTTP ${upstream.status}: ${await upstream.text()}`);
            if (!upstream.body) throw new Error('No response body');

            let fullContent = '';
            const reader = upstream.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        const token = parsed?.message?.content || '';
                        if (token) {
                            fullContent += token;
                            onToken(token);
                        }
                        if (parsed?.done) {
                            buf = '';
                            break;
                        }
                    } catch (_) {}
                }
            }

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
}
