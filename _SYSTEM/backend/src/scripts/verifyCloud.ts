import { neuralForge } from '../services/neuralForgeService';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verify() {
    console.log("⬡ STARTING_CLOUD_VERIFICATION...");
    
    console.log("⬡ CHECKING_CREDENTIALS...");
    const apiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY;
    const endpoint = process.env.OLLAMA_CLOUD_ENDPOINT;
    
    if (!apiKey) {
        console.error("!!! OLLAMA_API_KEY or OLLAMA_CLOUD_API_KEY is missing in .env");
        return;
    }
    console.log(`>>> Endpoint: ${endpoint}`);
    console.log(`>>> API Key found: ${apiKey.substring(0, 8)}...`);

    try {
        console.log("⬡ PINGING_FORGE...");
        const status = await neuralForge.ping();
        console.log(`>>> Status: Local=${status.local}, Cloud=${status.cloud}`);

        if (status.cloud) {
            console.log("⬡ TESTING_CLOUD_EMBEDDING...");
            const embedding = await neuralForge.getEmbedding("Verify Cloud Connectivity", "nomic-embed-text:cloud");
            if (embedding) {
                console.log(">>> Cloud embedding successful!");
            } else {
                console.error("!!! Cloud embedding failed.");
            }
        } else {
            console.warn("!!! Cloud is unreachable according to ping.");
        }

    } catch (error: any) {
        console.error(`!!! VERIFICATION_ERROR: ${error.message}`);
    }
    
    console.log("⬡ VERIFICATION_COMPLETE");
}

verify();
