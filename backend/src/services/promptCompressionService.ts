import { CompressionMode } from './smartRouter';

export interface CompressionStats {
    mode: CompressionMode;
    originalChars: number;
    compressedChars: number;
    originalEstimatedTokens: number;
    compressedEstimatedTokens: number;
    compressionRatio: number;
}

export interface CompressionResult {
    content: string;
    stats: CompressionStats;
}

const FILLER_SAFE = /\b(please|kindly|basically|actually|simply|really|very|just|clearly|obviously|literally)\b/gi;
const FILLER_AGGRESSIVE = /\b(the|a|an|that|which|please|kindly|basically|actually|simply|really|very|just|clearly|obviously|literally|i think|we should)\b/gi;

export class PromptCompressionService {
    compress(content: string, mode: CompressionMode = 'safe'): CompressionResult {
        const original = content || '';

        if (!original.trim() || mode === 'off') {
            return {
                content: original,
                stats: this.buildStats(original, original, mode)
            };
        }

        const compressed = this.compressLineWise(original, mode);
        return {
            content: compressed,
            stats: this.buildStats(original, compressed, mode)
        };
    }

    private compressLineWise(content: string, mode: CompressionMode) {
        const lines = content.split('\n');
        const result: string[] = [];
        const seen = new Set<string>();
        let inCodeFence = false;
        let inFrontmatter = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('```')) {
                inCodeFence = !inCodeFence;
                result.push(line);
                continue;
            }

            if (!inCodeFence && i === 0 && trimmed === '---') {
                inFrontmatter = true;
                result.push(line);
                continue;
            }

            if (inFrontmatter) {
                result.push(line);
                if (i !== 0 && trimmed === '---') inFrontmatter = false;
                continue;
            }

            if (inCodeFence || this.isStructuredLine(trimmed)) {
                result.push(line);
                continue;
            }

            const compressedLine = this.compressProseLine(line, mode);
            const dedupeKey = compressedLine.trim().toLowerCase();

            if (dedupeKey && seen.has(dedupeKey)) continue;
            if (dedupeKey) seen.add(dedupeKey);

            if (compressedLine.trim() || this.shouldKeepBlankLine(result)) {
                result.push(compressedLine);
            }
        }

        return result
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    private compressProseLine(line: string, mode: CompressionMode) {
        const placeholders: string[] = [];
        let working = line;

        working = working.replace(
            /(https?:\/\/\S+|(?:\/[\w.\-\/]+)+|\b\d{4}-\d{2}-\d{2}\b|\b[A-Z]{2,8}-\d+\b|\"[^\"]+\"|'[^']+')/g,
            (match) => {
                const index = placeholders.push(match) - 1;
                return `__KEEP_${index}__`;
            }
        );

        working = working.replace(/\s+/g, ' ').trim();
        working = working.replace(mode === 'aggressive' ? FILLER_AGGRESSIVE : FILLER_SAFE, ' ');
        working = working.replace(/\s+,/g, ',').replace(/\s+\./g, '.');
        working = working.replace(/\s{2,}/g, ' ').trim();

        if (mode === 'aggressive') {
            working = working
                .replace(/\b(is|are|was|were|be|been)\b/gi, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        working = working.replace(/__KEEP_(\d+)__/g, (_, rawIndex) => placeholders[Number(rawIndex)] || '');
        return working;
    }

    private isStructuredLine(trimmed: string) {
        if (!trimmed) return false;
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith(']') || trimmed.startsWith('}')) return true;
        if (trimmed.startsWith('|') || trimmed.startsWith('>')) return true;
        if (trimmed.startsWith('- [') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) return true;
        if (trimmed.startsWith('--- FILE:')) return true;
        if (/^[A-Za-z0-9_-]+:\s.+$/.test(trimmed)) return true;
        return false;
    }

    private shouldKeepBlankLine(result: string[]) {
        return result.length > 0 && result[result.length - 1].trim() !== '';
    }

    private buildStats(original: string, compressed: string, mode: CompressionMode): CompressionStats {
        const originalEstimatedTokens = this.estimateTokens(original);
        const compressedEstimatedTokens = this.estimateTokens(compressed);
        const ratio = originalEstimatedTokens === 0
            ? 1
            : Number((compressedEstimatedTokens / originalEstimatedTokens).toFixed(3));

        return {
            mode,
            originalChars: original.length,
            compressedChars: compressed.length,
            originalEstimatedTokens,
            compressedEstimatedTokens,
            compressionRatio: ratio
        };
    }

    private estimateTokens(content: string) {
        if (!content) return 0;
        return Math.max(1, Math.ceil(content.length / 4));
    }
}

export const promptCompression = new PromptCompressionService();
