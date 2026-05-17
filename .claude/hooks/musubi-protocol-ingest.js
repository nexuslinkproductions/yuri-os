#!/usr/bin/env node
/**
 * AEONIC_PROTOCOL SessionStart Hook
 * Injects AEONIC_PROTOCOL directives into session context at startup
 * Pattern: mirrors nisaba-subagent-start.js
 */

const fs = require('fs');
const path = require('path');
const stateModule = require('./session-state.js');

const YURI_ROOT = process.env.YURI_ROOT || '/Users/marcelspatz/YURI-OS-MUSUBI';
const PROTOCOL_FILE = path.join(YURI_ROOT, '_SYSTEM', 'MUSUBI_PROTOCOL.md');

/**
 * Extract sections from AEONIC_PROTOCOL.md via ## heading boundaries
 */
function parseSections(content) {
  const sections = {};
  // Match ## followed by optional number/dot, then section name
  const headingRegex = /^##\s+(?:\d+\.\s+)?([A-Z_]+)\n([\s\S]*?)(?=^##\s|$)/gm;

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const sectionName = match[1];
    const sectionBody = match[2].trim();
    sections[sectionName] = sectionBody;
  }
  return sections;
}

/**
 * Format sections into <aeonic-protocol> XML block
 */
function formatXmlBlock(sections) {
  const timestamp = new Date().toISOString();
  const roleMatrix = sections.ROLE_MATRIX || '';
  const offloadDirective = sections.GLOBAL_OFFLOAD_DIRECTIVE || '';
  const coreDirectives = sections.CORE_DIRECTIVES || '';

  return `<musubi-protocol version="1" loaded_at="${timestamp}">
### ROLE_MATRIX

${roleMatrix}

### GLOBAL_OFFLOAD_DIRECTIVE

${offloadDirective}

### CORE_DIRECTIVES

${coreDirectives}

</musubi-protocol>`;
}

/**
 * Main hook logic
 */
function main() {
  try {
    if (!fs.existsSync(PROTOCOL_FILE)) {
      process.stderr.write(
        `[aeonic-ingest] WARN: AEONIC_PROTOCOL.md not found at ${PROTOCOL_FILE}\n`
      );
      process.exit(0);
    }

    const content = fs.readFileSync(PROTOCOL_FILE, 'utf-8');
    const sections = parseSections(content);

    // Update session state
    const state = stateModule.read();
    state.aeonic = state.aeonic || {};
    state.aeonic.sections = sections;
    state.aeonic.loadedAt = new Date().toISOString();
    stateModule.write(state);

    // Emit to Claude as additionalContext
    const xmlBlock = formatXmlBlock(sections);
    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: xmlBlock.split('\n').join('\\n') // Escape newlines for JSON
      }
    };

    console.log(JSON.stringify(output));
  } catch (error) {
    process.stderr.write(
      `[aeonic-ingest] ERROR: ${error.message}\n`
    );
    process.exit(0); // Never block session start
  }
}

main();
