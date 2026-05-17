import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const LOCAL_WHISPER_URL = process.env.WHISPER_LOCAL_URL || 'http://localhost:8080/inference';
const LOCAL_TIMEOUT_MS = 120_000;

export interface TranscriptResult {
    text: string;
    language?: string;
    durationSeconds?: number;
    provider: 'local-whisper' | 'openai-whisper';
}

export class NotebookTranscribeService {

    async transcribe(audioFilePath: string): Promise<TranscriptResult> {
        try {
            return await this.transcribeLocal(audioFilePath);
        } catch (e: any) {
            console.log(`⬡ TRANSCRIBE :: LOCAL_FAILED (${e.message}), trying OpenAI`);
            return this.transcribeOpenAI(audioFilePath);
        }
    }

    private async transcribeLocal(filePath: string): Promise<TranscriptResult> {
        const fileBytes = fs.readFileSync(filePath);
        const blob = new Blob([fileBytes]);
        const form = new FormData();
        form.append('file', blob, path.basename(filePath));
        form.append('response_format', 'json');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LOCAL_TIMEOUT_MS);
        try {
            const resp = await fetch(LOCAL_WHISPER_URL, {
                method: 'POST',
                body: form,
                signal: controller.signal
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data: any = await resp.json();
            const text = data?.text || data?.transcription || '';
            if (!text) throw new Error('empty transcription');
            return { text: text.trim(), provider: 'local-whisper' };
        } finally {
            clearTimeout(timeout);
        }
    }

    private async transcribeOpenAI(filePath: string): Promise<TranscriptResult> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('No transcription provider available — set OPENAI_API_KEY or start a local Whisper server at ' + LOCAL_WHISPER_URL);
        }
        const openai = new OpenAI({ apiKey });
        const result = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath) as any,
            model: 'whisper-1',
            response_format: 'verbose_json'
        });
        return {
            text: result.text.trim(),
            language: (result as any).language,
            durationSeconds: (result as any).duration,
            provider: 'openai-whisper'
        };
    }
}

export const notebookTranscribe = new NotebookTranscribeService();
