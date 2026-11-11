import { Router } from 'express';
import { db, save, uid } from '../store';
import { notify, publicUser, requireRole, type AuthedRequest } from '../auth';
import { createLivekitToken, livekitConfig } from '../livekit';
import { getCatalog } from '../catalog';

export const studentRouter = Router();
studentRouter.use(requireRole('student', 'admin'));

function studentGrade(req: AuthedRequest): string | null {
  return req.user?.gradeId ?? null;
}

studentRouter.get('/dashboard', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const catalog = await getCatalog();
  const gradeId = user.gradeId;
  const subjects = catalog.subjects.filter((s) => s.gradeId === gradeId);
  const lessons = db.lessons
    .filter((l) => l.published && l.gradeId === gradeId)
    .sort((a, b) => a.order - b.order);
  const assignments = db.assignments
    .filter((a) => a.published && a.gradeId === gradeId)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const submissions = db.submissions.filter((s) => s.studentId === user.id);
  const upcoming = db.liveSessions
    .filter((s) => s.gradeId === gradeId && s.status !== 'ended')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const attempts = db.attempts.filter((a) => a.studentId === user.id);
  const notifications = db.notifications.filter((n) => n.userId === user.id).slice(0, 6);
  const completed = db.completions.filter((c) => c.studentId === user.id).map((c) => c.lessonId);

  res.json({
    user: publicUser(user),
    school: catalog.schools.find((s) => s.id === user.schoolId) ?? null,
    district: catalog.districts.find((d) => d.id === user.districtId) ?? null,
    grade: catalog.grades.find((g) => g.id === gradeId) ?? null,
    subjects,
    lessons: lessons.map((lesson) => ({
      ...lesson,
      completed: completed.includes(lesson.id),
      subjectName: subjects.find((s) => s.id === lesson.subjectId)?.name ?? '',
    })),
    assignments: assignments.map((assignment) => {
      const submission = submissions.find((s) => s.assignmentId === assignment.id);
      return {
        ...assignment,
        submitted: Boolean(submission),
        score: submission?.score ?? null,
        feedback: submission?.feedback ?? '',
        subjectName: subjects.find((s) => s.id === assignment.subjectId)?.name ?? '',
      };
    }),
    liveSessions: upcoming,
    attempts,
    notifications,
    stats: {
      lessonsTotal: lessons.length,
      lessonsCompleted: lessons.filter((l) => completed.includes(l.id)).length,
      assignmentsDue: assignments.filter((a) => !submissions.some((s) => s.assignmentId === a.id)).length,
      averageScore: attempts.length
        ? Math.round(attempts.reduce((sum, a) => sum + (a.total ? (a.score / a.total) * 100 : 0), 0) / attempts.length)
        : 0,
    },
  });
});

studentRouter.get('/lessons', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const catalog = await getCatalog();
  const subjectId = String(req.query.subjectId ?? '');
  const completed = db.completions.filter((c) => c.studentId === user.id).map((c) => c.lessonId);
  const subjects = catalog.subjects.filter((s) => s.gradeId === user.gradeId);
  const lessons = db.lessons
    .filter((l) => l.published && l.gradeId === user.gradeId && (!subjectId || l.subjectId === subjectId))
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      ...l,
      completed: completed.includes(l.id),
      subjectName: subjects.find((s) => s.id === l.subjectId)?.name ?? '',
      teacherName: db.users.find((u) => u.id === l.teacherId)?.fullName ?? '',
    }));
  res.json({ lessons, subjects });
});

studentRouter.get('/lessons/:id', (req: AuthedRequest, res) => {
  const user = req.user!;
  const lesson = db.lessons.find((l) => l.id === req.params.id);
  if (!lesson || !lesson.published) {
    res.status(404).json({ error: 'الدرس غير موجود' });
    return;
  }
  if (lesson.gradeId !== user.gradeId) {
    res.status(403).json({ error: 'هذا الدرس غير متاح لصفك الدراسي' });
    return;
  }
  const teacher = db.users.find((u) => u.id === lesson.teacherId);
  res.json({
    lesson,
    teacher: teacher ? { id: teacher.id, fullName: teacher.fullName, bio: teacher.bio } : null,
    completed: db.completions.some((c) => c.lessonId === lesson.id && c.studentId === user.id),
    assignment: db.assignments.find((a) => a.lessonId === lesson.id && a.published) ?? null,
  });
});

studentRouter.post('/lessons/:id/complete', (req: AuthedRequest, res) => {
  const user = req.user!;
  const lesson = db.lessons.find((l) => l.id === req.params.id && l.published);
  if (!lesson || lesson.gradeId !== user.gradeId) {
    res.status(404).json({ error: 'الدرس غير موجود' });
    return;
  }
  if (!db.completions.some((c) => c.lessonId === lesson.id && c.studentId === user.id)) {
    db.completions.push({ id: uid('lc'), lessonId: lesson.id, studentId: user.id, createdAt: new Date().toISOString() });
    save();
  }
  res.json({ ok: true });
});

studentRouter.get('/assignments', (req: AuthedRequest, res) => {
  const user = req.user!;
  const submissions = db.submissions.filter((s) => s.studentId === user.id);
  const assignments = db.assignments
    .filter((a) => a.published && a.gradeId === user.gradeId)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((a) => {
      const submission = submissions.find((s) => s.assignmentId === a.id);
      return {
        ...a,
        teacherName: db.users.find((u) => u.id === a.teacherId)?.fullName ?? '',
        submission: submission ?? null,
        submitted: Boolean(submission),
      };
    });
  res.json(assignments);
});

studentRouter.post('/assignments/:id/submit', (req: AuthedRequest, res) => {
  const user = req.user!;
  const assignment = db.assignments.find((a) => a.id === req.params.id && a.published);
  if (!assignment || assignment.gradeId !== user.gradeId) {
    res.status(404).json({ error: 'الواجب غير موجود' });
    return;
  }
  const text = String(req.body?.text ?? '').trim();
  const fileUrl = String(req.body?.fileUrl ?? '');
  if (!text && !fileUrl) {
    res.status(400).json({ error: 'أضف إجابة نصية أو ملفًا قبل التسليم' });
    return;
  }
  const existing = db.submissions.find((s) => s.assignmentId === assignment.id && s.studentId === user.id);
  if (existing && existing.score !== null) {
    res.status(400).json({ error: 'تم تصحيح هذا الواجب ولا يمكن إعادة التسليم' });
    return;
  }
  if (existing) {
    existing.text = text;
    existing.fileUrl = fileUrl;
    existing.submittedAt = new Date().toISOString();
  } else {
    db.submissions.push({
      id: uid('sub'),
      assignmentId: assignment.id,
      studentId: user.id,
      text,
      fileUrl,
      submittedAt: new Date().toISOString(),
      score: null,
      feedback: '',
      gradedAt: null,
    });
    notify(assignment.teacherId, 'تسليم واجب جديد', `${user.fullName} سلّم واجب: ${assignment.title}`, 'assignment', '/teacher/assignments');
  }
  save();
  res.json({ ok: true });
});

studentRouter.get('/quizzes', (req: AuthedRequest, res) => {
  const user = req.user!;
  const attempts = db.attempts.filter((a) => a.studentId === user.id);
  res.json(
    db.quizzes
      .filter((q) => q.published && q.gradeId === user.gradeId)
      .map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        durationMin: q.durationMin,
        questionsCount: q.questions.length,
        teacherName: db.users.find((u) => u.id === q.teacherId)?.fullName ?? '',
        attempt: attempts.find((a) => a.quizId === q.id) ?? null,
      })),
  );
});

studentRouter.get('/quizzes/:id', (req: AuthedRequest, res) => {
  const user = req.user!;
  const quiz = db.quizzes.find((q) => q.id === req.params.id && q.published);
  if (!quiz || quiz.gradeId !== user.gradeId) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  const attempt = db.attempts.find((a) => a.quizId === quiz.id && a.studentId === user.id);
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMin: quiz.durationMin,
      questions: quiz.questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
    },
    attempt: attempt ?? null,
  });
});

studentRouter.post('/quizzes/:id/submit', (req: AuthedRequest, res) => {
  const user = req.user!;
  const quiz = db.quizzes.find((q) => q.id === req.params.id && q.published);
  if (!quiz || quiz.gradeId !== user.gradeId) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (db.attempts.some((a) => a.quizId === quiz.id && a.studentId === user.id)) {
    res.status(400).json({ error: 'لقد أديت هذا الاختبار مسبقًا' });
    return;
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers.map((n: unknown) => Number(n)) : [];
  const score = quiz.questions.reduce((sum, q, i) => (answers[i] === q.correctIndex ? sum + 1 : sum), 0);
  const attempt = {
    id: uid('att'),
    quizId: quiz.id,
    studentId: user.id,
    answers,
    score,
    total: quiz.questions.length,
    submittedAt: new Date().toISOString(),
  };
  db.attempts.push(attempt);
  notify(quiz.teacherId, 'نتيجة اختبار جديد', `${user.fullName} أدى اختبار ${quiz.title}: ${score}/${quiz.questions.length}`, 'grade', '/teacher/quizzes');
  save();
  res.json({ attempt, correctAnswers: quiz.questions.map((q) => q.correctIndex) });
});

studentRouter.get('/results', (req: AuthedRequest, res) => {
  const user = req.user!;
  const attempts = db.attempts.filter((a) => a.studentId === user.id);
  const submissions = db.submissions.filter((s) => s.studentId === user.id);
  res.json({
    attempts: attempts.map((a) => ({
      ...a,
      quizTitle: db.quizzes.find((q) => q.id === a.quizId)?.title ?? '',
      percentage: a.total ? Math.round((a.score / a.total) * 100) : 0,
    })),
    gradedAssignments: submissions
      .filter((s) => s.score !== null)
      .map((s) => {
        const assignment = db.assignments.find((a) => a.id === s.assignmentId);
        return {
          ...s,
          assignmentTitle: assignment?.title ?? '',
          maxScore: assignment?.maxScore ?? 0,
          percentage: assignment?.maxScore ? Math.round((s.score! / assignment.maxScore) * 100) : 0,
        };
      }),
  });
});

studentRouter.get('/live', (req: AuthedRequest, res) => {
  const user = req.user!;
  const sessions = db.liveSessions
    .filter((s) => s.gradeId === user.gradeId)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .map((s) => ({
      ...s,
      teacherName: db.users.find((u) => u.id === s.teacherId)?.fullName ?? '',
      participantsCount: s.participants.filter((p) => !p.leftAt).length,
      joined: s.participants.some((p) => p.userId === user.id),
    }));
  res.json({ sessions, livekit: livekitConfig() ? { configured: true } : { configured: false } });
});

studentRouter.post('/live/:id/join', (req: AuthedRequest, res) => {
  const user = req.user!;
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  if (session.gradeId !== user.gradeId) {
    res.status(403).json({ error: 'هذه المحاضرة غير متاحة لصفك الدراسي' });
    return;
  }
  if (session.status === 'ended') {
    res.status(400).json({ error: 'انتهت هذه المحاضرة' });
    return;
  }
  const active = session.participants.filter((p) => !p.leftAt);
  if (active.length >= session.maxParticipants) {
    res.status(429).json({ error: 'اكتمل العدد الأقصى للمشاركين في هذه المحاضرة' });
    return;
  }
  if (!livekitConfig()) {
    res.status(503).json({
      error: 'خدمة البث المباشر غير مهيأة بعد. يلزم إضافة مفاتيح LiveKit في إعدادات المنصة.',
      code: 'livekit_not_configured',
    });
    return;
  }
  const existing = session.participants.find((p) => p.userId === user.id);
  if (existing) {
    existing.leftAt = null;
    existing.joinedAt = new Date().toISOString();
  } else {
    session.participants.push({ userId: user.id, joinedAt: new Date().toISOString(), leftAt: null, minutes: 0 });
  }
  if (session.status === 'scheduled') session.status = 'live';
  db.attendance.push({
    id: uid('att'),
    sessionId: session.id,
    studentId: user.id,
    status: 'present',
    minutes: 0,
  });
  save();
  const token = createLivekitToken({
    identity: user.id,
    name: user.fullName,
    room: session.roomName,
    canPublish: false,
    canSubscribe: true,
  });
  res.json({ ...token, role: 'student' });
});

studentRouter.post('/live/:id/leave', (req: AuthedRequest, res) => {
  const user = req.user!;
  const session = db.liveSessions.find((s) => s.id === req.params.id);
  if (!session) {
    res.status(404).json({ error: 'المحاضرة غير موجودة' });
    return;
  }
  const participant = session.participants.find((p) => p.userId === user.id && !p.leftAt);
  if (participant) {
    participant.leftAt = new Date().toISOString();
    participant.minutes = Math.max(1, Math.round((Date.now() - new Date(participant.joinedAt).getTime()) / 60000));
    save();
  }
  res.json({ ok: true });
});

studentRouter.get('/notifications', (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json(db.notifications.filter((n) => n.userId === user.id));
});

studentRouter.post('/notifications/:id/read', (req: AuthedRequest, res) => {
  const user = req.user!;
  const notification = db.notifications.find((n) => n.id === req.params.id && n.userId === user.id);
  if (!notification) {
    res.status(404).json({ error: 'الإشعار غير موجود' });
    return;
  }
  notification.read = true;
  save();
  res.json({ ok: true });
});

studentRouter.post('/notifications/read-all', (req: AuthedRequest, res) => {
  const user = req.user!;
  db.notifications.filter((n) => n.userId === user.id).forEach((n) => {
    n.read = true;
  });
  save();
  res.json({ ok: true });
});

studentRouter.get('/messages', (req: AuthedRequest, res) => {
  const user = req.user!;
  const withId = String(req.query.with ?? '');
  const messages = db.messages.filter(
    (m) =>
      (m.fromId === user.id && (!withId || m.toId === withId)) ||
      (m.toId === user.id && (!withId || m.fromId === withId)),
  );
  const teacherIds = new Set(
    db.lessons.filter((l) => l.gradeId === user.gradeId).map((l) => l.teacherId),
  );
  res.json({
    messages,
    teachers: db.users
      .filter((u) => teacherIds.has(u.id))
      .map((u) => ({ id: u.id, fullName: u.fullName, bio: u.bio })),
  });
});

studentRouter.post('/messages', (req: AuthedRequest, res) => {
  const user = req.user!;
  const toId = String(req.body?.toId ?? '');
  const body = String(req.body?.body ?? '').trim();
  const recipient = db.users.find((u) => u.id === toId);
  if (!recipient || !body) {
    res.status(400).json({ error: 'حدد المستلم واكتب نص الرسالة' });
    return;
  }
  db.messages.push({ id: uid('msg'), fromId: user.id, toId, body, read: false, createdAt: new Date().toISOString() });
  notify(toId, 'رسالة جديدة', `${user.fullName}: ${body.slice(0, 80)}`, 'account', '/teacher/messages');
  save();
  res.status(201).json({ ok: true });
});
