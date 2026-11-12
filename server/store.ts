import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppDatabase } from '../shared/types';
import { buildSeedDatabase, DEMO_ACCOUNTS } from './seed';

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as AppDatabase;
      if (parsed && parsed.version === 1) {
        if (remoteMode()) dropDemoIdentities(parsed);
        return parsed;
      }
    } catch {
      // fall through to a fresh seed when the file is unreadable
    }
  }
  const seeded = buildSeedDatabase();
  if (remoteMode()) dropDemoIdentities(seeded);
  persist(seeded);
  return seeded;
}

/**
 * Removes the demo logins (including the sample "يوسف الحارثي" account) from the local cache
 * whenever the app talks to the real Supabase project, so demo identities can never be
 * authenticated or reported as real users. Cached real Supabase profiles are kept.
 */
function dropDemoIdentities(data: AppDatabase) {
  const demoEmails = new Set(DEMO_ACCOUNTS.map((account) => account.email.toLowerCase()));
  const demoIds = new Set(data.users.filter((u) => demoEmails.has(u.email.toLowerCase())).map((u) => u.id));
  if (demoIds.size === 0) return;
  data.users = data.users.filter((u) => !demoIds.has(u.id));
  data.sessions = data.sessions.filter((s) => !demoIds.has(s.userId));
  data.resetTokens = data.resetTokens.filter((t) => !demoIds.has(t.userId));
  data.notifications = data.notifications.filter((n) => !demoIds.has(n.userId));
  demoIds.forEach((id) => delete data.passwordHashes[id]);
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
