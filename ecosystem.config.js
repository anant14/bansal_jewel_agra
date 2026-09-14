// PM2 process file — `pm2 start ecosystem.config.js`
module.exports = {
  apps: [
    {
      name: 'bansal-jewellers',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
