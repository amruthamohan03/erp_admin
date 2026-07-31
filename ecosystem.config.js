// /opt/erp_admin/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'erp-admin',
    cwd: '/opt/erp_admin',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    env: { NODE_ENV: 'development' }
  }]
}