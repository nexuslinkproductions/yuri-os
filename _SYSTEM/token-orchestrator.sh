#!/bin/bash

# Token Monitoring Orchestrator
# Master script for autonomous token tracking
# Usage: ./token-orchestrator.sh [action]

set -e

HOOKS_DIR="/Users/marcelspatz/.claude/hooks"
TRACKER_FILE="/Volumes/T7/NUDIMMUD/_SYSTEM/token-tracker.md"
SESSION_DIR="/tmp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
  echo -e "${BLUE}[TOKEN]${NC} $1"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
}

# Initialize session at start
init_session() {
  log "Initializing token tracking for session..."
  node "$HOOKS_DIR/token-session-init.js"
  success "Token session initialized"
}

# Finalize session at end
finalize_session() {
  log "Finalizing session..."

  # Find most recent session
  LATEST_SESSION=$(ls -t "$SESSION_DIR"/claude-session-*.json 2>/dev/null | head -1)

  if [ -z "$LATEST_SESSION" ]; then
    warn "No active session to finalize"
    return
  fi

  node "$HOOKS_DIR/token-session-end.js" "$LATEST_SESSION"
  success "Session finalized and logged"

  # Clean up
  cleanup_sessions
}

# Clean up old sessions
cleanup_sessions() {
  log "Cleaning up temporary session files..."
  node "$HOOKS_DIR/token-cleanup.js"
  success "Cleanup complete"
}

# Generate monthly summary
monthly_summary() {
  log "Generating monthly token summary..."
  node "$HOOKS_DIR/token-aggregate-monthly.js"
  success "Monthly summary generated"
}

# Show current session status
status() {
  log "Current token session status:"

  LATEST_SESSION=$(ls -t "$SESSION_DIR"/claude-session-*.json 2>/dev/null | head -1)

  if [ -z "$LATEST_SESSION" ]; then
    warn "No active session"
    return
  fi

  # Parse JSON
  SESSION_ID=$(jq -r '.sessionId' "$LATEST_SESSION")
  TOKENS=$(jq -r '.tokensEstimated' "$LATEST_SESSION")
  TOOLS=$(jq -r '.toolsLoaded | length' "$LATEST_SESSION")
  START_TIME=$(jq -r '.startTime' "$LATEST_SESSION")

  CURRENT_TIME=$(date +%s000)
  DURATION=$(( (CURRENT_TIME - START_TIME) / 1000 / 60 ))
  TOKENS_KB=$(( TOKENS / 1000 ))

  echo "  Session ID: $SESSION_ID"
  echo "  Tokens used: ${TOKENS_KB}K"
  echo "  Tools loaded: $TOOLS"
  echo "  Duration: ${DURATION}m"
}

# Show tracker file
show_tracker() {
  log "Recent sessions from tracker:"
  tail -20 "$TRACKER_FILE"
}

# Show monthly breakdown
monthly_report() {
  MONTH=${1:-$(date +%Y-%m)}
  log "Token usage for $MONTH:"

  grep "### SESSION $MONTH" "$TRACKER_FILE" | head -10
}

# Help text
show_help() {
  cat << EOF
Token Monitoring Orchestrator
Usage: ./token-orchestrator.sh [command]

Commands:
  init              Initialize token tracking for this session
  finalize          Finalize current session and log
  cleanup           Clean up old temporary session files
  monthly           Generate monthly summary
  status            Show current session status
  tracker           Show recent sessions from tracker
  report [YYYY-MM]  Show monthly report (defaults to current month)
  help              Show this help text

Automated hooks:
  - SessionStart: Automatically calls 'init'
  - PostToolUse: Logs token usage for each tool
  - PreToolUse: Checks budget before expensive operations
  - SessionEnd: Automatically calls 'finalize'

Examples:
  ./token-orchestrator.sh init        # Start tracking (called by Claude)
  ./token-orchestrator.sh status      # Check current usage
  ./token-orchestrator.sh monthly     # Generate month summary
  ./token-orchestrator.sh report 2026-05  # Show May report

EOF
}

# Main command router
case "${1:-status}" in
  init)
    init_session
    ;;
  finalize)
    finalize_session
    ;;
  cleanup)
    cleanup_sessions
    ;;
  monthly)
    monthly_summary
    ;;
  status)
    status
    ;;
  tracker)
    show_tracker
    ;;
  report)
    monthly_report "$2"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    error "Unknown command: $1"
    show_help
    exit 1
    ;;
esac

exit 0
