/**
 * Split backend/routes/admin.js into domain routers under routes/admin/
 * Run from repo root: node backend/scripts/split-admin-routes.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, '..', 'routes');
const adminDir = path.join(routesDir, 'admin');
const sourcePath = path.join(routesDir, 'admin.js');

const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');

function slice(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function write(rel, content) {
  const full = path.join(adminDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
}

const helpers = `${slice(1, 11)}

${slice(15, 44)
  .split('\n')
  .map((l) => (/^(async )?function /.test(l) ? `export ${l}` : l))
  .join('\n')}

${slice(445, 461)
  .split('\n')
  .map((l) => (/^function /.test(l) ? `export ${l}` : l))
  .join('\n')}
`;

write('helpers.js', helpers);

const baseImports = `import express from 'express';
import { supabase } from '../../config/database.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { createLog, getClientIP, getUserAgent } from '../../utils/logger.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.js';
`;

function moduleFile(extraImports, body) {
  return `${baseImports}${extraImports}
const router = express.Router();

${body}

export default router;
`;
}

const modules = [
  {
    file: 'auth.js',
    imports: `import { validateLogin } from '../../middleware/validation.js';\n`,
    body: slice(46, 128),
  },
  {
    file: 'dashboard.js',
    imports: '',
    body: slice(130, 443),
  },
  {
    file: 'health.js',
    imports: `import os from 'os';
import { recordHealthSample, getRequestSeries, getHealthSeries } from '../../utils/metricsStore.js';
import { percentile, sumRequestBuckets } from './helpers.js';
`,
    body: slice(463, 607),
  },
  {
    file: 'organizations.js',
    imports: `import { ensureOrgEnrollmentSettings } from '../../utils/orgEnrollmentSettings.js';
import { validateCreateOrganization, validateUpdateOrganization } from '../../middleware/validation.js';
`,
    body: `${slice(609, 781)}\n\n${slice(1259, 1413)}`,
  },
  {
    file: 'users.js',
    imports: `import { validateCreatePlatformUser, validateUpdatePlatformUser } from '../../middleware/validation.js';
`,
    body: slice(783, 1257),
  },
  {
    file: 'exams.js',
    imports: '',
    body: slice(1415, 2306),
  },
  {
    file: 'subscriptionPlans.js',
    imports: `import { getPlanTestModesMap, normalizePlanTestModes } from '../../utils/subscriptionPlanCatalog.js';
`,
    body: `${slice(2308, 2696)}\n\n${slice(2984, 3357)}`,
  },
  {
    file: 'settings.js',
    imports: `import { getSystemSetting, upsertSystemSetting } from './helpers.js';
`,
    body: slice(2704, 2976),
  },
  {
    file: 'questions.js',
    imports: '',
    body: slice(3360, 3558),
  },
  {
    file: 'logs.js',
    imports: '',
    body: slice(3560, 3733),
  },
  {
    file: 'subscriptions.js',
    imports: '',
    body: slice(3735, 4102),
  },
];

for (const mod of modules) {
  write(mod.file, moduleFile(mod.imports, mod.body));
}

const index = `${baseImports}
import authRouter from './auth.js';
import dashboardRouter from './dashboard.js';
import healthRouter from './health.js';
import organizationsRouter from './organizations.js';
import usersRouter from './users.js';
import examsRouter from './exams.js';
import subscriptionPlansRouter from './subscriptionPlans.js';
import settingsRouter from './settings.js';
import questionsRouter from './questions.js';
import logsRouter from './logs.js';
import subscriptionsRouter from './subscriptions.js';

const router = express.Router();

router.use(authRouter);
router.use(dashboardRouter);
router.use(healthRouter);
router.use(organizationsRouter);
router.use(usersRouter);
router.use(examsRouter);
router.use(subscriptionPlansRouter);
router.use(settingsRouter);
router.use(questionsRouter);
router.use(logsRouter);
router.use(subscriptionsRouter);

export default router;
`;

write('index.js', index);

fs.writeFileSync(
  sourcePath,
  `/** @deprecated Import from routes/admin/index.js */
export { default } from './admin/index.js';
`
);

console.log('Split admin.js into', adminDir);
console.log('Modules:', modules.map((m) => m.file).join(', '));
