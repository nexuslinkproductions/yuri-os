#!/usr/bin/env node
// @capability: infra-gap-proposer
// @serves: job proposal | company integration | infra-gap automation
// @does: Run infra-gap detector and propose missing surfaces as jobs to the job pool
// @use: node infra-gap-proposer.mjs [--dry-run] [--add]
// @exports: proposeInfraJobs

import { detectInfraGaps, proposeJob } from './infra-gap-detector.mjs';
import { openPool, addJob, listJobs, JOB_TYPES, JOB_STATES, PRIORITY } from './job-pool.mjs';

/**
 * Load job pool from SQLite via job-pool.mjs
 */
function loadJobPool() {
  const db = openPool();
  return db;
}

/**
 * Check if a job already exists (by title match)
 */
function jobExists(db, title) {
  const jobs = listJobs(db, {});
  return jobs.some(j => j.title === title);
}

/**
 * Propose infrastructure gaps as jobs
 */
export function proposeInfraJobs({ dryRun = false, add = false } = {}) {
  const { gaps } = detectInfraGaps();
  const pool = loadJobPool();

  const newJobs = [];
  const skipped = [];

  for (const gap of gaps) {
    const gapDetail = proposeJob(gap);
    const job = {
      title: gapDetail.title,
      type: 'infra',
      detail: gapDetail.detail,
      value: gapDetail.value,
      risk: gapDetail.risk,
      priority: gapDetail.priority,
      source: gapDetail.source,
      nextAction: gapDetail.nextAction,
      closureCondition: gapDetail.closure,
      state: 'recommended',
    };

    if (jobExists(pool, job.title)) {
      skipped.push(job);
    } else {
      newJobs.push(job);
    }
  }

  if (dryRun) {
    console.log('🔍 Infra Gap Job Proposal (DRY RUN)\n');
    console.log(`✅ Jobs to propose: ${newJobs.length}`);
    newJobs.forEach(job => {
      console.log(`   - ${job.title} (${job.priority}, value=${job.value})`);
    });
    console.log(`\n⏭️  Skipped (already exists): ${skipped.length}`);
    skipped.forEach(job => {
      console.log(`   - ${job.title}`);
    });
    return { proposed: newJobs, skipped, poolStats: null };
  }

  if (add) {
    let addedCount = 0;
    for (const job of newJobs) {
      try {
        addJob(db, job);
        addedCount++;
      } catch (e) {
        console.error(`   ❌ Failed to add job: ${job.title} - ${e.message}`);
      }
    }

    console.log('✅ Infra Gap Jobs Proposed\n');
    console.log(`Added ${addedCount} jobs to job pool:`);
    newJobs.forEach(job => {
      console.log(`   - ${job.title} [${job.priority}, value=${job.value}]`);
    });
    console.log(`\nSkipped ${skipped.length} (already exists)`);
    console.log(`\nJob pool updated: _SYSTEM/OS_KERNEL/work-ledger.db (jobs table)`);

    // Show current pool stats
    const jobs = listJobs(db, {});
    const stats = {
      total: jobs.length,
      open: jobs.filter(j => j.state === 'open').length,
      recommended: jobs.filter(j => j.state === 'recommended').length,
      done: jobs.filter(j => j.state === 'done').length,
    };
    console.log(`\nCurrent pool stats: total=${stats.total}, open=${stats.open}, recommended=${stats.recommended}, done=${stats.done}`);

    return { proposed: newJobs, skipped, poolStats: stats };
  } else {
    console.log('ℹ️  Run with --add to write jobs to job pool');
    console.log(`ℹ️  Proposed ${newJobs.length} jobs, skipped ${skipped.length}`);
  }

  return { proposed: newJobs, skipped, poolStats: null };
}

// CLI interface
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isAdd = args.includes('--add') || args.includes('-a');

proposeInfraJobs({ dryRun: isDryRun, add: isAdd });