import { Router } from 'express';
import { db, save, uid } from '../store';
import { notify, requireAuth, type AuthedRequest } from '../auth';

export const managerRouter = Router();
managerRouter.use(requireAuth);
managerRouter.use((req: AuthedRequest, res, next) => {
  const role = req.user?.role;
  if (role !== 'manager' && role !== 'admin') {
    res.status(403).json({ error: 'هذه الصفحة مخصصة لمدير المدرسة' });
    return;
  }
  next();
});

function scope(req: AuthedRequest) {
  const user = req.user!;
  const school = db.schools.find((s) => s.id === user.schoolId) ?? null;
  const district = db.districts.find((d) => d.id === (school?.districtId ?? user.districtId)) ?? null;
  return { user, school, district };
}

managerRouter.get('/dashboard', (req: AuthedRequest, res) => {
  const { user, school, district } = scope(req);
  const teachers = db.users.filter((u) => u.role === 'teacher' && u.schoolId === user.schoolId);
  const students = db.users.filter((u) => u.role === 'student' && u.schoolId === user.schoolId);
  const teacherIds = new Set(teachers.map((t) => t.id));
  const lessons = db.lessons.filter((l) => teacherIds.has(l.teacherId));
  const assignments = db.assignments.filter((a) => teacherIds.has(a.teacherId));
  const liveSessions = db.liveSessions.filter((s) => teacherIds.has(s.teacherId));
  const submissions = db.submissions.filter((s) => assignments.some((a) => a.id === s.assignmentId));
  const gradeIds = Array.from(
    new Set([...students.map((s) => s.gradeId).filter(Boolean), ...(school?.gradeIds ?? [])]),
  );

  res.json({
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    school,
    district,
    stats: {
      teachers: teachers.length,
      pendingTeachers: teachers.filter((t) => t.status !== 'active').length,
      students: students.length,
      lessons: lessons.length,
      assignments: assignments.length,
      submissions: submissions.length,
      liveSessions: liveSessions.length,
    },
    grades: db.grades.filter((g) => gradeIds.includes(g.id)),
    teachers: teachers.map((t) => ({
      id: t.id,
      fullName: t.fullName,
      email: t.email,
      phone: t.phone,
      status: t.status,
      subjectIds: t.subjectIds ?? [],
      subjects: db.subjects.filter((s) => (t.subjectIds ?? []).includes(s.id)).map((s) => s.name),
      lessonsCount: lessons.filter((l) => l.teacherId === t.id).length,
    })),
    students: students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      status: s.status,
      gradeId: s.gradeId,
      gradeName: db.grades.find((g) => g.id === s.gradeId)?.name ?? null,
    })),
    liveSessions: liveSessions
      .slice()
      .sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)))
      .slice(0, 10),
    announcements: db.announcements
      .filter((a) => a.schoolId === user.schoolId || a.authorId === user.id)
      .slice(0, 10),
  });
});

managerRouter.post('/announcements', (req: AuthedRequest, res) => {
  const { user, school } = scope(req);
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  if (!title || !body) {
    res.status(400).json({ error: 'عنوان الإعلان ونصه مطلوبان' });
    return;
  }
  const announcement = {
    id: uid('a'),
    title,
    body,
    audience: 'students' as const,
    authorId: user.id,
    authorName: user.fullName,
    districtId: school?.districtId ?? user.districtId ?? null,
    schoolId: user.schoolId ?? null,
    pinned: false,
    createdAt: new Date().toISOString(),
  };
  db.announcements.unshift(announcement);
  db.users
    .filter((u) => u.schoolId === user.schoolId && (u.role === 'student' || u.role === 'teacher'))
    .forEach((member) => notify(member.id, title, body, 'announcement', '/announcements'));
  save();
  res.status(201).json(announcement);
});

managerRouter.get('/students', (req: AuthedRequest, res) => {
  const { user } = scope(req);
  const gradeId = req.query.gradeId ? String(req.query.gradeId) : '';
  const students = db.users.filter(
    (u) => u.role === 'student' && u.schoolId === user.schoolId && (!gradeId || u.gradeId === gradeId),
  );
  res.json(
    students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      status: s.status,
      gradeId: s.gradeId,
      gradeName: db.grades.find((g) => g.id === s.gradeId)?.name ?? null,
      createdAt: s.createdAt,
    })),
  );
});
