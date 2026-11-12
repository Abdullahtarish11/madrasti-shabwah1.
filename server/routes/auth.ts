import { Router } from 'express';
import type { Role, User } from '../../shared/types';
import { db, save, uid } from '../store';
import {
  accessTokenFor,
  clearSessionCookie,
  createSession,
  currentUser,
  hashPassword,
  issueResetToken,
  notify,
  publicUser,
  requireAuth,
  sessionFor,
  setSessionCookie,
  verifyPassword,
  type AuthedRequest,
} from '../auth';
import { livekitStatus } from '../livekit';
import {
  dataMode,
  fetchProfileByEmail,
  fetchProfileById,
  passwordRecover,
  passwordSignIn,
  passwordSignUp,
  profileFromRow,
  remoteSignOut,
  supabaseAuthEnabled,
  supabaseStatus,
  updatePassword,
  userWrite,
  type RemoteProfile,
} from '../supabase';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRole(input: unknown): Role | null {
  const role = String(input ?? 'student');
  if (role === 'student' || role === 'teacher' || role === 'school_manager' || role === 'admin') return role;
  return null;
}

function profileToUser(profile: RemoteProfile): User {
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    phone: profile.phone,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    districtId: profile.districtId,
    schoolId: profile.schoolId,
    gradeId: profile.gradeId,
    collegeId: profile.collegeId,
    subjectIds: profile.subjectIds,
    approved: profile.approved,
    createdAt: profile.createdAt,
  };
}

/**
 * Mirrors the Supabase profile into the server cache so existing routes keep working.
 * A Supabase account never gets a local password hash, so local login cannot be spoofed.
 */
function cacheRemoteProfile(profile: RemoteProfile): User {
  const mapped = profileToUser(profile);
  const existing = db.users.find((u) => u.id === mapped.id);
  if (existing) Object.assign(existing, mapped);
  else db.users.push(mapped);
  delete db.passwordHashes[mapped.id];
  save();
  return existing ?? mapped;
}

/** Reads the profile with the user's own token first so RLS is exercised, then falls back. */
async function resolveProfile(userId: string, email: string, accessToken: string): Promise<RemoteProfile | null> {
  const byId = await fetchProfileById(userId, accessToken);
  if (byId) return byId;
  const row = await fetchProfileByEmail(email);
  return row ? profileFromRow(row) : null;
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

  /* ---------------- Real project: Supabase Auth only ---------------- */
  if (dataMode() === 'supabase') {
    if (!supabaseAuthEnabled()) {
      res.status(503).json({ error: 'مصادقة Supabase غير مفعّلة: يجب ضبط SUPABASE_ANON_KEY' });
      return;
    }
    const result = await passwordSignUp(email, password, {
      full_name: fullName,
      role: requestedRole,
      phone: String(body.phone ?? '').trim(),
      district_id: body.districtId ? String(body.districtId) : null,
      school_id: body.schoolId ? String(body.schoolId) : null,
      grade_id: body.gradeId ? String(body.gradeId) : null,
      college_id: body.collegeId ? String(body.collegeId) : null,
    }).catch((error: unknown) => {
      console.error('[auth] supabase signup failed', error instanceof Error ? error.message : error);
      return null;
    });

    if (!result) {
      res.status(502).json({ error: 'تعذّر الاتصال بخدمة الحسابات في Supabase. حاول لاحقًا.' });
      return;
    }
    if (!result.ok) {
      const duplicate = result.status === 422 || result.status === 409 || /registered|exists/i.test(result.message);
      res.status(duplicate ? 409 : 400).json({
        error: duplicate ? 'هذا البريد الإلكتروني مسجل مسبقًا' : result.message,
      });
      return;
    }

    // Email confirmation may be required: no session yet, so no cookie is issued.
    if (!result.session) {
      res.status(202).json({
        ok: true,
        pendingConfirmation: true,
        mode: 'supabase',
        message: 'تم إنشاء الحساب في Supabase. يرجى تأكيد البريد الإلكتروني ثم تسجيل الدخول.',
      });
      return;
    }

    const profile = await resolveProfile(result.session.user.id, email, result.session.accessToken);
    if (!profile) {
      res.status(202).json({
        ok: true,
        pendingConfirmation: true,
        mode: 'supabase',
        message:
          'تم إنشاء الحساب، لكن لم يتم العثور على صف في جدول profiles. تأكد من تفعيل Trigger إنشاء الملف الشخصي ثم سجّل الدخول.',
      });
      return;
    }

    const user = cacheRemoteProfile(profile);
    const session = createSession(user.id, {
      accessToken: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      supabaseUserId: result.session.user.id,
    });
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({
      user: publicUser(user),
      pendingApproval: user.role === 'teacher' && !user.approved,
      mode: 'supabase',
    });
    return;
  }

  /* ---------------- Isolated local demo mode ---------------- */
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

  if (isTeacher) {
    db.users
      .filter((u) => u.role === 'admin')
      .forEach((admin) =>
        notify(admin.id, 'طلب اعتماد معلم جديد', `المعلم ${fullName} بانتظار الاعتماد قبل النشر أو البث.`, 'account', '/admin/users'),
      );
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  res.status(201).json({ user: publicUser(user), pendingApproval: isTeacher, mode: 'local' });
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!EMAIL_RE.test(email) || !password) {
    res.status(400).json({ error: 'أدخل البريد الإلكتروني وكلمة المرور' });
    return;
  }

  /* ---------------- Real project: Supabase Auth only ---------------- */
  if (dataMode() === 'supabase') {
    if (!supabaseAuthEnabled()) {
      res.status(503).json({ error: 'مصادقة Supabase غير مفعّلة: يجب ضبط SUPABASE_ANON_KEY' });
      return;
    }
    const remote = await passwordSignIn(email, password).catch(() => null);
    if (!remote) {
      res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      return;
    }
    const profile = await resolveProfile(remote.user.id, email, remote.accessToken);
    if (!profile) {
      res.status(409).json({
        error: 'تم التحقق من الحساب لكن لا يوجد ملف شخصي في جدول profiles. راجع إدارة المنصة.',
      });
      return;
    }
    const user = cacheRemoteProfile(profile);
    const session = createSession(user.id, {
      accessToken: remote.accessToken,
      refreshToken: remote.refreshToken,
      supabaseUserId: remote.user.id,
    });
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({
      user: publicUser(user),
      pendingApproval: user.role === 'teacher' && !user.approved,
      mode: 'supabase',
    });
    return;
  }

  /* ---------------- Isolated local demo mode ---------------- */
  const user = db.users.find((u) => u.email === email);
  if (!user) {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return;
  }
  const stored = db.passwordHashes[user.id];
  if (!stored || !verifyPassword(password, stored)) {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    return;
  }

  const session = createSession(user.id);
  setSessionCookie(res, session.token, session.expiresAt);
  res.json({ user: publicUser(user), pendingApproval: user.role === 'teacher' && !user.approved, mode: 'local' });
});

authRouter.post('/logout', async (req, res) => {
  const session = sessionFor(req);
  const token = accessTokenFor(req);
  if (token) await remoteSignOut(token).catch(() => undefined);
  if (session) {
    db.sessions = db.sessions.filter((s) => s.token !== session.token);
    save();
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const user = currentUser(req);
  res.json({
    user: user ? publicUser(user) : null,
    mode: dataMode(),
    supabaseAuth: supabaseAuthEnabled(),
    supabase: supabaseStatus(),
    livekit: livekitStatus(),
  });
});

authRouter.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();

  if (dataMode() === 'supabase') {
    await passwordRecover(email).catch(() => false);
    res.json({ ok: true, mode: 'supabase', message: 'إذا كان البريد مسجلًا فسيصلك رابط استعادة كلمة المرور.' });
    return;
  }

  const user = db.users.find((u) => u.email === email);
  if (!user) {
    res.json({ ok: true, message: 'إذا كان البريد مسجلًا فسيصلك رابط استعادة كلمة المرور.' });
    return;
  }
  const token = issueResetToken(user.id);
  res.json({ ok: true, message: 'تم إنشاء رابط استعادة كلمة المرور.', devToken: token });
});

authRouter.post('/reset-password', (req, res) => {
  if (dataMode() === 'supabase') {
    res.status(400).json({
      error: 'في وضع Supabase تُعاد كلمة المرور عبر رابط البريد الإلكتروني الرسمي، وليس من هذه الواجهة.',
    });
    return;
  }
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

authRouter.patch('/profile', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const body = req.body ?? {};

  if (body.fullName !== undefined && String(body.fullName).trim().length < 3) {
    res.status(400).json({ error: 'الاسم الكامل مطلوب' });
    return;
  }

  /* ---------------- Real project: write through to profiles (RLS) ---------------- */
  if (dataMode() === 'supabase') {
    const token = accessTokenFor(req);
    if (!token) {
      res.status(401).json({ error: 'انتهت جلسة Supabase، يرجى تسجيل الدخول مرة أخرى' });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim();
    if (body.phone !== undefined) patch.phone = String(body.phone).trim();
    if (body.bio !== undefined) patch.bio = String(body.bio).slice(0, 500);
    if (body.avatarUrl !== undefined) patch.avatar_url = String(body.avatarUrl);
    if (body.districtId !== undefined) patch.district_id = body.districtId ? String(body.districtId) : null;
    if (body.schoolId !== undefined) patch.school_id = body.schoolId ? String(body.schoolId) : null;
    if (body.gradeId !== undefined) patch.grade_id = body.gradeId ? String(body.gradeId) : null;
    if (body.collegeId !== undefined) patch.college_id = body.collegeId ? String(body.collegeId) : null;
    if (Array.isArray(body.subjectIds)) patch.subject_ids = body.subjectIds.map(String);

    if (Object.keys(patch).length > 0) {
      try {
        const response = await userWrite('profiles', patch, token, 'PATCH', `id=eq.${encodeURIComponent(user.id)}`);
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 200);
          console.error('[auth] profile update rejected', response.status, detail);
          res.status(403).json({ error: 'لم تسمح سياسات الصلاحيات بتحديث الملف الشخصي. راجع إدارة المنصة.' });
          return;
        }
      } catch (error) {
        console.error('[auth] profile update failed', error instanceof Error ? error.message : error);
        res.status(502).json({ error: 'تعذّر حفظ التغييرات في Supabase. حاول لاحقًا.' });
        return;
      }
    }
    Object.assign(user, {
      fullName: body.fullName !== undefined ? String(body.fullName).trim() : user.fullName,
      phone: body.phone !== undefined ? String(body.phone).trim() : user.phone,
      bio: body.bio !== undefined ? String(body.bio).slice(0, 500) : user.bio,
      avatarUrl: body.avatarUrl !== undefined ? String(body.avatarUrl) : user.avatarUrl,
      districtId: body.districtId !== undefined ? (body.districtId ? String(body.districtId) : null) : user.districtId,
      schoolId: body.schoolId !== undefined ? (body.schoolId ? String(body.schoolId) : null) : user.schoolId,
      gradeId: body.gradeId !== undefined ? (body.gradeId ? String(body.gradeId) : null) : user.gradeId,
      collegeId: body.collegeId !== undefined ? (body.collegeId ? String(body.collegeId) : null) : user.collegeId,
      subjectIds: Array.isArray(body.subjectIds) ? body.subjectIds.map(String) : user.subjectIds,
    });
    save();
    res.json({ user: publicUser(user), mode: 'supabase' });
    return;
  }

  /* ---------------- Isolated local demo mode ---------------- */
  if (body.fullName !== undefined) user.fullName = String(body.fullName).trim();
  if (body.phone !== undefined) user.phone = String(body.phone).trim();
  if (body.bio !== undefined) user.bio = String(body.bio).slice(0, 500);
  if (body.avatarUrl !== undefined) user.avatarUrl = String(body.avatarUrl);
  if (body.districtId !== undefined) user.districtId = body.districtId ? String(body.districtId) : null;
  if (body.schoolId !== undefined) user.schoolId = body.schoolId ? String(body.schoolId) : null;
  if (body.gradeId !== undefined) user.gradeId = body.gradeId ? String(body.gradeId) : null;
  if (body.collegeId !== undefined) user.collegeId = body.collegeId ? String(body.collegeId) : null;
  if (Array.isArray(body.subjectIds)) user.subjectIds = body.subjectIds.map(String);
  save();
  res.json({ user: publicUser(user), mode: 'local' });
});

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const current = String(req.body?.currentPassword ?? '');
  const next = String(req.body?.newPassword ?? '');
  if (next.length < 8) {
    res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل' });
    return;
  }

  if (dataMode() === 'supabase') {
    // Re-authenticate so a stolen cookie alone cannot change the password.
    const fresh = await passwordSignIn(user.email, current).catch(() => null);
    if (!fresh) {
      res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
      return;
    }
    const changed = await updatePassword(fresh.accessToken, next).catch(() => false);
    if (!changed) {
      res.status(502).json({ error: 'تعذّر تحديث كلمة المرور في Supabase. حاول لاحقًا.' });
      return;
    }
    const session = sessionFor(req);
    if (session) {
      session.accessToken = fresh.accessToken;
      session.refreshToken = fresh.refreshToken;
      save();
    }
    res.json({ ok: true, mode: 'supabase' });
    return;
  }

  const stored = db.passwordHashes[user.id];
  if (stored && !verifyPassword(current, stored)) {
    res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    return;
  }
  db.passwordHashes[user.id] = hashPassword(next);
  save();
  res.json({ ok: true, mode: 'local' });
});
