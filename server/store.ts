import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppDatabase } from '../shared/types';
import { buildSeedDatabase } from './seed';

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MODE_FILE = path.join(DATA_DIR, 'mode.json');

/** True when the real Supabase project is configured, so demo identities must never be used. */
function remoteMode(): boolean {
  return Boolean(
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function load(): AppDatabase {
  ensureDirs();
  const mode: 'local' | 'supabase' = remoteMode() ? 'supabase' : 'local';
  if (storedMode() === mode && fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as AppDatabase;
      if (parsed && parsed.version === 1) return parsed;
    } catch {
      // fall through and rebuild below
    }
  }
  // Switching modes never carries rows across: the real project must not inherit
  // demo schools/lessons/lectures, and the demo must not inherit real-user cache.
  const fresh = mode === 'supabase' ? emptyDatabase() : buildSeedDatabase();
  persist(fresh);
  rememberMode(mode);
  return fresh;
}

/** Which dataset the cached local file belongs to, so the two modes never mix. */
function storedMode(): 'local' | 'supabase' | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8')) as { mode?: string };
    return parsed.mode === 'supabase' || parsed.mode === 'local' ? parsed.mode : null;
  } catch {
    return null;
  }
}

function rememberMode(mode: 'local' | 'supabase') {
  ensureDirs();
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode }));
}

/**
 * Structurally valid but completely empty local cache. Used when the app talks to the
 * real Supabase project so no demo content (schools, lessons, lectures, sample
 * accounts such as "يوسف الحارثي") is ever served as real data.
 */
function emptyDatabase(): AppDatabase {
  const blank = buildSeedDatabase();
  const record = blank as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (Array.isArray(value)) value.length = 0;
    else if (key === 'passwordHashes') record[key] = {};
  }
  return blank;
}

function persist(data: AppDatabase) {
  ensureDirs();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const db: AppDatabase = load();

let saveTimer: NodeJS.Timeout | null = null;
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      persist(db);
    } catch (error) {
      console.error('[store] failed to persist database', error);
    }
  }, 30);
}

export function saveNow() {
  persist(db);
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

export function resetDatabase() {
  const fresh = buildSeedDatabase();
  Object.assign(db, fresh);
  saveNow();
}
