import { Router } from 'express';
import type { Role, User } from '../../shared/types';
import { db, save, uid } from '../store';
import {
  clearSessionCookie,
  createSession,
  currentUser,
  hashPassword,
  issueResetToken,
  notify,
  publicUser,
  requireAuth,
  setSessionCookie,
  verifyPassword,
  type AuthedRequest,
} from '../auth';
import { livekitStatus } from '../livekit';
import { supabaseAuthEnabled, supabaseConfig, supabaseRecover, supabaseSignIn, supabaseSignUp, fetchProfileByEmail } from '../supabase';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRole(input: unknown): Role | null {
  const role = String(input ?? 'student');
  if (role === 'student' || role === 'teacher' || role === 'school_manager' || role === 'admin') return role;
  return null;
}

authRouter.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const requestedRole = normalizeRole(body.role);

  if (fullName.length < 3) {
    res.status(400).json({ error: 'الاسم الكامل مطلوب (٣ أحرف على الأقل)' });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'البريد الإلكتروني غير صحيح' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل' });
    return;
  }
  if (!requestedRole) {
    res.status(400).json({ error: 'نوع الحساب غير صحيح' });
    return;
  }
  if (requestedRole === 'admin') {
    res.status(403).json({ error: 'حساب المسؤول لا يمكن إنشاؤه من التسجيل العام' });
    return;
  }
  if (db.users.some((u) => u.email === email)) {
    res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل مسبقًا' });
    return;
  }

  const isTeacher = requestedRole === 'teacher';
  const user: User = {
    id: uid('u'),
    email,
    fullName,
    role: requestedRole,
    phone: String(body.phone ?? '').trim(),
    bio: '',
    avatarUrl: '',
    districtId: body.districtId ? String(body.districtId) : null,
    schoolId: body.schoolId ? String(body.schoolId) : null,
    gradeId: body.gradeId ? String(body.gradeId) : null,
    collegeId: body.collegeId ? String(body.collegeId) : null,
    subjectIds: Array.isArray(body.subjectIds) ? body.subjectIds.map(String) : [],
    approved: !isTeacher,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  db.passwordHashes[user.id] = hashPassword(password);
  save();

  if (supabaseAuthEnabled()) {
    try {
      await supabaseSignUp(email, password, { full_name: fullName, role: requestedRole });
    } catch (error) {
      console.error('[auth] supabase signup failed', error instanceof Error ? error.message : error);
    }
  }

  if (isTeacher) {
    db.users
      .filter((u) => u.role === 'admin')
      .forEach((admin) =>
        notify(admin.id, 'طلب اعتماد معلم جديد', `المعلم ${fullName} بانتظار الاعتماد قبل النشر أو البث.`, 'account', '/admin/users'),
      );
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  res.status(201).json({ user: publicUser(user), pendingApproval: isTeacher, mode: supabaseConfig() ? 'supabase' : 'local' });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!EMAIL_RE.test(email) || !password) {
    res.status(400).json({ error: 'أدخل البريد الإلكتروني وكلمة المرور' });
    return;
  }
  let user = db.users.find((u) => u.email === email);

  if (!user && supabaseAuthEnabled()) {
    const result = await supabaseSignIn(email, password).catch(() => null);
    if (result) {
      const profile = await fetchProfileByEmail(email);
      user = {
        id: uid('u'),
        email,
        fullName: String(profile?.full_name ?? profile?.name ?? email),
        role: normalizeRole(profile?.role) ?? 'student',
        phone: '',
        bio: '',
        avatarUrl: '',
        districtId: null,
        schoolId: null,
        gradeId: null,
        collegeId: null,
        subjectIds: [],
        approved: true,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      save();
    }
  }

  if (!user) {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return;
  }
  const stored = db.passwordHashes[user.id];
  if (stored && !verifyPassword(password, stored)) {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return;
  }
  if (!stored) {
    if (!supabaseAuthEnabled()) {
      res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      return;
    }
    const result = await supabaseSignIn(email, password).catch(() => null);
    if (!result) {
      res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      return;
    }
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  res.json({ user: publicUser(user), pendingApproval: user.role === 'teacher' && !user.approved });
});

authRouter.post('/logout', (req, res) => {
  const user = currentUser(req);
  if (user) {
    db.sessions = db.sessions.filter((s) => s.userId !== user.id);
    save();
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = currentUser(req);
  res.json({
    user: user ? publicUser(user) : null,
    mode: supabaseConfig() ? 'supabase' : 'local',
    supabaseAuth: supabaseAuthEnabled(),
    livekit: livekitStatus(),
  });
});

authRouter.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (supabaseAuthEnabled()) await supabaseRecover(email).catch(() => false);
  if (!user) {
    res.json({ ok: true, message: 'إذا كان البريد مسجلًا فسيصلك رابط استعادة كلمة المرور.' });
    return;
  }
  const token = issueResetToken(user.id);
  const devToken = supabaseAuthEnabled() ? undefined : token;
  res.json({
    ok: true,
    message: 'تم إنشاء رابط استعادة كلمة المرور.',
    devToken,
  });
});

authRouter.post('/reset-password', (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');
  if (password.length < 8) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل' });
    return;
  }
  const record = db.resetTokens.find((t) => t.token === token);
  if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: 'رابط الاستعادة غير صالح أو منتهي الصلاحية' });
    return;
  }
  db.passwordHashes[record.userId] = hashPassword(password);
  db.resetTokens = db.resetTokens.filter((t) => t.token !== token);
  db.sessions = db.sessions.filter((s) => s.userId !== record.userId);
  save();
  res.json({ ok: true });
});

authRouter.patch('/profile', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const body = req.body ?? {};
  if (body.fullName !== undefined) {
    const value = String(body.fullName).trim();
    if (value.length < 3) {
      res.status(400).json({ error: 'الاسم الكامل مطلوب' });
      return;
    }
    user.fullName = value;
  }
  if (body.phone !== undefined) user.phone = String(body.phone).trim();
  if (body.bio !== undefined) user.bio = String(body.bio).slice(0, 500);
  if (body.avatarUrl !== undefined) user.avatarUrl = String(body.avatarUrl);
  if (body.districtId !== undefined) user.districtId = body.districtId ? String(body.districtId) : null;
  if (body.schoolId !== undefined) user.schoolId = body.schoolId ? String(body.schoolId) : null;
  if (body.gradeId !== undefined) user.gradeId = body.gradeId ? String(body.gradeId) : null;
  if (body.collegeId !== undefined) user.collegeId = body.collegeId ? String(body.collegeId) : null;
  if (Array.isArray(body.subjectIds)) user.subjectIds = body.subjectIds.map(String);
  save();
  res.json({ user: publicUser(user) });
});

authRouter.post('/change-password', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const current = String(req.body?.currentPassword ?? '');
  const next = String(req.body?.newPassword ?? '');
  if (next.length < 8) {
    res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل' });
    return;
  }
  const stored = db.passwordHashes[user.id];
  if (stored && !verifyPassword(current, stored)) {
    res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    return;
  }
  db.passwordHashes[user.id] = hashPassword(next);
  save();
  res.json({ ok: true });
});
