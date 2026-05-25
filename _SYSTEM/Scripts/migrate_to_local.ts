import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(SCRIPT_DIR, '../..');
const TARGET = process.argv[2] ? path.resolve(process.argv[2]) : '';

if (!TARGET) {
    throw new Error('Usage: tsx _SYSTEM/Scripts/migrate_to_local.ts <target-directory>');
}

if (TARGET === SOURCE) {
    throw new Error('Refusing to migrate into the source repo root');
}

console.log(`⬡ VESTA_MIGRATION :: IGNITING :: [${SOURCE}] -> [${TARGET}]`);

function copyRecursive(src: string, dest: string) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
            if (shouldSkip(src, child)) return;
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        let content = fs.readFileSync(src);
        
        // Patch paths if it's a text file
        if (src.endsWith('.ts') || src.endsWith('.tsx') || src.endsWith('.js') || src.endsWith('.json')) {
            let text = content.toString('utf8');
            const original = text;
            if (original !== text) {
                console.log(`⬡ PATCHED_PATHS :: ${path.basename(src)}`);
            }
            fs.writeFileSync(dest, text);
        } else {
            fs.writeFileSync(dest, content);
        }
    }
}

function shouldSkip(parent: string, child: string) {
    const rel = path.relative(SOURCE, path.join(parent, child)).split(path.sep).join('/');
    return child === 'node_modules'
        || child === '.git'
        || child === 'dist'
        || child === '.env'
        || rel.startsWith('backend/data')
        || rel.startsWith('_SYSTEM/backend/data')
        || rel.startsWith('.claude/state')
        || rel.startsWith('.claude/history')
        || rel.startsWith('.claude/file-history')
        || rel.startsWith('.claude/projects')
        || rel.startsWith('.amp');
}

try {
    if (!fs.existsSync(TARGET)) fs.mkdirSync(TARGET, { recursive: true });
    copyRecursive(SOURCE, TARGET);
    console.log('⬡ OPERATION_VESTA :: MIGRATION_COMPLETE');
    console.log(`⬡ NEXT_STEPS :: cd ${TARGET} && npm install`);
} catch (e: any) {
    console.error(`⬡ MIGRATION_FATAL :: ${e.message}`);
}
