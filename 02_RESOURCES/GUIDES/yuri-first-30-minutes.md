# YURI — First 30 Minutes (Safe Start)

**For invite-only adopters.** Everything starts **DISARMED** — zero API spend until you explicitly arm.

---

## 0–5 min: Clone and dry-run install

```bash
git clone <invite-repo-url> ~/yuri
cd ~/yuri
./yuri-init.sh              # prints plan only
./yuri-init.sh --apply      # when ready
export YURI_ROOT="$PWD"     # or rely on yuri-init shell rc line
```

## 5–10 min: Verify governance spine

```bash
node _SYSTEM/mure/mure.mjs --validate
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/Scripts/xref-query.mjs "how does the energy gate work"
```

You should see: roster validates, demo plan with casts, xref hits from curated research.

## 10–15 min: Persona (optional)

```bash
cp persona.template.md _SYSTEM/persona.md   # only if yuri-init did not seed
# edit _SYSTEM/persona.md — your voice, not the author's
```

Never enable `YURI_PRIVATE_RICK_OVERLAY` unless you own that overlay locally.

## 15–20 min: Fleet planning (still DISARMED)

```bash
node _SYSTEM/Scripts/runFleet.mjs --task-file 02_RESOURCES/TASKS/example-task.json --dry-run
node _SYSTEM/Scripts/fleet-router-mlp.mjs --demo
```

Router suggestions are **advisory**. Role registry + governance gates decide dispatch.

## 20–25 min: Optional keys (only if arming live lanes)

| Lane | Requirement |
|------|-------------|
| GLM (z.ai) | Keychain `yuri-zai-api-key` or `ZAI_API_KEY` |
| Ollama Pro | Keychain `YURI_OS_MUSUBI:OLLAMA_API_KEY` |
| Native (Sonnet) | Cursor Pro / Claude Code Agent tool |

## 25–30 min: Arming ceremony (owner-only, costs money)

```bash
# Review dry-run plan first
touch _SYSTEM/state/mure.enabled
touch _SYSTEM/state/glm-fleet.enabled
touch _SYSTEM/state/swarm-convergence.enabled
# optional: touch _SYSTEM/state/ollama-fleet.enabled

node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --apply
```

**Disarm after run:**

```bash
rm _SYSTEM/state/mure.enabled _SYSTEM/state/glm-fleet.enabled _SYSTEM/state/swarm-convergence.enabled
```

---

## What NOT to do on day one

- Do not arm `energy-enforce.enabled` until you understand catastrophic veto behavior.
- Do not trust `routerConfidence` as authority — it is telemetry.
- Do not paste secrets into tracked files.
- Do not export or fork with `.claude/memory/` or `_SYSTEM/persona.md` from a dev monorepo.

## See also

- [`INSTALL.md`](../INSTALL.md)
- [`02_RESOURCES/GUIDES/fleet-router-adopter-guide.md`](fleet-router-adopter-guide.md)
- [`SECURITY.md`](../SECURITY.md)
