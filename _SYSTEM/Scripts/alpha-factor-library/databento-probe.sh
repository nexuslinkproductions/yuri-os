#!/usr/bin/env bash
# Databento probe wrapper — encodes the venv path + key-loading so you type ONE thing.
#
#   Input the key ONE of two ways, then run this script (all args pass through to the probe):
#
#   A) EPHEMERAL (recommended for the first probe — key never hits disk):
#        export DATABENTO_API_KEY='db-XXXXXXXX'
#        _SYSTEM/Scripts/alpha-factor-library/databento-probe.sh              # estimate only, $0
#        _SYSTEM/Scripts/alpha-factor-library/databento-probe.sh --pull       # tiny real slice
#
#   B) PERSISTENT (survives new shells): create a gitignored key file next to this script:
#        printf 'DATABENTO_API_KEY=db-XXXXXXXX\n' > _SYSTEM/Scripts/alpha-factor-library/databento.secrets
#        _SYSTEM/Scripts/alpha-factor-library/databento-probe.sh              # auto-sourced below
#      (databento.secrets matches *.secrets in .gitignore — it can never be committed.)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PY="$HOME/.venvs/nautilus-v2/bin/python"
KEY_FILE="$HERE/databento.secrets"
KEYCHAIN="$HERE/../yuri-keychain.mjs"   # _SYSTEM/Scripts/yuri-keychain.mjs

# Resolve DATABENTO_API_KEY, most-secure source first, only if not already in env:
#   1) macOS Keychain (YURI-canonical: YURI_OS_MUSUBI:DATABENTO_API_KEY)  <- primary, cross-lane
#   2) gitignored databento.secrets file  <- fallback (headless / keychain-unavailable)
if [[ -z "${DATABENTO_API_KEY:-}" ]]; then
  if k="$(node "$KEYCHAIN" get DATABENTO_API_KEY 2>/dev/null)" && [[ -n "$k" ]]; then
    export DATABENTO_API_KEY="$k"
  elif [[ -f "$KEY_FILE" ]]; then
    set -a; # shellcheck disable=SC1090
    source "$KEY_FILE"; set +a
  fi
  unset k 2>/dev/null || true
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: nautilus venv python not found at $VENV_PY" >&2
  exit 1
fi

exec "$VENV_PY" "$HERE/databento-probe.py" "$@"
