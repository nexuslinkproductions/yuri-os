#!/usr/bin/env node
/**
 * context-pack.mjs — assemble the drafting context for the content engine.
 *
 * Zero-dep. Reads the newest signals-radar sweep + fresh threads-inbox
 * captures and prints a ranked, paste-ready context pack for the drafting
 * agent: top signals, top competitor posts by likes, today's drafts path.
 *
 * Usage:  node _SYSTEM/content-engine/context-pack.mjs [--top 8] [--json]
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RADAR = join(ROOT, "_SYSTEM", "signals-radar");
const SWEEPS = join(RADAR, "signals");
const INBOX = join(RADAR, "threads-inbox");
const DRAFTS_ROOT = join(ROOT, "00_COMMAND-CENTER", "Inbox", "content-drafts");

const args = process.argv.slice(2);
const TOP = Number(args[args.indexOf("--top") + 1] || 8);
const AS_JSON = args.includes("--json");

const today = new Date().toISOString().slice(0, 10);

function latestSweep() {
  if (!existsSync(SWEEPS)) return null;
  const days = readdirSync(SWEEPS).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!days.length) return null;
  const file = join(SWEEPS, days[days.length - 1], "signals.json");
  if (!existsSync(file)) return null;
  try {
    return { day: days[days.length - 1], data: JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return null;
  }
}

function threadsCaptures() {
  if (!existsSync(INBOX)) return [];
  const posts = [];
  for (const f of readdirSync(INBOX)) {
    if (!f.endsWith(".json")) continue;
    try {
      const cap = JSON.parse(readFileSync(join(INBOX, f), "utf8"));
      for (const p of cap.posts || []) {
        posts.push({ account: cap.account, ...p });
      }
    } catch { /* skip malformed capture */ }
  }
  return posts;
}

const sweep = latestSweep();
const threads = threadsCaptures();

const signals = (sweep?.data?.items || [])
  .filter((i) => (i.signal || 0) > 0)
  .sort((a, b) => b.signal - a.signal)
  .slice(0, TOP);

const topThreads = threads
  .slice()
  .sort((a, b) => (b.likes || 0) - (a.likes || 0))
  .slice(0, TOP);

const pack = {
  generated_at: new Date().toISOString(),
  sweep_day: sweep?.day || null,
  voice_doc: "02_RESOURCES/GUIDES/CONTENT-VOICE.md",
  drafts_dir: join(DRAFTS_ROOT, today),
  top_signals: signals.map((s) => ({
    channel: s.channel, title: s.title, signal: s.signal_label, url: s.url,
    summary: (s.summary || "").slice(0, 200),
  })),
  top_threads_posts: topThreads.map((p) => ({
    account: p.account, likes: p.likes, replies: p.replies, posted: p.posted,
    text: (p.text || "").slice(0, 400),
  })),
  channels: sweep?.data?.channels || {},
};

if (AS_JSON) {
  console.log(JSON.stringify(pack, null, 2));
} else {
  console.log(`# Content context pack — ${pack.generated_at}`);
  console.log(`sweep: ${pack.sweep_day || "NONE — run research_signals.py first"}`);
  console.log(`voice: ${pack.voice_doc}`);
  console.log(`drafts → ${pack.drafts_dir}\n`);
  console.log(`## Top signals (${signals.length})`);
  for (const s of pack.top_signals) {
    console.log(`- [${s.channel}] ${s.title} — ${s.signal}\n  ${s.summary}`);
  }
  console.log(`\n## Top competitor Threads posts (${topThreads.length})`);
  for (const p of pack.top_threads_posts) {
    console.log(`- @${p.account} (${p.likes} likes, ${p.posted}):\n  ${p.text.replace(/\n/g, " / ")}`);
  }
  if (!sweep) {
    console.log("\nWARN: no sweep found — run: cd _SYSTEM/signals-radar && ./.venv/bin/python research_signals.py");
  }
  const stale = threads.length === 0;
  if (stale) console.log("WARN: threads-inbox empty — refresh captures via the browser bridge");
}
