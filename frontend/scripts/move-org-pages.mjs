/**
 * One-time migration: pages/org → features/org/pages (completed 2026-05-21).
 *
 * OrgAdmin UI now lives only under:
 *   frontend/src/features/org/pages/
 *   frontend/src/features/org/routes.jsx
 *
 * This script is kept for history. Re-running it is a no-op.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyDir = path.join(__dirname, '..', 'src', 'pages', 'org');
const canonicalDir = path.join(__dirname, '..', 'src', 'features', 'org', 'pages');

if (!fs.existsSync(canonicalDir)) {
  console.error('Expected canonical org pages at features/org/pages — missing.');
  process.exit(1);
}

if (fs.existsSync(legacyDir)) {
  const remaining = fs.readdirSync(legacyDir, { recursive: true });
  if (remaining.length > 0) {
    console.error(
      'Legacy pages/org still contains files. Remove re-exports; canonical path is features/org/pages/.'
    );
    process.exit(1);
  }
}

console.log('Org pages migration complete. Canonical path: frontend/src/features/org/pages/');
