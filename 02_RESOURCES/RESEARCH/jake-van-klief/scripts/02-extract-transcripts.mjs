import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { YoutubeTranscript } from 'youtube-transcript';

const BASE = '/Users/marcelspatz/YURI-OS-MUSUBI/RESEARCH/jake-van-klief';

const videos = JSON.parse(process.argv[2] || '[]');

async function extractAll() {
  const results = [];
  for (const v of videos) {
    const outPath = `${BASE}/transcripts/${v.id}.json`;
    if (existsSync(outPath)) {
      console.log(`SKIP ${v.id}: already exists`);
      results.push({ id: v.id, status: 'cached' });
      continue;
    }
    
    try {
      console.log(`FETCH ${v.id}: ${v.title?.slice(0,50)}...`);
      const transcript = await YoutubeTranscript.fetchTranscript(v.id);
      writeFileSync(outPath, JSON.stringify({ videoId: v.id, title: v.title, segments: transcript }, null, 2));
      
      // Also write plain text version
      const text = transcript.map(s => s.text).join(' ');
      writeFileSync(`${BASE}/transcripts/${v.id}.txt`, text);
      
      results.push({ id: v.id, status: 'done', segments: transcript.length });
      console.log(`  -> ${transcript.length} segments, ${text.length} chars`);
    } catch(e) {
      results.push({ id: v.id, status: 'failed', error: e.message });
      console.error(`  FAIL: ${e.message}`);
    }
  }
  
  writeFileSync(`${BASE}/raw/extraction-log.json`, JSON.stringify(results, null, 2));
  console.log(`\nDone: ${results.filter(r => r.status === 'done').length} success, ${results.filter(r => r.status === 'failed').length} failed`);
}

extractAll().catch(console.error);
