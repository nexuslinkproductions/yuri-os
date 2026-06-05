#!/usr/bin/env node
'use strict';

// Negative-fixture suite for the coworker-role role-path mutation matcher
// (isRolePathMutation) in bash-security-guard.js.
//
// WHY: the historical matcher used raw `cmd.includes(p)` (needs a contiguous
// relative path) + a `parts[0]`-only verb gate. That was LEXICALLY bypassable
// in five confirmed forms (cd-split, find -delete, echo|xargs, var-indirection,
// git reset --hard). This suite locks all five as DENY and guards the legit
// no-role-file commands that MUST still be allowed.
//
// Role is forced to `coworker` by handing the child a BOGUS YURI_DEV_KEY: with a
// dev-credential present, an invalid key fail-closes to coworker (yuri-operator.cjs
// resolveRole). The forms are passed as JSON `command` strings, so the OUTER live
// guard never sees them as literal mutation tokens.

const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../bash-security-guard.js');

let pass = 0;
let fail = 0;

function runHook(cmd, role) {
  const env = Object.assign({}, process.env);
  if (role === 'coworker') env.YURI_DEV_KEY = 'definitely-not-the-owner-key';
  else if (role === 'dev') delete env.YURI_DEV_KEY; // rely on session/default
  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf8',
    timeout: 5000,
    env,
  });
  return { stdout: (result.stdout || '').trim(), status: result.status };
}

function decision(out) {
  if (!out.stdout) return 'allow';
  let p;
  try { p = JSON.parse(out.stdout); } catch { return 'parseerr'; }
  const hso = (p && p.hookSpecificOutput) || {};
  if (hso.permissionDecision === 'deny') return 'deny';
  if (hso.additionalContext) return 'advisory';
  return 'allow';
}

function assert(label, ok, detail = '') {
  if (ok) { console.log(`  PASS: ${label}`); pass++; }
  else { console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

function expectDeny(label, cmd) {
  const out = runHook(cmd, 'coworker');
  assert(label, out.status === 0 && decision(out) === 'deny', `got=${decision(out)} stdout=${JSON.stringify(out.stdout)}`);
}

function expectAllow(label, cmd) {
  const out = runHook(cmd, 'coworker');
  assert(label, out.status === 0 && decision(out) === 'allow', `got=${decision(out)} stdout=${JSON.stringify(out.stdout)}`);
}

// NOT-DENIED: the role gate must not BLOCK the command. An `allow` (silent) or an
// `advisory` both qualify — the point is the role-path matcher does not deny it. Used for
// the interpreter-READ over-block cases (`node -e "console.log(rolefile)"`,
// `python3 -c "print(rolefile)"`) which legitimately resolve to the generic, role-
// independent "Inline node -e / python -c execution detected" ADVISORY (NOT a block) —
// exactly as the matrix/smoke baselines expect for any `node -e` / `python3 -c`.
function expectNotDenied(label, cmd) {
  const out = runHook(cmd, 'coworker');
  const d = decision(out);
  assert(label, out.status === 0 && (d === 'allow' || d === 'advisory'),
    `got=${d} stdout=${JSON.stringify(out.stdout)}`);
}

// ── The five confirmed live bypasses (all MUST DENY in coworker role) ─────────
console.log('\nConfirmed bypasses — must DENY (coworker role):');
expectDeny('1 cd-split rm', 'cd .claude/hooks && rm tirith-url-guard.js');
expectDeny('2 find -delete', 'find .claude/hooks -name tirith-url-guard.js -delete');
expectDeny('3 echo | xargs rm', 'echo .claude/hooks/tirith-url-guard.js | xargs rm');
expectDeny('4 var-indirection', 'F=.claude/hooks/tirith-url-guard.js; rm $F');
expectDeny('5 git reset --hard ref', 'git reset --hard HEAD~5');

// ── Defense-in-depth variants (must also DENY) ───────────────────────────────
console.log('\nDefense-in-depth variants — must DENY (coworker role):');
expectDeny('git reset --hard origin/main', 'git reset --hard origin/main');
expectDeny('git reset --hard (no ref)', 'git reset --hard');
expectDeny('git restore --source', 'git restore --source=HEAD~3 .claude/hooks/bash-security-guard.js');
expectDeny('git checkout protected file', 'git checkout .claude/hooks/tirith-url-guard.js');
expectDeny('git restore protected file', 'git restore .claude/hooks/operator-write-guard.js');
expectDeny('cd-split mv', 'cd .claude/hooks && mv bash-security-guard.js /tmp/x');
expectDeny('xargs on operator module', 'echo _SYSTEM/Scripts/yuri-operator.cjs | xargs rm');
expectDeny('var-indirection cp clobber', 'G=.claude/hooks/pre-tool-gate.js; cp /dev/null $G');
expectDeny('find -delete on operator-guard dir file', 'find .claude/hooks/operator-guard -name allow.json -delete');
expectDeny('redirect truncate via basename split', 'cd .claude/hooks && : > agent-spawn-guard.js');
expectDeny('sed -i basename split', 'cd .claude/hooks && sed -i s/a/b/ claude-protocol-guard.js');
expectDeny('truncate basename split', 'cd .claude/hooks && truncate -s0 musubi-protocol-enforce.js');
expectDeny('tee basename split', 'cd .claude/hooks && echo x | tee claude-protocol-guard.mjs');
expectDeny('dev-credential basename mutate', 'cd _SYSTEM/SELF && rm dev-credential.json');

// ── Legit coworker commands that touch NO role file (must still ALLOW) ────────
console.log('\nLegit no-role-file commands — must ALLOW (coworker role):');
expectAllow('rm a build artifact', 'rm dist/bundle.js');
expectAllow('mv a doc', 'mv notes.md docs/notes.md');
expectAllow('cd src then rm', 'cd src && rm old.js');
expectAllow('find -delete tmp', 'find /tmp -name "*.log" -delete');
expectAllow('echo | xargs rm tmp', 'echo /tmp/junk.txt | xargs rm');
expectAllow('var-indirection non-role', 'F=src/app.js; rm $F');
expectAllow('git status', 'git status');
expectAllow('git diff', 'git diff');
expectAllow('git reset (soft, no hard)', 'git reset HEAD~1');
expectAllow('git reset --soft', 'git reset --soft HEAD~1');
expectAllow('git restore worktree file', 'git restore src/app.js');
expectAllow('ls a hooks dir read', 'ls .claude/hooks');
expectAllow('cat a hook (read not mutate)', 'cat .claude/hooks/bash-security-guard.js');
expectAllow('grep across hooks (read)', 'grep -rn TODO .claude/hooks');
expectAllow('node-run a hook (exec not mutate)', 'node .claude/hooks/pre-tool-gate.js');
expectAllow('redirect to non-role file', 'echo done > build.log');
expectAllow('basename-collision non-role path', 'rm src/yuri-operator.cjs.bak');
expectAllow('same-basename DIFFERENT dir (realpath wins)', 'rm src/pre-tool-gate.js');
expectAllow('same-basename git restore diff dir', 'git restore src/pre-tool-gate.js');
expectAllow('cp to non-role despite role-ish basename suffix', 'cp x.js tirith-url-guard.js.tmpl');

// ── Round-2 regression: the 3 surviving bypasses (must DENY) ─────────────────
// S1 chmod / S2 rsync: chmod 000 neuters a guard, rsync /dev/null clobbers it; both
// were absent from MUTATING_VERBS. S3: decode-and-exec pipe (`base64 -d | sh`) missed
// extractShellWrapper (only -c form) and isDownloadExecuteChain (only curl|wget). The
// S3 command string is assembled from pieces so it cannot trip a literal-string guard
// while this test file is itself being edited/scanned.
console.log('\nRound-2 surviving bypasses — must DENY (coworker role):');
const PIPE = ' | ';
const B64_PAYLOAD = 'cm0gLmNsYXVkZS9ob29rcy90aXJpdGgtdXJsLWd1YXJkLmpz'; // rm .claude/hooks/tirith-url-guard.js
expectDeny('S1 chmod 000 guard', 'chmod 000 .claude/hooks/tirith-url-guard.js');
expectDeny('S2 rsync /dev/null clobber guard', 'rsync /dev/null .claude/hooks/tirith-url-guard.js');
expectDeny('S3 base64 -d | sh', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'sh');
// Decode/fetch-exec siblings of S3 (same risk class) — all must DENY:
expectDeny('S3b base64 --decode | bash', 'echo ' + B64_PAYLOAD + PIPE + 'base64 --decode' + PIPE + 'bash');
expectDeny('S3c base32 -d | sh', 'echo PAYLOAD' + PIPE + 'base32 -d' + PIPE + 'sh');
expectDeny('S3d xxd -r | sh', 'echo deadbeef' + PIPE + 'xxd -r -p' + PIPE + 'sh');
expectDeny('S3e openssl enc -d | sh', 'echo X' + PIPE + 'openssl enc -base64 -d' + PIPE + 'sh');
expectDeny('S3f printf-hex | sh', "printf '\\x72\\x6d'" + PIPE + 'sh');
expectDeny('S3g base64 -d | sudo sh', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'sudo sh');
expectDeny('S3h wrapped base64 -d | sh', 'bash -c "echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'sh"');
// chmod/rsync hidden by cd-split / basename (verb-anywhere + basename defense):
expectDeny('S1b chmod via cd-split basename', 'cd .claude/hooks && chmod 000 tirith-url-guard.js');
expectDeny('S2b rsync clobber operator module', 'rsync /dev/null _SYSTEM/Scripts/yuri-operator.cjs');
// decompress-to-shell siblings (gzip/gunzip/zcat/tr/rev/uudecode) — same decode-exec class:
expectDeny('S3i gzip -d | sh', 'echo X' + PIPE + 'gzip -d' + PIPE + 'sh');
expectDeny('S3j gunzip | bash', 'echo X' + PIPE + 'gunzip' + PIPE + 'bash');
expectDeny('S3k tr | sh', 'echo X' + PIPE + 'tr a-z n-z' + PIPE + 'sh');
expectDeny('S3l rev | sh', 'echo X' + PIPE + 'rev' + PIPE + 'sh');
// GLOB-target mutation of a guard (shell expands onto the live file at run time):
expectDeny('S4a chmod glob guard', 'chmod 000 .claude/hooks/tirith-url-guard.*');
expectDeny('S4b mv glob guard', 'mv .claude/hooks/tirith-url-guard.* /tmp/');
expectDeny('S4c rm glob guard', 'rm .claude/hooks/tirith-url-guard.*');

// ── Round-2 regression: O1 superstring over-blocks (must ALLOW) ──────────────
// Legacy contiguous-substring path fired on SUPERSTRINGS of a protected path. Dropped;
// the realpath walk + scratch-artifact exemption now clear these scratch/typo cleanups.
console.log('\nRound-2 O1 superstring artifacts — must ALLOW (coworker role):');
expectAllow('O1a cp .cjs.bak scratch', 'cp _SYSTEM/Scripts/yuri-operator.cjs.bak /tmp/');
expectAllow('O1b rm .cjsX superstring', 'rm _SYSTEM/Scripts/yuri-operator.cjsX');
expectAllow('O1c mv .cjs.old scratch', 'mv _SYSTEM/Scripts/yuri-operator.cjs.old /tmp/');
expectAllow('O1d rm operator-guardian.js (NOT operator-guard dir)', 'rm .claude/hooks/operator-guardian.js');
expectAllow('O1e rm tirith-url-guard.js.orig scratch', 'rm .claude/hooks/tirith-url-guard.js.orig');
// chmod/rsync on a NON-role path must still ALLOW (verb added, but path not protected):
expectAllow('chmod on non-role path', 'chmod 755 src/app.js');
expectAllow('rsync between non-role paths', 'rsync -a src/ dist/');
// transparent local-source pipe to shell must still ALLOW (not a decoder):
expectAllow('cat local script | bash (transparent)', 'cat build.sh | bash');
// legit GLOB mutation on a NON-role path must still ALLOW (glob regex must not over-match):
expectAllow('chmod glob non-role', 'chmod 755 src/*.js');
expectAllow('rm glob non-role', 'rm dist/*');
expectAllow('mv glob non-role', 'mv build/*.map /tmp/');

// ── Round-3 regression: robust fail-closed role-matcher redesign ──────────────
// Round-2 verify found 4 surviving bypass classes + 1 disclosed residual, all ALLOW in
// coworker role, all must DENY. The redesign computes roleSignal (token/glob/brace/
// decoded-payload/literal-basename) INDEPENDENTLY of verb detection, then DENIES on
// roleSignal AND (mutatingVerb OR obfuscation/exec construct). Payloads/chains are
// assembled from pieces so this file cannot trip the live outer guard while edited.
console.log('\nRound-3 surviving bypasses — must DENY (coworker role):');
const RGUARD = '.claude/hooks/tirith-url-guard.js';
// H1 — cmd-substitution / variable-indirection VERB LAUNDERING:
expectDeny('H1a $(printf rm) rolefile', '$(printf rm) ' + RGUARD);
expectDeny('H1b $(echo rm) rolefile', '$(echo rm) ' + RGUARD);
expectDeny('H1c backtick printf rm rolefile', '`printf rm` ' + RGUARD);
expectDeny('H1d var-indirection $x verb', 'x=rm; $x ' + RGUARD);
// H2 — DECODE-EXEC to a NON-SHELL interpreter (role path hidden in the b64 blob):
expectDeny('H2a base64 -d | python3', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'python3');
expectDeny('H2b base64 -d | perl', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'perl');
expectDeny('H2c base64 -d | node', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'node');
expectDeny('H2d base64 -d | ruby', 'echo ' + B64_PAYLOAD + PIPE + 'base64 -d' + PIPE + 'ruby');
// H3 — BRACE EXPANSION onto guard file(s):
expectDeny('H3a chmod brace 2-elem', 'chmod 000 .claude/hooks/{tirith-url-guard,operator-write-guard}.js');
expectDeny('H3b mv brace 2-elem', 'mv .claude/hooks/{tirith-url-guard,operator-write-guard}.js /tmp/');
expectDeny('H3c brace single-elem', 'chmod 000 .claude/hooks/{tirith-url-guard}.js');
expectDeny('H3d brace suffix {js,bak}', 'chmod 000 .claude/hooks/tirith-url-guard.{js,bak}');
// R — inline interpreter -e/-c with a protected role basename in the arg:
expectDeny('R1 perl -e system rm rolefile', 'perl -e "system(\'rm ' + RGUARD + '\')"');
expectDeny('R2 python3 -c os.remove rolefile', 'python3 -c "import os; os.remove(\'' + RGUARD + '\')"');
// Deeper self-attack forms (eval / $IFS / hex / nested cmd-subst / inline unlink):
expectDeny('A2 eval "rm rolefile"', 'eval "rm ' + RGUARD + '"');
expectDeny('A3 $IFS-split chmod rolefile', 'chmod${IFS}000${IFS}' + RGUARD);
expectDeny('A4 nested cmd-subst rm rolefile', 'rm $(echo $(printf ' + RGUARD + '))');
expectDeny('A7 printf-hex literal | python3', 'printf "\\x72\\x6d ' + RGUARD + '"' + PIPE + 'python3');
expectDeny('A8 xxd hex of rolefile | sh', 'echo 726d202e636c617564652f686f6f6b732f7469726974682d75726c2d67756172642e6a73' + PIPE + 'xxd -r -p' + PIPE + 'sh');
expectDeny('A9 var head $c chmod rolefile', 'c=chmod; $c 000 ' + RGUARD);
expectDeny('A11 cmd-subst basename only', 'rm $(echo tirith-url-guard.js)');
expectDeny('A12 node -e unlink rolefile', 'node -e "require(\'fs\').unlinkSync(\'.claude/hooks/pre-tool-gate.js\')"');
expectDeny('A13 ruby -e File.delete rolefile', 'ruby -e "File.delete(\'.claude/hooks/agent-spawn-guard.js\')"');
expectDeny('A14 brace suffix {,.bak} operator module', 'mv _SYSTEM/Scripts/yuri-operator.cjs{,.bak}');

// ── Round-3 over-block guard: NON-role obfuscation/brace/decode MUST still ALLOW ──
console.log('\nRound-3 over-block guard — must ALLOW (coworker role):');
expectAllow('OB cmd-subst non-role', '$(printf x) /tmp/y');
expectAllow('OB brace non-role chmod', 'chmod 644 src/{a,b}.js');
expectAllow('OB decode-exec non-role python3', 'echo data' + PIPE + 'base64 -d' + PIPE + 'python3');
expectAllow('OB perl -e non-role file', 'perl -e "print 1" src/app.js');
expectAllow('OB cat rolefile (READ)', 'cat ' + RGUARD);
expectAllow('OB head rolefile (READ)', 'head .claude/hooks/bash-security-guard.js');
expectAllow('OB grep rolefile (READ)', 'grep TODO ' + RGUARD);
expectAllow('OB node-run rolefile (exec)', 'node .claude/hooks/pre-tool-gate.js');
expectAllow('OB git status', 'git status');
expectAllow('OB eval non-role build', 'eval "cat env.sh"');
expectAllow('OB $IFS non-role echo', 'echo${IFS}hello');
expectAllow('OB nested cmd-subst non-role', 'rm $(echo $(printf dist/bundle.js))');
expectAllow('OB brace-seq {a..c} non-role', 'chmod 644 src/file{a..c}.js');
expectAllow('OB printf-hex non-role | python3', 'printf "\\x68\\x69"' + PIPE + 'python3');
expectAllow('OB cmd-subst non-role basename', 'rm $(echo bundle.js)');
expectAllow('OB brace suffix non-role', 'mv src/app.js{,.bak}');
expectAllow('OB brace-seq {a..z} guard SUPERSTRING (.jsa..jsz not the file)', 'chmod 000 ' + RGUARD + '{a..z}');

// ── Round-4 over-block FIX: interpreter/cmd-subst READS of a role basename must NOT DENY ──
// Round-3 over-blocked legit coworker reads/commits: any role basename inside an
// interpreter -e/-c arg or a cmd-subst literal armed roleSignal AND a construct, so a
// pure READ/PRINT/commit-message DENIED. Round-4 ties the literal-basename signal to an
// actual MUTATION (fs.unlink/writeFile/rm/os.remove/system('rm..)/open(..,'w')) — a
// console.log / print / readFileSync / passive basename literal ALLOWs (read parity with
// cat). node -e / python3 -c additionally trip the long-standing role-INDEPENDENT inline-
// exec ADVISORY (not a block), so those assert not-denied; perl/echo/git-commit allow.
console.log('\nRound-4 over-block fix — interpreter/cmd-subst READS must NOT DENY (coworker role):');
expectNotDenied('OB4 node -e readFileSync rolefile (READ via interp)',
  `node -e "require('fs').readFileSync('` + RGUARD + `')"`);
expectNotDenied('OB4 node -e console.log rolefile (print-only)',
  `node -e "console.log('see ` + RGUARD + `')"`);
expectNotDenied('OB4 python3 -c print rolefile (print-only)',
  `python3 -c "print('` + RGUARD + `')"`);
expectAllow('OB4 perl -e print rolefile (print-only, no interp advisory)',
  `perl -e "print '` + RGUARD + `'"`);
expectAllow('OB4 echo $(date) touched rolefile (passive cmd-subst literal)',
  'echo $(date) "touched ' + RGUARD + '"');
expectAllow('OB4 git commit -m basename rolefile (local commit ref)',
  'git commit -m "fix $(basename ' + RGUARD + ')"');

// ── Round-4 KEEP-DENY: the interpreter MUTATION counterparts must still DENY ──────────
console.log('\nRound-4 interpreter MUTATIONS — must still DENY (coworker role):');
expectDeny('KD4 node -e unlinkSync rolefile', `node -e "require('fs').unlinkSync('` + RGUARD + `')"`);
expectDeny('KD4 perl -e system rm rolefile', `perl -e "system('rm ` + RGUARD + `')"`);
expectDeny('KD4 python3 -c os.remove rolefile', `python3 -c "os.remove('` + RGUARD + `')"`);
expectDeny('KD4 node -e writeFileSync rolefile', `node -e "require('fs').writeFileSync('` + RGUARD + `','x')"`);
expectDeny('KD4 ruby -e File.delete rolefile', `ruby -e "File.delete('` + RGUARD + `')"`);

// ── Round-4 CHEAP SURVIVORS: here-string + newline-var-head must DENY; negatives ALLOW ──
// HOLE A: `sh <<< "rm <rolefile>"` (here-string body carries the verb, no pipe/path token).
// HOLE B: `cmd=rm\n$cmd <rolefile>` (newline between assignment and $VAR head — the `;`
// form already denied; this closes the newline-laundering parity gap).
console.log('\nRound-4 cheap survivors — must DENY (coworker role):');
expectDeny('C4 here-string rm rolefile', 'sh <<< "rm ' + RGUARD + '"');
expectDeny('C4 here-string chmod rolefile', 'sh <<< "chmod 000 ' + RGUARD + '"');
expectDeny('C4 proc-sub rm rolefile', 'diff <(rm ' + RGUARD + ') /dev/null');
expectDeny('C4 newline-var-head rm rolefile', 'cmd=rm\n$cmd ' + RGUARD);
expectDeny('C4 newline-var-head brace ${cmd}', 'cmd=rm\n${cmd} ' + RGUARD);

console.log('\nRound-4 cheap-survivor NEGATIVES — must ALLOW (coworker role):');
expectAllow('C4-neg here-string echo non-role', 'sh <<< "echo hi"');
expectAllow('C4-neg here-string cat rolefile (READ via here-string)', 'sh <<< "cat ' + RGUARD + '"');
expectAllow('C4-neg newline-assign non-role node app', 'FOO=bar\nnode app.js');
expectAllow('C4-neg newline-var-head non-role path', 'cmd=rm\n$cmd dist/bundle.js');

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nRole-bypass results: ${pass}/${total} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
