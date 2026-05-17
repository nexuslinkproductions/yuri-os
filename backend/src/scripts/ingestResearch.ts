/**
 * Bulk-ingest YURI-OS-MUSUBI vault research into a Notebook.
 * Run: npx ts-node src/scripts/ingestResearch.ts
 */
import path from 'path';
import fs from 'fs';
import { initDatabase } from '../models/database';
import { NotebookService } from '../services/notebookService';
import { NotebookIngestService } from '../services/notebookIngestService';

const NOTEBOOK_TITLE = 'YURI-OS-MUSUBI Research Vault';

const VAULT_SOURCES: Array<{ path: string; description: string }> = [
    // NISABA — operational theology & mechanics
    { path: 'NISABA/nisaba.md',                                description: 'NISABA — Complete Deployment Theology' },
    { path: 'NISABA/01_DEPLOYMENT/swarm-architecture.md',     description: 'Swarm Architecture — Orchestrator/Specialist Pattern' },
    { path: 'NISABA/02_EVOLUTION/dream-system.md',            description: 'Dream System — Learning & Memory Evolution' },
    { path: 'NISABA/03_DISTRIBUTION/distribution-swarm.md',   description: 'Distribution Swarm — Horizontal Scaling & Mesh' },
    { path: 'NISABA/04_QUALITY/gan-loop-engine.md',           description: 'GAN Loop Engine — Adversarial Quality Gates' },
    { path: 'NISABA/05_DEFENSE/defense-system.md',            description: 'Defense System — Security Gates & Rollback' },
    { path: 'NISABA/06_SWARM/idea-to-empire.md',              description: 'Idea to Empire — Scaling from POC to Distributed Empire' },
    { path: 'NISABA/07_CANON/canon-system.md',                description: 'Canon System — Canonical Truth & Consensus Protocols' },

    // NEURAL-NETWORK — AI agent frameworks
    { path: 'NEURAL-NETWORK/evo-nexus/README.md',             description: 'EvoNexus — Multi-Agent OS (38 Agents)' },
    { path: 'NEURAL-NETWORK/evo-nexus/CHANGELOG.md',          description: 'EvoNexus — Detailed Release History' },
    { path: 'NEURAL-NETWORK/evo-nexus/ROUTINES.md',           description: 'EvoNexus — Automated Routine Catalog' },
    { path: 'NEURAL-NETWORK/GitNexus/README.md',              description: 'GitNexus — Knowledge Graph for Architectural Awareness' },
    { path: 'NEURAL-NETWORK/GitNexus/ARCHITECTURE.md',        description: 'GitNexus — Graph Architecture & DAG Resolution' },
    { path: 'NEURAL-NETWORK/GitNexus/RUNBOOK.md',             description: 'GitNexus — Operational Runbook' },
    { path: 'NEURAL-NETWORK/OBLITERATUS/README.md',           description: 'OBLITERATUS — Adversarial QA Framework' },
    { path: 'NEURAL-NETWORK/OBLITERATUS/docs/mechanistic_interpretability_research.md', description: 'OBLITERATUS — Mechanistic Interpretability Research' },
    { path: 'NEURAL-NETWORK/OBLITERATUS/docs/RESEARCH_SURVEY.md', description: 'OBLITERATUS — Research Survey' },

    // Command Center — system architecture & operations
    { path: '00_COMMAND-CENTER/NUDIMMUD-ARCHITECTURAL-OVERVIEW.md', description: 'NUDIMMUD — Full Architectural Overview' },

    // Research — design & security
    { path: 'RESEARCH/BACKEND_SECURITY_ANALYSIS_ORACLE.md',   description: 'Oracle Backend Security Analysis' },
    { path: 'RESEARCH/REVERSE_ENGINEERING_IMPLEMENTATION.md', description: 'Reverse Engineering Implementation Guide' },
];

// Optional: add if files exist
const OPTIONAL_SOURCES: Array<{ path: string; description: string }> = [
    { path: 'RESEARCH/DESIGN-RADAR/synthesis.md',             description: 'Design Radar — Cross-vendor Design System Synthesis' },
    { path: 'RESEARCH/ORACLE-CORPUS/ORACLE_EXTRACTION_MAP.md', description: 'Oracle Extraction Map — Agent Tool Index' },
    { path: 'RESEARCH/ORACLE-CORPUS/ORACLE_TOOL_SURFACES.md', description: 'Oracle Tool Surfaces — Capability Matrix' },
    { path: 'RESEARCH/papers/Recursive Language Models - MIT.pdf', description: 'MIT Paper — Recursive Language Models' },
];

async function main() {
    const db = initDatabase();
    const notebookSvc = new NotebookService(db);
    const ingestSvc = new NotebookIngestService(notebookSvc);

    const VAULT_ROOT = path.resolve(__dirname, '../../../');

    // Find or create the notebook
    const existing = notebookSvc.listNotebooks().find(n => n.title === NOTEBOOK_TITLE);
    const notebook = existing ?? notebookSvc.createNotebook(NOTEBOOK_TITLE, 'Accumulated NUDIMMUD research, operational theology, and system documentation');
    console.log(`\n⬡ NOTEBOOK: "${notebook.title}" (id=${notebook.id})\n`);

    const allSources = [
        ...VAULT_SOURCES,
        ...OPTIONAL_SOURCES.filter(s => fs.existsSync(path.join(VAULT_ROOT, s.path)))
    ];

    let ok = 0;
    let fail = 0;

    for (const src of allSources) {
        const fullPath = path.join(VAULT_ROOT, src.path);
        if (!fs.existsSync(fullPath)) {
            console.log(`  ⊘ SKIP (not found): ${src.path}`);
            continue;
        }

        process.stdout.write(`  ⬡ Ingesting: ${src.description}... `);
        try {
            const ext = path.extname(fullPath).toLowerCase();
            let result;

            if (ext === '.pdf') {
                result = await ingestSvc.ingestFile(
                    notebook.id, fullPath,
                    'application/pdf',
                    path.basename(fullPath)
                );
            } else {
                result = await ingestSvc.ingestObsidianNote(notebook.id, src.path);
            }

            console.log(`✓ ${result.chunkCount} chunks, ${result.wordCount.toLocaleString()} words`);
            ok++;
        } catch (e: any) {
            console.log(`✗ ${e.message}`);
            fail++;
        }
    }

    console.log(`\n⬡ INGESTION COMPLETE: ${ok} sources ingested, ${fail} failed`);
    console.log(`⬡ Embeddings generating in background — check source status via /api/notebook/sources/:id/status`);
    console.log(`⬡ Notebook ready at: /api/notebook/notebooks/${notebook.id}`);

    // Keep process alive briefly for async embedding kickoff
    await new Promise(r => setTimeout(r, 2000));
    db.close();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
