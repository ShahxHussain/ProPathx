/**
 * One-time splitter: services/api.js → src/api/* modules
 * Run: node scripts/split-api-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');
const legacyPath = path.join(srcRoot, 'services', 'api.js');
const apiDir = path.join(srcRoot, 'api');

const MAP = {
  orgAuth: 'org/auth.js',
  syncStoredUser: 'profile.js',
  profileAPI: 'profile.js',
  userManagement: 'org/users.js',
  orgDashboard: 'org/dashboard.js',
  testAPI: 'org/tests.js',
  studentAPI: 'org/students.js',
  groupAPI: 'org/groups.js',
  adminAPI: 'admin.js',
  examAPI: 'org/exams.js',
  questionAPI: 'questions.js',
  reviewerAPI: 'reviewers.js',
  notificationAPI: 'notifications.js',
  studentAuth: 'student/auth.js',
  studentDashboardAPI: 'student/dashboard.js',
  orgSettingsAPI: 'org/settings.js',
};

const legacy = fs.readFileSync(legacyPath, 'utf8');
const lines = legacy.split('\n');

// --- client.js (lines 1–60, export request + API_BASE_URL)
const clientBody = lines.slice(0, 60).join('\n');
const client = clientBody
  .replace(/^const API_BASE_URL/, 'export const API_BASE_URL')
  .replace(/^const request = async/, 'export async function request');
fs.mkdirSync(apiDir, { recursive: true });
fs.writeFileSync(path.join(apiDir, 'client.js'), `${client}\n`);

// --- split on export boundaries
const chunks = legacy.split(/\n(?=export (const|function))/);
const header = chunks.shift(); // discarded (client portion)

const fileContents = {};
for (const chunk of chunks) {
  const nameMatch = chunk.match(/^export (?:const|function) (\w+)/);
  if (!nameMatch) continue;
  const name = nameMatch[1];
  const rel = MAP[name];
  if (!rel) {
    console.warn('No map for export:', name);
    continue;
  }
  const body = `import { request } from '${importPath(rel)}';\n\n${chunk.trim()}\n`;
  if (!fileContents[rel]) fileContents[rel] = [];
  fileContents[rel].push(body);
}

function importPath(fromFile) {
  const depth = fromFile.split('/').length - 1;
  return `${ '../'.repeat(depth) }client.js`;
}

for (const [rel, parts] of Object.entries(fileContents)) {
  const full = path.join(apiDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, parts.join('\n'));
}

// --- index.js
const index = `/**
 * Domain-split API modules. Import from \`services/api.js\` for backward compatibility.
 */
export { request, API_BASE_URL } from './client.js';

export { orgAuth } from './org/auth.js';
export { syncStoredUser, profileAPI } from './profile.js';
export { userManagement } from './org/users.js';
export { orgDashboard } from './org/dashboard.js';
export { testAPI } from './org/tests.js';
export { studentAPI } from './org/students.js';
export { groupAPI } from './org/groups.js';
export { adminAPI } from './admin.js';
export { examAPI } from './org/exams.js';
export { questionAPI } from './questions.js';
export { reviewerAPI } from './reviewers.js';
export { notificationAPI } from './notifications.js';
export { studentAuth } from './student/auth.js';
export { studentDashboardAPI } from './student/dashboard.js';
export { orgSettingsAPI } from './org/settings.js';

import { orgAuth } from './org/auth.js';
import { userManagement } from './org/users.js';
import { orgDashboard } from './org/dashboard.js';
import { orgSettingsAPI } from './org/settings.js';
import { adminAPI } from './admin.js';
import { examAPI } from './org/exams.js';
import { questionAPI } from './questions.js';
import { reviewerAPI } from './reviewers.js';
import { notificationAPI } from './notifications.js';
import { testAPI } from './org/tests.js';
import { studentAPI } from './org/students.js';
import { studentAuth } from './student/auth.js';
import { studentDashboardAPI } from './student/dashboard.js';

export default {
  orgAuth,
  userManagement,
  orgDashboard,
  orgSettingsAPI,
  adminAPI,
  examAPI,
  questionAPI,
  reviewerAPI,
  notificationAPI,
  testAPI,
  studentAPI,
  studentAuth,
  studentDashboardAPI,
};
`;
fs.writeFileSync(path.join(apiDir, 'index.js'), index);

// --- services/api.js barrel
const barrel = `/**
 * @deprecated Import from \`../api\` or domain modules under \`../api/\`.
 * This file re-exports for backward compatibility.
 */
export * from '../api/index.js';
export { default } from '../api/index.js';
`;
fs.writeFileSync(legacyPath, barrel);

console.log('Split api.js into', apiDir);
console.log('Updated services/api.js barrel');
