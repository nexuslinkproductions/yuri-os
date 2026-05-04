/**
 * ⬡ YURI TRADING :: PM2 Ecosystem Config
 * Supervised process management for feed aggregator + backend.
 * Deploy: pm2 start ecosystem.config.cjs
 * Save:   pm2 save
 * Boot:   pm2 startup (then copy the sudo line it prints)
 */
module.exports = {
  apps: [
    {
      name: 'yuri-feed-aggregator',
      script: 'Scripts/feeds/feed-aggregator.mjs',
      cwd: '/Users/marcelspatz/NUDIMMUD',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '256M',
      env: { NODE_ENV: 'production' },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/Users/marcelspatz/Library/Logs/yuri-feed-err.log',
      out_file: '/Users/marcelspatz/Library/Logs/yuri-feed-out.log',
      merge_logs: true,
    },
    {
      name: 'yuri-backend',
      script: 'node_modules/.bin/ts-node',
      args: 'src/server.ts',
      cwd: '/Users/marcelspatz/NUDIMMUD/backend',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3004',
        NUDIMMUD_DISABLE_WATCHERS: '1',
        NUDIMMUD_DISABLE_INTERVALS: '1',
        NUDIMMUD_DISABLE_SWARM_ORCHESTRATOR: '1',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/Users/marcelspatz/Library/Logs/yuri-backend-err.log',
      out_file: '/Users/marcelspatz/Library/Logs/yuri-backend-out.log',
      merge_logs: true,
    },
  ],
};
