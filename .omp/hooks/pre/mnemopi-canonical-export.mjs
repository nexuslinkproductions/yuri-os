// mnemopi-canonical-export.mjs — OMP → YURI canonical export arming hook.
//
// Arms EXPORT-OUT: on session shutdown, proposes this OMP session's Mnemopi auto-retentions
// INTO YURI's propose→decide gate (memory-proposals.jsonl) via mnemopi-canonical-bridge.mjs's
// runExportAndAdjudicate({ apply: true }). "Proposed", not promoted — the operator still decides
// before anything reaches canonical truth. This is the ongoing, automatic arm of the one-shot bridge.
//
// SAFETY POSTURE (arm-gated and fail-open; fires once per session at shutdown):
//   • ARM-GATED: no-ops unless _SYSTEM/state/mnemopi-export-hook.enabled exists OR
//     env YURI_MNEMOPI_EXPORT_HOOK=1. Owner-gated (touch/rm the flag to arm/disarm).
//   • GATED TARGET: the bridge routes through proposeMemoryWrite (propose→decide), never raw
//     appendClaim — it cannot flood canonical. Loop-guarded (skips yuri-seed rows) + content-sha
//     deduped, so re-runs across sessions never double-propose.
//   • Fail-open ALWAYS: any error is swallowed. This hook must never block, slow, or break a
//     session lifecycle. It observes + proposes; it never gates.
//   • Eventually-consistent: if a shutdown is missed (hard kill), the NEXT shutdown scans ALL
//     working_memory rows and dedups, so nothing is permanently lost.
//
// Wiring: dropped at .omp/hooks/pre/ (project scope). OMP's extension runner loads the default
// factory and binds pi.on(...) to the runtime event bus.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = process.env.YURI_REPO_ROOT || `${os.homedir()}/YURI-OS-MUSUBI`;
const SCRIPTS = path.join(REPO_ROOT, '_SYSTEM', 'Scripts');
const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mnemopi-export-hook.enabled');

function hookArmed() {
  if (process.env.YURI_MNEMOPI_EXPORT_HOOK === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

async function lazyBridge() {
  try { return await import(path.join(SCRIPTS, 'mnemopi-canonical-bridge.mjs')); } catch { return null; }
}

// De-dupe firing within a single process (session_shutdown should fire once, but guard anyway).
let _ran = false;

async function proposeSessionLearnings() {
  if (_ran) return;
  _ran = true;
  const bridge = await lazyBridge();
  if (!bridge?.runExportAndAdjudicate) return;
  try {
    await bridge.runExportAndAdjudicate({ apply: true });
  } catch { /* fail-open — never break session shutdown */ }
}

export default function hook(pi) {
  // On session shutdown: propose this session's OMP learnings into YURI's propose→decide gate.
  pi.on('session_shutdown', async () => {
    try {
      if (!hookArmed()) return;
      await proposeSessionLearnings();
    } catch { /* fail-open — never block shutdown */ }
    return; // observe + propose only; never returns { cancel }
  });
}
