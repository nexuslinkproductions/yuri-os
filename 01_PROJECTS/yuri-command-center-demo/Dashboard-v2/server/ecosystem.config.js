/**
 * PM2 ecosystem config — Infomaniak compute instance
 *
 * Deploy: pm2 start ecosystem.config.js
 * Reload: pm2 reload nex-api
 * Logs:   pm2 logs nex-api
 *
 * Cron jobs replace Netlify scheduled functions.
 * Times are UTC — Infomaniak Geneva is UTC+1/+2 (CEST summer).
 */

module.exports = {
  apps: [
    // ── Main API server ──────────────────────────────────────────────
    {
      name: 'nex-api',
      script: './server/index.js',
      cwd: '/opt/nex/app',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        NEX_ENV_FILE: '/opt/nex/.env',
      },
      error_file: '/var/log/nex/api-error.log',
      out_file: '/var/log/nex/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ── SvelteKit frontend (adapter-node) ─────────────────────────────
    {
      name: 'nex-frontend',
      script: './build/index.js',
      cwd: '/opt/nex/app',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        ORIGIN: 'https://ops.c2moviez.com',
        NEX_ENV_FILE: '/opt/nex/.env',
      },
      error_file: '/var/log/nex/frontend-error.log',
      out_file: '/var/log/nex/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // ── Scheduled: telegram-digest — Mon-Fri 06:00 UTC (08:00 CEST) ──
    {
      name: 'cron-telegram-digest',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-digest',
      cron_restart: '0 6 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-prebrief — Mon-Fri 07:30 UTC (09:30 CEST) ─
    {
      name: 'cron-telegram-prebrief',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-prebrief',
      cron_restart: '30 7 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-proactive — Mon-Fri 14:00 UTC (16:00 CEST) ─
    {
      name: 'cron-telegram-proactive',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-proactive',
      cron_restart: '0 14 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-eod — Mon-Fri 17:00 UTC (19:00 CEST) ─────
    {
      name: 'cron-telegram-eod',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-eod',
      cron_restart: '0 17 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-team-digest — Mon-Fri 06:30 UTC ──────────
    {
      name: 'cron-telegram-team-digest',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-team-digest',
      cron_restart: '30 6 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-fk-digest — Mon-Fri 16:00 UTC ────────────
    {
      name: 'cron-telegram-fk-digest',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-fk-digest',
      cron_restart: '0 16 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: telegram-fact-changes — Mon-Fri 19:30 UTC ─────────
    {
      name: 'cron-telegram-fact-changes',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/telegram-fact-changes',
      cron_restart: '30 19 * * 1-5',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: metrics-snapshot — daily 23:00 UTC ─────────────────
    {
      name: 'cron-metrics-snapshot',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/metrics-snapshot',
      cron_restart: '0 23 * * *',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: deep-learning — daily 00:00 UTC ────────────────────
    {
      name: 'cron-deep-learning',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/deep-learning',
      cron_restart: '0 0 * * *',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },

    // ── Scheduled: decision-outcome — hourly :15 ──────────────────────
    {
      name: 'cron-decision-outcome',
      script: './server/cron-runner.js',
      args: '/_internal/scheduled/decision-outcome',
      cron_restart: '15 * * * *',
      watch: false,
      autorestart: false,
      env: { NODE_ENV: 'production', PORT: '3001' },
    },
  ],
};
