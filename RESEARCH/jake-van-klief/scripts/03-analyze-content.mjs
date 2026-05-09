import { readFileSync, writeFileSync, readdirSync } from 'fs';

const BASE = '/Users/marcelspatz/NUDIMMUD/RESEARCH/jake-van-klief';
const outDir = `${BASE}/analysis`;

// Classification categories based on trading bot pipeline
const CATEGORIES = {
  MARKET_SCAN: ['market', 'scan', 'filter', 'liquidity', 'volume', 'opportunity'],
  RESEARCH: ['research', 'news', 'sentiment', 'twitter', 'reddit', 'information'],
  PREDICTION: ['predict', 'probability', 'edge', 'model', 'calibrate', 'brier', 'confidence'],
  RISK: ['risk', 'kelly', 'position', 'sizing', 'drawdown', 'exposure', 'stop'],
  EXECUTION: ['execute', 'order', 'slippage', 'limit', 'hedge', 'api'],
  COMPOUND: ['learn', 'track', 'post-mortem', 'log', 'sharpe', 'win rate'],
  MARKET_STRUCTURE: ['ict', 'liquidity', 'order flow', 'supply', 'demand', 'structure'],
  PSYCHOLOGY: ['psychology', 'discipline', 'emotion', 'fear', 'greed', 'mindset'],
};

function classifyContent(text) {
  const lower = text.toLowerCase();
  const matched = {};
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    const hits = keywords.filter(k => lower.includes(k));
    if (hits.length > 0) matched[cat] = hits;
  }
  return matched;
}

function extractKeyConcepts(text) {
  // Extract capitalized phrases (potential concepts/frameworks)
  const concepts = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g) || [];
  return [...new Set(concepts)].slice(0, 50);
}

function analyze() {
  const transcriptFiles = readdirSync(`${BASE}/transcripts`).filter(f => f.endsWith('.txt'));
  const allTexts = [];
  
  for (const file of transcriptFiles) {
    const videoId = file.replace('.txt', '');
    const text = readFileSync(`${BASE}/transcripts/${file}`, 'utf-8');
    const classifications = classifyContent(text);
    const concepts = extractKeyConcepts(text);
    
    allTexts.push({
      videoId,
      categories: classifications,
      concepts,
      charCount: text.length
    });
  }
  
  // Aggregate across all videos
  const categoryCounts = {};
  const allConcepts = [];
  
  for (const v of allTexts) {
    for (const [cat, hits] of Object.entries(v.categories)) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    allConcepts.push(...v.concepts);
  }
  
  // Count concept frequency
  const conceptFreq = {};
  for (const c of allConcepts) {
    conceptFreq[c] = (conceptFreq[c] || 0) + 1;
  }
  
  const topConcepts = Object.entries(conceptFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  
  const summary = {
    totalVideos: transcriptFiles.length,
    categoryCoverage: Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]),
    topConcepts,
    videoDetail: allTexts
  };
  
  writeFileSync(`${outDir}/content-analysis.json`, JSON.stringify(summary, null, 2));
  console.log('Analysis complete');
  console.log(`Videos: ${summary.totalVideos}`);
  console.log('Category coverage:');
  for (const [cat, count] of summary.categoryCoverage) {
    console.log(`  ${cat}: ${count}/${summary.totalVideos}`);
  }
  console.log('\nTop concepts:');
  for (const [concept, freq] of summary.topConcepts.slice(0, 10)) {
    console.log(`  ${concept}: ${freq}`);
  }
}

analyze();
