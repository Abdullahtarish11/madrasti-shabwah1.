/**
 * Production smoke check: runs the compiled server exactly as `npm start` does
 * and verifies the SPA routes, the API and the PWA assets are actually served.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 3125);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(process.cwd(), '.data-smoke');

const entry = path.join(process.cwd(), 'server-dist', 'server', 'index.js');
if (!fs.existsSync(entry)) {
  console.error(`Missing build output: ${entry}. Run "npm run build" first.`);
  process.exit(1);
}
if (!fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
  console.error('Missing dist/index.html. Run "npm run build" first.');
  process.exit(1);
}

fs.rmSync(DATA_DIR, { recursive: true, force: true });

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, PORT: String(PORT), HOST: '0.0.0.0', DATA_DIR, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const logs = [];
server.stdout.on('data', (chunk) => logs.push(chunk.toString()));
server.stderr.on('data', (chunk) => logs.push(chunk.toString()));

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) return false;
    try {
      const response = await fetch(`${BASE}/api/public/health`);
      if (response.ok) return true;
    } catch {
      /* keep waiting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.error('Compiled server did not start:\n' + logs.join(''));
    process.exit(1);
  }

  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  check('home page is served', home.status === 200 && homeHtml.includes('id="root"'), `status=${home.status}`);

  for (const route of ['/schools', '/library', '/universities', '/announcements', '/search', '/auth']) {
    const response = await fetch(`${BASE}${route}`);
    check(`SPA route ${route} responds`, response.status === 200, `status=${response.status}`);
  }

  const health = await fetch(`${BASE}/api/public/health`);
  check('API health responds', health.status === 200);

  const schools = await fetch(`${BASE}/api/public/schools`);
  const schoolsData = await schools.json().catch(() => null);
  const schoolRows = Array.isArray(schoolsData) ? schoolsData : schoolsData?.schools ?? [];
  check('API returns schools', schools.status === 200 && schoolRows.length > 0, `count=${schoolRows.length}`);

  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  check('PWA manifest is served', manifest.status === 200);

  const worker = await fetch(`${BASE}/sw.js`);
  check('service worker is served', worker.status === 200);

  const icon = await fetch(`${BASE}/icons/icon-192.png`);
  check('PWA icon is served', icon.status === 200);

  console.log(failures === 0 ? '\nproduction smoke passed' : `\n${failures} production smoke checks failed`);
}

main()
  .catch((error) => {
    console.error('Smoke run failed:', error);
    failures += 1;
  })
  .finally(() => {
    server.kill('SIGTERM');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    setTimeout(() => process.exit(failures === 0 ? 0 : 1), 300);
  });
