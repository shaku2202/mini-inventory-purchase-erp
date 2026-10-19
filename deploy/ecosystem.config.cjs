// PM2 process file for a Linux VPS:  pm2 start deploy/ecosystem.config.cjs && pm2 save
// Secrets are NOT stored here - the app reads backend/.env (chmod 600) or the server environment.
module.exports = {
  apps: [
    {
      name: 'erp-api',
      cwd: './backend',
      script: 'dist/server.js',
      instances: 2, // cluster mode; migrations are guarded by an advisory lock
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production', PORT: 4000 },
      max_memory_restart: '300M',
      kill_timeout: 10000, // matches the graceful-shutdown window in server.ts
      time: true,
    },
  ],
};
