import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';

const VAULT_ROOT = SystemConfig.ROOT;

function resolveVaultPath(relativePath: string): string {
    return SystemConfig.resolve(relativePath);
}

export interface NoteDetail {
    title: string;
    content: string;
    path: string;
    backlinks: string[];
    tags: string[];
}

export function getNoteDetail(relativePath: string): NoteDetail {
    let resolvedPath: string;
    try {
        resolvedPath = resolveVaultPath(relativePath);
    } catch (error) {
        console.warn(`⬡ SECURITY_ALERT :: Blocked traversal attempt to ${relativePath}`);
        throw error;
    }

    if (!fs.existsSync(resolvedPath)) {
        throw new Error('FILE_NOT_FOUND');
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    
    // Simple Obsidian parsing: find [[Links]] and #tags
    const linkRegex = /\[\[(.*?)\]\]/g;
    const tagRegex = /#(\w+)/g;
    
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
        links.push(match[1]);
    }

    const tags: string[] = [];
    while ((match = tagRegex.exec(content)) !== null) {
        tags.push(match[1]);
    }

    return {
        title: path.basename(resolvedPath, '.md'),
        content: content,
        path: relativePath,
        backlinks: links,
        tags: tags
    };
}
