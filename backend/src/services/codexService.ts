import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';

const execFilePromise = util.promisify(execFile);

export interface CodexTask {
    id: string;
    action: 'REFACTOR' | 'TEST' | 'GENERATE' | 'REVIEW';
    targetFile: string;
    prompt: string;
    status: 'STAGED' | 'EXECUTING' | 'VERIFIED' | 'FAILED';
    diff?: string;
}

export class CodexService {
    private activeTasks: CodexTask[] = [];

    /**
     * Initiates a coding task following the CODEX_PROTOCOL.
     */
    public async initiateTask(action: CodexTask['action'], targetFile: string, prompt: string): Promise<CodexTask> {
        const taskId = `codex_${Date.now()}`;
        const task: CodexTask = {
            id: taskId,
            action,
            targetFile,
            prompt,
            status: 'EXECUTING'
        };

        this.activeTasks.push(task);
        this.executeTask(task);
        return task;
    }

    private async executeTask(task: CodexTask) {
        console.log(`⬡ CODEX_PROTOCOL_INITIATED :: ${task.action} on ${task.targetFile}`);
        
        try {
            // Step 1: CONTEXT_STAGING
            // In a real scenario, this would gather imports and related files.
            
            // Step 2: GENERATION (via Neural Forge)
            const forgeScript = SystemConfig.resolve('_SYSTEM/neural_forge.py');
            const result = await execFilePromise('python3', [
                forgeScript,
                'eval',
                'deepseek-coder-v2',
                `Task: ${task.action}. File: ${task.targetFile}. Prompt: ${task.prompt}`
            ], {
                cwd: SystemConfig.ROOT
            });
            const output = JSON.parse(result.stdout);
            
            task.diff = output.output_preview; // Simulated diff
            
            // Step 3: VERIFICATION
            // Run linting or unit tests
            task.status = 'VERIFIED';
            console.log(`⬡ CODEX_PROTOCOL_VERIFIED :: ${task.id}`);
            
        } catch (error) {
            task.status = 'FAILED';
            console.error(`⬡ CODEX_PROTOCOL_FAILURE :: ${task.id} ->`, (error as Error).message);
        }
    }

    public getTasks() {
        return this.activeTasks;
    }
}

export const codexService = new CodexService();
