// dev-server.js
const chokidar = require('chokidar');
const path = require('path');

// Ensure output goes to terminal
process.stdout.write('🔍 Watching for file changes...\n');
process.stdout.write('💡 When files change, click the Extensions Reloader button in Chrome\n');

// Watch all relevant files
chokidar.watch(['**/*.js', '**/*.css', '**/*.html', '**/*.json'], {
  ignored: ['node_modules/**', '.git/**'],
  persistent: true
}).on('change', (filePath) => {
  // Force output to terminal
  process.stdout.write(`\n🔄 File changed: ${filePath}\n`);
  process.stdout.write('↻ Click Extensions Reloader button now!\n');
  
  // Make a sound (optional)
  process.stdout.write('\x07');
  
  // Also log to console for browser context
  console.log(`\n🔄 File changed: ${filePath}`);
  console.log('↻ Click Extensions Reloader button now!');
});