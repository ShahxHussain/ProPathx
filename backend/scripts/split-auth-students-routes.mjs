/**
 * Split backend/routes/auth.js and students.js into org vs student modules.
 * Run from repo root: node backend/scripts/split-auth-students-routes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, '..', 'routes');

function read(rel) {
  return fs.readFileSync(path.join(routesDir, rel), 'utf8');
}

function write(rel, content) {
  const full = path.join(routesDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
}

function exportify(source) {
  return source
    .split('\n')
    .map((line) => {
      if (/^(async )?function \w+/.test(line)) return `export ${line}`;
      if (/^const \w+ =/.test(line) && !line.includes('express.Router')) return `export ${line}`;
      return line;
    })
    .join('\n');
}

function collectExportNames(source) {
  const names = [];
  for (const line of source.split('\n')) {
    const fn = line.match(/^(?:export )?(?:async )?function (\w+)/);
    const cn = line.match(/^(?:export )?const (\w+) =/);
    if (fn) names.push(fn[1]);
    if (cn && cn[1] !== 'router') names.push(cn[1]);
  }
  return [...new Set(names)];
}

function destructureBlock(names) {
  const lines = names.map((n) => `  ${n},`);
  return `const {\n${lines.join('\n')}\n} = shared;`;
}

const studentModuleImports = `import express from 'express';
import { supabase } from '../../config/database.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../middleware/auth.js';
import { getClientIP, getUserAgent, createLog } from '../../utils/logger.js';
import { hashPassword } from '../../utils/password.js';
import { createNotification } from '../../utils/notifications.js';
import {
  filterPlansForStudentAudience,
  enrichPlansWithExams,
  getPlanTestModesMap,
  isPlanModeEnabled,
} from '../../utils/subscriptionPlanCatalog.js';
import {
  getOrgEnrollmentSettings,
  shouldAutoApproveDirectAssign,
  shouldAutoApproveStudentRequests,
} from '../../utils/orgEnrollmentSettings.js';
import * as shared from '../students/shared.js';
`;

// ─── AUTH ───────────────────────────────────────────────────────────────────
const authLines = read('auth.js').split('\n');
const authImports = authLines.slice(0, 21).join('\n');

write(
  'auth/helpers.js',
  `${authImports}

${exportify(authLines.slice(24, 139).join('\n'))}
`
);

const orgAuthBody = [
  authLines.slice(144, 200).join('\n'),
  `router.post('/signup', validateOrgSignup, async (req, res) => {`,
  authLines.slice(215, 324).join('\n'),
  authLines.slice(427, 1836).join('\n'),
]
  .join('\n\n')
  .replace(
    /router\.post\('\/login', validateLogin, async \(req, res, next\) => \{[\s\S]*?if \(isStudentAuthRequest\) \{[\s\S]*?return next\('route'\);\n    \}\n\n/,
    "router.post('/login', validateLogin, async (req, res) => {\n"
  );

write(
  'org/auth.js',
  `${authImports}
import {
  buildOrgUserLoginPayload,
  getPublicMaintenanceSettings,
  enrichLogsWithActorNames,
} from '../auth/helpers.js';

const router = express.Router();

${orgAuthBody}

export default router;
`
);

const studentSignup = authLines
  .slice(331, 420)
  .join('\n')
  .replace(
    /  if \(!\(req\.baseUrl && req\.baseUrl\.includes\('\/student\/auth'\)\)\) \{\n    return res\.status\(404\)\.json\(\{ error: 'Route not found' \}\);\n  \}\n\n/,
    ''
  );

const studentLogin = authLines
  .slice(1843, 2054)
  .join('\n')
  .replace(/, async \(req, res, next\) => \{/, ', async (req, res) => {')
  .replace(
    /  \/\/ Only handle student logins[\s\S]*?if \(!isStudentAuthRequest\) \{[\s\S]*?return next\('route'\);\n  \}\n\n/,
    ''
  );

write(
  'student/auth.js',
  `${authImports}

const router = express.Router();

/** POST /api/student/auth/signup */
${studentSignup}

${studentLogin}

export default router;
`
);

write(
  'auth.js',
  `/** @deprecated Import routes/org/auth.js or routes/student/auth.js */
export { default } from './org/auth.js';
`
);

// ─── STUDENTS ───────────────────────────────────────────────────────────────
const studentsLines = read('students.js').split('\n');
const orgMarker = studentsLines.findIndex((l) => l.includes('ORG ADMIN STUDENT MANAGEMENT ROUTES'));
const noteIdx = studentsLines.findIndex((l) => l.includes('NOTE: This router is mounted'));

const sharedChunks = [
  studentsLines.slice(0, 180).join('\n'), // imports + helpers before router
  studentsLines.slice(182, 943).join('\n'), // helpers after router, before student routes
  studentsLines.slice(2342, 2363).join('\n'), // scoreQuestionAttempt
  studentsLines.slice(3573, 3629).join('\n'), // bulk register helpers
  studentsLines.slice(4325, 4362).join('\n'), // directory helpers
];

const sharedSource = sharedChunks.join('\n\n');
write('students/shared.js', exportify(sharedSource));

const sharedNames = collectExportNames(sharedSource);
const destructuring = destructureBlock(sharedNames);

const portalRoutes = [
  studentsLines.slice(noteIdx, 2342).join('\n'),
  studentsLines.slice(2363, orgMarker).join('\n'),
].join('\n');

const orgRoutes = [
  studentsLines.slice(orgMarker, 3573).join('\n'),
  studentsLines.slice(3629, 4325).join('\n'),
  studentsLines.slice(4362).join('\n'),
].join('\n');

write(
  'student/portal.js',
  `${studentModuleImports}
${destructuring}

const router = express.Router();

${portalRoutes}

export default router;
`
);

write(
  'org/students.js',
  `${studentModuleImports}
${destructuring}

const router = express.Router();

${orgRoutes}

export default router;
`
);

write(
  'students.js',
  `/** @deprecated Import routes/student/portal.js or routes/org/students.js */
export { default } from './student/portal.js';
`
);

console.log('Split complete.');
console.log(`  Shared student helpers: ${sharedNames.length} exports`);
