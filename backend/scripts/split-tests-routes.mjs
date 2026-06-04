/**
 * Split backend/routes/tests.js into routes/org/tests/
 * Run from repo root: node backend/scripts/split-tests-routes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, '..', 'routes');
const testsDir = path.join(routesDir, 'org', 'tests');
const sourcePath = path.join(routesDir, 'tests.js');

const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');

function slice(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function exportHelpersBlock(startLine, endLine) {
  return slice(startLine, endLine)
    .split('\n')
    .map((line) => {
      if (/^async function /.test(line)) return `export ${line}`;
      if (/^function /.test(line)) return `export ${line}`;
      if (/^const MIN_QUESTIONS/.test(line)) return `export ${line}`;
      if (/^const PG_OPTIONS/.test(line)) return `export ${line}`;
      return line;
    })
    .join('\n');
}

function write(rel, content) {
  const full = path.join(testsDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
}

const sharedHeader = `import { supabase } from '../../../config/database.js';
import { isPlanModeEnabled } from '../../../utils/subscriptionPlanCatalog.js';

`;

write('shared.js', sharedHeader + exportHelpersBlock(10, 556));

const routeImports = `import express from 'express';
import { supabase } from '../../../config/database.js';
import { createLog, getClientIP, getUserAgent } from '../../../utils/logger.js';
import { authenticate, requireRole, verifyActiveStatus } from '../../../middleware/auth.js';
`;

function routeModule(extraImports, bodySlices) {
  const body = bodySlices.map(([s, e]) => slice(s, e)).join('\n\n');
  return `${routeImports}${extraImports}
const router = express.Router();

${body}

export default router;
`;
}

write(
  'crud.js',
  routeModule(
    `import {
  bindingFromTestRow,
  loadTestQuestionsWithQuestions,
  getOrCreateUsageCounter,
  orgHasQualifyingSubscription,
  checkMinQuestionsForActivateOrAssign,
} from './shared.js';
`,
    [
      [558, 1068],
      [2734, 2801],
    ]
  )
);

write(
  'questions.js',
  routeModule(
    `import {
  validateWeightageForAdd,
  ensureScheduledModeEnabledForTestSubscription,
} from './shared.js';
`,
    [[1070, 1758]]
  )
);

write(
  'assignments.js',
  routeModule(
    `import {
  checkMinQuestionsForActivateOrAssign,
  ensureScheduledModeEnabledForTestSubscription,
  getEligibleStudentIdsForTestExam,
  deleteStudentAttemptsForTest,
} from './shared.js';
`,
    [[1760, 2732]]
  )
);

write(
  'index.js',
  `import express from 'express';
import crudRouter from './crud.js';
import questionsRouter from './questions.js';
import assignmentsRouter from './assignments.js';

const router = express.Router();

router.use(crudRouter);
router.use(questionsRouter);
router.use(assignmentsRouter);

export default router;
`
);

const barrel = `/** @deprecated Import from ./org/tests/index.js — removed in Phase D */
export { default } from './org/tests/index.js';
`;

fs.writeFileSync(sourcePath, barrel);

console.log('Split tests.js → routes/org/tests/ (shared, crud, questions, assignments, index)');
console.log('Root tests.js is now a re-export barrel.');
