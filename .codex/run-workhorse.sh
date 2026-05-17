#!/usr/bin/env bash
# Usage: ./run-workhorse.sh "<rough idea>"
# Forces workhorse execution via direct script call.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node _SYSTEM/Scripts/nudimmud-workhorse.mjs forge --generate-plan "$@"
