/**
 * Supabase adapter.
 * Uses the existing project only (never creates a project or destructive changes).
 * Reads the documented tables through PostgREST and maps tolerant column names.
 * Without credentials the platform runs on the local persistent store.
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

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  anonKey: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return { url, serviceKey, anonKey };
}

export function supabaseAuthEnabled(): boolean {
  return supabaseConfig() !== null && process.env.SUPABASE_AUTH === 'true';
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
  const headers: Record<string, string> = {
    apikey: key ?? config.serviceKey,
    Authorization: `Bearer ${key ?? config.serviceKey}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${config.url}${path}`, { ...init, headers });
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

export async function supabaseSignIn(email: string, password: string) {
  const config = supabaseConfig();
  if (!config?.anonKey) throw new Error('Supabase auth keys are missing');
  const res = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { access_token: string; user: { id: string; email: string } };
}

export async function supabaseSignUp(email: string, password: string, metadata: Record<string, unknown>) {
  const config = supabaseConfig();
  if (!config?.anonKey) throw new Error('Supabase auth keys are missing');
  const res = await fetch(`${config.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, body: await res.text() };
  return { ok: true as const, body: await res.json() };
}

export async function supabaseRecover(email: string) {
  const config = supabaseConfig();
  if (!config?.anonKey) throw new Error('Supabase auth keys are missing');
  const res = await fetch(`${config.url}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.ok;
}

export async function fetchProfileByEmail(email: string): Promise<Row | null> {
  try {
    const rows = await select('profiles', `select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function resetSupabaseCache() {
  cache = { at: 0, data: null };
}
