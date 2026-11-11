import { Router } from 'express';
import { db } from '../store';
import { getCatalog } from '../catalog';
import { makePdf } from '../pdf';
import { livekitStatus } from '../livekit';
import { supabaseConfig } from '../supabase';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from '../store';

export const publicRouter = Router();

publicRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: supabaseConfig() ? 'supabase' : 'local',
    livekit: livekitStatus(),
    time: new Date().toISOString(),
  });
});

publicRouter.get('/overview', async (_req, res) => {
  const catalog = await getCatalog();
  const publishedLessons = db.lessons.filter((l) => l.published).length;
  res.json({
    counts: {
      districts: catalog.districts.length,
      schools: catalog.schools.length,
      books: catalog.books.length,
      subjects: catalog.subjects.length,
      colleges: catalog.colleges.length,
      programs: catalog.programs.length,
      students: db.users.filter((u) => u.role === 'student').length,
      teachers: db.users.filter((u) => u.role === 'teacher' && u.approved).length,
      lessons: publishedLessons,
      liveSessions: db.liveSessions.length,
    },
    announcements: catalog.announcements
      .slice()
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4),
    districts: catalog.districts.map((district) => ({
      ...district,
      schoolsCount: catalog.schools.filter((s) => s.districtId === district.id).length,
    })),
    latestBooks: catalog.books.slice(0, 6),
    sources: catalog.sources,
    livekit: livekitStatus(),
    mode: supabaseConfig() ? 'supabase' : 'local',
  });
});

publicRouter.get('/districts', async (_req, res) => {
  const catalog = await getCatalog();
  res.json(
    catalog.districts.map((district) => ({
      ...district,
      schoolsCount: catalog.schools.filter((s) => s.districtId === district.id).length,
    })),
  );
});

publicRouter.get('/districts/:id', async (req, res) => {
  const catalog = await getCatalog();
  const district = catalog.districts.find((d) => d.id === req.params.id);
  if (!district) {
    res.status(404).json({ error: 'المديرية غير موجودة' });
    return;
  }
  res.json({
    district,
    schools: catalog.schools.filter((s) => s.districtId === district.id),
  });
});

publicRouter.get('/levels', async (_req, res) => {
  const catalog = await getCatalog();
  res.json(
    catalog.levels
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((level) => ({
        ...level,
        grades: catalog.grades.filter((g) => g.levelId === level.id).sort((a, b) => a.order - b.order),
      })),
  );
});

publicRouter.get('/grades', async (_req, res) => {
  const catalog = await getCatalog();
  res.json(catalog.grades.slice().sort((a, b) => a.order - b.order));
});

publicRouter.get('/schools', async (req, res) => {
  const catalog = await getCatalog();
  const { districtId, levelId, gradeId, q, gender } = req.query as Record<string, string | undefined>;
  let schools = catalog.schools;
  if (districtId) schools = schools.filter((s) => s.districtId === districtId);
  if (levelId) schools = schools.filter((s) => s.levelId === levelId);
  if (gradeId) {
    const grade = catalog.grades.find((g) => g.id === gradeId);
    schools = schools.filter((s) => (s.gradeIds.length ? s.gradeIds.includes(gradeId) : grade ? s.levelId === grade.levelId : true));
  }
  if (gender) schools = schools.filter((s) => s.gender === gender);
  if (q) {
    const term = q.trim();
    schools = schools.filter((s) => s.name.includes(term) || s.address.includes(term));
  }
  const districtMap = new Map(catalog.districts.map((d) => [d.id, d.name]));
  res.json(schools.map((s) => ({ ...s, districtName: districtMap.get(s.districtId) ?? '' })));
});

publicRouter.get('/schools/:id', async (req, res) => {
  const catalog = await getCatalog();
  const school = catalog.schools.find((s) => s.id === req.params.id);
  if (!school) {
    res.status(404).json({ error: 'المدرسة غير موجودة' });
    return;
  }
  const district = catalog.districts.find((d) => d.id === school.districtId);
  const level = catalog.levels.find((l) => l.id === school.levelId);
  const grades = school.gradeIds.length
    ? catalog.grades.filter((g) => school.gradeIds.includes(g.id))
    : catalog.grades.filter((g) => g.levelId === school.levelId);
  const subjects = catalog.subjects.filter((s) => grades.some((g) => g.id === s.gradeId));
  const teachers = db.users
    .filter((u) => u.role === 'teacher' && u.approved && u.schoolId === school.id)
    .map((u) => ({ id: u.id, fullName: u.fullName, subjectIds: u.subjectIds }));
  res.json({
    school: { ...school, districtName: district?.name ?? '', levelName: level?.name ?? '' },
    district,
    level,
    grades,
    subjectsCount: subjects.length,
    teachers,
    stats: {
      students: db.users.filter((u) => u.role === 'student' && u.schoolId === school.id).length,
      lessons: db.lessons.filter((l) => l.published && (l as unknown as { schoolId?: string | null }).schoolId === school.id).length,
      liveSessions: db.liveSessions.filter((s) => (s as unknown as { schoolId?: string | null }).schoolId === school.id).length,
    },
  });
});

publicRouter.get('/subjects', async (req, res) => {
  const catalog = await getCatalog();
  const { gradeId } = req.query as Record<string, string | undefined>;
  const subjects = gradeId ? catalog.subjects.filter((s) => s.gradeId === gradeId) : catalog.subjects;
  res.json(subjects);
});

publicRouter.get('/books', async (req, res) => {
  const catalog = await getCatalog();
  const { gradeId, subjectId, q, limit } = req.query as Record<string, string | undefined>;
  let books = catalog.books;
  if (gradeId) books = books.filter((b) => b.gradeId === gradeId);
  if (subjectId) books = books.filter((b) => b.subjectId === subjectId);
  if (q) {
    const term = q.trim();
    books = books.filter((b) => b.title.includes(term) || b.description.includes(term));
  }
  const subjectMap = new Map(catalog.subjects.map((s) => [s.id, s.name]));
  const gradeMap = new Map(catalog.grades.map((g) => [g.id, g.name]));
  const enriched = books.map((b) => ({
    ...b,
    subjectName: subjectMap.get(b.subjectId) ?? '',
    gradeName: gradeMap.get(b.gradeId) ?? '',
  }));
  res.json(limit ? enriched.slice(0, Number(limit)) : enriched);
});

publicRouter.get('/books/:id', async (req, res) => {
  const catalog = await getCatalog();
  const book = catalog.books.find((b) => b.id === req.params.id);
  if (!book) {
    res.status(404).json({ error: 'الكتاب غير موجود' });
    return;
  }
  const subject = catalog.subjects.find((s) => s.id === book.subjectId);
  const grade = catalog.grades.find((g) => g.id === book.gradeId);
  res.json({ book, subject, grade });
});

publicRouter.get('/books/:id/file', async (req, res) => {
  const catalog = await getCatalog();
  const book = catalog.books.find((b) => b.id === req.params.id);
  if (!book) {
    res.status(404).json({ error: 'الكتاب غير موجود' });
    return;
  }
  if (/^https?:\/\//.test(book.fileUrl)) {
    res.redirect(book.fileUrl);
    return;
  }
  const uploaded = book.fileUrl.startsWith('/api/files/') ? path.join(UPLOAD_DIR, book.fileUrl.replace('/api/files/', '')) : '';
  if (uploaded && fs.existsSync(uploaded)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(book.title)}.pdf"`);
    fs.createReadStream(uploaded).pipe(res);
    return;
  }
  const pdf = makePdf(book.title, [
    `Grade: ${book.gradeId}`,
    `Subject: ${book.subjectId}`,
    `Term: ${book.term}`,
    `Pages: ${book.pages}`,
    'This demo file proves PDF download and offline caching.',
    'Upload the official book from the admin dashboard to replace it.',
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(pdf.length));
  res.setHeader('Content-Disposition', `inline; filename="book-${book.id}.pdf"`);
  res.send(pdf);
});

publicRouter.get('/colleges', async (_req, res) => {
  const catalog = await getCatalog();
  res.json(
    catalog.colleges.map((college) => ({
      ...college,
      programsCount: catalog.programs.filter((p) => p.collegeId === college.id).length,
    })),
  );
});

publicRouter.get('/colleges/:id', async (req, res) => {
  const catalog = await getCatalog();
  const college = catalog.colleges.find((c) => c.id === req.params.id);
  if (!college) {
    res.status(404).json({ error: 'الكلية غير موجودة' });
    return;
  }
  res.json({
    college,
    district: catalog.districts.find((d) => d.id === college.districtId),
    programs: catalog.programs.filter((p) => p.collegeId === college.id),
  });
});

publicRouter.get('/programs', async (_req, res) => {
  const catalog = await getCatalog();
  const collegeMap = new Map(catalog.colleges.map((c) => [c.id, c.name]));
  res.json(catalog.programs.map((p) => ({ ...p, collegeName: collegeMap.get(p.collegeId) ?? '' })));
});

publicRouter.get('/announcements', async (req, res) => {
  const catalog = await getCatalog();
  const { audience } = req.query as Record<string, string | undefined>;
  let list = catalog.announcements;
  if (audience && audience !== 'all') list = list.filter((a) => a.audience === audience || a.audience === 'all');
  res.json(list.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)));
});

publicRouter.get('/search', async (req, res) => {
  const catalog = await getCatalog();
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.json({ query: '', districts: [], schools: [], books: [], subjects: [], colleges: [], programs: [] });
    return;
  }
  const match = (value: string) => value.toLowerCase().includes(q.toLowerCase());
  const districtMap = new Map(catalog.districts.map((d) => [d.id, d.name]));
  const gradeMap = new Map(catalog.grades.map((g) => [g.id, g.name]));
  res.json({
    query: q,
    districts: catalog.districts.filter((d) => match(d.name) || match(d.description)),
    schools: catalog.schools
      .filter((s) => match(s.name) || match(s.address) || match(districtMap.get(s.districtId) ?? ''))
      .slice(0, 25)
      .map((s) => ({ ...s, districtName: districtMap.get(s.districtId) ?? '' })),
    books: catalog.books
      .filter((b) => match(b.title) || match(b.description))
      .slice(0, 25)
      .map((b) => ({ ...b, gradeName: gradeMap.get(b.gradeId) ?? '' })),
    subjects: catalog.subjects.filter((s) => match(s.name) || match(s.code)).slice(0, 25),
    colleges: catalog.colleges.filter((c) => match(c.name) || match(c.description)),
    programs: catalog.programs.filter((p) => match(p.name) || match(p.description)).slice(0, 25),
  });
});
