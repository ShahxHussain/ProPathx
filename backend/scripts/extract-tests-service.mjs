/**
 * Build services/testsService.js from git history of routes/tests.js helpers block.
 * Run: node backend/scripts/extract-tests-service.mjs
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

let source;
try {
  source = execSync('git show HEAD:backend/routes/tests.js', { cwd: repoRoot, encoding: 'utf8' });
} catch {
  console.error('Could not read HEAD:backend/routes/tests.js');
  process.exit(1);
}

const lines = source.split('\n');
const helpers = lines
  .slice(9, 556)
  .map((line) => {
    if (/^async function /.test(line)) return `export ${line}`;
    if (/^function /.test(line)) return `export ${line}`;
    if (/^const MIN_QUESTIONS/.test(line)) return `export ${line}`;
    if (/^const PG_OPTIONS/.test(line)) return `export ${line}`;
    return line;
  })
  .join('\n');

const out = `import { supabase } from '../config/database.js';
import { isPlanModeEnabled } from '../utils/subscriptionPlanCatalog.js';

${helpers}
`;

const outPath = path.join(__dirname, '..', 'services', 'testsService.js');
fs.writeFileSync(outPath, out.endsWith('\n') ? out : `${out}\n`);
console.log('Wrote', outPath);
