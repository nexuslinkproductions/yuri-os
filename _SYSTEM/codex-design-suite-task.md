## CODEX TASK SPEC

**Goal:** Symbiotic integration of all design skills into a unified auto-triggered suite. design-master becomes the single entry point; a hook auto-activates design context on design-related prompts.

**Target files:**
- Scripts/design-context-inject.mjs (create)
- .claude/hooks/user-prompt-submit.js (modify)
- .claude/commands/design.md (modify)
- .claude/commands/frontend-design.md (modify)
- .claude/skills/design-master/SKILL.md (modify)

**Rollback boundary:** `git diff HEAD .claude/hooks/user-prompt-submit.js .claude/commands/ .claude/skills/design-master/SKILL.md Scripts/design-context-inject.mjs`

**Prohibited:** Do not modify design-source-pack skill. Do not remove existing Haki/Nen blocks from user-prompt-submit.js. Do not break SKILL.md YAML frontmatter.

Files to CREATE:
1. Scripts/design-context-inject.mjs — reads design-memory.json, returns compact context block for prompt injection

Files to MODIFY:
2. .claude/hooks/user-prompt-submit.js — add design intent detector that injects design-master context into additionalContext
3. .claude/commands/design.md — update to route all modes through design-master
4. .claude/commands/frontend-design.md — add redirect note to design-master at top
5. .claude/skills/design-master/SKILL.md — expand triggers list, add symbiosis routing note

Spec for Scripts/design-context-inject.mjs:
- Read .claude/skills/design-master/design-memory.json (root canonical file)
- Extract: last 5 entries sorted by date, all unique tokens_used across all entries, most recent pattern field
- Read first 30 lines of DESIGN.md if exists at repo root
- Return compact markdown string:
  ## DESIGN MASTER ACTIVE
  ### Recent decisions (last 5)
  [date] [component]: [decision truncated to 100 chars]
  ### Active design tokens
  [comma-separated token list]
  ### Current pattern
  [pattern from most recent entry with a pattern field]
- If design-memory.json missing or empty, return empty string silently
- Script outputs to stdout, exits 0 always

Spec for user-prompt-submit.js design auto-activation:
Add AFTER the existing Haki/Nen blocks (do not touch those). Add:

const DESIGN_PATTERN = /design|UI|CSS|visual|layout|component|HUD|dashboard|interface|style|color|font|typography|theme|brand|landing.?page|frontend|html.*build|build.*html|svg|animation|glassmorphism|dark.mode|musubi.brand|ember|audit.html|build.*report/i;

if (DESIGN_PATTERN.test(userPrompt)) {
  try {
    const { execSync } = require('child_process');
    const designCtx = execSync('node Scripts/design-context-inject.mjs', {
      cwd: ROOT, timeout: 5000, encoding: 'utf8'
    }).trim();
    if (designCtx) {
      additionalContext += '\n\n<design-master-context>\n' + designCtx + '\n</design-master-context>';
      process.stderr.write('[design-auto] design-master context injected\n');
    }
  } catch (e) {
    // non-fatal, continue
  }
}

Spec for .claude/commands/design.md — replace full content with:
Unified design command. All design work routes through design-master.

Modes:
- /design — activate design-master for current task (reads design-memory.json first)
- /design frontend — surface=web, Musubi brand layer enforced
- /design hud — surface=HUD, HUD token system enforced  
- /design brand — surface=identity, musubi-ember + Bricolage Grotesque
- /design audit — design critique on current implementation

All modes: read design-memory.json first, write decisions back on completion.
Related: /design-source-pack for extracting reusable visual systems.
Auto-activates via hook when design intent detected in prompt.

Spec for .claude/commands/frontend-design.md — prepend one line at top:
> Routes to design-master with surface=frontend. For full design suite: /design

Spec for .claude/skills/design-master/SKILL.md triggers expansion:
Add to existing triggers array (do not remove existing triggers):
  - 'color palette'
  - 'dark theme'
  - 'musubi brand'
  - 'ember accent'
  - 'build a report'
  - 'html report'
  - 'audit html'
  - 'glassmorphism'
  - 'atmosphere'
  - 'depth'
  - 'background depth'
  - 'design the audit'

Add to routing_note field: 'Auto-activates via user-prompt-submit.js hook on design intent detection. design-context-inject.mjs provides live context from design-memory.json at prompt time.'

Constraints:
- Do NOT delete or modify design-source-pack skill (distinct function)
- Do NOT break existing Haki/Nen blocks in user-prompt-submit.js
- design-context-inject.mjs must never crash the hook — all errors caught silently
- SKILL.md must remain valid YAML frontmatter after trigger additions

Verify:
node --check Scripts/design-context-inject.mjs
node Scripts/design-context-inject.mjs | head -10
grep -c 'design-auto\|design-master-context' .claude/hooks/user-prompt-submit.js
