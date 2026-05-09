/**
 * ⬡ YURI_TRADING :: tradingScoreService
 * Palantir-grade composite signal scoring engine on :3004.
 * Architecture: normalize feeds → score individually → merge cross-source → rank.
 */

const WEIGHTS = {
  dex: { volumeSpike: 15, liquidity: 10, ageFreshness: 10 },    // max 35
  funding: { rateBias: 20, openInterest: 10 },                    // max 30
  whale: { amountMagnitude: 15, accumulationSignal: 10 },         // max 25
  crossSource: { multiFeedBonus: 10 },                            // max 10
  totalMax: 100,  // canonical ceiling — normalized from (35+30+25+10)=100
} as const;

// Freshness decay half-life constants (in seconds)
const DECAY = {
  dexAge: { halfLife: 21_600, minWeight: 0.15 },   // 6h half-life, 15% floor
  fundingStaleness: { halfLife: 300, minWeight: 0.5 }, // 5min half-life
  whaleRecency: { halfLife: 3_600, minWeight: 0.2 },   // 1h half-life
} as const;

// Entity resolution: canonical symbol map
const SYMBOL_MAP: Record<string, string> = {
  'WBTC': 'BTC', 'RENBTC': 'BTC', 'SBTC': 'BTC',
  'WETH': 'ETH', 'STETH': 'ETH', 'RETH': 'ETH',
  'USDC.E': 'USDC', 'USDT.E': 'USDT',
};

export interface ScoredDexPair {
  token: string; chainId: string; dex: string; age: number;
  priceUsd: number; liquidity: number; volume1h: number; volumeSpikePct: number;
  subScores: { volumeSpike: number; liquidity: number; ageFreshness: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'dex'; signals: string[];
}

export interface ScoredFundingAsset {
  token: string; markPx: number; fundingRate: number; funding8h: number;
  openInterest: number; signalBias: 'SHORT_BIAS'|'LONG_BIAS'|'NEUTRAL';
  subScores: { rateBias: number; openInterest: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'funding'; signals: string[];
}

export interface ScoredWhaleTransaction {
  id: string; token: string; blockchain: string; amountUsd: number;
  fromOwner: string; toOwner: string; type: string; timestamp: string|null;
  subScores: { amountMagnitude: number; accumulationSignal: number };
  score: number; confidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL';
  source: 'whale'; signals: string[];
}

export interface MergedSignal {
  token: string; sources: string[]; sourceCount: number;
  dexSignals: ScoredDexPair[]; fundingSignals: ScoredFundingAsset[];
  whaleSignals: ScoredWhaleTransaction[];
  aggregateScore: number; maxConfidence: 'LOW'|'MEDIUM'|'HIGH';
  urgency: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL'; topSignals: string[];
  evidence: string[];
  sourceSet: string[];
}

export interface SignalReport {
  ts: string;
  summary: {
    totalDexSignals: number; totalFundingSignals: number;
    totalWhaleSignals: number; mergedTokens: number;
    criticalCount: number; elevatedCount: number;
  };
  topMerged: MergedSignal[]; topDex: ScoredDexPair[];
  topFunding: ScoredFundingAsset[]; topWhale: ScoredWhaleTransaction[];
}

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function logScale(v: number, min: number, max: number, pts: number) {
  if (v <= min) return 0; if (v >= max) return pts;
  return clamp((Math.log(v)-Math.log(min))/(Math.log(max)-Math.log(min))*pts,0,pts);
}

function scoreDexPair(p: any): ScoredDexPair {
  const sig: string[] = [];
  const vs = clamp(logScale(p.volumeSpikePct,200,3000,15),0,15);
  if(vs>=12)sig.push('EXPLOSIVE_VOLUME');else if(vs>=7)sig.push('HIGH_VOLUME');
  const ls = clamp(logScale(p.liquidity,10_000,1_000_000,10),0,10);
  if(ls>=8)sig.push('DEEP_LIQUIDITY');else if(ls>=4)sig.push('ADEQUATE_LIQUIDITY');
  const as = clamp(10*(1-(p.age/3600)/24),0,10);
  if(p.age<3600)sig.push('BRAND_NEW');else if(p.age<21600)sig.push('FRESH');
  const t = Math.round(vs+ls+as);
  return{token:(p.baseToken||'???').toUpperCase(),chainId:p.chainId||'unknown',dex:p.dex||'',age:p.age,priceUsd:p.priceUsd,liquidity:p.liquidity,volume1h:p.volume1h,volumeSpikePct:p.volumeSpikePct,subScores:{volumeSpike:+vs.toFixed(1),liquidity:+ls.toFixed(1),ageFreshness:+as.toFixed(1)},score:t,confidence:t>=25?'HIGH':t>=15?'MEDIUM':'LOW',urgency:t>=30?'CRITICAL':t>=22?'ELEVATED':t>=12?'WATCH':'NEUTRAL',source:'dex',signals:sig};
}

function scoreFundingAsset(a: any): ScoredFundingAsset {
  const sig: string[] = [];
  const abs = Math.abs(a.fundingRate||0);
  const rs = clamp(logScale(abs,0.0001,0.003,20),0,20);
  if(rs>=16)sig.push('EXTREME_FUNDING');else if(rs>=10)sig.push('HIGH_FUNDING');
  const bias: 'SHORT_BIAS'|'LONG_BIAS'|'NEUTRAL'=(a.fundingRate||0)>0.001?'SHORT_BIAS':(a.fundingRate||0)<-0.001?'LONG_BIAS':'NEUTRAL';
  if(bias!=='NEUTRAL')sig.push(bias);
  const os = clamp(logScale(a.openInterest||0,1_000_000,100_000_000,10),0,10);
  if(os>=7)sig.push('HIGH_OI');
  const t = Math.round(rs+os);
  return{token:(a.asset||'???').toUpperCase(),markPx:a.markPx||0,fundingRate:a.fundingRate||0,funding8h:a.funding8h||0,openInterest:a.openInterest||0,signalBias:bias,subScores:{rateBias:+rs.toFixed(1),openInterest:+os.toFixed(1)},score:t,confidence:t>=20?'HIGH':t>=10?'MEDIUM':'LOW',urgency:t>=24?'CRITICAL':t>=16?'ELEVATED':t>=8?'WATCH':'NEUTRAL',source:'funding',signals:sig};
}

function scoreWhaleTransaction(tx: any): ScoredWhaleTransaction {
  const sig: string[] = [];
  const as = clamp(logScale(tx.amountUsd||0,500_000,50_000_000,15),0,15);
  if(as>=12)sig.push('MEGA_WHALE');else if(as>=7)sig.push('LARGE_WHALE');
  const type = tx.type||'TRANSFER';
  let ac=0;if(type==='EXCHANGE_WITHDRAWAL'){ac=10;sig.push('ACCUMULATION');}else if(type==='EXCHANGE_DEPOSIT'){ac=2;sig.push('DISTRIBUTION');}
  const t = Math.round(as+ac);
  return{id:tx.id||'',token:(tx.symbol||'???').toUpperCase(),blockchain:tx.blockchain||'',amountUsd:tx.amountUsd||0,fromOwner:tx.fromOwner||'',toOwner:tx.toOwner||'',type,timestamp:tx.timestamp||null,subScores:{amountMagnitude:+as.toFixed(1),accumulationSignal:ac},score:t,confidence:t>=18?'HIGH':t>=10?'MEDIUM':'LOW',urgency:t>=20?'CRITICAL':t>=14?'ELEVATED':t>=7?'WATCH':'NEUTRAL',source:'whale',signals:sig};
}

function mergeSignals(
  dx: ScoredDexPair[], fu: ScoredFundingAsset[], wh: ScoredWhaleTransaction[],
): MergedSignal[] {
  const m = new Map<string,{dx:ScoredDexPair[];fu:ScoredFundingAsset[];wh:ScoredWhaleTransaction[]}>();
  for(const d of dx){if(!m.has(d.token))m.set(d.token,{dx:[],fu:[],wh:[]});m.get(d.token)!.dx.push(d);}
  for(const f of fu){if(!m.has(f.token))m.set(f.token,{dx:[],fu:[],wh:[]});m.get(f.token)!.fu.push(f);}
  for(const w of wh){if(!m.has(w.token))m.set(w.token,{dx:[],fu:[],wh:[]});m.get(w.token)!.wh.push(w);}
  const out: MergedSignal[] = [];
  for(const [token,f] of m){
    const src: string[] = [];if(f.dx.length)src.push('dex');if(f.fu.length)src.push('funding');if(f.wh.length)src.push('whale');
    const bd=f.dx.reduce((mx,s)=>s.score>mx?s.score:mx,0);
    const bf=f.fu.reduce((mx,s)=>s.score>mx?s.score:mx,0);
    const bw=f.wh.reduce((mx,s)=>s.score>mx?s.score:mx,0);
    const bonus = src.length>=2?WEIGHTS.crossSource.multiFeedBonus:0;
    const agg = Math.round(Math.max(bd,bf,bw)+bonus);
    const allSigs=[...f.dx.flatMap(s=>s.signals),...f.fu.flatMap(s=>s.signals),...f.wh.flatMap(s=>s.signals)];
    const ts = [...new Set(allSigs)].slice(0,8);
    const partial: Omit<MergedSignal,'evidence'> = {token,sources:src,sourceCount:src.length,sourceSet:src,dexSignals:f.dx,fundingSignals:f.fu,whaleSignals:f.wh,aggregateScore:agg,maxConfidence:src.length>=2?'HIGH':agg>=20?'MEDIUM':'LOW',urgency:agg>=30?'CRITICAL':agg>=20?'ELEVATED':agg>=10?'WATCH':'NEUTRAL',topSignals:ts};
    // Recompute confidence/urgency on normalized 0-100 scale
    const maxConf: 'LOW'|'MEDIUM'|'HIGH' = src.length>=2 ? 'HIGH' : agg>=50 ? 'MEDIUM' : 'LOW';
    const urg: 'CRITICAL'|'ELEVATED'|'WATCH'|'NEUTRAL' = agg>=65 ? 'CRITICAL' : agg>=45 ? 'ELEVATED' : agg>=20 ? 'WATCH' : 'NEUTRAL';
    const mergedSig: MergedSignal = {...partial, maxConfidence: maxConf, urgency: urg, evidence: buildEvidence({...partial, maxConfidence: maxConf, urgency: urg, evidence: []})};
    out.push(mergedSig);
  }
  out.sort((a,b)=>b.aggregateScore-a.aggregateScore);
  return out;
}

// ── Freshness Decay ────────────────────────────────────────────────────
function decay(elapsedSeconds: number, halfLife: number, minWeight: number): number {
  if (elapsedSeconds <= 0) return 1;
  const lambda = Math.LN2 / halfLife;
  return Math.max(minWeight, Math.exp(-lambda * elapsedSeconds));
}

// ── Entity Resolution ──────────────────────────────────────────────────
function canonicalizeToken(symbol: string): string {
  const upper = (symbol || '???').toUpperCase().trim();
  return SYMBOL_MAP[upper] || upper;
}

// ── Score Normalization ────────────────────────────────────────────────
function normalizeScore(rawScore: number, sourceMax: number): number {
  return clamp(Math.round((rawScore / sourceMax) * 100), 0, 100);
}

// ── Evidence Builder ───────────────────────────────────────────────────
function buildEvidence(m: MergedSignal): string[] {
  const reasons: string[] = [];
  if (m.sourceCount >= 2) reasons.push(`Cross-source confirmation (${m.sources.join('+')})`);
  for (const sig of m.topSignals) reasons.push(sig.replace(/_/g, ' '));
  if (m.maxConfidence === 'HIGH') reasons.push('High confidence');
  return reasons;
}

// ── News & Sentiment Scoring ──────────────────────────────────────────

function scoreNewsImpact(articles: any[], token: string): { score: number; evidence: string[] } {
  const relevant = articles.filter(a => (a.assets || []).includes(token));
  if (relevant.length === 0) return { score: 0, evidence: [] };

  let score = 0;
  const evidence: string[] = [];
  const sentiments = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };

  for (const a of relevant) {
    const s = (a as any).sentiment as keyof typeof sentiments;
    sentiments[s] = (sentiments[s] || 0) + ((a as any).strength || 1);
    evidence.push(`[${s}] ${(a as any).headline.slice(0, 60)}`);
  }

  score = sentiments.BULLISH * 3 - sentiments.BEARISH * 3;
  return { score: clamp(score, -15, 15), evidence: evidence.slice(0, 5) };
}

function scoreSentiment(fng: any[]): { score: number; evidence: string[] } {
  if (!fng.length) return { score: 0, evidence: [] };
  const current = fng[0];
  const val = current.value || 50;
  // Extreme readings are contrarian signals
  const contrarian = val <= 25 ? 8 : val >= 75 ? -6 : 0; // extreme fear → bullish, extreme greed → bearish
  const evidence = [`Fear & Greed: ${current.sentiment} (${val}/100) ${current.emoji}`];
  return { score: contrarian, evidence };
}

export function computeSignals(feeds: {dex?:{pairs?:any[]};funding?:{assets?:any[]};whale?:{transactions?:any[]};jupiter?:{tokens?:any[]};birdeye?:{tokens?:any[]};feargreed?:{data?:any[]};news?:{articles?:any[]}}): SignalReport {
  const now = Date.now();

  // Score with freshness decay applied
  const dp = (feeds.dex?.pairs||[]).map(p => {
    const scored = scoreDexPair(p);
    const elapsed = p.age || 0;
    const d = decay(elapsed, DECAY.dexAge.halfLife, DECAY.dexAge.minWeight);
    scored.score = normalizeScore(Math.round(scored.score * d), WEIGHTS.dex.volumeSpike + WEIGHTS.dex.liquidity + WEIGHTS.dex.ageFreshness);
    return scored;
  });

  const fa = (feeds.funding?.assets||[]).map(a => {
    const scored = scoreFundingAsset(a);
    // Funding staleness: use poll interval as proxy (data is always <5min old from poller)
    const d = decay(0, DECAY.fundingStaleness.halfLife, DECAY.fundingStaleness.minWeight);
    scored.score = normalizeScore(Math.round(scored.score * d), WEIGHTS.funding.rateBias + WEIGHTS.funding.openInterest);
    return scored;
  });

  const wt = (feeds.whale?.transactions||[]).map(tx => {
    const scored = scoreWhaleTransaction(tx);
    const elapsed = tx.timestamp ? (now - new Date(tx.timestamp).getTime()) / 1000 : 0;
    const d = decay(elapsed, DECAY.whaleRecency.halfLife, DECAY.whaleRecency.minWeight);
    scored.score = normalizeScore(Math.round(scored.score * d), WEIGHTS.whale.amountMagnitude + WEIGHTS.whale.accumulationSignal);
    return scored;
  });

  // Canonicalize token symbols for merge
  for (const d of dp) d.token = canonicalizeToken(d.token);
  for (const f of fa) f.token = canonicalizeToken(f.token);
  for (const w of wt) w.token = canonicalizeToken(w.token);

  // Build discovery source sets from Jupiter + Birdeye
  const jupiterTokens = new Set((feeds.jupiter?.tokens||[]).map(t => canonicalizeToken(t.token)));
  const birdeyeTokens = new Set((feeds.birdeye?.tokens||[]).map(t => canonicalizeToken(t.token)));

  // Sort
  dp.sort((a,b)=>b.score-a.score);
  fa.sort((a,b)=>b.score-a.score);
  wt.sort((a,b)=>b.score-a.score);

  const merged = mergeSignals(dp,fa,wt);

  // Apply news & sentiment augmentation
  const articles = feeds.news?.articles || [];
  const fngData = feeds.feargreed?.data || [];
  const fngScore = scoreSentiment(fngData);

  for (const m of merged) {
    const newsScore = scoreNewsImpact(articles, m.token);
    if (newsScore.score !== 0) {
      m.aggregateScore = clamp(m.aggregateScore + newsScore.score, 0, 100);
      m.evidence.push(...newsScore.evidence);
      if (!m.sources.includes('news')) m.sources.push('news');
      m.sourceCount = m.sources.length;
    }
    if (fngScore.score !== 0) {
      m.aggregateScore = clamp(m.aggregateScore + fngScore.score, 0, 100);
      m.evidence.push(...fngScore.evidence);
    }
    // Recompute urgency after adjustments
    m.urgency = m.aggregateScore >= 65 ? 'CRITICAL' : m.aggregateScore >= 45 ? 'ELEVATED' : m.aggregateScore >= 20 ? 'WATCH' : 'NEUTRAL';
  }

  return {
    ts: new Date().toISOString(),
    summary: {
      totalDexSignals: dp.length, totalFundingSignals: fa.length,
      totalWhaleSignals: wt.length, mergedTokens: merged.length,
      criticalCount: merged.filter(m=>m.urgency==='CRITICAL').length,
      elevatedCount: merged.filter(m=>m.urgency==='ELEVATED').length,
    },
    topMerged: merged.slice(0,20), topDex: dp.slice(0,10),
    topFunding: fa.slice(0,10), topWhale: wt.slice(0,10),
  };
}
