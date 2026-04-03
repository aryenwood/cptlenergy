#!/usr/bin/env node
// Production build: minify + obfuscate index.html
// Usage: node build.js
// Output: index.min.html (deploy this instead of index.html)

const { minify } = require('html-minifier-terser');
const fs = require('fs');

const input = fs.readFileSync('index.html', 'utf8');

(async () => {
  console.log('Building production index.html...');
  console.log('  Source:', (input.length / 1024).toFixed(0), 'KB');

  const result = await minify(input, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: {
      mangle: {
        reserved: [
          // Firebase SDK globals
          'firebase', 'fbAuth', 'fbDb', 'fbStorage', 'fbMsg',
          // Leaflet
          'L',
          // App globals that must stay
          'DataStore', 'TrainerBot', 'wcSplash',
          '_isSuperAdminCached', '_initApp', '_dismissSplash',
          'renderDashboard', 'renderLogList', 'activateTab',
          'showToast', 'haptic', 'drainToFirestore',
          'applyOrgSettings', 'applyThemePrimary', 'applyGlassColor',
          'getActiveRole', 'applyRoleUI', 'loadAppointments', 'saveAppointments',
          'loadEntries', 'loadTeam', 'saveTeam',
          'renderTierProgress', 'triggerAppointmentWin', 'showWinOverlay',
          '_computeRepRank', 'confetti', 'fireConfetti',
          'Sentry', 'Anthropic'
        ]
      },
      compress: {
        drop_console: false, // keep console.log for debugging
        passes: 2
      }
    }
  });

  fs.writeFileSync('index.min.html', result);
  const savings = ((1 - result.length / input.length) * 100).toFixed(1);
  console.log('  Output:', (result.length / 1024).toFixed(0), 'KB');
  console.log('  Savings:', savings + '%');
  console.log('  Written to: index.min.html');
  console.log('\nDeploy index.min.html as index.html on production.');
})().catch(e => { console.error('Build failed:', e.message); process.exit(1); });
