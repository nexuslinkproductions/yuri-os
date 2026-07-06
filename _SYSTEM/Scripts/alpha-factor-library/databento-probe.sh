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

# Persistent path: source the gitignored key file if present and env not already set.
if [[ -z "${DATABENTO_API_KEY:-}" && -f "$KEY_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$KEY_FILE"; set +a
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "ERROR: nautilus venv python not found at $VENV_PY" >&2
  exit 1
fi

exec "$VENV_PY" "$HERE/databento-probe.py" "$@"
