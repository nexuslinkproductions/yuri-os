# MODEL-ARSENAL ROUTING BRIEF — GLM-5.2 (run AFTER the main upgrade lane lands)

Owner directive (2026-06-19): "let glm 5.2 find the best model in the arsenal INCLUDED IN MY CODING PLAN to
match what I'm trying to achieve. Do NOT limit it to a couple — there's a whole list." Goal = Yuri as a full
JARVIS: SEE the screen, READ on-screen text, navigate the WEB, and ultimately drive the GUI — by voice.

## DO NOT pre-filter. Evaluate the WHOLE arsenal and VERIFY access yourself.
Claude probed only a couple of models and that wrongly narrowed it — ignore that as a constraint. Every model
below is in Marcel's plan (top subscription). YOU verify each candidate's real access (right surface, right
billing/resource-package) before picking — don't exclude a model on one 429; figure out HOW to reach it.

## THE FULL ARSENAL (from Marcel's z.ai console — his plan)
Language models:
GLM-4.6, GLM-4.6V-FlashX, GLM-4.7, GLM-5-Turbo, GLM-5V-Turbo, GLM-5.1, GLM-5.2, GLM-4.5, GLM-4.6V,
GLM-4.7-Flash, GLM-4.7-FlashX, GLM-OCR, GLM-5, GLM-4-Plus, GLM-4.5V, GLM-4.6V-Flash,
AutoGLM-Phone-Multilingual, GLM-4.5-Air, GLM-4.5-AirX, GLM-4.5-Flash, GLM-4-32B-0414-128K,
Web-Reader, Search-Prime, Search-Prime-Claude
Image generation: GLM-Image

## CAPABILITY MAP (starting hypotheses — verify + refine, route the BEST model to each need)
- SEE the screen / images (vision): the `*V` line — GLM-4.6V, GLM-4.5V, GLM-4.6V-Flash, GLM-4.6V-FlashX,
  GLM-5V-Turbo. Pick the best ACCESSIBLE one for screenshot description / UI reading.
- READ on-screen or document TEXT: GLM-OCR (purpose-built OCR — likely better than vision-describe for text).
- DRIVE the GUI / device automation: AutoGLM-Phone-Multilingual (Zhipu's autonomous GUI-agent line) — this is
  directly aligned with "control the computer". Investigate whether it helps Yuri's gui_script/computer-use.
- NAVIGATE / READ the web: Web-Reader (page reading), Search-Prime / Search-Prime-Claude (web search).
- GENERATE images: GLM-Image (if Marcel ever asks her to make an image).
- BRAIN (fast voice conversation): currently GLM-5-Turbo (keep unless you find a clearly better in-plan voice
  brain — speed matters for real-time voice).

## ADVISORY ONLY — Claude's preliminary probes (DATA POINTS, not a filter; re-verify everything)
On the Anthropic surface (`api.z.ai/api/anthropic`, the $0 Coding-Plan surface Yuri uses) with the keychain
key `yuri-zai-api-key`, Claude saw: GLM-4.6V → 200 + real vision; GLM-4.5V → 200 + real vision;
GLM-5-Turbo → 200; GLM-5V-Turbo → 429 `[1311] plan doesn't include`; GLM-4.6V-FlashX & GLM-OCR → 429 `[1113]
insufficient balance / recharge`. The 429s may be a resource-package / surface / billing config — these
models ARE in Marcel's plan, so DON'T exclude them; determine how to reach them (different surface, enable a
package, etc.) or report exactly what's needed. Treat 200-confirmed models as safe; investigate the rest.

## TASK
1. Map the goal's capabilities (vision, OCR, web, GUI-automation, brain) to the BEST ACCESSIBLE model for each,
   from the full arsenal — verifying access empirically (a real call per candidate; for vision, a real
   `screencapture` → describe; pin output to ENGLISH — GLM-4.6V replied in Chinese to a bare prompt).
2. Wire the chosen model(s) into the voice subsystem. Specifically fix the screenshot/vision path, which
   currently defaults to `glm-4v` — an INVALID id (`400 [1211] Unknown Model`) that silently fails — to the
   best accessible vision model. Keep each model behind an env override (e.g. `YURI_Z_VISION_MODEL`,
   `YURI_Z_OCR_MODEL`).
3. If a desired model needs a billing/resource-package step Marcel must do, REPORT it precisely (don't
   silently fall back) — name the model, the surface, and the exact action.
4. Verify live on the $0 surface where possible; log model choices + access findings in `02-GLM-CHANGELOG.md`.

## CONSTRAINTS
- Keep the BRAIN fast for voice. Don't break the bot.py HTTP contract, the confirm-gate, or protected paths.
- Prefer the flat-rate Coding-Plan surface; if a capability genuinely needs a metered/balance model, surface
  that as a decision for Marcel rather than assuming.
