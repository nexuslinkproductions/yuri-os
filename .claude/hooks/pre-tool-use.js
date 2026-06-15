#!/usr/bin/env node
// PreToolUse — 4-tier compaction + cross-terminal memory awareness
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const bus = require('./memory-bus.js');
const ss = require('./session-state.js');

const MEMORY_INDEX = path.join(os.homedir(), '.claude', 'projects', '-Users-marcelspatz-YURI-OS-MUSUBI', 'memory', 'MEMORY.md');

const HEAVY_TOOLS = new Set(['Agent', 'WebSearch', 'WebFetch', 'TaskCreate']);

function getTier(pct, tokenmaxxing = false) {
  if (tokenmaxxing) {
    if (pct < 52) return 0;
    if (pct < 60) return 1;
    if (pct < 73) return 2;
    if (pct < 82) return 3;
    return 4;
  }
  if (pct < 55) return 0;
  if (pct < 65) return 1;
  if (pct < 78) return 2;
  if (pct < 88) return 3;
  return 4;
}

function buildHint(state) {
  const parts = [];
  if (state.git?.branch) parts.push(`branch=${state.git.branch}`);
  const files = (state.files_written || []).slice(-3);
  if (files.length) parts.push(`files=${files.map(f => path.basename(f)).join(',')}`);
  if (state.aversions?.length) parts.push(`aversion="${state.aversions.slice(-1)[0]}"`);
  return `/compact Preserve: ${parts.join(' | ')}`;
}

function emitContext(msg) {
  // wave-3 G.2: stdout, not stderr — the PreToolUse structured advisory channel is
  // stdout-only; stderr JSON was silently discarded, so every compaction-tier and
  // token-economy advisory this hook computed never reached the model.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg }
  }) + '\n');
}

try {
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) process.exit(0);
    const event = JSON.parse(input);

    const toolName = event?.tool_name || event?.tool || '';
    const toolInput = JSON.stringify(event?.tool_input || {});

    // ── Cross-terminal memory check ──────────────────────────────────────────
    const sessionId = bus.getSessionId();
    const currentBus = bus.readBus();
    const session = bus.readSession(sessionId);

    if (
        currentBus.sequence > session.lastSeenSequence &&
        currentBus.writerSession &&
        currentBus.writerSession !== sessionId
    ) {
        let memoryContent = '';
        try { memoryContent = fs.readFileSync(MEMORY_INDEX, 'utf8').trim(); } catch (_) {}

        const changedFiles = (currentBus.files || []).join(', ') || 'memory files';
        emitContext([
            `[CROSS-TERMINAL MEMORY UPDATE] Another Claude session wrote: ${changedFiles}`,
            `Written at: ${currentBus.lastWrite}`,
            '',
            'Current memory index:',
            memoryContent || '(could not read MEMORY.md)',
        ].join('\n'));

        session.lastSeenSequence = currentBus.sequence;
        bus.writeSession(sessionId, session);
        bus.cleanOldSessions();
    }

    // ── Tier-based compaction dispatch ──────────────────────────────────────
    const state = ss.read();
    const contextPct = state?.context?.pct || 0;
    const tokenmaxxing = state?.tokenmaxxing === true;
    const tier = getTier(contextPct, tokenmaxxing);

    if (tier >= 1 && state) {
        const lastFiredPct = state.context?.last_fired_pct || 0;
        const shouldFire = tier === 1 || Math.abs(contextPct - lastFiredPct) >= 3;

        if (shouldFire) {
            const hint = buildHint(state);
            const historyEntry = { tier, pct: contextPct, ts: new Date().toISOString() };

            if (tier === 1) {
                // Log only, no output
                ss.update(s => {
                    s.compact_history.push({ ...historyEntry, action: 'logged' });
                    s.context.tier = tier;
                });
            } else if (tier === 2) {
                ss.update(s => {
                    s.compact_history.push({ ...historyEntry, hint, action: tokenmaxxing ? 'auto_compact' : 'soft_prompt' });
                    s.context.tier = tier;
                    s.context.last_fired_pct = contextPct;
                });
                if (tokenmaxxing) {
                    emitContext(
                        `⚡ TOKENMAXXING AUTO-COMPACT: Context at ${contextPct.toFixed(0)}%. Run /compact NOW:\n${hint}\nDo not proceed — compact first, then continue.`
                    );
                } else {
                    emitContext(
                        `CONTEXT AT ${contextPct.toFixed(0)}%: Consider running /compact now.\n` +
                        `Pre-built hint: ${hint}`
                    );
                }
            } else if (tier === 3) {
                ss.update(s => {
                    s.compact_history.push({ ...historyEntry, hint, action: 'hard_prompt' });
                    s.context.tier = tier;
                    s.context.last_fired_pct = contextPct;
                });
                emitContext(
                    `CONTEXT CRITICAL AT ${contextPct.toFixed(0)}%: /compact STRONGLY RECOMMENDED.\n` +
                    `Run NOW: ${hint}\n` +
                    (state.aversions?.length ? `Aversion: ${state.aversions.slice(-1)[0]}` : '')
                );
            } else if (tier === 4) {
                ss.update(s => {
                    s.compact_history.push({ ...historyEntry, hint, action: 'critical' });
                    s.context.tier = tier;
                    s.context.last_fired_pct = contextPct;
                });
                // Trigger early learning extraction async
                const { spawn } = require('child_process');
                spawn('node', [path.join(__dirname, 'session-reflect.js'), '--mid-session'], {
                    detached: true, stdio: 'ignore', cwd: process.cwd()
                }).unref();
                emitContext(
                    `CONTEXT AT ${contextPct.toFixed(0)}%: Session approaching limit. Auto-extracted learnings written.\n` +
                    `You MUST /compact immediately: ${hint}`
                );
            }
        }
    }

    // ── Local-first Agent intercept ──────────────────────────────────────────
    if (toolName === 'Agent' && tokenmaxxing) {
        let agentPrompt = '';
        try { agentPrompt = (event?.tool_input?.prompt || '').toLowerCase(); } catch (_) {}
        const lightweightIndicators = [
            'explore', 'lookup', 'summarize', 'summarise', 'find', 'check', 'list',
            'read', 'search', 'what does', 'what is', 'skill', 'memory', 'index',
            'analyze', 'analyse', 'describe', 'explain', 'review'
        ];
        const heavyIndicators = [
            'implement', 'write', 'create', 'build', 'fix', 'refactor', 'edit',
            'install', 'deploy', 'run tests', 'execute', 'migrate'
        ];
        const isLight = lightweightIndicators.some(kw => agentPrompt.includes(kw));
        const isHeavyTask = heavyIndicators.some(kw => agentPrompt.includes(kw));
        if (isLight && !isHeavyTask) {
            emitContext(
                `⚡ LOCAL-FIRST: Agent() detected for lightweight task. Try local before cloud:\n` +
                `  1. mcp__ollama-bridge__ollama_run({ prompt: "<task>", model: "qwen2.5:7b" })\n` +
                `  2. mcp__ollama-bridge__ollama_explore_files({ prompt: "<task>", file_paths: [...] }) — if files needed\n` +
                `  3. If Ollama unavailable/fails: Agent({ model: "haiku" }) — NOT default Sonnet. Haiku is the fallback ceiling for fetch/read/explore.\n` +
                `  4. Escalate to Agent() (Sonnet) only for planning, implementation, or testing tasks.\n` +
                `  Skill: /local-subagent — routing protocol and model selection guide.`
            );
        }
    }

    // ── Legacy token economy check (score-based) ─────────────────────────────
    const isHeavy = HEAVY_TOOLS.has(toolName);
    const score = (isHeavy ? 600 : 100) + Math.floor(toolInput.length / 10);

    const heavyThreshold = tokenmaxxing ? 58 : 75;
    const highCostThreshold = tokenmaxxing ? 50 : 60;
    const prefix = tokenmaxxing ? '⚡ tokenmaxxing: ' : '';
    if (contextPct > heavyThreshold && isHeavy) {
        emitContext(`${prefix}TOKEN_ECONOMY: Context at ${contextPct.toFixed(0)}% — "${toolName}" is expensive. Consider offloading to @deepseek or @qwen.`);
    } else if (score > 2000 && contextPct > highCostThreshold) {
        emitContext(`${prefix}TOKEN_ECONOMY: High-cost op "${toolName}" (score: ${score}). Recommend: offload via @deepseek or @kimi.`);
    }

    process.exit(0);
} catch (_) {
    process.exit(0);
}
