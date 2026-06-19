# Z.ai GLM Coding Plan — model catalog + role map (2026-06-19)

Marcel's Z.ai GLM Coding Plan (Max subscription) — registered as a first-class YURI lane (mirrors Mimo):
Anthropic-compatible endpoint `https://api.z.ai/api/anthropic`, Bearer auth (`ANTHROPIC_AUTH_TOKEN` /
keychain `yuri-zai-api-key` → `ZAI_API_KEY`). **Dispatch lane LIVE-VERIFIED** 2026-06-19 (`ai llm glm` →
glm-4.7 → real reply). Two surfaces, exactly like Mimo:
- `ai llm glm "..."` (also `glm-turbo`, `glm-5.2`, `glm-air`, or any model via `--model <id>`) — call Z.ai from inside a normal session.
- `ai claude-zai` — independent native Claude Code session on GLM (`/model glm-5.2` works in-session). OPUS→glm-5.2, SONNET→glm-4.7, HAIKU→glm-4.5-air.

## Full catalog (from the Z.ai console, 2026-06-19)

**Language models:** GLM-5.2 · GLM-5.1 · GLM-5 · GLM-5-Turbo · GLM-5V-Turbo · GLM-4.7 · GLM-4.7-Flash · GLM-4.7-FlashX · GLM-4.6 · GLM-4.6V · GLM-4.6V-Flash · GLM-4.6V-FlashX · GLM-4.5 · GLM-4.5V · GLM-4.5-Air · GLM-4.5-AirX · GLM-4.5-Flash · GLM-4-Plus · GLM-4-32B-0414-128K · GLM-OCR · Web-Reader · Search-Prime · Search-Prime-Claude · AutoGLM-Phone-Multilingual
**Image generation:** GLM-Image · CogView-4-250304
**Video generation:** ViduQ1-text · ViduQ1-Image · ViduQ1-Start-End · Vidu2-Image · Vidu2-Start-End · Vidu2-Reference · CogVideoX-3
**Real-time audio-video:** GLM-ASR-2512 (owner: known, not evaluated here)

## Role decipher — which to use for what

| Role | Model | Why |
|---|---|---|
| **Voice brain (snappy + reactive)** | **GLM-5-Turbo** | Live ~4s (vs 5.2 6s, 4.7 33s), GLM-5 intelligence, natural conversational output. The pick for Yuri's brain. |
| Heavy reasoning / Opus-tier | GLM-5.2 | "Comparable to Claude Opus"; premium tier (higher deduction). Use for the hard stuff. |
| Flagship (one below 5.2) | GLM-5.1 / GLM-5 | Strong general/coding without the 5.2 premium. |
| Coding workhorse | GLM-4.7 (or GLM-4.6) | Sonnet-tier coding default for `ai claude-zai`. |
| Fast coding | GLM-4.7-Flash / -FlashX | Low-latency coding when 4.7 full is overkill. |
| Lightweight / cheap | GLM-4.5-Air / -AirX / -Flash | Fastest, but terse — triage / bulk. |
| Vision / multimodal | GLM-4.6V(-Flash/-FlashX) · GLM-4.5V · GLM-5V-Turbo | Image understanding. |
| OCR | GLM-OCR | Document text extraction. |
| Web / search | Web-Reader · Search-Prime · Search-Prime-Claude | Grounded web read + search. |
| Phone automation | AutoGLM-Phone-Multilingual | On-device phone agent (multilingual). |
| Image generation | GLM-Image · CogView-4-250304 | Owner interested — wire when ready. |
| Video generation | Vidu* family · CogVideoX-3 | Text/image→video. |

## Registered as YURI dispatch lanes (the useful subset)

`glm-5.2` · `glm-5.1` · `glm-5-turbo` · `glm-4.7` · `glm-4.5-air` — in `.claude/config/models.json` →
`llm_compat_lanes`, all `provider: z-ai-coding-plan`, `protocol: anthropic`, `auth_header: bearer`.
Aliases (llm-lane.mjs): `glm`/`zai`→glm-4.7, `glm-turbo`/`turbo`→glm-5-turbo, `glm-max`→glm-5.2,
`glm-air`→glm-4.5-air, `glm-5.1`. Any other catalog model is reachable ad-hoc via `--model <id>`.

NOTE: context windows set conservative (200K) pending live verification of Z.ai's long-context header
convention; output caps approximate, refine via live-400 probe like the deepseek lanes. models.json +
llm-lane.mjs edits left UNCOMMITTED 2026-06-19 (they carry a parallel session's glm-cloud changes — do-not-sweep).
