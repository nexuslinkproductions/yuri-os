#!/usr/bin/env node
// @capability: voice-reply-tts
// @serves: speak claude reply | voice loop output | tts stop hook | conversational voice | hear claude talk back
// @does: Stop hook — extracts a CONVERSATIONAL spoken line from the last assistant turn (drops code, paths, filenames, urls, hashes, commands) and speaks it via voice-speak.sh (Rick server) or `say`. DISARMED unless armed.
// @use: OUT half of the voice loop. Arm with `voice-seam.sh on`. Override the spoken text with [[speak: ...]] in a reply.
// @exports: (Stop-hook entrypoint, stdin JSON)
//
// Contract (verified https://code.claude.com/docs/en/hooks): Stop stdin = {transcript_path, agent_id?, ...};
// transcript = JSONL assistant entries with content[] text blocks; Stop hooks do NOT honor async -> detach playback.
// Voice MUST NEVER break the session: every failure path exits 0.

import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ok = () => process.exit(0);

// Turn raw assistant markdown into a short CONVERSATIONAL line for speech.
function toSpeech(text) {
  // 1. explicit override wins: [[speak: ...]]
  const ov = text.match(/\[\[\s*speak\s*:\s*([\s\S]*?)\]\]/i);
  if (ov && ov[1].trim()) return clamp(collapse(ov[1]));

  // 2. drop fenced code blocks entirely, then keep only prose-ish lines
  const noCode = text.replace(/```[\s\S]*?```/g, ' ');
  const kept = [];
  for (let raw of noCode.split('\n')) {
    let s = raw.trim();
    if (!s) continue;
    if (/^#{1,6}\s+/.test(s)) s = s.replace(/^#{1,6}\s+/, '');     // header -> its words
    if (/^\s*[-*+]\s+/.test(s)) s = s.replace(/^\s*[-*+]\s+/, ''); // bullet -> its words
    if (/^\s*\d+\.\s+/.test(s)) s = s.replace(/^\s*\d+\.\s+/, '');
    if (/^[>|]/.test(s)) s = s.replace(/^[>|]\s*/, '');
    // skip lines that are clearly machinery, not conversation
    if (/^(\$|>|#)\s/.test(raw)) continue;                                   // shell prompt
    if (/^(sudo|bash|sh|cd|npm|npx|node|git|curl|ffmpeg|brew|pip|python3?|export|afplay|tmux)\b/.test(s)) continue; // command
    if (/^[\w.\-]+\/[\w.\-/]*$/.test(s)) continue;                            // bare path line
    if (/^[\w.\-]+\.\w{1,6}(:\d+)?$/.test(s)) continue;                       // bare filename[:line]
    if (/[{};]\s*$/.test(s) && /[=()<>]/.test(s)) continue;                   // code-ish line
    kept.push(s);
  }
  let speech = kept.join(' ')
    .replace(/`([^`]*)`/g, ' ')                                  // inline code -> drop (don't read symbols)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                     // link -> its text
    .replace(/https?:\/\/\S+/g, ' ')                             // urls
    .replace(/\b[0-9a-f]{7,}\b/gi, ' ')                          // commit-ish hashes
    .replace(/[\w.\-]*\/[\w.\-/]+/g, ' ')                        // paths a/b/c
    .replace(/\b[\w\-]+\.(mjs|js|ts|tsx|py|sh|json|md|wav|mp3|txt|css|html|yaml|yml|toml|cfg|log)\b/gi, ' ') // filenames
    .replace(/[*_>#~|]/g, ' ')
    .replace(/\s+([.!?,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = speech.match(/[^.!?]+[.!?]+/g) || (speech ? [speech] : []);
  // No arbitrary truncation — speak the whole answer. VOICE_MAX_SENTENCES is just a
  // sanity backstop against a pathological wall of text; the char clamp governs in practice.
  const maxSentences = parseInt(process.env.VOICE_MAX_SENTENCES || '99', 10);
  return clamp(sentences.slice(0, maxSentences).join(' ').trim());
}

function collapse(s) {
  return s.replace(/[`*_>#~|]/g, ' ').replace(/\s+/g, ' ').trim();
}
function clamp(s) {
  const cap = parseInt(process.env.VOICE_MAX_CHARS || '2000', 10);
  if (s.length > cap) s = s.slice(0, cap).replace(/\s+\S*$/, '') + '…';
  return s;
}

try {
  const base = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // DISARMED by default. Arm via flag file (`voice-seam.sh on`) OR VOICE_AGENT_ACTIVE=1.
  const armed = process.env.VOICE_AGENT_ACTIVE === '1' || (() => {
    try { return fs.existsSync(`${base}/_SYSTEM/state/voice-loop.enabled`); } catch { return false; }
  })();
  if (!armed) ok();

  // PAUSE: while focusing on voice-CONTROL (input), suppress Rick TTS output.
  // Re-enable by deleting _SYSTEM/state/voice/tts.paused (or `voice-seam.sh` later).
  try { if (fs.existsSync(`${base}/_SYSTEM/state/voice/tts.paused`)) ok(); } catch {}

  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { ok(); }
  if (!raw.trim()) ok();
  let payload;
  try { payload = JSON.parse(raw); } catch { ok(); }
  if (payload.agent_id || payload.agent_type) ok();   // main lane only

  const tpath = payload.transcript_path;
  if (!tpath || !fs.existsSync(tpath)) ok();

  const lines = fs.readFileSync(tpath, 'utf8').split('\n').filter(Boolean);
  let text = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj;
    try { obj = JSON.parse(lines[i]); } catch { continue; }
    const msg = obj.message || obj;
    if ((msg.role || obj.role) !== 'assistant') continue;
    const content = msg.content;
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) text = content.filter(c => c && c.type === 'text' && c.text).map(c => c.text).join(' ');
    if (text) break;
  }
  if (!text.trim()) ok();

  const out = toSpeech(text);
  if (!out) ok();

  // BRIDGE MODE (Pipecat rebuild): hand the spoken line to the brain-proxy FIFO instead of
  // playing it here — Pipecat owns the TTS. Non-blocking write: skip if no reader is waiting.
  const bridgeOn = process.env.VOICE_BRIDGE === '1' || (() => {
    try { return fs.existsSync(`${base}/_SYSTEM/state/voice/bridge.enabled`); } catch { return false; }
  })();
  if (bridgeOn) {
    try {
      const fifo = `${base}/_SYSTEM/state/voice/reply.fifo`;
      const fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
      fs.writeSync(fd, out + '\n');
      fs.closeSync(fd);
    } catch {}
    ok();
  }

  // TTS engine: $VOICE_TTS_CMD -> voice-speak.sh (Rick server) -> macOS `say`.
  let ttsCmd = process.env.VOICE_TTS_CMD;
  if (!ttsCmd) {
    try {
      const speak = `${base}/_SYSTEM/Scripts/voice-speak.sh`;
      if (fs.existsSync(speak)) ttsCmd = `bash "${speak}"`;
    } catch {}
  }

  // LATEST-WINS guard: bump a seq each reply; voice-speak.sh drops playback if a newer
  // reply fired while it was synthesizing (so you never hear a reply after you moved on).
  const seqFile = `${base}/_SYSTEM/state/voice/speak.seq`;
  let mySeq = Date.now();
  try {
    const prev = parseInt(fs.readFileSync(seqFile, 'utf8'), 10) || 0;
    mySeq = Math.max(mySeq, prev + 1);
    fs.writeFileSync(seqFile, String(mySeq));
  } catch {}
  const childEnv = { ...process.env, VOICE_SEQ: String(mySeq), VOICE_SEQ_FILE: seqFile };

  let child;
  if (ttsCmd) {
    // feed text via a temp-file fd as stdin (detached child + immediate exit drops a pipe)
    let stdinFd = 'ignore';
    try {
      const tmp = `${os.tmpdir()}/voice-tts-${process.pid}.txt`;
      fs.writeFileSync(tmp, out);
      stdinFd = fs.openSync(tmp, 'r');
    } catch {}
    child = spawn('/bin/sh', ['-c', ttsCmd], { stdio: [stdinFd, 'ignore', 'ignore'], detached: true, env: childEnv });
  } else {
    const args = [];
    if (process.env.VOICE_SAY_VOICE) args.push('-v', process.env.VOICE_SAY_VOICE);
    args.push('-r', process.env.VOICE_SAY_RATE || '210', out);
    child = spawn('say', args, { stdio: 'ignore', detached: true, env: childEnv });
  }
  child.unref();
} catch {
  // swallow — voice must never break the session
}
process.exit(0);
