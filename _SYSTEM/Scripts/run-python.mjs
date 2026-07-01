#!/usr/bin/env node
// @capability: run-python
// @serves: cross-platform python invocation | python3 not found | py launcher | windows python
// @does: spawns whichever Python interpreter actually works on this OS and forwards its exit code
// @use: replace a bare `python3 <script>` package.json leaf when the target must run on both
//   Windows (where a real `python3` binary is often absent and the WindowsApps store-alias stub
//   prints "Python was not found" and exits 49) and macOS/Linux (where `python3` is real and no
//   `py` launcher exists).
// @exports: main
//
// Root cause this exists for: on Windows, `python3` frequently resolves to the WindowsApps
// execution-alias stub, not a real interpreter — it exits 49 instead of running the script.
// The real interpreter is reachable via the `py` launcher (`py -3`). macOS/Linux boxes have a
// real `python3` and no `py` launcher. This wrapper tries the platform-appropriate command first
// and forwards stdio + exit code untouched, so callers (npm scripts, CI) see identical behavior
// on both OSes.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function tryRun(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) {
    return { ok: false, status: null };
  }
  return { ok: true, status: result.status };
}

export function main(argv = process.argv.slice(2)) {
  const candidates =
    process.platform === 'win32'
      ? [
          ['py', ['-3', ...argv]],
          ['python3', argv],
          ['python', argv],
        ]
      : [
          ['python3', argv],
          ['python', argv],
        ];

  for (const [command, args] of candidates) {
    const { ok, status } = tryRun(command, args);
    if (ok) {
      return status ?? 0;
    }
  }

  process.stderr.write('run-python: no working Python interpreter found (tried: ' + candidates.map((c) => c[0]).join(', ') + ')\n');
  return 49;
}

// Windows file:// URLs are triple-slash + drive-letter (file:///C:/...), which does not
// match a naive `file://${argv[1]}` string build — that mismatch silently skipped `main()`
// entirely on win32 (process exited 0 with no output). `pathToFileURL` normalizes both
// sides through the same platform-correct encoder so the direct-execution guard actually
// fires on every OS.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
