#!/usr/bin/env node
/**
 * Checks the connection to the EXISTING Supabase project (no writes, no schema changes).
 * Prints SKIP and exits 0 when credentials are not configured yet.
 *
 *   node scripts/supabase-check.mjs
 */
const URL_BASE = (process.env.SUPABASE_URL || 'https://qxbvmspoegazzpryzcce.supabase.co').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'madrasti-files';

const TABLES = [
  'districts',
  'schools',
  'education_levels',
  'grades',
  'subjects',
  'books',
  'colleges',
  'college_programs',
  'profiles',
  'courses',
  'lessons',
  'enrollments',
  'announcements',
];

if (!ANON && !SERVICE) {
  console.log('SKIP  لم يتم ضبط مفاتيح Supabase بعد (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).');
  console.log('      التطبيق يعمل الآن في الوضع التجريبي المعزول. أضف المفاتيح من Settings → Environment variables.');
  process.exit(0);
}

const key = SERVICE || ANON;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
let failures = 0;

console.log(`Supabase project: ${URL_BASE}`);
console.log(`Key used: ${SERVICE ? 'service_role (server only)' : 'anon'}`);
const keyKind = key.startsWith('sb_publishable_')
  ? 'publishable (new Supabase key format — supported)'
  : key.split('.').length === 3
    ? 'JWT legacy (supported)'
    : 'unknown format';
console.log(`Key format: ${keyKind}`);
console.log(`Storage bucket: ${BUCKET}\n`);

for (const table of TABLES) {
  try {
    const response = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=1`, {
      headers: { ...headers, Prefer: 'count=exact' },
    });
    if (!response.ok) {
      failures += 1;
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 160);
      console.log(`FAIL  ${table.padEnd(16)} HTTP ${response.status} ${detail}`);
      continue;
    }
    const rows = await response.json();
    const range = response.headers.get('content-range') || '';
    const count = range.includes('/') ? range.split('/')[1] : String(rows.length);
    console.log(`OK    ${table.padEnd(16)} rows=${count}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${table.padEnd(16)} ${error instanceof Error ? error.message : error}`);
  }
}

/*
 * Storage probe: the bucket-metadata endpoint (/storage/v1/bucket/:id) requires
 * service_role or a storage admin token, so an anon/publishable key gets HTTP 400.
 * The app itself uploads and lists objects, so we probe the same path it uses.
 */
try {
  const response = await fetch(`${URL_BASE}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 5 }),
  });
  if (response.ok) {
    const objects = await response.json();
    const sample = Array.isArray(objects) ? objects.length : 0;
    console.log(`OK    bucket ${BUCKET} (object listing allowed, sample objects=${sample})`);
  } else {
    failures += 1;
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 160);
    console.log(`FAIL  bucket ${BUCKET} listing HTTP ${response.status} ${detail}`);
    console.log('      راجع وجود الـ bucket وسياسات storage في المشروع.');
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL  bucket ${BUCKET} ${error instanceof Error ? error.message : error}`);
}

if (!SERVICE) {
  console.log('SKIP  bucket metadata (يتطلب service_role) — فحص القائمة أعلاه يكفي للتأكد من عمل المخزن.');
}

if (ANON) {
  try {
    const response = await fetch(`${URL_BASE}/auth/v1/settings`, { headers: { apikey: ANON } });
    if (response.ok) {
      const settings = await response.json();
      console.log(
        `OK    auth email=${Boolean(settings.external?.email)} signups=${settings.disable_signup ? 'disabled' : 'enabled'}`,
      );
    } else {
      failures += 1;
      console.log(`FAIL  auth settings HTTP ${response.status}`);
    }
  } catch (error) {
    failures += 1;
    console.log(`FAIL  auth settings ${error instanceof Error ? error.message : error}`);
  }
} else {
  console.log('SKIP  auth settings (no anon key)');
}

console.log(
  '\nملاحظة: rows=0 تعني إما جدولًا فارغًا فعلًا أو منع RLS للقراءة بالمفتاح العام؛ service_role يوضح الفرق.',
);
console.log(failures === 0 ? '\nSupabase connection check passed.' : `\nSupabase check finished with ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
