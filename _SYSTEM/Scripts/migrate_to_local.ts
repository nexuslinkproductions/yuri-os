import fs from 'fs';
import path from 'path';

const SOURCE = '/Users/marcelspatz/YURI-OS-MUSUBI';
const TARGET = '/Users/marcelspatz/YURI-OS-MUSUBI';

console.log(`⬡ VESTA_MIGRATION :: IGNITING :: [${SOURCE}] -> [${TARGET}]`);

function copyRecursive(src: string, dest: string) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
            if (child === 'node_modules' || child === '.git' || child === 'dist') return;
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        let content = fs.readFileSync(src);
        
        // Patch paths if it's a text file
        if (src.endsWith('.ts') || src.endsWith('.tsx') || src.endsWith('.js') || src.endsWith('.json') || src.endsWith('.env')) {
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

try {
    if (!fs.existsSync(TARGET)) fs.mkdirSync(TARGET, { recursive: true });
    copyRecursive(SOURCE, TARGET);
    console.log('⬡ OPERATION_VESTA :: MIGRATION_COMPLETE');
    console.log(`⬡ NEXT_STEPS :: cd ${TARGET} && npm install`);
} catch (e: any) {
    console.error(`⬡ MIGRATION_FATAL :: ${e.message}`);
}
