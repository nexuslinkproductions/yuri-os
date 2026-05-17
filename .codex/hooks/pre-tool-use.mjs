#!/usr/bin/env node

import { runHookFromStdin } from '../../_SYSTEM/Scripts/policy/yuri-safety-core.mjs';

await runHookFromStdin({ check: process.argv.includes('--check') });
