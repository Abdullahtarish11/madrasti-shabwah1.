import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, save, uid, UPLOAD_DIR } from '../store';
import { notify, requireTeacher, type AuthedRequest } from '../auth';
import { createLivekitToken, livekitConfig } from '../livekit';
import { getCatalog } from '../catalog';

export const teacherRouter = Router();
teacherRouter.use(requireTeacher);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10).replace(/[^.\w]/g, '');
      cb(null, `${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function ownedLessons(req: AuthedRequest) {
  return db.lessons.filter((l) => l.teacherId === req.user!.id);
}

teacherRouter.get('/dashboard', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const catalog = await getCatalog();
  const lessons = ownedLessons(req);
  const assignments = db.assignments.filter((a) => a.teacherId === user.id);
  const submissions = db.submissions.filter((s) => assignments.some((a) => a.id === s.assignmentId));
  const sessions = db.liveSessions.filter((s) => s.teacherId === user.id);
  const quizzes = db.quizzes.filter((q) => q.teacherId === user.id);
  const gradeIds = Array.from(new Set([...lessons.map((l) => l.gradeId), ...assignments.map((a) => a.gradeId)]));
  const students = db.users.filter((u) => u.role === 'student' && u.gradeId && gradeIds.includes(u.gradeId));
  const messages = db.messages.filter((m) => m.toId === user.id || m.fromId === user.id);

  res.json({
    user,
    school: catalog.schools.find((s) => s.id === user.schoolId) ?? null,
    stats: {
      lessons: lessons.length,
      publishedLessons: lessons.filter((l) => l.published).length,
      assignments: assignments.length,
      pendingGrading: submissions.filter((s) => s.score === null).length,
      liveSessions: sessions.length,
      students: students.length,
      quizzes: quizzes.length,
      messages: messages.filter((m) => m.toId === user.id && !m.read).length,
    },
    subjects: catalog.subjects.filter((s) => user.subjectIds.includes(s.id) || lessons.some((l) => l.subjectId === s.id)),
    recentSubmissions: submissions.slice(-5).reverse().map((s) => ({
      ...s,
      studentName: db.users.find((u) => u.id === s.studentId)?.fullName ?? '',
      assignmentTitle: assignments.find((a) => a.id === s.assignmentId)?.title ?? '',
    })),
    upcoming: sessions.filter((s) => s.status !== 'ended').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    messages: messages.filter((m) => m.toId === user.id).slice(-5).reverse(),
  });
});

teacherRouter.get('/lessons', (req: AuthedRequest, res) => {
  const catalog = db.subjects;
  res.json(
    ownedLessons(req)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((lesson) => ({
        ...lesson,
        subjectName: catalog.find((s) => s.id === lesson.subjectId)?.name ?? '',
        gradeName: db.grades.find((g) => g.id === lesson.gradeId)?.name ?? '',
      })),
  );
});

teacherRouter.post('/lessons', (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const gradeId = String(body.gradeId ?? '');
  const subjectId = String(body.subjectId ?? '');
  if (!title || !gradeId || !subjectId) {
    res.status(400).json({ error: 'العنوان والصف والمادة مطلوبة' });
    return;
  }
  const lesson = {
    id: uid('l'),
    courseId: body.courseId ? String(body.courseId) : null,
    teacherId: req.user!.id,
    title,
    description: String(body.description ?? ''),
    content: String(body.content ?? ''),
    videoUrl: String(body.videoUrl ?? ''),
    fileUrl: String(body.fileUrl ?? ''),
    gradeId,
    subjectId,
    published: false,
    order: ownedLessons(req).length + 1,
    durationMin: Number(body.durationMin ?? 30) || 30,
    createdAt: new Date().toISOString(),
  };
  db.lessons.push(lesson);
  save();
  res.status(201).json(lesson);
});

teacherRouter.patch('/lessons/:id', (req: AuthedRequest, res) => {
  const lesson = db.lessons.find((l) => l.id === req.params.id);
  if (!lesson) {
    res.status(404).json({ error: 'الدرس غير موجود' });
    return;
  }
  if (lesson.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك تعديل درس معلم آخر' });
    return;
  }
  const body = req.body ?? {};
  const fields = ['title', 'description', 'content', 'videoUrl', 'fileUrl', 'gradeId', 'subjectId'] as const;
  fields.forEach((field) => {
    if (body[field] !== undefined) (lesson as unknown as Record<string, unknown>)[field] = String(body[field]);
  });
  if (body.durationMin !== undefined) lesson.durationMin = Number(body.durationMin) || lesson.durationMin;
  if (body.order !== undefined) lesson.order = Number(body.order) || lesson.order;
  if (body.published !== undefined) {
    lesson.published = Boolean(body.published);
    if (lesson.published) {
      db.users
        .filter((u) => u.role === 'student' && u.gradeId === lesson.gradeId)
        .forEach((student) => notify(student.id, 'درس جديد', `تم نشر درس: ${lesson.title}`, 'announcement', `/student/lessons/${lesson.id}`));
    }
  }
  save();
  res.json(lesson);
});

teacherRouter.delete('/lessons/:id', (req: AuthedRequest, res) => {
  const lesson = db.lessons.find((l) => l.id === req.params.id);
  if (!lesson) {
    res.status(404).json({ error: 'الدرس غير موجود' });
    return;
  }
  if (lesson.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك حذف درس معلم آخر' });
    return;
  }
  db.lessons = db.lessons.filter((l) => l.id !== lesson.id);
  save();
  res.json({ ok: true });
});

teacherRouter.post('/upload', upload.single('file'), (req: AuthedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'لم يتم إرسال ملف صالح (PDF أو صورة أو فيديو)' });
    return;
  }
  const record = {
    id: uid('f'),
    name: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    path: req.file.filename,
    ownerId: req.user!.id,
    createdAt: new Date().toISOString(),
  };
  db.uploads.push(record);
  save();
  res.status(201).json({ id: record.id, name: record.name, size: record.size, url: `/api/files/${record.path}` });
});

teacherRouter.get('/assignments', (req: AuthedRequest, res) => {
  const assignments = db.assignments.filter((a) => a.teacherId === req.user!.id);
  res.json(
    assignments.map((a) => {
      const submissions = db.submissions.filter((s) => s.assignmentId === a.id);
      return {
        ...a,
        gradeName: db.grades.find((g) => g.id === a.gradeId)?.name ?? '',
        submissionsCount: submissions.length,
        pendingCount: submissions.filter((s) => s.score === null).length,
      };
    }),
  );
});

teacherRouter.post('/assignments', (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const gradeId = String(body.gradeId ?? '');
  const subjectId = String(body.subjectId ?? '');
  if (!title || !gradeId || !subjectId) {
    res.status(400).json({ error: 'العنوان والصف والمادة مطلوبة' });
    return;
  }
  const assignment = {
    id: uid('as'),
    teacherId: req.user!.id,
    lessonId: body.lessonId ? String(body.lessonId) : null,
    gradeId,
    subjectId,
    title,
    description: String(body.description ?? ''),
    dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
    maxScore: Number(body.maxScore ?? 20) || 20,
    published: Boolean(body.published ?? true),
    createdAt: new Date().toISOString(),
  };
  db.assignments.push(assignment);
  if (assignment.published) {
    db.users
      .filter((u) => u.role === 'student' && u.gradeId === gradeId)
      .forEach((student) => notify(student.id, 'واجب جديد', assignment.title, 'assignment', '/student/assignments'));
  }
  save();
  res.status(201).json(assignment);
});

teacherRouter.patch('/assignments/:id', (req: AuthedRequest, res) => {
  const assignment = db.assignments.find((a) => a.id === req.params.id);
  if (!assignment) {
    res.status(404).json({ error: 'الواجب غير موجود' });
    return;
  }
  if (assignment.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك تعديل واجب معلم آخر' });
    return;
  }
  const body = req.body ?? {};
  if (body.title !== undefined) assignment.title = String(body.title);
  if (body.description !== undefined) assignment.description = String(body.description);
  if (body.dueAt !== undefined) assignment.dueAt = new Date(body.dueAt).toISOString();
  if (body.maxScore !== undefined) assignment.maxScore = Number(body.maxScore) || assignment.maxScore;
  if (body.published !== undefined) assignment.published = Boolean(body.published);
  save();
  res.json(assignment);
});

teacherRouter.delete('/assignments/:id', (req: AuthedRequest, res) => {
  const assignment = db.assignments.find((a) => a.id === req.params.id);
  if (!assignment) {
    res.status(404).json({ error: 'الواجب غير موجود' });
    return;
  }
  if (assignment.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك حذف واجب معلم آخر' });
    return;
  }
  db.assignments = db.assignments.filter((a) => a.id !== assignment.id);
  db.submissions = db.submissions.filter((s) => s.assignmentId !== assignment.id);
  save();
  res.json({ ok: true });
});

teacherRouter.get('/assignments/:id/submissions', (req: AuthedRequest, res) => {
  const assignment = db.assignments.find((a) => a.id === req.params.id);
  if (!assignment) {
    res.status(404).json({ error: 'الواجب غير موجود' });
    return;
  }
  if (assignment.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'هذا الواجب لا يخصك' });
    return;
  }
  res.json({
    assignment,
    submissions: db.submissions
      .filter((s) => s.assignmentId === assignment.id)
      .map((s) => ({ ...s, studentName: db.users.find((u) => u.id === s.studentId)?.fullName ?? '' })),
  });
});

teacherRouter.post('/submissions/:id/grade', (req: AuthedRequest, res) => {
  const submission = db.submissions.find((s) => s.id === req.params.id);
  if (!submission) {
    res.status(404).json({ error: 'التسليم غير موجود' });
    return;
  }
  const assignment = db.assignments.find((a) => a.id === submission.assignmentId);
  if (!assignment || assignment.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك تصحيح واجب معلم آخر' });
    return;
  }
  const score = Number(req.body?.score);
  if (!Number.isFinite(score) || score < 0 || score > assignment.maxScore) {
    res.status(400).json({ error: `الدرجة يجب أن تكون بين 0 و ${assignment.maxScore}` });
    return;
  }
  submission.score = score;
  submission.feedback = String(req.body?.feedback ?? '');
  submission.gradedAt = new Date().toISOString();
  notify(submission.studentId, 'تم تصحيح واجبك', `${assignment.title}: ${score}/${assignment.maxScore}`, 'grade', '/student/results');
  save();
  res.json(submission);
});

teacherRouter.get('/quizzes', (req: AuthedRequest, res) => {
  const quizzes = db.quizzes.filter((q) => q.teacherId === req.user!.id);
  res.json(
    quizzes.map((q) => ({
      ...q,
      gradeName: db.grades.find((g) => g.id === q.gradeId)?.name ?? '',
      attemptsCount: db.attempts.filter((a) => a.quizId === q.id).length,
      averageScore: (() => {
        const attempts = db.attempts.filter((a) => a.quizId === q.id);
        if (!attempts.length) return 0;
        return Math.round(
          (attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length) * 100,
        );
      })(),
    })),
  );
});

teacherRouter.post('/quizzes', (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const gradeId = String(body.gradeId ?? '');
  const subjectId = String(body.subjectId ?? '');
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!title || !gradeId || !subjectId) {
    res.status(400).json({ error: 'العنوان والصف والمادة مطلوبة' });
    return;
  }
  if (questions.length === 0) {
    res.status(400).json({ error: 'أضف سؤالًا واحدًا على الأقل' });
    return;
  }
  for (const question of questions) {
    if (!question?.text || !Array.isArray(question.options) || question.options.length < 2) {
      res.status(400).json({ error: 'كل سؤال يحتاج نصًا وخيارين على الأقل' });
      return;
    }
    const correct = Number(question.correctIndex);
    if (!Number.isInteger(correct) || correct < 0 || correct >= question.options.length) {
      res.status(400).json({ error: 'حدد الإجابة الصحيحة لكل سؤال' });
      return;
    }
  }
  const quiz = {
    id: uid('q'),
    teacherId: req.user!.id,
    gradeId,
    subjectId,
    title,
    description: String(body.description ?? ''),
    durationMin: Number(body.durationMin ?? 20) || 20,
    published: Boolean(body.published ?? true),
    questions: questions.map((q: { text: string; options: string[]; correctIndex: number }, i: number) => ({
      id: `${Date.now()}-${i}`,
      text: String(q.text),
      options: q.options.map(String),
      correctIndex: Number(q.correctIndex),
    })),
    createdAt: new Date().toISOString(),
  };
  db.quizzes.push(quiz);
  if (quiz.published) {
    db.users
      .filter((u) => u.role === 'student' && u.gradeId === gradeId)
      .forEach((student) => notify(student.id, 'اختبار جديد', quiz.title, 'assignment', '/student/quizzes'));
  }
  save();
  res.status(201).json(quiz);
});

teacherRouter.delete('/quizzes/:id', (req: AuthedRequest, res) => {
  const quiz = db.quizzes.find((q) => q.id === req.params.id);
  if (!quiz) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (quiz.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك حذف اختبار معلم آخر' });
    return;
  }
  db.quizzes = db.quizzes.filter((q) => q.id !== quiz.id);
  save();
  res.json({ ok: true });
});

teacherRouter.get('/students', (req: AuthedRequest, res) => {
  const lessons = ownedLessons(req);
  const gradeIds = Array.from(new Set(lessons.map((l) => l.gradeId)));
  const students = db.users
    .filter((u) => u.role === 'student' && (!gradeIds.length || (u.gradeId && gradeIds.includes(u.gradeId))))
    .map((u) => {
      const attempts = db.attempts.filter((a) => a.studentId === u.id);
      const submissions = db.submissions.filter((s) => s.studentId === u.id);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        gradeId: u.gradeId,
        gradeName: db.grades.find((g) => g.id === u.gradeId)?.name ?? '',
        schoolName: db.schools.find((s) => s.id === u.schoolId)?.name ?? '',
        attemptsCount: attempts.length,
        submissionsCount: submissions.length,
        gradedCount: submissions.filter((s) => s.score !== null).length,
      };
    });
  res.json(students);
});

teacherRouter.get('/live', (req: AuthedRequest, res) => {
  res.json({
    sessions: db.liveSessions
      .filter((s) => s.teacherId === req.user!.id)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
      .map((s) => ({
        ...s,
        participantsCount: s.participants.filter((p) => !p.leftAt).length,
        totalMinutes: s.participants.reduce((sum, p) => sum + p.minutes, 0),
      })),
    livekit: livekitConfig() ? { configured: true } : { configured: false },
  });
});

teacherRouter.post('/live', (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const gradeId = String(body.gradeId ?? '');
  const subjectId = String(body.subjectId ?? '');
  if (!title || !gradeId || !subjectId) {
    res.status(400).json({ error: 'العنوان والصف والمادة مطلوبة' });
    return;
  }
  const session = {
    id: uid('ls'),
    teacherId: req.user!.id,
    title,
    description: String(body.description ?? ''),
    gradeId,
    subjectId,
    roomName: `madrasti-${uid('room')}`,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt).toISOString() : new Date(Date.now() + 3600000).toISOString(),
    durationMin: Number(body.durationMin ?? 60) || 60,
    status: 'scheduled' as const,
    recordEnabled: Boolean(body.recordEnabled ?? false),
    recordingUrl: '',
    maxParticipants: 40,
    participants: [],
    createdAt: new Date().toISOString(),
  };
  db.liveSessions.push(session);
  db.users
    .filter((u) => u.role === 'student' && u.gradeId === gradeId)
    .forEach((student) => notify(student.id, 'محاضرة مباشرة جديدة', `${title} - ${new Date(session.scheduledAt).toLocaleString('ar')}`, 'live', '/student/live'));
  save();
  res.status(201).json(session);
});

teacherRouter.patch('/live/:id', (req: AuthedRequest, res) => {
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  if (session.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك تعديل محاضرة معلم آخر' });
    return;
  }
  const body = req.body ?? {};
  if (body.title !== undefined) session.title = String(body.title);
  if (body.description !== undefined) session.description = String(body.description);
  if (body.scheduledAt !== undefined) session.scheduledAt = new Date(body.scheduledAt).toISOString();
  if (body.durationMin !== undefined) session.durationMin = Number(body.durationMin) || session.durationMin;
  if (body.recordEnabled !== undefined) session.recordEnabled = Boolean(body.recordEnabled);
  if (body.recordingUrl !== undefined) session.recordingUrl = String(body.recordingUrl);
  save();
  res.json(session);
});

teacherRouter.post('/live/:id/start', (req: AuthedRequest, res) => {
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  if (session.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك بدء محاضرة معلم آخر' });
    return;
  }
  if (!livekitConfig()) {
    res.status(503).json({ error: 'خدمة البث غير مهيأة. أضف مفاتيح LiveKit أولًا.', code: 'livekit_not_configured' });
    return;
  }
  session.status = 'live';
  save();
  res.json({ ok: true, room: session.roomName });
});

teacherRouter.post('/live/:id/end', (req: AuthedRequest, res) => {
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  if (session.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك إنهاء محاضرة معلم آخر' });
    return;
  }
  session.status = 'ended';
  session.participants.filter((p) => !p.leftAt).forEach((p) => {
    p.leftAt = new Date().toISOString();
    p.minutes = Math.max(1, Math.round((Date.now() - new Date(p.joinedAt).getTime()) / 60000));
  });
  save();
  res.json({ ok: true });
});

teacherRouter.post('/live/:id/join', (req: AuthedRequest, res) => {
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  if (session.teacherId !== req.user!.id) {
    res.status(403).json({ error: 'لا يمكنك الانضمام لبث معلم آخر' });
    return;
  }
  if (!livekitConfig()) {
    res.status(503).json({ error: 'خدمة البث غير مهيأة. أضف مفاتيح LiveKit أولًا.', code: 'livekit_not_configured' });
    return;
  }
  if (session.status !== 'live') session.status = 'live';
  save();
  const token = createLivekitToken({
    identity: req.user!.id,
    name: req.user!.fullName,
    room: session.roomName,
    canPublish: true,
    canSubscribe: true,
  });
  res.json({ ...token, role: 'teacher' });
});

teacherRouter.get('/attendance', (req: AuthedRequest, res) => {
  const sessionId = String(req.query.sessionId ?? '');
  const sessions = db.liveSessions.filter((s) => s.teacherId === req.user!.id);
  const selected = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  if (!selected) {
    res.json({ sessions: [], records: [] });
    return;
  }
  res.json({
    sessions: sessions.map((s) => ({ id: s.id, title: s.title, scheduledAt: s.scheduledAt })),
    selected,
    records: selected.participants.map((p) => ({
      studentId: p.userId,
      studentName: db.users.find((u) => u.id === p.userId)?.fullName ?? '',
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      minutes: p.minutes,
      status: p.leftAt ? 'present' : 'present',
    })),
  });
});

teacherRouter.post('/announcements', (req: AuthedRequest, res) => {
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  const gradeId = String(req.body?.gradeId ?? '');
  if (!title || !body) {
    res.status(400).json({ error: 'عنوان الإعلان ونصه مطلوبان' });
    return;
  }
  const announcement = {
    id: uid('a'),
    title,
    body,
    audience: 'students' as const,
    authorId: req.user!.id,
    authorName: req.user!.fullName,
    districtId: null,
    schoolId: null,
    pinned: false,
    createdAt: new Date().toISOString(),
  };
  db.announcements.unshift(announcement);
  db.users
    .filter((u) => u.role === 'student' && (!gradeId || u.gradeId === gradeId))
    .forEach((student) => notify(student.id, 'إعلان من معلمك', title, 'announcement', '/student/notifications'));
  save();
  res.status(201).json(announcement);
});

teacherRouter.get('/messages', (req: AuthedRequest, res) => {
  const messages = db.messages.filter((m) => m.toId === req.user!.id || m.fromId === req.user!.id);
  res.json({
    messages: messages.map((m) => ({
      ...m,
      fromName: db.users.find((u) => u.id === m.fromId)?.fullName ?? '',
      toName: db.users.find((u) => u.id === m.toId)?.fullName ?? '',
    })),
  });
});

teacherRouter.post('/messages/:id/read', (req: AuthedRequest, res) => {
  const message = db.messages.find((m) => m.id === req.params.id && m.toId === req.user!.id);
  if (message) {
    message.read = true;
    save();
  }
  res.json({ ok: true });
});
