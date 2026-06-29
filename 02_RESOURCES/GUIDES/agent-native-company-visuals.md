# Agent-Native × YURI — Visual Company Control

Quick start for using [BuilderIO/agent-native](https://github.com/BuilderIO/agent-native) inside YURI's MURE company model.

## What you get today

### 1. Visual planning before agents build

```bash
npx @agent-native/core@latest skills add visual-plan
```

In Cursor or Claude Code:

- **`/visual-plan`** — structured plan with diagrams, file maps, wireframes, open questions
- **`/visual-recap`** — visual PR/diff recap with shareable link

Best for: multi-role MURE runs, UI work, architecture decisions you want to approve before code lands.

Optional auth (shareable review + comments):

```bash
npx @agent-native/core@latest connect https://plan.agent-native.com --client all --scope user
```

Reload the client → MCP → Authenticate on `plan`.

### 2. MURE company dashboard (already live)

```bash
node _SYSTEM/Scripts/work-dashboard.mjs --serve
```

Open **http://localhost:4270** — realtime runs, job pool, doctrine axes, 20-role constellation.

Static org swimlane:

```bash
node _SYSTEM/mure/role-swimlane.mjs > /tmp/mure-swimlane.html && open /tmp/mure-swimlane.html
```

### 3. Local reference clone

```bash
node _SYSTEM/Scripts/agent-native-bootstrap.mjs clone
# → integrations/agent-native/ (gitignored)
```

Browse templates: `templates/dispatch`, `templates/analytics`, `templates/plan`, `templates/design`.

## Recommended workflow

1. **Plan** — `/visual-plan` with your MURE task packet or phase doc
2. **Dispatch** — `node _SYSTEM/mure/mure.mjs --demo` or `runFleet.mjs --dry-run` (DISARMED)
3. **Watch** — work dashboard on :4270 while runs execute
4. **Recap** — `/visual-recap` after merge

## What's coming (roadmap)

| Priority | Surface | Benefit |
| --- | --- | --- |
| Next | Dashboard drill-down to blackboard JSON | See exactly what each role produced |
| High | Dispatch-template fork | Approvals, audit, metrics, direct job control |
| Med | Analytics over fleet/token ledger | Cost, throughput, router confidence charts |
| Med | Design template | Prototype dashboard panels before shipping HTML |

Full integration spec: `_SYSTEM/reports/AGENT_NATIVE_INTEGRATION_2026-06-29.md`

## Other BuilderIO repos worth knowing

- **[skills](https://github.com/BuilderIO/skills)** — skill packs including visual-plan source
- **[micro-agent](https://github.com/BuilderIO/micro-agent)** — small focused code agent
- **[ai-shell](https://github.com/BuilderIO/ai-shell)** — natural language → shell

## Auto-incorporation (no manual `/visual-plan` typing)

You do **not** need to paste skill instructions or type slash commands every session.

| Layer | What happens automatically |
| --- | --- |
| **Cursor / Claude** | `visual-plan` is in `.claude/skills/` — agents load `SKILL.md` when the task is multi-file, UI-heavy, architectural, or risky (same rule as other skills) |
| **Canonical index** | `skills/visual-plan/` + `skills/skill-index.json` — picked up by `yuri-skill-loader.mjs` and fused swarm evidence |
| **MURE helmsman** | Large company runs should treat visual plan as the approval gate before code (agent loads skill; calls Plan MCP tools directly) |
| **Slash command** | `.claude/commands/visual-plan.md` exists for Claude Code if you want explicit invocation — optional |
| **One-time setup** | `node _SYSTEM/Scripts/agent-native-bootstrap.mjs connect` then reload Cursor. Plain `npx` from repo root fails on peer deps — use bootstrap or `NPM_CONFIG_LEGACY_PEER_DEPS=true` |

**Fresh machine:**

```bash
node _SYSTEM/Scripts/agent-native-bootstrap.mjs all
# or separately: install-skills + connect
```

**What you still control manually:** approving the plan before implementation (by design — the skill is an approval gate, not silent autopilot).

## Safety

- Default fleet remains **DISARMED**; live dispatch needs explicit owner arm
- Do not put secrets or client PII into hosted visual plans
- `integrations/` never ships in git — docs and skills only
