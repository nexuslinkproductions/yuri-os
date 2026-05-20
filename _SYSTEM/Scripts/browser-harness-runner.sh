#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HARNESS_DIR="${BROWSER_HARNESS_DIR:-$REPO_ROOT/_SYSTEM/tools/browser-harness}"
HARNESS_CMD="${BROWSER_HARNESS_BIN:-browser-harness}"

json_health() {
  local cli_path=""
  local doctor_status=0
  local doctor_output=""

  cli_path="$(command -v "$HARNESS_CMD" 2>/dev/null || true)"
  if [[ -n "$cli_path" ]]; then
    doctor_output="$("$HARNESS_CMD" --doctor 2>&1)" || doctor_status=$?
  else
    doctor_status=127
    doctor_output="browser-harness command not found"
  fi

  node -e '
    const [harnessDir, cliPath, doctorStatus, doctorOutput] = process.argv.slice(1);
    const installed = Boolean(cliPath) && require("node:fs").existsSync(harnessDir);
    process.stdout.write(JSON.stringify({
      status: installed ? "installed" : "not_installed",
      harness_dir: harnessDir,
      cli: cliPath || null,
      doctor_status: Number(doctorStatus),
      doctor: doctorOutput,
    }) + "\n");
  ' "$HARNESS_DIR" "$cli_path" "$doctor_status" "$doctor_output"
}

if [[ "${1:-}" == "--health" ]]; then
  json_health
  exit 0
fi

if [[ ! -d "$HARNESS_DIR" ]]; then
  echo "{\"error\":\"harness_not_installed\",\"harness_dir\":\"$HARNESS_DIR\"}" >&2
  exit 2
fi

if ! command -v "$HARNESS_CMD" >/dev/null 2>&1; then
  echo "{\"error\":\"browser_harness_cli_missing\",\"hint\":\"cd $HARNESS_DIR && uv tool install --force --reinstall -e .\"}" >&2
  exit 127
fi

if [[ $# -gt 0 ]]; then
  printf '%s\n' "$*" | "$HARNESS_CMD"
else
  "$HARNESS_CMD"
fi
