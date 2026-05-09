# Yuri OS Fixture RAG Runner

status: `RAG_RUNNER_CREATED`
checked_at: `2026-05-09T20:10:25+02:00`
head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
runner_path: `backend/src/scripts/ingestWikiControlPlane.ts`
npm_script: `backend/package.json#wiki:rag`
notebook_title: `Yuri Wiki Control Plane`
notebook_stable_key: `yuri-os/wiki-control-plane`

## Purpose

Provide a repeatable lane runner for the wiki control plane so future re-ingest and verification uses the same exact file list, stable notebook identity, and retrieval check.

## Scope

- stable notebook identity first, title fallback only
- fixed wiki control-plane source list only
- embeddings wait loop
- end-to-end retrieval verification

## Non-Claims

- does not touch unrelated vault content
- does not rewrite the wiki sources during ingest
- does not replace the source registry mirror

## Future Use

Run `npm run wiki:rag` from `backend/` when the same lane needs to be re-verified.
Use `npm run wiki:rag:auto` when you want digest-gated refresh and `npm run wiki:rag:watch` for continuous polling.
Use `npm run wiki:rag:launchd:install` once to load the macOS launch agent that starts the watcher on login.
