#!/usr/bin/env node

import { getHealthSummary } from './kagami-overseer.mjs';

const summary = getHealthSummary();
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(summary.quarantinedLanes.length > 0 || summary.status === 'fail' ? 1 : 0);
