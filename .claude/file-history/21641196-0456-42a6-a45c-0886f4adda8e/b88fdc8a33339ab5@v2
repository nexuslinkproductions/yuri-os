import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';
import { NotebookDoc } from './notebookService';

const TARGET_FOLDER = 'NISABA/09_NOTEBOOK';

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80);
}

export class NotebookObsidianSyncService {

    async pushToVault(doc: NotebookDoc): Promise<string> {
        const targetDir = SystemConfig.resolve(TARGET_FOLDER);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const ts = new Date().toISOString().slice(0, 10);
        const slug = sanitizeFilename(doc.title);
        const filename = `${doc.doc_type}-${ts}-${slug}.md`;
        const fullPath = path.join(targetDir, filename);

        const markdown = this.buildMarkdown(doc);
        fs.writeFileSync(fullPath, markdown, 'utf-8');

        const vaultRelativePath = `${TARGET_FOLDER}/${filename}`;
        console.log(`⬡ NOTEBOOK_OBSIDIAN_SYNC :: Written to ${vaultRelativePath}`);
        return vaultRelativePath;
    }

    private buildMarkdown(doc: NotebookDoc): string {
        const typeLabels: Record<string, string> = {
            summary: 'Summary',
            study_guide: 'Study Guide',
            faq: 'FAQ',
            timeline: 'Timeline',
            briefing: 'Briefing'
        };
        return [
            '---',
            `type: notebook-${doc.doc_type}`,
            `title: "${doc.title}"`,
            `notebook_id: ${doc.notebook_id}`,
            `model: ${doc.model_id || 'unknown'}`,
            `generated: ${doc.created_at}`,
            `tags: [notebook, ${doc.doc_type}, nudimmud]`,
            '---',
            '',
            `# ${typeLabels[doc.doc_type] || doc.title}`,
            '',
            doc.content
        ].join('\n');
    }
}

export const notebookObsidianSync = new NotebookObsidianSyncService();
