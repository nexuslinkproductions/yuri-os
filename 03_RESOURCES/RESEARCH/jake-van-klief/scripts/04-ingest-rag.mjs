import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { apiFetch } from '../../src/lib/runtime.js';

const BASE = '/Users/marcelspatz/NUDIMMUD/RESEARCH/jake-van-klief';
const BACKEND = 'http://127.0.0.1:3004';

async function ingestToRAG() {
  // 1. Read analysis
  const analysisPath = `${BASE}/analysis/content-analysis.json`;
  if (!existsSync(analysisPath)) {
    console.log('No analysis found — run 03-analyze-content.mjs first');
    return;
  }
  
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf-8'));
  
  // 2. Create structured knowledge entries
  const knowledgeEntries = [];
  
  for (const v of analysis.videoDetail) {
    const transcriptPath = `${BASE}/transcripts/${v.videoId}.txt`;
    if (!existsSync(transcriptPath)) continue;
    
    const text = readFileSync(transcriptPath, 'utf-8').slice(0, 10000); // Truncate for DB
    
    knowledgeEntries.push({
      source: 'youtube',
      channel: '@JEVanClief',
      videoId: v.videoId,
      categories: Object.keys(v.categories),
      concepts: v.concepts.slice(0, 20),
      summary: text.slice(0, 500),
      content: text
    });
  }
  
  // 3. Write ingest manifest
  const ingestManifest = {
    timestamp: new Date().toISOString(),
    source: 'jake-van-klief-youtube',
    totalVideos: analysis.totalVideos,
    entries: knowledgeEntries.map(e => ({
      videoId: e.videoId,
      categories: e.categories,
      conceptCount: e.concepts.length,
      contentLength: e.content.length
    }))
  };
  
  writeFileSync(`${BASE}/ingest/ingest-manifest.json`, JSON.stringify(ingestManifest, null, 2));
  
  // 4. Try to ingest via backend
  console.log(`Prepared ${knowledgeEntries.length} entries for ingestion`);
  
  for (const entry of knowledgeEntries.slice(0, 3)) { // Start with 3
    try {
      const res = await fetch(`${BACKEND}/api/vault/ingest`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY || 'nudimmud-default-key-change-me'}`
        },
        body: JSON.stringify({
          source: `youtube:${entry.videoId}`,
          title: `Jake Van Clief - ${entry.videoId}`,
          content: entry.content,
          tags: entry.categories,
          metadata: { videoId: entry.videoId, channel: '@JEVanClief' }
        })
      });
      
      if (res.ok) {
        console.log(`  INGESTED ${entry.videoId}: ${res.status}`);
      } else {
        const err = await res.text();
        console.log(`  FAILED ${entry.videoId}: ${res.status} - ${err.slice(0, 100)}`);
      }
    } catch(e) {
      console.log(`  ERROR ${entry.videoId}: ${e.message}`);
    }
  }
  
  console.log('\nNext: Full vault ingestion via backend /api/vault/ingest or manual');
  console.log(`Ingest manifest at: ${BASE}/ingest/ingest-manifest.json`);
}

ingestToRAG().catch(console.error);
