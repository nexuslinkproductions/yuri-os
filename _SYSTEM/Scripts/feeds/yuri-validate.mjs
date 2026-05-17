#!/usr/bin/env node
/**
 * ⬡ YURI TRADING :: yuri-validate.mjs — smoke test suite
 * Run: node _SYSTEM/Scripts/feeds/yuri-validate.mjs
 * Exit 0 = all clear, Exit 1 = failures
 */
const AGG='http://127.0.0.1:4201', API='http://127.0.0.1:3004';
let failures=0; const results=[];

async function check(label, fn) {
  try { await fn(); results.push(`  ✅ ${label}`); }
  catch(e) { failures++; results.push(`  ❌ ${label}: ${e.message}`); }
}

async function fetchOK(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function testAggregator() {
  console.log('\n📡 Aggregator (:4201)');
  await check('GET /health', async () => {
    const d = await fetchOK(`${AGG}/health`);
    if (d.status !== 'ok') throw new Error('status');
    for (const f of ['dex','funding','whale','feargreed','news'])
      if (!(f in d.feeds)) throw new Error(`missing ${f}`);
  });
  await check('GET /feeds/dex', async () => {
    const d = await fetchOK(`${AGG}/feeds/dex`);
    if (!Array.isArray(d.pairs)) throw new Error('pairs');
  });
  await check('GET /feeds/funding', async () => {
    const d = await fetchOK(`${AGG}/feeds/funding`);
    if (!Array.isArray(d.assets) || d.assets.length === 0) throw new Error('assets empty');
    const a=d.assets[0]; if(typeof a.fundingRate!=='number') throw new Error('rate');
  });
  await check('GET /feeds/feargreed', async () => {
    const d = await fetchOK(`${AGG}/feeds/feargreed`);
    if (d.data.length>0) { const f=d.data[0]; if(f.value<0||f.value>100) throw new Error('range'); }
  });
  await check('GET /feeds/news', async () => {
    const d = await fetchOK(`${AGG}/feeds/news`);
    if (!Array.isArray(d.articles)) throw new Error('articles');
    if (d.articles.length>0) { const n=d.articles[0]; if(!n.sentiment||!['BULLISH','BEARISH','NEUTRAL'].includes(n.sentiment)) throw new Error('sentiment'); }
  });
}

async function testBackend() {
  console.log('\n🔧 Backend (:3004)');
  for (const f of ['dex','funding','whale','jupiter','birdeye','feargreed','news'])
    await check(`GET /api/trading/feeds/${f}`, async () => { await fetchOK(`${API}/api/trading/feeds/${f}`); });
  await check('GET /api/trading/signals', async () => {
    const d = await fetchOK(`${API}/api/trading/signals`);
    if (!d.topMerged || !d.summary) throw new Error('shape');
    if (d.topMerged.length>0) {
      const m=d.topMerged[0];
      if (typeof m.aggregateScore!=='number'||m.aggregateScore<0||m.aggregateScore>100) throw new Error('score range');
      if (!['CRITICAL','ELEVATED','WATCH','NEUTRAL'].includes(m.urgency)) throw new Error('urgency');
      if (!Array.isArray(m.evidence)) throw new Error('evidence');
    }
  });
  await check('GET /api/trading/signals/merged', async () => {
    const d = await fetchOK(`${API}/api/trading/signals/merged`);
    if (!d.signals || !d.summary || typeof d.summary.criticalCount!=='number') throw new Error('shape');
  });
}

async function testFreshness() {
  console.log('\n⏱️  Freshness');
  await check('DEX stale', async () => {
    const d=await fetchOK(`${AGG}/feeds/dex`);
    if(d.lastUpdated&&(Date.now()-new Date(d.lastUpdated).getTime())/1000>120) throw new Error('stale');
  });
  await check('Funding stale', async () => {
    const d=await fetchOK(`${AGG}/feeds/funding`);
    if(d.lastUpdated&&(Date.now()-new Date(d.lastUpdated).getTime())/1000>60) throw new Error('stale');
  });
  await check('F&G stale', async () => {
    const d=await fetchOK(`${AGG}/feeds/feargreed`);
    if(d.lastUpdated&&d.data.length>0&&(Date.now()-new Date(d.lastUpdated).getTime())/1000>600) throw new Error('stale');
  });
}

async function testDegraded() {
  console.log('\n🔄 Degraded');
  await check('All routes return JSON', async () => {
    for(const r of ['/health','/feeds/dex','/feeds/funding','/feeds/whale','/feeds/feargreed','/feeds/news','/feeds/coinbase']){
      const res=await fetch(`${AGG}${r}`); try{await res.json()}catch{throw new Error(`${r} non-JSON`)};
    }
  });
}

async function main() {
  console.log('⬡ YURI TRADING :: VALIDATION — '+new Date().toISOString());
  await testAggregator(); await testBackend(); await testFreshness(); await testDegraded();
  console.log(`\n${'─'.repeat(40)}\n${results.filter(r=>r.includes('✅')).length}/${results.length} passed`);
  results.filter(r=>r.includes('❌')).forEach(r=>console.log(r));
  if(failures>0){console.log(`\n❌ ${failures} failure(s)`); process.exit(1);}
  console.log('\n✅ ALL CLEAR'); process.exit(0);
}
main().catch(e=>{console.error('FATAL:',e.message); process.exit(1);});
