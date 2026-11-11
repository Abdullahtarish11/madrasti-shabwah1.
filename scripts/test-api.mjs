/**
 * End-to-end API checks for Madrasti Shabwah.
 * Starts the real server on a test port with an isolated DATA_DIR so the
 * production dataset is never touched, then verifies roles and permissions.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.TEST_PORT ?? 4123);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(process.cwd(), '.data-test');

fs.rmSync(DATA_DIR, { recursive: true, force: true });

const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const serverLog = [];
server.stdout.on('data', (chunk) => serverLog.push(chunk.toString()));
server.stderr.on('data', (chunk) => serverLog.push(chunk.toString()));

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/public/health`);
      if (response.ok) return true;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Minimal cookie jar so session cookies follow each role's requests. */
function makeClient() {
  let cookie = '';
  return async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${BASE}${url}`, { method, headers, body: payload });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    if (setCookie.length) cookie = setCookie.map((value) => value.split(';')[0]).join('; ');
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.arrayBuffer();
    return { status: response.status, data, headers: response.headers };
  };
}

const DEMO = {
  admin: { email: 'admin@madrasti.ye', password: 'Admin@12345' },
  teacher: { email: 'teacher@madrasti.ye', password: 'Teacher@12345' },
  student: { email: 'student@madrasti.ye', password: 'Student@12345' },
  manager: { email: 'manager@madrasti.ye', password: 'Manager@12345' },
};

async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.error('Server did not start:\n' + serverLog.join(''));
    process.exit(1);
  }

  const publicClient = makeClient();

  const health = await publicClient('GET', '/api/public/health');
  check('health endpoint responds', health.status === 200);

  const overview = await publicClient('GET', '/api/public/overview');
  check('public overview returns districts', overview.status === 200 && Array.isArray(overview.data?.districts) && overview.data.districts.length > 0);

  const schools = await publicClient('GET', '/api/public/schools');
  check('public schools list is populated', schools.status === 200 && (schools.data?.schools ?? schools.data)?.length > 0);

  const books = await publicClient('GET', '/api/public/books');
  const bookList = Array.isArray(books.data) ? books.data : books.data?.books ?? [];
  check('public books list is populated', books.status === 200 && bookList.length > 0);

  const search = await publicClient('GET', '/api/public/search?q=شبوة');
  check('search endpoint responds', search.status === 200);

  if (bookList.length > 0) {
    const file = await publicClient('GET', `/api/public/books/${bookList[0].id}/file`);
    const buffer = Buffer.from(file.data ?? []);
    check(
      'book PDF download works',
      file.status === 200 && buffer.subarray(0, 4).toString() === '%PDF',
      `status=${file.status} bytes=${buffer.length}`,
    );
  }

  // Registration + login for a new student account.
  const freshClient = makeClient();
  const uniqueEmail = `student.${Date.now()}@example.com`;
  const register = await freshClient('POST', '/api/auth/register', {
    fullName: 'طالب اختبار',
    email: uniqueEmail,
    password: 'Test@12345',
    role: 'student',
    districtId: 'd1',
    gradeId: 'g1',
  });
  check('student registration succeeds', register.status === 201 || register.status === 200, `status=${register.status}`);

  const me = await freshClient('GET', '/api/auth/me');
  check('session cookie authenticates /me', me.status === 200 && me.data?.user?.email === uniqueEmail);

  const studentClient = makeClient();
  const studentLogin = await studentClient('POST', '/api/auth/login', DEMO.student);
  check('student login succeeds', studentLogin.status === 200 && studentLogin.data?.user?.role === 'student');

  const studentDash = await studentClient('GET', '/api/student/dashboard');
  check(
    'student dashboard loads with lessons',
    studentDash.status === 200 && Array.isArray(studentDash.data?.lessons),
    `status=${studentDash.status}`,
  );

  const studentForbidden = await studentClient('GET', '/api/admin/overview');
  check('student cannot reach admin API', studentForbidden.status === 403, `status=${studentForbidden.status}`);

  const studentTeacherForbidden = await studentClient('GET', '/api/teacher/dashboard');
  check('student cannot reach teacher API', studentTeacherForbidden.status === 403, `status=${studentTeacherForbidden.status}`);

  const teacherClient = makeClient();
  const teacherLogin = await teacherClient('POST', '/api/auth/login', DEMO.teacher);
  check('teacher login succeeds', teacherLogin.status === 200 && teacherLogin.data?.user?.role === 'teacher');

  const teacherDash = await teacherClient('GET', '/api/teacher/dashboard');
  check('teacher dashboard loads', teacherDash.status === 200 && teacherDash.data?.stats !== undefined);

  const teacherAdminForbidden = await teacherClient('GET', '/api/admin/overview');
  check('teacher cannot reach admin API', teacherAdminForbidden.status === 403);

  const managerClient = makeClient();
  const managerLogin = await managerClient('POST', '/api/auth/login', DEMO.manager);
  check('school manager login succeeds', managerLogin.status === 200 && managerLogin.data?.user?.role === 'school_manager');

  const managerDash = await managerClient('GET', '/api/manager/dashboard');
  check(
    'manager dashboard is scoped to own school',
    managerDash.status === 200 && managerDash.data?.school?.id === managerLogin.data?.user?.schoolId,
    `status=${managerDash.status}`,
  );

  const managerAdminForbidden = await managerClient('GET', '/api/admin/users');
  check('manager cannot reach admin API', managerAdminForbidden.status === 403);

  const adminClient = makeClient();
  const adminLogin = await adminClient('POST', '/api/auth/login', DEMO.admin);
  check('admin login succeeds', adminLogin.status === 200 && adminLogin.data?.user?.role === 'admin');

  const adminOverview = await adminClient('GET', '/api/admin/overview');
  check('admin overview loads', adminOverview.status === 200 && adminOverview.data?.counts !== undefined);

  const adminUsers = await adminClient('GET', '/api/admin/users');
  check('admin can list users', adminUsers.status === 200 && Array.isArray(adminUsers.data));

  const createdDistrict = await adminClient('POST', '/api/admin/districts', {
    name: `مديرية اختبار ${Date.now()}`,
    description: 'سجل مؤقت من اختبار آلي',
  });
  check('admin can create a district record', createdDistrict.status === 201 || createdDistrict.status === 200);

  if (createdDistrict.data?.id) {
    const removed = await adminClient('DELETE', `/api/admin/districts/${createdDistrict.data.id}`);
    check('admin can delete the test district', removed.status === 200 || removed.status === 204);
  }

  const unauthorizedUpload = await publicClient('GET', '/api/files/anything.pdf');
  check('file access requires authentication', unauthorizedUpload.status === 401);

  const logout = await adminClient('POST', '/api/auth/logout');
  check('logout clears the session', logout.status === 200);
  const afterLogout = await adminClient('GET', '/api/admin/overview');
  check('session is invalid after logout', afterLogout.status === 401);

  const pwa = await fetch(`${BASE}/manifest.webmanifest`);
  check('PWA manifest is served', pwa.status === 200);

  console.log('\n' + results.join('\n'));
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
}

main()
  .catch((error) => {
    console.error('Test run failed:', error);
    failures += 1;
  })
  .finally(() => {
    server.kill('SIGTERM');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    setTimeout(() => process.exit(failures === 0 ? 0 : 1), 300);
  });
