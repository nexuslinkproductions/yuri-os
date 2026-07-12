#!/usr/bin/env bash
# Smoke test for url-safety-guard.js
# Feeds PreToolUse events via stdin and asserts exit + output.
set -euo pipefail

GUARD="node .claude/hooks/url-safety-guard.js"
PASS=0
FAIL=0

expect_allow() {
  local label="$1" input="$2"
  local out rc
  out=$(echo "$input" | $GUARD 2>&1) && rc=$? || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: $label — hook exited non-zero ($rc)"
    echo "  output: $out"
    FAIL=$((FAIL + 1))
  elif echo "$out" | grep -q '"permissionDecision":"ask"'; then
    echo "FAIL: $label — blocked unexpectedly"
    echo "  output: $out"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $label — allowed"
    PASS=$((PASS + 1))
  fi
}

expect_block() {
  local label="$1" input="$2"
  local out rc
  out=$(echo "$input" | $GUARD 2>&1) && rc=$? || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: $label — hook exited non-zero ($rc)"
    echo "  output: $out"
    FAIL=$((FAIL + 1))
  elif echo "$out" | grep -q '"permissionDecision":"ask"'; then
    echo "PASS: $label — blocked"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label — allowed unexpectedly"
    echo "  output: $out"
    FAIL=$((FAIL + 1))
  fi
}

# Helper: wrap command in a PreToolUse JSON event
p() {
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"
}

echo "=== URL Safety Guard Smoke Tests ==="
echo ""

# --- Public URLs (should ALLOW) ---
expect_allow "public HTTPS"          "$(p 'curl https://example.com/')"
expect_allow "public HTTP"           "$(p 'curl http://example.org/path')"
expect_allow "no URLs"               "$(p 'echo hello world')"
expect_allow "empty command"         '{"tool_name":"Bash","tool_input":{"command":""}}'
expect_allow "non-Bash tool"         '{"tool_name":"Read","tool_input":{"command":"curl https://evil.internal/"}}'

# --- Private/malformed URLs (should BLOCK) ---
expect_block  "loopback 127.0.0.1"        "$(p 'curl http://127.0.0.1/')"
expect_block  "loopback localhost"         "$(p 'curl http://localhost:8080/api')"
expect_block  "RFC1918 10.x"               "$(p 'wget http://10.0.0.1/admin')"
expect_block  "RFC1918 192.168.x"          "$(p 'curl https://192.168.1.1/')"
expect_block  "RFC1918 172.16.x"           "$(p 'curl http://172.16.0.1/')"
expect_block  "0.0.0.0"                   "$(p 'curl http://0.0.0.0:3000/')"
expect_block  "link-local 169.254.x"       "$(p 'curl http://169.254.169.254/latest/meta-data/')"
expect_block  "CGNAT 100.64.x"             "$(p 'curl http://100.64.0.1/')"
expect_block  "IPv6 ::"                    "$(p 'curl http://[::]:8080/')"
expect_block  "IPv6 ::1"                   "$(p 'curl http://[::1]:8080/')"
expect_block  "IPv6 link-local"            "$(p 'curl http://[fe80::1]:8080/')"
expect_block  "IPv6 ULA"                   "$(p 'curl http://[fd00::1]:8080/')"
expect_block  "IPv4-mapped loopback"       "$(p 'curl http://[::ffff:127.0.0.1]/')"
expect_block  ".local suffix"              "$(p 'curl http://host.local/')"
expect_block  ".localhost suffix"          "$(p 'curl http://api.localhost/')"
expect_block  ".internal suffix"           "$(p 'curl http://db.internal/')"
expect_block  "userinfo with private"      "$(p 'curl https://safe@127.0.0.1/secret')"

# --- Regression cases (exact bypasses that were fixed) ---
expect_block  "trailing dot localhost."    "$(p 'curl http://localhost./')"
expect_block  "trailing dot foo.local."    "$(p 'curl http://foo.local./')"
expect_block  "IPv6 unspecified ::"        "$(p 'curl http://[::]/path')"
expect_block  "canonical mapped IPv6 hex"  "$(p 'curl http://[::ffff:7f00:1]/')"
expect_block  "malformed URL bracket"      "$(p 'curl https://[not-an-ip]/')"

echo ""
echo "---"
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "SMOKE FAILED"
  exit 1
else
  echo "SMOKE PASSED"
  exit 0
fi
