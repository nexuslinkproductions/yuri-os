import { execSync } from 'child_process';
import { initDatabase } from '../models/database';
import { insertKnowledgeNode } from '../models/queries';
import path from 'path';

/**
 * BUG_FINDER (NABU INTEGRATION)
 * Runs static analysis (TSC) and ingests results as Knowledge Nodes.
 * Domain: SYSTEM_BUG
 */
async function runBugFinder() {
    console.log('⬡ BUG_FINDER :: Starting system scan...');
    const db = initDatabase();

    // 1. Clear old bugs to prevent stale entries in the current session view
    try {
        db.prepare("DELETE FROM knowledge_nodes WHERE domain = 'SYSTEM_BUG'").run();
        console.log('⬡ BUG_FINDER :: Purged legacy bug nodes.');
    } catch (e) {}

    try {
        // Root is 4 levels up from src/scripts (nudimmud/)
        const rootDir = path.resolve(__dirname, '../../../../');
        console.log(`⬡ BUG_FINDER :: Executing TSC audit in ${rootDir}...`);
        
        try {
            // --noEmit prevents generating JS files
            // --pretty false makes parsing reliable
            execSync('npx tsc --noEmit --pretty false', { 
                cwd: rootDir,
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout/stderr
            });
            console.log('⬡ BUG_FINDER :: SUCCESS - No type errors detected.');
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            const lines = output.split('\n');
            let errorCount = 0;

            for (const line of lines) {
                // TSC format: file.ts(1,1): error TS2304: Cannot find name 'x'.
                const match = line.match(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
                if (match) {
                    const [_, filePath, lineNum, colNum, errorCode, message] = match;
                    
                    const title = `TS${errorCode}: ${message.substring(0, 60)}${message.length > 60 ? '...' : ''}`;
                    const content = `**Error**: ${message}\n**File**: \`${filePath}\`\n**Position**: Line ${lineNum}, Col ${colNum}\n\n**Context**: Found during Phase 2 Automated Audit.\n\n**Raw Trace**:\n\`\`\`\n${line}\n\`\`\``;
                    
                    insertKnowledgeNode(db, {
                        title,
                        content,
                        source_path: filePath,
                        node_type: 'SYSTEM_BUG',
                        tags: JSON.stringify(['typescript', 'bug', `ts${errorCode}`, 'automated_audit']),
                        domain: 'SYSTEM_BUG',
                        embedding: null
                    });
                    errorCount++;
                }
            }
            
            if (errorCount > 0) {
                console.log(`⬡ BUG_FINDER :: Ingested ${errorCount} systemic bugs into the vault.`);
            } else {
                console.log('⬡ BUG_FINDER :: TSC finished with errors but none could be parsed.');
            }
        }
    } catch (e: any) {
        console.error('⬡ BUG_FINDER_CRITICAL ::', e.message);
    }
}

// Execute
runBugFinder().then(() => {
    console.log('⬡ BUG_FINDER :: Scan complete.');
    process.exit(0);
}).catch(err => {
    console.error('⬡ BUG_FINDER_FAILED ::', err);
    process.exit(1);
});
