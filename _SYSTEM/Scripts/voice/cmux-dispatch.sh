#!/usr/bin/env bash
# @capability: cmux-overseer-dispatch
# @serves: overseer drive worker sessions | cmux send task to worker | conduct claude fleet | read cmux feed
# @does: the overseer's toolkit to drive worker Claude sessions in cmux — send a task to a worker surface (cmux send --surface + a separate Enter key), list surfaces, tail the activity feed.
# @use: the OVERSEER Claude calls this via its Bash tool. dispatch <surface> "<task>" | workers | feed | peek
# @exports: dispatch, workers, feed
set -uo pipefail

case "${1:-help}" in
  dispatch)
    surface="${2:-}"; shift 2 2>/dev/null || true; task="$*"
    { [ -z "$surface" ] || [ -z "$task" ]; } && { echo "usage: cmux-dispatch.sh dispatch <surface> \"<task>\""; exit 1; }
    # type the task, settle, then a DISTINCT Enter key (TUI-safe: paste != submit)
    cmux send --surface "$surface" -- "$task" || { echo "✗ cmux send failed to $surface"; exit 1; }
    sleep 0.4
    cmux send-key --surface "$surface" enter || { echo "✗ cmux send-key enter failed to $surface"; exit 1; }
    echo "→ dispatched to $surface: $task"
    ;;
  workers)
    cmux list-pane-surfaces 2>/dev/null || echo "cmux list-pane-surfaces unavailable"
    ;;
  feed)
    cmux feed tui
    ;;
  peek)
    echo "cmux has no pane-content read; use 'feed', or watch the pane visually. Session states:"
    cat ~/.cmuxterm/*-hook-sessions.json 2>/dev/null | head -40 || echo "(no hook session files yet — run: cmux hooks setup)"
    ;;
  *)
    echo "usage: cmux-dispatch.sh {dispatch <surface> \"<task>\" | workers | feed | peek}"
    ;;
esac
