#!/usr/bin/env node
/**
 * ⬡ YURI_TRADING :: news-feed.mjs
 * Aggregates CoinDesk/CoinTelegraph/TheBlock RSS → { asset, headline, sentiment }
 */
import https from 'node:https';

const SOURCES = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'TheBlock', url: 'https://www.theblock.co/rss.xml' },
];
const POLL_MS = 120_000;

function fetchText(url) {
  return new Promise((res, rej) => {
    https.get(url, { timeout: 15_000 }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej);
  });
}

const ASSET_RE = [
  [/\b(Bitcoin|BTC)\b/gi,'BTC'],[/\b(Ethereum|Ether|ETH)\b/gi,'ETH'],[/\b(Solana|SOL)\b/gi,'SOL'],
  [/\b(XRP|Ripple)\b/gi,'XRP'],[/\b(Dogecoin|DOGE)\b/gi,'DOGE'],[/\b(Cardano|ADA)\b/gi,'ADA'],
  [/\b(BNB)\b/gi,'BNB'],[/\b(Avalanche|AVAX)\b/gi,'AVAX'],[/\b(Polygon|MATIC|POL)\b/gi,'POL'],
  [/\b(Chainlink|LINK)\b/gi,'LINK'],[/\b(Uniswap|UNI)\b/gi,'UNI'],
  [/\b(ETF|Exchange-Traded)\b/gi,'BTC'],[/\b(Fed|Federal Reserve|rate cut|rate hike)\b/gi,'MACRO'],
  [/\b(SEC|regulation|crackdown|lawsuit)\b/gi,'REGULATION'],[/\b(hack|exploit|stolen)\b/gi,'SECURITY'],
  [/\b(airdrop|listing|mainnet|launch)\b/gi,'EVENTS'],
];

function detectAssets(h) { const s=new Set(); for(const [re,t] of ASSET_RE) if(re.test(h)) s.add(t); return [...s]; }

function classifySentiment(h) {
  const l=h.toLowerCase(); let s=0;
  'crash plunge dump ban crackdown lawsuit hack exploit fear sell-off bear decline drop fall'.split(' ').forEach(w=>{if(l.includes(w))s-=2});
  'surge rally pump approval etf adoption breakthrough bull rise record high green partnership'.split(' ').forEach(w=>{if(l.includes(w))s+=2});
  if(s>=3)return{sentiment:'BULLISH',strength:Math.min(s,10)};
  if(s<=-3)return{sentiment:'BEARISH',strength:Math.min(-s,10)};
  return{sentiment:'NEUTRAL',strength:0};
}

function parseRSS(xml) {
  const items=[];
  const re=/<item>([\s\S]*?)<\/item>/gi; let m;
  while((m=re.exec(xml))!==null){
    const b=m[1];
    const t=(b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)||[])[1]||'';
    const lk=(b.match(/<link>(.*?)<\/link>/i)||[])[1]||'';
    const pd=(b.match(/<pubDate>(.*?)<\/pubDate>/i)||[])[1]||'';
    if(t) items.push({title:t.replace(/<[^>]+>/g,'').trim(),link:lk,pubDate:pd});
  }
  return items;
}

async function pollOnce() {
  const all=[];
  for(const src of SOURCES){
    try{
      const xml=await fetchText(src.url);
      const items=parseRSS(xml).slice(0,8);
      for(const it of items){
        const assets=detectAssets(it.title); if(!assets.length) continue;
        const {sentiment,strength}=classifySentiment(it.title);
        all.push({headline:it.title,source:src.name,url:it.link,publishedAt:it.pubDate,assets,sentiment,strength,type:'news'});
      }
    }catch(e){console.error(`⬡ YURI_TRADING :: news-feed ${src.name} err: ${e.message}`);}
  }
  const seen=new Set();
  const dedup=all.filter(i=>{const k=i.headline.slice(0,60).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true;});
  dedup.sort((a,b)=>new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime());
  const sel=dedup.slice(0,25);
  console.log(`⬡ YURI_TRADING :: news-feed poll — ${sel.length} articles`);
  return sel;
}

let pollTimer=null, latestNews=[];
export function startNewsFeed(cb){if(pollTimer)clearInterval(pollTimer); pollOnce().then(d=>{latestNews=d;if(cb)cb(d);}); pollTimer=setInterval(async()=>{const d=await pollOnce(); latestNews=d; if(cb)cb(d);},POLL_MS); console.log(`⬡ YURI_TRADING :: news-feed started`); return()=>{if(pollTimer){clearInterval(pollTimer);pollTimer=null;}};}
export function getLatestNews(){return latestNews;}

function standalone() {
  console.log(`⬡ YURI_TRADING :: news-feed standalone — ${new Date().toISOString()}`);
  pollOnce().then(items=>{items.slice(0,10).forEach(i=>console.log(`  [${i.sentiment}] ${i.assets.join(',')} — ${i.headline.slice(0,80)}`)); process.exit(0);});
}
if(process.argv[1]?.includes('news-feed.mjs')) standalone();
