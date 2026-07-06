#!/usr/bin/env zsh
# Paste-safe storage of the Databento API key into the YURI macOS Keychain
# (service YURI_OS_MUSUBI:DATABENTO_API_KEY). No quoting, no argv exposure
# (ps-invisible), no shell-history leak (read -s), no env left behind.
# Run it, paste the key at the prompt, press Enter. That's the whole thing.
set -e
HERE="${0:A:h}"
KEYCHAIN="$HERE/../yuri-keychain.mjs"

read -rs "key?Paste Databento API key, then Enter: "
print   # newline after the silent prompt
[[ -n "$key" ]] || { print -u2 "No key entered — nothing stored."; exit 1; }

# Inline env assignment: the value reaches ONLY this node process (set-env reads
# process.env.DATABENTO_API_KEY), never the parent shell, never argv, never history.
DATABENTO_API_KEY="$key" node "$KEYCHAIN" set-env DATABENTO_API_KEY
key=''  # scrub the local

print "Stored. Verify: node $KEYCHAIN has DATABENTO_API_KEY   (exit 0 = present)"
