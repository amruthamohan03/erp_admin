// /opt/erp_admin/ecosystem.config.js
//
// `next start` serves the output of `next build`, so run a build first and
// re-run it after every deploy — pm2 restarting the process does not rebuild.
//
// NODE_ENV must be 'production' here: `next start` serves a production build,
// and running it with NODE_ENV=development mismatches the build it is serving.
//
// AUTH_COOKIE_SECURE=false is what keeps login working while this box is
// reached over plain HTTP — a `secure` cookie is silently dropped by the
// browser on http://, which shows up as "login accepted, still redirected back
// to /login". Delete the line once TLS terminates in front of the app.
//
// Env values live in .env.local (Next loads it); only the two flags that have
// to differ per deployment are set here.
//
//   pm2 delete erp-admin                 # pm2 reuses the old env otherwise
//   pm2 start ecosystem.config.js --update-env
//   pm2 save
//   pm2 env <id>                         # confirm what the process actually got

module.exports = {
  apps: [
    {
      name: 'erp-admin',
      cwd: '/opt/erp_admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'false',
      },
    },
  ],
};
