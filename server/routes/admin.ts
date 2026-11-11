import { Router } from 'express';
import { db, save, uid } from '../store';
import { publicUser, requireRole, type AuthedRequest } from '../auth';
import { getCatalog } from '../catalog';
import { probeSchema, supabaseConfig, resetSupabaseCache } from '../supabase';
import { livekitStatus } from '../livekit';
import type { Role } from '../../shared/types';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

adminRouter.get('/overview', async (_req, res) => {
  const catalog = await getCatalog();
  const students = db.users.filter((u) => u.role === 'student');
  const teachers = db.users.filter((u) => u.role === 'teacher');
  const submissions = db.submissions;
  const attempts = db.attempts;
  res.json({
    counts: {
      districts: catalog.districts.length,
      schools: catalog.schools.length,
      colleges: catalog.colleges.length,
      programs: catalog.programs.length,
      subjects: catalog.subjects.length,
      books: catalog.books.length,
      students: students.length,
      teachers: teachers.length,
      pendingTeachers: teachers.filter((t) => !t.approved).length,
      lessons: db.lessons.length,
      liveSessions: db.liveSessions.length,
      announcements: db.announcements.length,
    },
    recentUsers: db.users.slice(-6).reverse().map(publicUser),
    pendingTeachers: teachers.filter((t) => !t.approved).map(publicUser),
    sources: catalog.sources,
    mode: supabaseConfig() ? 'supabase' : 'local',
    livekit: livekitStatus(),
  });
});

adminRouter.get('/users', (req: AuthedRequest, res) => {
  const role = String(req.query.role ?? '');
  const q = String(req.query.q ?? '').trim();
  let users = db.users;
  if (role) users = users.filter((u) => u.role === role);
  if (q) users = users.filter((u) => u.fullName.includes(q) || u.email.includes(q));
  res.json(users.map(publicUser));
});

adminRouter.patch('/users/:id', (req: AuthedRequest, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }
  const body = req.body ?? {};
  if (body.role !== undefined) {
    const role = String(body.role) as Role;
    if (!['student', 'teacher', 'school_manager', 'admin'].includes(role)) {
      res.status(400).json({ error: 'الدور غير صحيح' });
      return;
    }
    user.role = role;
  }
  if (body.approved !== undefined) user.approved = Boolean(body.approved);
  if (body.fullName !== undefined) user.fullName = String(body.fullName);
  if (body.schoolId !== undefined) user.schoolId = body.schoolId ? String(body.schoolId) : null;
  if (body.districtId !== undefined) user.districtId = body.districtId ? String(body.districtId) : null;
  if (body.gradeId !== undefined) user.gradeId = body.gradeId ? String(body.gradeId) : null;
  save();
  res.json(publicUser(user));
});

adminRouter.post('/teachers/:id/approve', (req: AuthedRequest, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user || user.role !== 'teacher') {
    res.status(404).json({ error: 'المعلم غير موجود' });
    return;
  }
  user.approved = Boolean(req.body?.approved ?? true);
  db.notifications.unshift({
    id: uid('n'),
    userId: user.id,
    title: user.approved ? 'تم اعتماد حسابك' : 'تم إيقاف اعتماد حسابك',
    body: user.approved ? 'يمكنك الآن نشر الدروس وبدء المحاضرات المباشرة.' : 'تم إيقاف الاعتماد، تواصل مع إدارة المنصة.',
    type: 'account',
    link: '/teacher',
    read: false,
    createdAt: new Date().toISOString(),
  });
  save();
  res.json(publicUser(user));
});

adminRouter.delete('/users/:id', (req: AuthedRequest, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }
  if (user.id === req.user!.id) {
    res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
    return;
  }
  db.users = db.users.filter((u) => u.id !== user.id);
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  save();
  res.json({ ok: true });
});

function crud<T extends { id: string }>(
  collection: () => T[],
  setCollection: (rows: T[]) => void,
  build: (body: Record<string, unknown>) => T | { error: string },
  apply?: (row: T, body: Record<string, unknown>) => void,
) {
  return {
    list: (_req: unknown, res: import('express').Response) => res.json(collection()),
    create: (req: import('express').Request, res: import('express').Response) => {
      const built = build(req.body ?? {});
      if ('error' in built) {
        res.status(400).json({ error: built.error });
        return;
      }
      const rows = collection();
      rows.push(built);
      setCollection(rows);
      save();
      res.status(201).json(built);
    },
    update: (req: import('express').Request, res: import('express').Response) => {
      const row = collection().find((r) => r.id === req.params.id);
      if (!row) {
        res.status(404).json({ error: 'العنصر غير موجود' });
        return;
      }
      if (apply) apply(row, req.body ?? {});
      save();
      res.json(row);
    },
    remove: (req: import('express').Request, res: import('express').Response) => {
      const rows = collection();
      if (!rows.some((r) => r.id === req.params.id)) {
        res.status(404).json({ error: 'العنصر غير موجود' });
        return;
      }
      setCollection(rows.filter((r) => r.id !== req.params.id));
      save();
      res.json({ ok: true });
    },
  };
}

const districtsCrud = crud(
  () => db.districts,
  (rows) => {
    db.districts = rows;
  },
  (body) => {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'اسم المديرية مطلوب' };
    return { id: uid('d'), name, description: String(body.description ?? '') };
  },
  (row, body) => {
    if (body.name !== undefined) row.name = String(body.name);
    if (body.description !== undefined) row.description = String(body.description);
  },
);
adminRouter.get('/districts', districtsCrud.list);
adminRouter.post('/districts', districtsCrud.create);
adminRouter.patch('/districts/:id', districtsCrud.update);
adminRouter.delete('/districts/:id', districtsCrud.remove);

const schoolsCrud = crud(
  () => db.schools,
  (rows) => {
    db.schools = rows;
  },
  (body) => {
    const name = String(body.name ?? '').trim();
    if (!name || !body.districtId) return { error: 'اسم المدرسة والمديرية مطلوبان' };
    return {
      id: uid('sch'),
      name,
      districtId: String(body.districtId),
      levelId: String(body.levelId ?? 'lv1'),
      gender: (String(body.gender ?? 'مختلط') as 'بنين' | 'بنات' | 'مختلط'),
      address: String(body.address ?? ''),
      phone: String(body.phone ?? ''),
      studentsCount: Number(body.studentsCount ?? 0) || 0,
      teachersCount: Number(body.teachersCount ?? 0) || 0,
      gradeIds: Array.isArray(body.gradeIds) ? body.gradeIds.map(String) : [],
      createdAt: new Date().toISOString(),
    };
  },
  (row, body) => {
    (['name', 'districtId', 'levelId', 'gender', 'address', 'phone'] as const).forEach((field) => {
      if (body[field] !== undefined) (row as Record<string, unknown>)[field] = String(body[field]);
    });
    if (body.studentsCount !== undefined) row.studentsCount = Number(body.studentsCount) || 0;
    if (body.teachersCount !== undefined) row.teachersCount = Number(body.teachersCount) || 0;
    if (Array.isArray(body.gradeIds)) row.gradeIds = body.gradeIds.map(String);
  },
);
adminRouter.get('/schools', schoolsCrud.list);
adminRouter.post('/schools', schoolsCrud.create);
adminRouter.patch('/schools/:id', schoolsCrud.update);
adminRouter.delete('/schools/:id', schoolsCrud.remove);

const collegesCrud = crud(
  () => db.colleges,
  (rows) => {
    db.colleges = rows;
  },
  (body) => {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'اسم الكلية مطلوب' };
    return {
      id: uid('col'),
      name,
      universityName: String(body.universityName ?? 'جامعة شبوة'),
      districtId: String(body.districtId ?? 'd1'),
      description: String(body.description ?? ''),
      dean: String(body.dean ?? ''),
    };
  },
  (row, body) => {
    (['name', 'universityName', 'districtId', 'description', 'dean'] as const).forEach((field) => {
      if (body[field] !== undefined) row[field] = String(body[field]);
    });
  },
);
adminRouter.get('/colleges', collegesCrud.list);
adminRouter.post('/colleges', collegesCrud.create);
adminRouter.patch('/colleges/:id', collegesCrud.update);
adminRouter.delete('/colleges/:id', collegesCrud.remove);

const programsCrud = crud(
  () => db.programs,
  (rows) => {
    db.programs = rows;
  },
  (body) => {
    const name = String(body.name ?? '').trim();
    if (!name || !body.collegeId) return { error: 'اسم البرنامج والكلية مطلوبان' };
    return {
      id: uid('p'),
      collegeId: String(body.collegeId),
      name,
      degree: String(body.degree ?? 'بكالوريوس'),
      years: Number(body.years ?? 4) || 4,
      description: String(body.description ?? ''),
    };
  },
  (row, body) => {
    (['name', 'collegeId', 'degree', 'description'] as const).forEach((field) => {
      if (body[field] !== undefined) row[field] = String(body[field]);
    });
    if (body.years !== undefined) row.years = Number(body.years) || row.years;
  },
);
adminRouter.get('/programs', programsCrud.list);
adminRouter.post('/programs', programsCrud.create);
adminRouter.patch('/programs/:id', programsCrud.update);
adminRouter.delete('/programs/:id', programsCrud.remove);

const subjectsCrud = crud(
  () => db.subjects,
  (rows) => {
    db.subjects = rows;
  },
  (body) => {
    const name = String(body.name ?? '').trim();
    if (!name || !body.gradeId) return { error: 'اسم المادة والصف مطلوبان' };
    return {
      id: uid('sub'),
      gradeId: String(body.gradeId),
      name,
      code: String(body.code ?? ''),
      description: String(body.description ?? ''),
    };
  },
  (row, body) => {
    (['name', 'gradeId', 'code', 'description'] as const).forEach((field) => {
      if (body[field] !== undefined) row[field] = String(body[field]);
    });
  },
);
adminRouter.get('/subjects', subjectsCrud.list);
adminRouter.post('/subjects', subjectsCrud.create);
adminRouter.patch('/subjects/:id', subjectsCrud.update);
adminRouter.delete('/subjects/:id', subjectsCrud.remove);

const booksCrud = crud(
  () => db.books,
  (rows) => {
    db.books = rows;
  },
  (body) => {
    const title = String(body.title ?? '').trim();
    if (!title || !body.gradeId || !body.subjectId) return { error: 'العنوان والصف والمادة مطلوبة' };
    const id = uid('b');
    return {
      id,
      title,
      gradeId: String(body.gradeId),
      subjectId: String(body.subjectId),
      term: (Number(body.term ?? 1) === 2 ? 2 : 1) as 1 | 2,
      pages: Number(body.pages ?? 0) || 0,
      sizeKb: Number(body.sizeKb ?? 0) || 0,
      description: String(body.description ?? ''),
      fileUrl: String(body.fileUrl ?? `/api/public/books/${id}/file`),
      createdAt: new Date().toISOString(),
    };
  },
  (row, body) => {
    (['title', 'gradeId', 'subjectId', 'description', 'fileUrl'] as const).forEach((field) => {
      if (body[field] !== undefined) row[field] = String(body[field]);
    });
    if (body.term !== undefined) row.term = Number(body.term) === 2 ? 2 : 1;
    if (body.pages !== undefined) row.pages = Number(body.pages) || 0;
    if (body.sizeKb !== undefined) row.sizeKb = Number(body.sizeKb) || 0;
  },
);
adminRouter.get('/books', booksCrud.list);
adminRouter.post('/books', booksCrud.create);
adminRouter.patch('/books/:id', booksCrud.update);
adminRouter.delete('/books/:id', booksCrud.remove);

const announcementsCrud = crud(
  () => db.announcements,
  (rows) => {
    db.announcements = rows;
  },
  (body) => {
    const title = String(body.title ?? '').trim();
    if (!title) return { error: 'عنوان الإعلان مطلوب' };
    return {
      id: uid('a'),
      title,
      body: String(body.body ?? ''),
      audience: (String(body.audience ?? 'all') as 'all' | 'students' | 'teachers' | 'parents'),
      authorId: 'u-admin',
      authorName: 'مسؤول المنصة',
      districtId: body.districtId ? String(body.districtId) : null,
      schoolId: body.schoolId ? String(body.schoolId) : null,
      pinned: Boolean(body.pinned ?? false),
      createdAt: new Date().toISOString(),
    };
  },
  (row, body) => {
    (['title', 'body', 'audience'] as const).forEach((field) => {
      if (body[field] !== undefined) row[field] = String(body[field]);
    });
    if (body.pinned !== undefined) row.pinned = Boolean(body.pinned);
  },
);
adminRouter.get('/announcements', announcementsCrud.list);
adminRouter.post('/announcements', announcementsCrud.create);
adminRouter.patch('/announcements/:id', announcementsCrud.update);
adminRouter.delete('/announcements/:id', announcementsCrud.remove);

adminRouter.get('/reports', async (_req, res) => {
  const catalog = await getCatalog();
  const students = db.users.filter((u) => u.role === 'student');
  const teachers = db.users.filter((u) => u.role === 'teacher');
  const attempts = db.attempts;
  const submissions = db.submissions;
  res.json({
    users: {
      students: students.length,
      teachers: teachers.length,
      approvedTeachers: teachers.filter((t) => t.approved).length,
      managers: db.users.filter((u) => u.role === 'school_manager').length,
      admins: db.users.filter((u) => u.role === 'admin').length,
    },
    content: {
      lessons: db.lessons.length,
      publishedLessons: db.lessons.filter((l) => l.published).length,
      assignments: db.assignments.length,
      quizzes: db.quizzes.length,
      liveSessions: db.liveSessions.length,
      books: catalog.books.length,
      schools: catalog.schools.length,
    },
    performance: {
      quizAttempts: attempts.length,
      averageQuizScore: attempts.length
        ? Math.round((attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length) * 100)
        : 0,
      submissions: submissions.length,
      gradedSubmissions: submissions.filter((s) => s.score !== null).length,
    },
    schoolsByDistrict: catalog.districts.map((district) => ({
      district: district.name,
      schools: catalog.schools.filter((s) => s.districtId === district.id).length,
      students: students.filter((u) => u.districtId === district.id).length,
    })),
    liveMinutes: db.liveSessions.reduce((sum, s) => sum + s.participants.reduce((m, p) => m + p.minutes, 0), 0),
  });
});

adminRouter.get('/db-status', async (_req, res) => {
  const probe = await probeSchema();
  res.json({
    ...probe,
    livekit: livekitStatus(),
    note: probe.configured
      ? 'تم فحص الجداول القراءة فقط. لم يتم تنفيذ أي تغيير على قاعدة البيانات.'
      : 'لم تُضف مفاتيح Supabase بعد؛ المنصة تعمل على التخزين المحلي المؤقت.',
  });
});

adminRouter.post('/db-status/refresh', async (_req, res) => {
  resetSupabaseCache();
  const probe = await probeSchema();
  res.json(probe);
});
