module.exports = {
  apps: [
    {
      name: 'yuri-os-musubi-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/Users/marcelspatz/YURI-OS-MUSUBI/backend',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'development',
        PORT: 3004
      },
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '5s',
      max_restarts: 15,
      exp_backoff_restart_delay: 100,
      error_file: '/Users/marcelspatz/.pm2/logs/yuri-os-musubi-backend-error.log',
      out_file: '/Users/marcelspatz/.pm2/logs/yuri-os-musubi-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'yuri-os-musubi-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/Users/marcelspatz/YURI-OS-MUSUBI',
      env: {
        NODE_ENV: 'development',
        PORT: 5173
      },
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '5s',
      max_restarts: 15,
      exp_backoff_restart_delay: 100,
    }
  ]
};
