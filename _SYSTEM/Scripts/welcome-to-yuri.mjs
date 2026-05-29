#!/usr/bin/env node
/**
 * welcome-to-yuri.mjs — the WELCOME GIFT 🎁
 *
 * A baked-in easter egg for the second operator. Run it on a fresh clone.
 * Rick-voiced. Funny. Secretly a 60-second orientation to operating YURI.
 *
 *   node _SYSTEM/Scripts/welcome-to-yuri.mjs            # full experience
 *   node _SYSTEM/Scripts/welcome-to-yuri.mjs --fast     # skip the animation
 *   node _SYSTEM/Scripts/welcome-to-yuri.mjs --no-color # plain
 *   node _SYSTEM/Scripts/welcome-to-yuri.mjs --who=Mike # name the operator
 *
 * No dependencies. Pure node. Self-contained on purpose — it has to survive a clone.
 */

const args = new Set(process.argv.slice(2));
const FAST = args.has('--fast');
const NOCOLOR = args.has('--no-color') || !process.stdout.isTTY;
const whoArg = process.argv.slice(2).find(a => a.startsWith('--who='));
const WHO = whoArg ? whoArg.split('=')[1] : 'Mike';

const c = NOCOLOR
  ? new Proxy({}, { get: () => (s) => s })
  : {
      dim:   (s) => `\x1b[2m${s}\x1b[0m`,
      bold:  (s) => `\x1b[1m${s}\x1b[0m`,
      cyan:  (s) => `\x1b[36m${s}\x1b[0m`,
      mag:   (s) => `\x1b[35m${s}\x1b[0m`,
      grn:   (s) => `\x1b[32m${s}\x1b[0m`,
      yel:   (s) => `\x1b[33m${s}\x1b[0m`,
      red:   (s) => `\x1b[31m${s}\x1b[0m`,
      white: (s) => `\x1b[97m${s}\x1b[0m`,
    };

const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));

async function type(line, { speed = 14, after = 220 } = {}) {
  if (FAST || NOCOLOR) { process.stdout.write(line + '\n'); return; }
  for (const ch of line) { process.stdout.write(ch); await sleep(speed); }
  process.stdout.write('\n');
  await sleep(after);
}

const SIGIL = [
  '',
  '        ╭───────────────────────────────────────────╮',
  '        │                                           │',
  '        │      Y U R I   ·   結   ·   MUSUBI         │',
  '        │        fashioner of likenesses            │',
  '        │                                           │',
  '        ╰───────────────────────────────────────────╯',
  '',
];

const QUIPS = [
  'Wubba lubba dub dub. You\'re in.',
  'Don\'t think about it too hard. Actually — do. That\'s the whole point.',
  'I\'ve seen infinite timelines. In most of them you ran this twice.',
  'Two operators, one brain. Statistically inadvisable. Let\'s go anyway.',
  'The boring AI assistants are in another repo, Morty.',
];

async function main() {
  if (!FAST && !NOCOLOR) process.stdout.write('\x1b[2J\x1b[H\x1b[?25l'); // clear + hide cursor

  for (const l of SIGIL) console.log(c.cyan(l));
  await sleep(400);

  await type(c.dim('  > establishing symbiotic link ...'), { after: 350 });
  await type(c.dim('  > scanning operator brain ............ ') + c.grn('found (suspiciously similar to operator #1)'), { after: 300 });
  await type(c.dim('  > loading the ME tablets ............. ') + c.grn('ok'), { after: 250 });
  await type(c.dim('  > minting operator badge ............. ') + c.yel('#002'), { after: 450 });
  console.log('');

  await type(c.bold(c.white(`  Welcome to YURI, ${WHO}.`)), { speed: 22, after: 500 });
  console.log('');
  await type(`  ${c.mag('»')} ${QUIPS[Math.floor((Date.now() / 1000) % QUIPS.length)]}`, { after: 500 });
  console.log('');

  await type(c.dim('  ─────────────────────────────────────────────────────────'));
  await type(c.bold('  What this thing actually is') + c.dim('  (the 60-second version)'));
  await type(c.dim('  ─────────────────────────────────────────────────────────'));
  console.log('');

  const beats = [
    [c.cyan('It is not a chatbot.'), 'It is an external nervous system. You brain-dump, it decodes, routes, builds, verifies, and remembers across sessions. Messy input is the expected input.'],
    [c.cyan('It runs in lanes.'), 'The main session is overseer + finalizer. Real work offloads to lanes (Codex, DeepSeek, local models, Claude lanes). It picks the smallest lane that can do the job, automatically.'],
    [c.cyan('It has a brain block.'), 'Every session loads a <yuri-brain> with the persona, the rules, the live system state, and the operator cognitive contract. That\'s why it already knows how you work.'],
    [c.cyan('It has hard rules.'), 'No commit/push without you saying so. No reading secrets. Protected paths are protected. It will challenge you once when you\'re about to do something dumb, then respect your call.'],
    [c.cyan('It earns trust by remembering.'), 'Forgetting your intent = breaking trust. It externalizes everything: what landed where, what\'s live, what\'s parked. You should never have to ask "where did that go."'],
  ];
  for (const [head, body] of beats) {
    await type('  ' + c.grn('●') + ' ' + head, { speed: 8, after: 120 });
    await type('    ' + c.dim(body), { speed: 4, after: 320 });
    console.log('');
  }

  await type(c.dim('  ─────────────────────────────────────────────────────────'));
  await type(c.bold('  How to operate it'));
  await type(c.dim('  ─────────────────────────────────────────────────────────'));
  console.log('');
  await type('  ' + c.yel('1.') + ' Just talk to it. Shotgun bursts of ideas are fine — it decodes the pattern.');
  await type('  ' + c.yel('2.') + ' Tell it the goal, not the keystrokes. It plans, routes, and verifies.');
  await type('  ' + c.yel('3.') + ' When it asks one sharp question, that\'s the moment that saves an hour. Answer it.');
  await type('  ' + c.yel('4.') + ' Read ' + c.cyan('WELCOME-MIKE.md') + ' for the clone + setup steps. Then sit next to Marcel.');
  console.log('');

  await sleep(300);
  await type(c.dim('  ─────────────────────────────────────────────────────────'));
  await type('  ' + c.mag('Marcel built this so you don\'t have to start from zero.'), { speed: 16 });
  await type('  ' + c.mag('Same Yuri he runs. Now it\'s yours too. Let\'s go make money.'), { speed: 16, after: 200 });
  console.log('');
  await type(c.dim('  (psst — run me again with --fast if you\'re in a hurry, or --who=YourName)'));
  console.log('');

  if (!FAST && !NOCOLOR) process.stdout.write('\x1b[?25h'); // show cursor
}

main().catch((e) => {
  if (!NOCOLOR) process.stdout.write('\x1b[?25h');
  console.error('welcome ritual interrupted:', e?.message || e);
  process.exit(0); // a welcome gift never hard-fails
});
