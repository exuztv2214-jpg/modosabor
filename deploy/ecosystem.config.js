// PM2 Ecosystem Config — ModoSabor Server
module.exports = {
  apps: [
    {
      name: 'modosabor-server',
      script: 'index.js',
      cwd: '/var/www/modosabor/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        TRUST_PROXY: '1',
      },
      error_file: '/opt/modosabor/data/logs/server-err.log',
      out_file: '/opt/modosabor/data/logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
