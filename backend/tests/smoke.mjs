/**
 * API smoke tests — start server, hit /health, verify auth guard, optional login + profile.
 *
 * Always runs without real Supabase (placeholder env). Set SMOKE_ADMIN_EMAIL and
 * SMOKE_ADMIN_PASSWORD (plus real SUPABASE_* vars) for full auth smoke.
 *
 * Run: npm run test:smoke (from backend/)
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const port = process.env.SMOKE_PORT || '3099';
const baseUrl = `http://127.0.0.1:${port}`;

const serverEnv = {
  ...process.env,
  PORT: port,
  NODE_ENV: 'test',
  JWT_SECRET: process.env.JWT_SECRET || 'ci-smoke-test-jwt-secret-min-32-chars',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ci-smoke-placeholder-key',
};

async function waitForHealth(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not respond on ${baseUrl}/health within ${maxMs}ms`);
}

async function assertStatus(label, response, expected) {
  if (response.status !== expected) {
    let body = '';
    try {
      body = JSON.stringify(await response.json());
    } catch {
      body = await response.text();
    }
    throw new Error(`${label}: expected ${expected}, got ${response.status} — ${body}`);
  }
}

async function runSmokeTests() {
  let serverLogs = '';
  const server = spawn('node', ['server.js'], {
    cwd: backendRoot,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });

  const stopServer = () =>
    new Promise((resolve) => {
      if (server.killed) return resolve();
      server.once('exit', resolve);
      server.kill('SIGTERM');
      setTimeout(() => {
        if (!server.killed) server.kill('SIGKILL');
      }, 3000);
    });

  try {
    await waitForHealth();
    console.log('✓ GET /health — server started');

    const healthRes = await fetch(`${baseUrl}/health`);
    await assertStatus('GET /health', healthRes, 200);
    const healthBody = await healthRes.json();
    if (healthBody.status !== 'ok') {
      throw new Error(`GET /health: unexpected body ${JSON.stringify(healthBody)}`);
    }

    const unauthProfile = await fetch(`${baseUrl}/api/profile`);
    await assertStatus('GET /api/profile (no token)', unauthProfile, 401);
    console.log('✓ GET /api/profile — rejects unauthenticated requests');

    const email = process.env.SMOKE_ADMIN_EMAIL;
    const password = process.env.SMOKE_ADMIN_PASSWORD;
    if (email && password) {
      const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!loginRes.ok) {
        const err = await loginRes.json().catch(() => ({}));
        throw new Error(`POST /api/admin/login failed: ${err.error || loginRes.status}`);
      }
      const loginBody = await loginRes.json();
      if (!loginBody.token) {
        throw new Error('POST /api/admin/login: response missing token');
      }
      console.log('✓ POST /api/admin/login');

      const profileRes = await fetch(`${baseUrl}/api/profile`, {
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      if (!profileRes.ok) {
        const err = await profileRes.json().catch(() => ({}));
        throw new Error(`GET /api/profile (authenticated) failed: ${err.error || profileRes.status}`);
      }
      const profileBody = await profileRes.json();
      if (!profileBody.profile) {
        throw new Error('GET /api/profile: response missing profile');
      }
      console.log('✓ GET /api/profile — authenticated');
    } else {
      console.log(
        '○ Skipping login/profile smoke (set SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD for full test)'
      );
    }

    console.log('\nSmoke tests passed.');
  } catch (error) {
    if (serverLogs.trim()) {
      console.error('\n--- server output ---\n' + serverLogs.trim());
    }
    throw error;
  } finally {
    await stopServer();
  }
}

runSmokeTests().catch((error) => {
  console.error('\nSmoke tests failed:', error.message);
  process.exit(1);
});
