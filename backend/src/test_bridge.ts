import { initDatabase } from './models/database';
import { vectorSearch } from './services/vectorSearchService';

async function verifyBridge() {
    const db = initDatabase();
    console.log('⬡ VERIFYING_NEURAL_BRIDGE...');

    const query = "What is the secret key and when was the Aeonic Protocol activated?";
    const results = await vectorSearch.search(db, query, 3);

    console.log('\n⬡ SEARCH_RESULTS:');
    results.forEach((r, i) => {
        console.log(`[${i+1}] ${r.title} (Similarity: ${(r as any).similarity.toFixed(4)})`);
        console.log(`Content: ${r.content.substring(0, 100)}...`);
        console.log('---');
    });

    if (results.length > 0 && results[0].title.includes('Secret Key')) {
        console.log('✅ SUCCESS :: Neural Bridge is operational and reading from Obsidian.');
    } else {
        console.log('❌ FAILURE :: No relevant notes found. Ensure Ollama is running and nomic-embed-text is pulled.');
    }
}

verifyBridge().catch(console.error);
