import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

function resolveEnvPath() {
    const candidates = [
        path.resolve(process.cwd(), 'backend/.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '../../.env')
    ];

    return candidates.find((candidate) => fs.existsSync(candidate));
}

dotenv.config({ path: resolveEnvPath() });

const { initDatabase } = require('../models/database') as typeof import('../models/database');
const { obsidianRest } = require('../services/obsidianRestService') as typeof import('../services/obsidianRestService');
const { neuralForge } = require('../services/neuralForgeService') as typeof import('../services/neuralForgeService');

/**
 * ⬡ VAULT_BRIDGE_PROTOCOL
 * This script bridges local Obsidian knowledge into the Neural Forge context window.
 */

const DEFAULT_MODEL = process.env.NEURAL_FORGE_BRIDGE_MODEL || 'llama3.2'; // Fast and context-efficient

async function bridgeVault(query?: string) {
    console.log('⬡ INITIATING_VAULT_BRIDGE...');

    const db = initDatabase();
    neuralForge.setDb(db);

    const operatorIntent = query?.trim() || 'Inspect the current vault state and report the strongest alignment risks.';
    const contextBlocks: string[] = [];
    let sourceTitle = 'OPERATOR_QUERY';
    let obsidianOnline = false;

    try {
        const forgeStatus = await neuralForge.ping();
        console.log(
            `⬡ NEURAL_FORGE_STATUS :: local=${forgeStatus.local} cloud=${forgeStatus.cloud} ` +
            `anthropic=${forgeStatus.anthropic} google=${forgeStatus.google} openai=${forgeStatus.openai} ` +
            `moonshot=${forgeStatus.moonshot} kimi=${forgeStatus.kimi}`
        );
    } catch (error: any) {
        console.warn(`⬡ NEURAL_FORGE_PING_WARN :: ${error.message}`);
    }

    try {
        const obsidianStatus = obsidianRest.getStatus();
        obsidianOnline = obsidianStatus.mode !== 'offline';
        console.log(
            `⬡ OBSIDIAN_STATUS :: mode=${obsidianStatus.mode} connected=${obsidianStatus.connected} ` +
            `workspaceFallback=${obsidianStatus.workspaceFallbackAvailable}`
        );

        const activeFile = await obsidianRest.getActiveFile();
        if (activeFile?.path) {
            const noteContent = await obsidianRest.readNote(activeFile.path);
            contextBlocks.push(`--- SOURCE: ${activeFile.path} ---\n${noteContent}`);
            sourceTitle = activeFile.path;
            obsidianOnline = true;
        } else {
            console.warn('⬡ OBSIDIAN_REST_OFFLINE :: Continuing with Forge-only bridge context.');
        }
    } catch (error: any) {
        console.warn(`⬡ OBSIDIAN_PING_WARN :: ${error.message}`);
        console.warn('⬡ OBSIDIAN_REST_OFFLINE :: Continuing with Forge-only bridge context.');
    }

    if (query?.trim()) {
        contextBlocks.push(`--- OPERATOR_QUERY ---\n${operatorIntent}`);
    }

    if (contextBlocks.length === 0) {
        contextBlocks.push([
            '--- BRIDGE_DIAGNOSTIC ---',
            'No Obsidian REST context was available and no operator query was supplied.',
            'Use the bridge query to seed Forge retrieval against the vault graph.'
        ].join('\n'));
        sourceTitle = 'BRIDGE_DIAGNOSTIC';
    }

    console.log(`⬡ CONTEXT_SOURCE :: ${sourceTitle} (${contextBlocks.join('\n\n').length} chars)`);

    try {
        const prompt = `
[BRIDGE_STATUS]
Obsidian REST: ${obsidianOnline ? 'ONLINE' : 'OFFLINE'}
Bridge Query: ${operatorIntent}

[CONTEXT_INJECTION_FROM_VAULT]
${contextBlocks.join('\n\n')}

[OBJECTIVE]
Analyze the provided context from my Obsidian vault. Provide high-density, critical feedback, identify hidden patterns, and suggest 3 strategic next steps for this project. Focus on "${operatorIntent}" and the health of the vault/forge link.

[FEEDBACK_SPECIFICATION]
- Be concise but profound.
- Use a technical, "C2 Command" tone.
- Format with clear headers.
`;

        console.log('⬡ TRANSMITTING_TO_NEURAL_FORGE...');

        const response = await neuralForge.chat(
            DEFAULT_MODEL,
            [{ role: 'user', content: prompt }],
            'You are the Neural Forge bridge node. Convert vault context into actionable, operational analysis.',
            {
                allowLocal: true,
                allowCloud: process.env.NEURAL_FORGE_ALLOW_CLOUD === 'true',
                retrievalProfile: 'CROSS_VAULT_SYNTHESIS',
                reasoningBudget: 'balanced',
                compressionMode: 'safe'
            }
        );

        console.log('\n⬡ --- NEURAL_INSIGHT_RECEIVED ---\n');
        console.log(response.content);
        console.log('\n⬡ --- END_OF_TRANSMISSION ---\n');
    } catch (err: any) {
        console.error('⬡ BRIDGE_FAILURE ::', err.message);
    }
}

// Execute the bridge
const userQuery = process.argv.slice(2).join(' ');
bridgeVault(userQuery);
