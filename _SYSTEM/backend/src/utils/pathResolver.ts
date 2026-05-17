import path from 'path';
import dotenv from 'dotenv';
import { SystemConfig } from '../config/SystemConfig';

dotenv.config();

/**
 * ⬡ PATH_RESOLVER
 * Dynamically resolves system paths based on the current environment root.
 * Delegates root selection and traversal safety to SystemConfig.
 */
class PathResolver {
    private root: string;

    constructor() {
        this.root = SystemConfig.ROOT;
        
        console.log(`⬡ PATH_RESOLVER :: ROOT_ANCHORED_TO: ${this.root}`);
    }

    /**
     * Resolve a relative path to the current system root
     */
    resolve(relativePath: string): string {
        return SystemConfig.resolve(relativePath);
    }

    getRoot(): string {
        return this.root;
    }
}

export const pathResolver = new PathResolver();
