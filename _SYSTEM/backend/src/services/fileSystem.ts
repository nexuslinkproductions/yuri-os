import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';

const VAULT_ROOT = SystemConfig.ROOT;

function resolveVaultPath(relativePath: string): string {
    return SystemConfig.resolve(relativePath);
}

export interface FileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    mtime?: Date;
}

export function listVaultDirectory(relativePath: string = ''): FileNode[] {
    const fullPath = resolveVaultPath(relativePath);

    if (!fs.existsSync(fullPath)) {
        return [];
    }

    const items = fs.readdirSync(fullPath);
    
    return items
        .filter(item => !item.startsWith('.')) // Hide hidden files/folders (dotfiles)
        .map(item => {
            const itemPath = path.join(fullPath, item);
            const stats = fs.statSync(itemPath);
            return {
                name: item,
                path: path.relative(VAULT_ROOT, itemPath),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
            };
        });
}

export function grepFile(relativePath: string, pattern: string): string[] {
    const fullPath = resolveVaultPath(relativePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const regex = new RegExp(pattern, 'i');
    return lines
        .map((line, index) => regex.test(line) ? `${index + 1}: ${line}` : null)
        .filter(Boolean) as string[];
}

export function editFileLines(relativePath: string, startLine: number, endLine: number, newContent: string): void {
    const fullPath = resolveVaultPath(relativePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    // Replace lines (1-indexed)
    lines.splice(startLine - 1, endLine - startLine + 1, newContent);
    
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
}

export function backupFile(relativePath: string): string {
    const fullPath = resolveVaultPath(relativePath);
    const backupPath = `${fullPath}.bak`;
    fs.copyFileSync(fullPath, backupPath);
    return path.relative(VAULT_ROOT, backupPath);
}
export function readFile(relativePath: string): string {
    const fullPath = resolveVaultPath(relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
}

export function writeFile(relativePath: string, content: string): void {
    const fullPath = resolveVaultPath(relativePath);

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
}
