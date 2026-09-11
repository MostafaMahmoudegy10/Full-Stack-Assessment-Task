const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

// Run the compiled seed directly: deployed dynos do not need Turbo or Nest CLI.
if (!process.argv.includes('--reset-demo-data')) {
  console.error(
    'This command deletes and recreates ProjectFlow collections. ' +
      'Run with --reset-demo-data only against a disposable demo database.',
  );
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI must be set explicitly (Heroku Config Vars).');
  process.exit(1);
}
const seed = resolve(__dirname, '../apps/api/dist/database/seed.js');
if (!existsSync(seed)) {
  console.error('Compiled seed missing. Build/deploy the application first.');
  process.exit(1);
}

console.log('Resetting the configured demo database using the existing ProjectFlow seed.');
require(seed);
