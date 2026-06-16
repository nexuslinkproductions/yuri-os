# CONTROL PACKET — Observatory dashboard (W3 view, Hybrid tabs)

GOAL: Build the Observatory dashboard in the root Vite/React app, consuming the LIVE observatory server. Owner chose **Hybrid tabs**: Markets | Mechanism | Mind(3D). This packet covers the shell + Markets + Mechanism + the SSE wiring; the Mind tab is a graceful STUB here (the R3F scenes are a separate lane — import them but tolerate absence so the build passes).

GROUND FIRST:
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — §8 W2 entry has the EXACT contract: REST GET /api/observatory/{markets,factors,paper,regime,energy,health}; SSE GET /api/observatory/stream with events market.tick/factor.signal/paper.fill/regime.shift/energy.state (type is in the JSON payload → use EventSource `onmessage` + JSON.parse(e.data), NOT addEventListener-per-type). §4 constraint: **NO HUD/Kagami design tokens — self-contained CSS only.**
2. _SYSTEM/Scripts/alpha-factor-library/observatory/observatory-server.mjs — confirm the route + SSE payload shapes against source.
3. The app: _SYSTEM/src/App.tsx (routing), _SYSTEM/src/index.html, _SYSTEM/src/pages/HomePage.tsx (page pattern), _SYSTEM/src/components/TelemetryDeck.tsx + ConclaveMonitor.tsx + the Oracle BarChart/LineChart/SentimentGauge SVG components (REUSE these patterns for the Mechanism panels — minimise new deps), vite.config.mts (add a dev-proxy).
4. lightweight-charts is installed (root). Read its installed version's API (v5.x mounts via createChart on a div ref; series API changed in v5 — verify against node_modules types or docs).

TARGET FILES (new under _SYSTEM/src/):
- pages/ObservatoryPage.tsx — tabbed container (Markets | Mechanism | Mind), self-contained CSS.
- hooks/useObservatoryStream.ts — initial REST snapshot fetch + SSE subscription (onmessage+JSON.parse), reconnect on drop, graceful offline state. Returns typed {markets, factors, paper, regime, energy, health, connected}.
- components/observatory/MarketsTab.tsx — lightweight-charts candlestick per market (BTC-USD, ETH-USD) fed from /markets bars (timestamp=unix-seconds = lightweight-charts UTCTimestamp) + a paper positions/P&L table + a NO_TRADE log.
- components/observatory/MechanismTab.tsx — factor ΔU signals, regime timeline, Brier/calibration, energy ΔU gauge (reuse the existing SVG chart components / simple custom; no new dep).
- components/observatory/MindTab.tsx — STUB: try to import ../../scenes/EnergySurfaceScene + QSphereScene; if not present, render a "3D mind — wiring" placeholder. Lazy-import so absence never breaks the build.
- observatory.css (or CSS modules) — self-contained, NO --yuri-hud-*/--yuri-kagami-*.

WIRING:
- App.tsx: add an /observatory route.
- vite.config.mts: dev-proxy /api/observatory → http://localhost:<OBSERVATORY_PORT default> (read the server's default port from observatory-server.mjs).

REQUIREMENTS: TypeScript clean (the build runs `tsc && vite build`). lightweight-charts mounted/cleaned in useEffect (dispose on unmount). SSE graceful when server offline (loading/empty/reconnect — never crash). Self-contained CSS, dark, readable. No HUD/Kagami tokens.

ACCEPTANCE: `npm run build` (tsc && vite build) GREEN. ObservatoryPage renders all 3 tab headers; Markets renders a chart container + paper table; Mechanism renders the panels; Mind shows the placeholder. (Full live data render is verified by the main session against the running server.)

AFTER WRITING: run `npm run build`; report PASS/FAIL + the exact tsc/vite result + a ≤8-line summary + confirm the MindTab import contract it expects from the scenes lane. Do NOT git commit.
