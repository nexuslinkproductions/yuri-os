# Yuri OS Fixture RAG Launchd

status: `RAG_LAUNCHD_RUNNING`
checked_at: `2026-05-09T20:41:27+02:00`
head: `b5ac69333cf34915863f65fa6dcb4c6918a29107`
launchd_label: `com.nudimmud.wiki-rag`
plist_path: `/Users/marcelspatz/Library/LaunchAgents/com.nudimmud.wiki-rag.plist`
launchd_domain: `gui/501`
launchd_state: `running`
watcher_entrypoint: `_SYSTEM/Scripts/wiki-rag-launchd.mjs run`
watch_command: `npm run wiki:rag:watch`
health_command: `npm run wiki:rag:health`
install_command: `npm run wiki:rag:launchd:install`
status_command: `npm run wiki:rag:launchd:status`
log_stdout: `/Users/marcelspatz/Library/Logs/NUDIMMUD/wiki-rag-launchd.out.log`
log_stderr: `/Users/marcelspatz/Library/Logs/NUDIMMUD/wiki-rag-launchd.err.log`

## Purpose

Persist the wiki RAG watcher across logins with a launchd agent so the automation stays resident without manual memory.

## Behavior

- starts at login via `RunAtLoad`
- remains alive via `KeepAlive`
- runs the existing digest-gated watcher
- runs the automated health probe from the watcher loop
- health probe confirms launchd state, notebook identity, and count parity
- inherits a PATH that resolves the local npm binary
- keeps logs in the user Library log directory

## Non-Claims

- does not change the source registry mirror
- does not alter the wiki source set
- does not replace the notebook target

## Use

Install once with `npm run wiki:rag:launchd:install`.
Inspect the live agent with `npm run wiki:rag:launchd:status`.
Probe the full lane with `npm run wiki:rag:health`.
Remove it with `npm run wiki:rag:launchd:uninstall`.
