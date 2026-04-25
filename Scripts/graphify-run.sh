#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$ROOT}"

cd "$ROOT"
exec graphify update "$TARGET"
