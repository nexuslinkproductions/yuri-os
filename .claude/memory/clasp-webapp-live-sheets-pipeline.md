---
name: clasp-webapp-live-sheets-pipeline
description: Edit live Google Sheets cells+AppsScript from terminal via clasp + token-gated web-app JSON API; Drive MCP is read-only+stale
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["google sheet fix", "edit live spreadsheet", "apps script clasp", "lilly sheets", "debug google sheet"]
  refs: ["[[feedback-verify-maps-before-destructive]]"]
---

RULE: To debug/edit a live Google Sheet (cells + bound Apps Script) from the terminal, use clasp + a temporary token-gated web app as a JSON API.
WHEN: Owner gives a Google Sheet link and asks to fix formulas/scripts/formatting; the Drive MCP only reads (and caches stale) and cannot write cells or see Apps Script.
DO: (1) clasp login as an account with EDIT on the bound script (owner; sheet-edit ACL must propagate, else CAN_EDIT:false). (2) clasp clone <scriptId> (Apps Script API must be ON for that account). (3) Add a doGet web app (executeAs USER_DEPLOYING, access ANYONE_ANONYMOUS) gated by a random token, with read actions (listSheets/formulas/values/cf/colors/errors/triggers) returning ContentService JSON, and a run action restricted to ^yuriFix* fixers. (4) clasp push + clasp deploy; redeploy after every code change (the /exec URL is pinned to the deployed version, push alone is not live). (5) curl the endpoint for fresh reads; apply fixes as yuriFix* funcs run via ?action=run. (6) Verify by reading back. (7) CLEANUP: delete temp sheets, strip web app + fixers, revert manifest, clasp undeploy ALL deployments (@HEAD is undeletable but inert once doGet/webapp gone), confirm the URL no longer returns JSON.
DONT: trust the claude_ai Google Drive connector for verifying edits (it serves a cached pre-edit snapshot, byte-identical across calls); CSV export is pinned to one gid; clasp run needs a GCP-project API-executable (skip it). Never patch en masse without reading real data first (caught 1200 "BW average" cells that were actually blood pressure 120/80 via LEFT(3)/RIGHT(2)).
WHY: clasp is the only terminal path to container-bound Apps Script; a token-gated web app is the only cache-free live read/write of cells without per-cell pasting.
SEE: skills adversarial-verification; [[feedback-verify-maps-before-destructive]]
