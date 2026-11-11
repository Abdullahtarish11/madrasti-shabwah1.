import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AppDatabase } from '../shared/types';
import { buildSeedDatabase } from './seed';

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

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
      if (parsed && parsed.version === 1) return parsed;
    } catch {
      // fall through to a fresh seed when the file is unreadable
    }
  }
  const seeded = buildSeedDatabase();
  persist(seeded);
  return seeded;
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
