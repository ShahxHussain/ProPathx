/**
 * Move frontend/src/pages/org → features/org/pages and create legacy re-exports.
 * Run from repo root: node frontend/scripts/move-org-pages.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = path.join(__dirname, '..', 'src');
const fromDir = path.join(frontendSrc, 'pages', 'org');
const toDir = path.join(frontendSrc, 'features', 'org', 'pages');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function fixImports(filePath) {
  const rel = path.relative(toDir, filePath);
  const depth = rel.split(path.sep).length - 1;
  let content = fs.readFileSync(filePath, 'utf8');
  const prefix = '../'.repeat(depth + 3); // pages at depth+1 from src; need +3 to reach src from features/org/pages/...

  // From features/org/pages/File.jsx: ../../../ = src
  // From features/org/pages/testWizard/File.jsx: ../../../../ = src
  if (depth === 0) {
    content = content.replace(/from '\.\.\/\.\.\//g, "from '../../../");
    content = content.replace(/from "\.\.\/\.\.\//g, 'from "../../../');
  } else {
    content = content.replace(/from '\.\.\/\.\.\/\.\.\//g, "from '../../../../");
    content = content.replace(/from "\.\.\/\.\.\/\.\.\//g, 'from "../../../../');
  }
  fs.writeFileSync(filePath, content);
}

function reExportPath(fromLegacyFile, targetFile) {
  const relDir = path.dirname(path.relative(fromDir, fromLegacyFile));
  const targetRel = path
    .relative(path.join(fromDir, relDir), targetFile)
    .replace(/\\/g, '/')
    .replace(/\.jsx$/, '')
    .replace(/\.js$/, '');

  return `/** @deprecated Import from features/org/pages */\nexport { default } from '${targetRel.startsWith('.') ? targetRel : `./${targetRel}`}';\n`;
}

if (!fs.existsSync(fromDir)) {
  console.log('pages/org already moved or missing — skipping file move');
} else {
  fs.mkdirSync(toDir, { recursive: true });

  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const src = path.join(fromDir, entry.name);
    const dest = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  for (const file of walk(toDir)) {
    if (/\.(jsx|js)$/.test(file)) fixImports(file);
  }

  for (const file of walk(fromDir)) {
    fs.rmSync(file, { force: true });
  }
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (entry.isDirectory()) fs.rmSync(path.join(fromDir, entry.name), { recursive: true, force: true });
  }
}

const movedFiles = walk(toDir);
for (const target of movedFiles) {
  if (!/\.(jsx|js)$/.test(target)) continue;
  const relFromOrg = path.relative(toDir, target);
  const legacyFile = path.join(fromDir, relFromOrg);
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  const exportPath = path
    .relative(path.dirname(legacyFile), target)
    .replace(/\\/g, '/')
    .replace(/\.jsx$/, '')
    .replace(/\.js$/, '');
  const exportFrom = exportPath.startsWith('.') ? exportPath : `./${exportPath}`;
  fs.writeFileSync(
    legacyFile,
    `/** @deprecated Import from features/org/pages */\nexport { default } from '${exportFrom}';\n`
  );
}

// Named exports used by test wizard
const testQuestionsLegacy = path.join(fromDir, 'TestQuestions.jsx');
const testQuestionsTarget = path.join(toDir, 'TestQuestions.jsx');
if (fs.existsSync(testQuestionsTarget)) {
  fs.writeFileSync(
    testQuestionsLegacy,
    `/** @deprecated Import from features/org/pages/TestQuestions */\nexport { default, TestQuestionsEmbedded } from '../../features/org/pages/TestQuestions';\n`
  );
}

const routesPath = path.join(frontendSrc, 'features', 'org', 'routes.jsx');
let routes = fs.readFileSync(routesPath, 'utf8');
routes = routes.replace(/from '\.\.\/\.\.\/pages\/org\//g, "from './pages/");
routes = routes.replace(/from "\.\.\/\.\.\/pages\/org\//g, 'from "./pages/');
fs.writeFileSync(routesPath, routes);

console.log('Moved org pages → features/org/pages/');
console.log('Created re-exports in pages/org/');
console.log('Updated features/org/routes.jsx');
