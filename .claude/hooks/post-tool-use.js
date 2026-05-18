#!/usr/bin/env node
// PostToolUse — tool tracking + design memory + cross-terminal memory bus
'use strict';
const fs = require('fs');
const path = require('path');
const bus = require('./memory-bus.js');
const ss = require('./session-state.js');

const MEMORY_FILE = '/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/design-master/design-memory.json';
const DESIGN_EXTS = ['.tsx', '.css', '.html', '.scss'];

try {
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) process.exit(0);
    const event = JSON.parse(input);

    const toolName = event?.tool_name || '';
    const filePath = event?.tool_input?.file_path || event?.tool_input?.path || '';
    const isError = !!event?.tool_response?.is_error;
    const errorSnippet = isError
        ? String(event?.tool_response?.content || '').slice(0, 200)
        : null;

    // ── Session state: track every tool call ─────────────────────────────────
    ss.update(state => {
        state.tools_used.push({
            tool: toolName,
            ts: new Date().toISOString(),
            success: !isError,
            error: errorSnippet,
        });

        if (isError && errorSnippet) {
            state.errors.push({ ts: new Date().toISOString(), tool: toolName, snippet: errorSnippet });
        }

        // Track file writes
        if (['Edit', 'Write'].includes(toolName) && filePath) {
            const rel = filePath.replace('/Users/marcelspatz/YURI-OS-MUSUBI/', '');
            if (!state.files_written.includes(rel)) state.files_written.push(rel);
        }

        // Track skill reads (Read tool on a SKILL.md)
        if (toolName === 'Read' && filePath) {
            const m = filePath.match(/skills\/([^/]+)\/SKILL\.md$/i);
            if (m && !state.skills_read.includes(m[1])) state.skills_read.push(m[1]);
        }

        // Track skill writes
        if (['Edit', 'Write'].includes(toolName) && filePath) {
            const m = filePath.match(/skills\/([^/]+)\/SKILL\.md$/i);
            if (m && !state.skills_written.includes(m[1])) state.skills_written.push(m[1]);
        }
    });

    // ── Cross-terminal memory bus: sync memory file writes ───────────────────
    if (['Edit', 'Write'].includes(toolName) && filePath && bus.isMemoryFile(filePath)) {
        const sessionId = bus.getSessionId();
        bus.writeBus(sessionId, [path.basename(filePath)]);
    }

    // ── Design memory capture (Edit/Write on design files only) ──────────────
    if (['Edit', 'Write'].includes(toolName) && filePath && DESIGN_EXTS.some(ext => filePath.endsWith(ext))) {
        const basename = path.basename(filePath, path.extname(filePath));
        const isNew = toolName === 'Write';

        let memory = { version: '1.0', lastUpdated: '', entries: [] };
        try { memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8')); } catch (_) {}

        const entry = {
            date: new Date().toISOString().slice(0, 10),
            component: basename,
            file: filePath.replace('/Users/marcelspatz/YURI-OS-MUSUBI/', ''),
            action: isNew ? 'create' : 'edit',
            decision: isNew ? `New component created: ${basename}` : `Updated: ${basename}`
        };

        const alreadyLogged = memory.entries.some((e) =>
            e.file === entry.file && e.date === entry.date && e.action === entry.action
        );

        if (!alreadyLogged) {
            memory.entries = [entry, ...memory.entries].slice(0, 100);
            memory.lastUpdated = new Date().toISOString();
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
        }
    }

    // ── Plan dispatch gate: arm after ExitPlanMode ────────────────────────────
    if (toolName === 'ExitPlanMode' && !isError) {
        ss.update(state => {
            state.plan_dispatch_gate = {
                armed: true,
                armed_at: Date.now(),
                satisfied: false,
                warn_count: 0,
            };
        });
    }

    process.exit(0);
} catch (_) {
    process.exit(0);
}
