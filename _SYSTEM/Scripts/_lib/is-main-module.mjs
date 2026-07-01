// _lib/is-main-module.mjs — portable ESM main-module guard (win32-safe).
//
// The legacy `import.meta.url === \`file://${process.argv[1]}\`` guard silently no-ops on
// Windows: import.meta.url uses file:///C:/... (forward slashes) while argv[1] is C:\... (backslashes).
// See github.com/nexuslinkproductions/yuri-os/issues/3

import { pathToFileURL } from 'node:url';

/** True when this module is the Node entry script (not imported). */
export function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return importMetaUrl === pathToFileURL(argv1).href;
}
