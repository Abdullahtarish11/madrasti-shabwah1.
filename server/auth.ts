import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from '../shared/types';
import { db, save, uid } from './store';

export const SESSION_COOKIE = 'ms_session';
const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export interface RemoteTokens {
  accessToken: string;
  refreshToken: string;
  supabaseUserId: string;
}

export function createSession(userId: string, remote?: RemoteTokens): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.sessions = db.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
  db.sessions.push({ token, userId, expiresAt, ...(remote ?? {}) });
  save();
  return { token, expiresAt };
}

/** Session record for the current request (used for user-scoped Supabase calls). */
export function sessionFor(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE] || (req.headers.authorization?.replace('Bearer ', '') ?? '');
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

/** Supabase access token of the signed-in user, so RLS policies apply to server calls. */
export function accessTokenFor(req: Request): string | null {
  return sessionFor(req)?.accessToken ?? null;
}

export function destroySession(token: string | undefined) {
  if (!token) return;
  db.sessions = db.sessions.filter((s) => s.token !== token);
  save();
}

export function setSessionCookie(res: Response, token: string, expiresAt: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function publicUser(user: User) {
  const { ...rest } = user;
  const school = db.schools.find((s) => s.id === rest.schoolId);
  const district = db.districts.find((d) => d.id === rest.districtId);
  const grade = db.grades.find((g) => g.id === rest.gradeId);
  return {
    ...rest,
    schoolName: school?.name,
    districtName: district?.name,
    gradeName: grade?.name,
  };
}

export function currentUser(req: Request): User | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE] || (req.headers.authorization?.replace('Bearer ', '') ?? '');
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  return db.users.find((u) => u.id === session.userId) ?? null;
}

export interface AuthedRequest extends Request {
  user?: User;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'يجب تسجيل الدخول للمتابعة', code: 'unauthorized' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'يجب تسجيل الدخول للمتابعة', code: 'unauthorized' });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'لا تملك صلاحية للوصول إلى هذا القسم', code: 'forbidden' });
      return;
    }
    req.user = user;
    next();
  };
}

export function requireTeacher(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'يجب تسجيل الدخول للمتابعة', code: 'unauthorized' });
    return;
  }
  if (user.role !== 'teacher' && user.role !== 'admin') {
    res.status(403).json({ error: 'هذا القسم مخصص للمعلمين', code: 'forbidden' });
    return;
  }
  if (user.role === 'teacher' && !user.approved) {
    res.status(403).json({
      error: 'حسابك كمعلم قيد الاعتماد من إدارة المنصة. لا يمكن النشر أو البث قبل الاعتماد.',
      code: 'teacher_pending',
    });
    return;
  }
  req.user = user;
  next();
}

export function issueResetToken(userId: string): string {
  const token = crypto.randomBytes(24).toString('hex');
  db.resetTokens = db.resetTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
  db.resetTokens.push({ token, userId, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  save();
  return token;
}

export function notify(userId: string, title: string, body: string, type: 'announcement' | 'assignment' | 'grade' | 'live' | 'account', link = '') {
  db.notifications.unshift({
    id: uid('n'),
    userId,
    title,
    body,
    type,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  });
  save();
}
