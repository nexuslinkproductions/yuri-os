import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';
import { NotebookDoc } from './notebookService';

const EXPORT_DIR = 'backend/data/notebook-exports';

export class NotebookPdfExportService {

    async exportDoc(doc: NotebookDoc): Promise<string> {
        const puppeteer = await import('puppeteer');
        const exportDir = SystemConfig.resolve(EXPORT_DIR);
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

        const filename = `doc-${doc.id}-${Date.now()}.pdf`;
        const outputPath = path.join(exportDir, filename);

        const html = this.buildHtml(doc);

        const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            await page.pdf({
                path: outputPath,
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
            });
        } finally {
            await browser.close();
        }

        console.log(`⬡ NOTEBOOK_PDF_EXPORT :: ${outputPath}`);
        return outputPath;
    }

    private buildHtml(doc: NotebookDoc): string {
        const typeLabel: Record<string, string> = {
            summary: 'Executive Summary',
            study_guide: 'Study Guide',
            faq: 'FAQ Document',
            timeline: 'Timeline',
            briefing: 'Intelligence Briefing'
        };

        // Convert markdown headings and basic formatting for PDF
        const bodyHtml = doc.content
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
            .replace(/\n\n/g, '</p><p>')
            .replace(/^([^<].+)$/gm, (m) => m.trim() ? m : '')
            .split('\n').filter(l => l.trim()).join('\n');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${doc.title}</title>
<style>
  :root {
    --bg: #0d0d0f;
    --surface: #131317;
    --accent: #00e5ff;
    --text: #e8e8f0;
    --muted: #8888aa;
    --border: #1e1e2a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: white;
    color: #1a1a2e;
    font-size: 11pt;
    line-height: 1.7;
  }
  .header {
    border-bottom: 3px solid #00e5ff;
    padding-bottom: 16px;
    margin-bottom: 32px;
  }
  .header .label {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #00b4cc;
    margin-bottom: 8px;
  }
  .header h1 {
    font-size: 22pt;
    font-weight: 700;
    color: #0d0d2e;
  }
  .meta {
    font-size: 8.5pt;
    color: #666;
    margin-top: 6px;
  }
  .content h1 { font-size: 16pt; margin: 24px 0 12px; color: #0d0d2e; }
  .content h2 { font-size: 13pt; margin: 20px 0 10px; color: #1a1a40; border-bottom: 1px solid #e0e0f0; padding-bottom: 4px; }
  .content h3 { font-size: 11pt; margin: 16px 0 8px; color: #2a2a50; }
  .content p { margin: 10px 0; }
  .content ul { margin: 10px 0 10px 20px; }
  .content li { margin: 4px 0; }
  .content strong { color: #0d0d2e; }
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #e0e0f0;
    font-size: 8pt;
    color: #999;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="label">NUDIMMUD · ${typeLabel[doc.doc_type] || doc.doc_type}</div>
    <h1>${doc.title}</h1>
    <div class="meta">Generated: ${new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Model: ${doc.model_id || 'Unknown'}</div>
  </div>
  <div class="content">
    <p>${bodyHtml}</p>
  </div>
  <div class="footer">NUDIMMUD Intelligence System · Notebook ID ${doc.notebook_id}</div>
</body>
</html>`;
    }
}

export const notebookPdfExport = new NotebookPdfExportService();
