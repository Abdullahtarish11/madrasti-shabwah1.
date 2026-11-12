/**
 * Supabase adapter for the existing Madrasti Shabwah project.
 *
 * Rules enforced here:
 * - Never creates a project, never runs destructive SQL.
 * - Reads the 13 documented tables through PostgREST and maps tolerant column names.
 * - User-scoped calls use the caller's access token so existing RLS policies apply.
 * - The service_role key is only used for server-side catalog reads and never leaves the server.
 * - Without credentials the platform stays in an isolated local demo store.
 */
import type {
  Announcement,
  Book,
  College,
  CollegeProgram,
  District,
  EducationLevel,
  Grade,
  School,
  Subject,
} from '../shared/types';

/** Known project for this deployment; only the keys are secrets. */
export const DEFAULT_SUPABASE_URL = 'https://qxbvmspoegazzpryzcce.supabase.co';
export const DEFAULT_BUCKET = 'madrasti-files';

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  anonKey: string;
}

export type DataMode = 'supabase' | 'local';

export function supabaseConfig(): SupabaseConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL)
    .trim()
    .replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  // A URL alone is not a connection: at least one real key is required.
  if (!serviceKey && !anonKey) return null;
  return { url, serviceKey, anonKey };
}

/** Server-side key: service_role when available, otherwise the anon key (RLS still applies). */
function serverKey(config: SupabaseConfig): string {
  return config.serviceKey || config.anonKey;
}

export function dataMode(): DataMode {
  return supabaseConfig() ? 'supabase' : 'local';
}

export function storageBucket(): string {
  return (process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
}

export function supabaseAuthEnabled(): boolean {
  const config = supabaseConfig();
  return config !== null && Boolean(config.anonKey) && process.env.SUPABASE_AUTH !== 'false';
}

export interface SupabaseStatus {
  mode: DataMode;
  url: string;
  auth: boolean;
  storage: boolean;
  bucket: string;
  hasServiceKey: boolean;
  hasAnonKey: boolean;
  missing: string[];
}

export function supabaseStatus(): SupabaseStatus {
  const config = supabaseConfig();
  const missing: string[] = [];
  if (!config) {
    if (!process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  return {
    mode: config ? 'supabase' : 'local',
    url: config?.url ?? DEFAULT_SUPABASE_URL,
    auth: supabaseAuthEnabled(),
    storage: config !== null,
    bucket: storageBucket(),
    hasServiceKey: Boolean(config?.serviceKey),
    hasAnonKey: Boolean(config?.anonKey),
    missing,
  };
}

export const EXISTING_TABLES = [
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

async function rest(path: string, init: RequestInit = {}, key?: string): Promise<Response> {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured');
  const token = key ?? serverKey(config);
  const headers: Record<string, string> = {
    apikey: config.anonKey || config.serviceKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${config.url}${path}`, { ...init, headers });
}

/** PostgREST read performed with the signed-in user's token so RLS policies are honoured. */
export async function userSelect(table: string, query: string, accessToken: string): Promise<Record<string, unknown>[]> {
  const res = await rest(`/rest/v1/${table}?${query}`, {}, accessToken);
  if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** PostgREST write performed with the signed-in user's token (RLS decides what is allowed). */
export async function userWrite(
  table: string,
  body: unknown,
  accessToken: string,
  method: 'POST' | 'PATCH' = 'POST',
  query = '',
): Promise<Response> {
  return rest(
    `/rest/v1/${table}${query ? `?${query}` : ''}`,
    {
      method,
      body: JSON.stringify(body),
      headers: { Prefer: 'return=representation' },
    },
    accessToken,
  );
}

export interface TableProbe {
  table: string;
  ok: boolean;
  status: number;
  columns: string[];
  rowCount: number;
  error?: string;
}

export async function probeSchema(): Promise<{ configured: boolean; url: string | null; tables: TableProbe[] }> {
  const config = supabaseConfig();
  if (!config) return { configured: false, url: null, tables: [] };
  const tables: TableProbe[] = [];
  for (const table of EXISTING_TABLES) {
    try {
      const res = await rest(`/rest/v1/${table}?select=*&limit=1`);
      if (!res.ok) {
        const text = await res.text();
        tables.push({ table, ok: false, status: res.status, columns: [], rowCount: 0, error: text.slice(0, 300) });
        continue;
      }
      const rows = (await res.json()) as Record<string, unknown>[];
      tables.push({
        table,
        ok: true,
        status: res.status,
        columns: rows.length ? Object.keys(rows[0]) : [],
        rowCount: rows.length,
      });
    } catch (error) {
      tables.push({
        table,
        ok: false,
        status: 0,
        columns: [],
        rowCount: 0,
        error: error instanceof Error ? error.message : 'network error',
      });
    }
  }
  return { configured: true, url: config.url, tables };
}

type Row = Record<string, unknown>;

function pick(row: Row, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return fallback;
}

function num(row: Row, keys: string[], fallback = 0): number {
  const raw = pick(row, keys, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(row: Row, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === 'approved';
    if (typeof value === 'number') return value === 1;
  }
  return fallback;
}

async function select(table: string, query = 'select=*'): Promise<Row[]> {
  const res = await rest(`/rest/v1/${table}?${query}`);
  if (!res.ok) throw new Error(`${table}: ${res.status}`);
  return (await res.json()) as Row[];
}

export interface RemoteCatalog {
  districts: District[];
  levels: EducationLevel[];
  grades: Grade[];
  schools: School[];
  subjects: Subject[];
  books: Book[];
  colleges: College[];
  programs: CollegeProgram[];
  announcements: Announcement[];
}

let cache: { at: number; data: RemoteCatalog | null } = { at: 0, data: null };
const CACHE_MS = 60_000;

export async function remoteCatalog(): Promise<RemoteCatalog | null> {
  if (!supabaseConfig()) return null;
  if (Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const [districtRows, levelRows, gradeRows, schoolRows, subjectRows, bookRows, collegeRows, programRows, announcementRows] =
      await Promise.all([
        select('districts'),
        select('education_levels').catch(() => []),
        select('grades'),
        select('schools'),
        select('subjects'),
        select('books'),
        select('colleges'),
        select('college_programs').catch(() => []),
        select('announcements').catch(() => []),
      ]);

    const data: RemoteCatalog = {
      districts: districtRows.map((r, i) => ({
        id: pick(r, ['id'], `rd${i}`),
        name: pick(r, ['name', 'title'], 'مديرية'),
        description: pick(r, ['description', 'desc'], ''),
      })),
      levels: levelRows.map((r, i) => ({
        id: pick(r, ['id'], `rlv${i}`),
        name: pick(r, ['name', 'title'], 'مرحلة'),
        order: num(r, ['order', 'sort_order', 'level_order'], i + 1),
      })),
      grades: gradeRows.map((r, i) => ({
        id: pick(r, ['id'], `rg${i}`),
        levelId: pick(r, ['level_id', 'education_level_id', 'levelId']),
        name: pick(r, ['name', 'title'], 'صف'),
        order: num(r, ['order', 'sort_order', 'grade_order'], i + 1),
      })),
      schools: schoolRows.map((r, i) => ({
        id: pick(r, ['id'], `rs${i}`),
        districtId: pick(r, ['district_id', 'districtId']),
        levelId: pick(r, ['level_id', 'education_level_id', 'levelId']),
        name: pick(r, ['name', 'title'], 'مدرسة'),
        gender: (pick(r, ['gender', 'type'], 'مختلط') as School['gender']) || 'مختلط',
        address: pick(r, ['address', 'location'], ''),
        phone: pick(r, ['phone', 'contact'], ''),
        studentsCount: num(r, ['students_count', 'students', 'student_count']),
        teachersCount: num(r, ['teachers_count', 'teachers', 'teacher_count']),
        gradeIds: [],
        createdAt: pick(r, ['created_at'], new Date().toISOString()),
      })),
      subjects: subjectRows.map((r, i) => ({
        id: pick(r, ['id'], `rsub${i}`),
        gradeId: pick(r, ['grade_id', 'gradeId']),
        name: pick(r, ['name', 'title'], 'مادة'),
        code: pick(r, ['code', 'slug'], ''),
        description: pick(r, ['description', 'desc'], ''),
      })),
      books: bookRows.map((r, i) => ({
        id: pick(r, ['id'], `rb${i}`),
        title: pick(r, ['title', 'name'], 'كتاب'),
        gradeId: pick(r, ['grade_id', 'gradeId']),
        subjectId: pick(r, ['subject_id', 'subjectId']),
        term: (num(r, ['term', 'semester'], 1) === 2 ? 2 : 1) as 1 | 2,
        pages: num(r, ['pages', 'page_count']),
        sizeKb: num(r, ['size_kb', 'size']),
        description: pick(r, ['description', 'desc'], ''),
        fileUrl: pick(r, ['file_url', 'pdf_url', 'url', 'file']),
        createdAt: pick(r, ['created_at'], new Date().toISOString()),
      })),
      colleges: collegeRows.map((r, i) => ({
        id: pick(r, ['id'], `rc${i}`),
        name: pick(r, ['name', 'title'], 'كلية'),
        universityName: pick(r, ['university_name', 'university'], 'جامعة شبوة'),
        districtId: pick(r, ['district_id', 'districtId']),
        description: pick(r, ['description', 'desc'], ''),
        dean: pick(r, ['dean', 'manager'], ''),
      })),
      programs: programRows.map((r, i) => ({
        id: pick(r, ['id'], `rp${i}`),
        collegeId: pick(r, ['college_id', 'collegeId']),
        name: pick(r, ['name', 'title'], 'برنامج'),
        degree: pick(r, ['degree', 'level'], 'بكالوريوس'),
        years: num(r, ['years', 'duration'], 4),
        description: pick(r, ['description', 'desc'], ''),
      })),
      announcements: announcementRows.map((r, i) => ({
        id: pick(r, ['id'], `ra${i}`),
        title: pick(r, ['title', 'name'], 'إعلان'),
        body: pick(r, ['body', 'content', 'description'], ''),
        audience: (pick(r, ['audience', 'target'], 'all') as Announcement['audience']) || 'all',
        authorId: pick(r, ['author_id', 'user_id']),
        authorName: pick(r, ['author_name'], 'إدارة المنصة'),
        districtId: pick(r, ['district_id']) || null,
        schoolId: pick(r, ['school_id']) || null,
        pinned: Boolean(r.pinned ?? r.is_pinned),
        createdAt: pick(r, ['created_at'], new Date().toISOString()),
      })),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error('[supabase] catalog read failed', error instanceof Error ? error.message : error);
    cache = { at: Date.now(), data: null };
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Auth (Supabase Auth)                                                */
/* ------------------------------------------------------------------ */

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string };
}

function authHeaders(anonKey: string): Record<string, string> {
  return { apikey: anonKey, 'Content-Type': 'application/json' };
}

function toSession(payload: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}): SupabaseSession | null {
  if (!payload.access_token || !payload.user?.id) return null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? '',
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    user: { id: payload.user.id, email: payload.user.email ?? '' },
  };
}

export async function passwordSignIn(email: string, password: string): Promise<SupabaseSession | null> {
  const config = supabaseConfig();
  if (!config?.anonKey) throw new Error('SUPABASE_ANON_KEY is missing');
  const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(config.anonKey),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  return toSession((await res.json()) as Parameters<typeof toSession>[0]);
}

export async function passwordSignUp(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; session: SupabaseSession | null; message: string }> {
  const config = supabaseConfig();
  if (!config?.anonKey) throw new Error('SUPABASE_ANON_KEY is missing');
  const res = await fetch(`${config.url}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders(config.anonKey),
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = 'تعذّر إنشاء الحساب';
    try {
      const parsed = JSON.parse(text) as { msg?: string; error_description?: string; message?: string };
      message = parsed.msg ?? parsed.error_description ?? parsed.message ?? message;
    } catch {
      /* keep default */
    }
    return { ok: false, status: res.status, session: null, message };
  }
  let session: SupabaseSession | null = null;
  try {
    session = toSession(JSON.parse(text) as Parameters<typeof toSession>[0]);
  } catch {
    /* email confirmation may be required */
  }
  return { ok: true, status: res.status, session, message: session ? '' : 'تم إنشاء الحساب، يرجى تأكيد البريد الإلكتروني.' };
}

export async function refreshSession(refreshToken: string): Promise<SupabaseSession | null> {
  const config = supabaseConfig();
  if (!config?.anonKey || !refreshToken) return null;
  const res = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: authHeaders(config.anonKey),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  return toSession((await res.json()) as Parameters<typeof toSession>[0]);
}

export async function remoteSignOut(accessToken: string): Promise<void> {
  const config = supabaseConfig();
  if (!config?.anonKey || !accessToken) return;
  await fetch(`${config.url}/auth/v1/logout`, {
    method: 'POST',
    headers: { ...authHeaders(config.anonKey), Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

export async function passwordRecover(email: string): Promise<boolean> {
  const config = supabaseConfig();
  if (!config?.anonKey) return false;
  const res = await fetch(`${config.url}/auth/v1/recover`, {
    method: 'POST',
    headers: authHeaders(config.anonKey),
    body: JSON.stringify({ email }),
  });
  return res.ok;
}

/** Updates the signed-in user's own password using their access token. */
export async function updatePassword(accessToken: string, password: string): Promise<boolean> {
  const config = supabaseConfig();
  if (!config?.anonKey) return false;
  const res = await fetch(`${config.url}/auth/v1/user`, {
    method: 'PUT',
    headers: { ...authHeaders(config.anonKey), Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export interface RemoteProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'student' | 'teacher' | 'school_manager' | 'admin';
  phone: string;
  bio: string;
  avatarUrl: string;
  districtId: string | null;
  schoolId: string | null;
  gradeId: string | null;
  collegeId: string | null;
  subjectIds: string[];
  approved: boolean;
  createdAt: string;
}

function normalizeRoleValue(value: unknown): RemoteProfile['role'] {
  const role = String(value ?? 'student');
  if (role === 'teacher' || role === 'school_manager' || role === 'admin') return role;
  return 'student';
}

export function profileFromRow(row: Row): RemoteProfile {
  const subjectIds = row.subject_ids;
  return {
    id: pick(row, ['id', 'user_id']),
    email: pick(row, ['email']).toLowerCase(),
    fullName: pick(row, ['full_name', 'fullName', 'name'], 'مستخدم'),
    role: normalizeRoleValue(pick(row, ['role', 'user_role'])),
    phone: pick(row, ['phone', 'mobile']),
    bio: pick(row, ['bio', 'about']),
    avatarUrl: pick(row, ['avatar_url', 'avatar']),
    districtId: pick(row, ['district_id']) || null,
    schoolId: pick(row, ['school_id']) || null,
    gradeId: pick(row, ['grade_id']) || null,
    collegeId: pick(row, ['college_id']) || null,
    subjectIds: Array.isArray(subjectIds) ? subjectIds.map(String) : [],
    // A teacher must be approved before publishing or broadcasting.
    approved:
      normalizeRoleValue(pick(row, ['role', 'user_role'])) === 'teacher'
        ? bool(row, ['approved', 'is_approved', 'verified'], pick(row, ['status']) === 'approved')
        : true,
    createdAt: pick(row, ['created_at'], new Date().toISOString()),
  };
}

export async function fetchProfileById(id: string, accessToken?: string): Promise<RemoteProfile | null> {
  const query = `select=*&id=eq.${encodeURIComponent(id)}&limit=1`;
  try {
    const rows = accessToken ? await userSelect('profiles', query, accessToken) : await select('profiles', query);
    return rows[0] ? profileFromRow(rows[0]) : null;
  } catch (error) {
    console.error('[supabase] profile read failed', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchProfileByEmail(email: string): Promise<Row | null> {
  try {
    const rows = await select('profiles', `select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Storage (bucket: madrasti-files)                                    */
/* ------------------------------------------------------------------ */

function storagePath(objectPath: string): string {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

export interface UploadResult {
  ok: boolean;
  path: string;
  status: number;
  error?: string;
}

export async function uploadObject(options: {
  objectPath: string;
  data: Buffer;
  contentType: string;
  accessToken: string;
}): Promise<UploadResult> {
  const config = supabaseConfig();
  if (!config) return { ok: false, path: options.objectPath, status: 0, error: 'not configured' };
  const bucket = storageBucket();
  const res = await fetch(`${config.url}/storage/v1/object/${bucket}/${storagePath(options.objectPath)}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey || config.serviceKey,
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': options.contentType,
      'x-upsert': 'true',
    },
    body: new Uint8Array(options.data),
  });
  if (!res.ok) {
    return { ok: false, path: options.objectPath, status: res.status, error: (await res.text()).slice(0, 300) };
  }
  return { ok: true, path: options.objectPath, status: res.status };
}

export async function createSignedUrl(objectPath: string, accessToken: string, expiresIn = 3600): Promise<string | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const bucket = storageBucket();
  const res = await fetch(`${config.url}/storage/v1/object/sign/${bucket}/${storagePath(objectPath)}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey || config.serviceKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const relative = body.signedURL ?? body.signedUrl;
  return relative ? `${config.url}/storage/v1${relative.startsWith('/') ? '' : '/'}${relative}` : null;
}

/** Streams a private object through the server using the caller's token. */
export async function downloadObject(objectPath: string, accessToken: string): Promise<Response | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const bucket = storageBucket();
  const res = await fetch(`${config.url}/storage/v1/object/authenticated/${bucket}/${storagePath(objectPath)}`, {
    headers: {
      apikey: config.anonKey || config.serviceKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return res.ok ? res : null;
}

export async function removeObject(objectPath: string, accessToken: string): Promise<boolean> {
  const config = supabaseConfig();
  if (!config) return false;
  const bucket = storageBucket();
  const res = await fetch(`${config.url}/storage/v1/object/${bucket}/${storagePath(objectPath)}`, {
    method: 'DELETE',
    headers: {
      apikey: config.anonKey || config.serviceKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return res.ok;
}

export async function probeStorage(): Promise<{ configured: boolean; bucket: string; ok: boolean; status: number; error?: string }> {
  const config = supabaseConfig();
  if (!config) return { configured: false, bucket: storageBucket(), ok: false, status: 0 };
  const res = await fetch(`${config.url}/storage/v1/bucket/${storageBucket()}`, {
    headers: { apikey: serverKey(config), Authorization: `Bearer ${serverKey(config)}` },
  });
  const body = await res.text();
  return {
    configured: true,
    bucket: storageBucket(),
    ok: res.ok,
    status: res.status,
    error: res.ok ? undefined : body.slice(0, 200),
  };
}

/* ------------------------------------------------------------------ */
/* Legacy helpers kept for compatibility                               */
/* ------------------------------------------------------------------ */

export async function supabaseSignIn(email: string, password: string) {
  const session = await passwordSignIn(email, password);
  if (!session) return null;
  return { access_token: session.accessToken, refresh_token: session.refreshToken, user: session.user };
}

export async function supabaseSignUp(email: string, password: string, metadata: Record<string, unknown>) {
  const result = await passwordSignUp(email, password, metadata);
  if (!result.ok) return { ok: false as const, status: result.status, body: result.message };
  return { ok: true as const, body: { session: result.session, message: result.message } };
}

export async function supabaseRecover(email: string) {
  return passwordRecover(email);
}

export function resetSupabaseCache() {
  cache = { at: 0, data: null };
}
