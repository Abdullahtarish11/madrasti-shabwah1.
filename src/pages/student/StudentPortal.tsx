import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  Progress,
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { LiveRoom, type LiveToken } from '../../components/LiveRoom';

const nav = [
  { to: '/student', label: 'لوحة التحكم', end: true },
  { to: '/student/lessons', label: 'الدروس' },
  { to: '/student/assignments', label: 'الواجبات' },
  { to: '/student/quizzes', label: 'الاختبارات' },
  { to: '/student/results', label: 'النتائج' },
  { to: '/student/live', label: 'المحاضرات المباشرة' },
  { to: '/student/notifications', label: 'الإشعارات' },
  { to: '/student/messages', label: 'التواصل مع المعلمين' },
];

function PortalNav() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function asList<T>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data[key])) return data[key] as T[];
  return [];
}

interface Subject {
  id: string;
  name: string;
  teacherName?: string;
}

interface Lesson {
  id: string;
  title: string;
  subjectName?: string;
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
  createdAt?: string;
  completed?: boolean;
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  maxScore?: number;
  subjectName?: string;
  submitted?: boolean;
  score?: number | null;
  feedback?: string | null;
  fileUrl?: string | null;
}

interface QuizRow {
  id: string;
  title: string;
  description?: string;
  durationMin?: number;
  questionsCount?: number;
  teacherName?: string;
  attempt?: { score: number; total: number } | null;
}

interface LiveSession {
  id: string;
  title: string;
  subjectName?: string;
  scheduledAt?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
  recordingUrl?: string;
}

interface Notification {
  id: string;
  title: string;
  body?: string;
  createdAt?: string;
  read?: boolean;
}

interface Message {
  id: string;
  body: string;
  fromName?: string;
  toName?: string;
  createdAt?: string;
  direction?: 'in' | 'out';
  toId?: string;
}

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<any>('/api/student/dashboard')
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل لوحة التحكم'));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل لوحة التحكم…" />;

  const stats = data.stats ?? {};
  const lessons: Lesson[] = data.lessons ?? [];
  const assignments: Assignment[] = data.assignments ?? [];
  const live: LiveSession[] = data.liveSessions ?? [];
  const subjects: Subject[] = data.subjects ?? [];

  return (
    <div>
      <PageHeader
        title={`مرحبًا ${data.user?.fullName ?? ''}`}
        subtitle={[data.grade?.name, data.school?.name, data.district?.name].filter(Boolean).join(' · ') || 'حدّد مدرستك وصفك من الملف الشخصي'}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الدروس المتاحة" value={stats.lessonsTotal ?? lessons.length} />
        <StatCard label="دروس مكتملة" value={stats.lessonsCompleted ?? 0} tone="green" />
        <StatCard label="واجبات مستحقة" value={stats.assignmentsDue ?? assignments.filter((a) => !a.submitted).length} tone="amber" />
        <StatCard label="متوسط الدرجات" value={`${stats.averageScore ?? 0}%`} tone="brand" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="موادي الدراسية" subtitle="المواد المرتبطة بصفك ومدرستك" />
          {subjects.length === 0 ? (
            <EmptyState title="لا توجد مواد بعد" description="حدّد صفك في الملف الشخصي لتظهر موادك." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {subjects.map((subject) => (
                <div key={subject.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-slate-800">{subject.name}</p>
                  <p className="text-xs text-slate-500">{subject.teacherName ?? 'بدون معلم مخصص'}</p>
                  <NavLink to="/student/lessons" className="mt-2 inline-block text-xs font-semibold text-brand-700">
                    مشاهدة الدروس ←
                  </NavLink>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="أقرب المحاضرات" />
          {live.length === 0 ? (
            <EmptyState title="لا محاضرات مجدولة" />
          ) : (
            <ul className="space-y-2 text-sm">
              {live.slice(0, 4).map((session) => (
                <li key={session.id} className="rounded-lg bg-slate-50 p-2">
                  <p className="font-semibold text-slate-800">{session.title}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(session.scheduledAt ?? session.startedAt)}</p>
                  <Badge tone={session.status === 'live' ? 'green' : 'slate'}>
                    {session.status === 'live' ? 'مباشر الآن' : session.status === 'ended' ? 'منتهية' : 'مجدولة'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <NavLink to="/student/live" className="mt-3 inline-block text-xs font-semibold text-brand-700">
            كل المحاضرات ←
          </NavLink>
        </Card>
      </div>

      <Card className="mt-6">
        <SectionTitle title="آخر الواجبات" />
        {assignments.length === 0 ? (
          <EmptyState title="لا واجبات حاليًا" />
        ) : (
          <div className="space-y-2">
            {assignments.slice(0, 5).map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-semibold text-slate-800">{assignment.title}</p>
                  <p className="text-xs text-slate-500">
                    {assignment.subjectName ?? 'مادة'} · التسليم {formatDate(assignment.dueDate)}
                  </p>
                </div>
                <Badge tone={assignment.submitted ? 'green' : 'amber'}>
                  {assignment.submitted ? (assignment.score != null ? `تم التصحيح: ${assignment.score}` : 'تم التسليم') : 'لم يُسلّم'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Lessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<any>('/api/student/lessons')
      .then((data) => setLessons(asList<Lesson>(data, 'lessons')))
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الدروس'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading label="جارٍ تحميل الدروس…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div>
      <PageHeader title="الدروس" subtitle="دروس صفك وموادك الدراسية" />
      {lessons.length === 0 ? (
        <EmptyState title="لا دروس منشورة بعد" description="ستظهر الدروس هنا بعد نشرها من معلميك." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lessons.map((lesson) => (
            <Card key={lesson.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-800">{lesson.title}</h3>
                {lesson.completed && <Badge tone="green">مكتمل</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-500">{lesson.subjectName ?? 'مادة'}</p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{lesson.content?.slice(0, 140) ?? ''}</p>
              <NavLink to={`/student/lessons/${lesson.id}`} className="btn-secondary mt-3 inline-flex">
                فتح الدرس
              </NavLink>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LessonDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<any>(`/api/student/lessons/${id}`)
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الدرس'));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل الدرس…" />;

  const lesson: Lesson = data.lesson ?? data;
  const completed = data.completed ?? lesson.completed;

  const complete = async () => {
    setBusy(true);
    try {
      await api.post(`/api/student/lessons/${id}/complete`);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحديث حالة الدرس');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={lesson.title} subtitle={lesson.subjectName ?? ''} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {lesson.videoUrl && (
            <video controls className="mb-4 w-full rounded-xl bg-black" src={lesson.videoUrl} preload="metadata" />
          )}
          <div className="whitespace-pre-line text-sm leading-7 text-slate-700">{lesson.content || 'لا يوجد شرح مكتوب لهذا الدرس.'}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {lesson.fileUrl && (
              <a href={lesson.fileUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                تحميل مرفقات الدرس
              </a>
            )}
            <button type="button" onClick={complete} disabled={busy || completed} className="btn-primary">
              {completed ? 'درس مكتمل' : busy ? 'جارٍ الحفظ…' : 'تحديد كمكتمل'}
            </button>
          </div>
        </Card>
        <Card>
          <SectionTitle title="معلومات الدرس" />
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex justify-between">
              <span>المادة</span>
              <span className="font-semibold">{lesson.subjectName ?? '—'}</span>
            </li>
            <li className="flex justify-between">
              <span>تاريخ النشر</span>
              <span className="font-semibold">{formatDate(lesson.createdAt)}</span>
            </li>
            <li className="flex justify-between">
              <span>الحالة</span>
              <Badge tone={completed ? 'green' : 'slate'}>{completed ? 'مكتمل' : 'غير مكتمل'}</Badge>
            </li>
          </ul>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            يمكنك حفظ الصفحة في وضع دون اتصال من صفحة «دون إنترنت» بعد تنزيل الملفات.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Assignments() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .get<any>('/api/student/assignments')
      .then((data) => setRows(asList<Assignment>(data, 'assignments')))
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الواجبات'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submit = async (event: FormEvent, assignmentId: string) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post(`/api/student/assignments/${assignmentId}/submit`, { text, fileUrl: fileUrl || null });
      setNotice('تم تسليم الواجب بنجاح.');
      setActiveId(null);
      setText('');
      setFileUrl('');
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تسليم الواجب');
    }
  };

  const onFile = async (file: File) => {
    setError('');
    try {
      const uploaded = await uploadFile(file, setProgress);
      setFileUrl(uploaded.url);
      setProgress(100);
    } catch (err: any) {
      setError(err?.message ?? 'فشل رفع الملف');
    }
  };

  if (loading) return <Loading label="جارٍ تحميل الواجبات…" />;

  return (
    <div>
      <PageHeader title="الواجبات" subtitle="سلّم واجباتك وتابع التصحيح والدرجات" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {rows.length === 0 ? (
        <EmptyState title="لا واجبات حاليًا" />
      ) : (
        <div className="space-y-3">
          {rows.map((assignment) => (
            <Card key={assignment.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-800">{assignment.title}</h3>
                  <p className="text-xs text-slate-500">
                    {assignment.subjectName ?? 'مادة'} · آخر موعد {formatDate(assignment.dueDate)} · الدرجة {assignment.maxScore ?? 100}
                  </p>
                </div>
                <Badge tone={assignment.submitted ? 'green' : 'amber'}>
                  {assignment.submitted ? 'تم التسليم' : 'بانتظار التسليم'}
                </Badge>
              </div>
              {assignment.description && <p className="mt-2 text-sm text-slate-600">{assignment.description}</p>}
              {assignment.submitted && assignment.score != null && (
                <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
                  الدرجة: {assignment.score} / {assignment.maxScore ?? 100}
                  {assignment.feedback ? ` — ملاحظة المعلم: ${assignment.feedback}` : ''}
                </p>
              )}
              {!assignment.submitted && (
                <div className="mt-3">
                  {activeId === assignment.id ? (
                    <form onSubmit={(event) => submit(event, assignment.id)} className="space-y-3">
                      <textarea
                        className="input min-h-24"
                        placeholder="اكتب حلّك هنا…"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="file"
                          className="text-sm"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onFile(file);
                          }}
                        />
                        {progress > 0 && progress < 100 && <span className="text-xs text-slate-500">رفع {progress}%</span>}
                        {fileUrl && <Badge tone="green">تم رفع الملف</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary">تسليم الواجب</button>
                        <button type="button" className="btn-secondary" onClick={() => setActiveId(null)}>
                          إلغاء
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" className="btn-primary" onClick={() => setActiveId(assignment.id)}>
                      حل الواجب
                    </button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Quizzes() {
  const [rows, setRows] = useState<QuizRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/api/student/quizzes')
      .then((data) => setRows(asList<QuizRow>(data, 'quizzes')))
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الاختبارات'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading label="جارٍ تحميل الاختبارات…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div>
      <PageHeader title="الاختبارات" subtitle="اختبارات قصيرة مع تصحيح فوري" />
      {rows.length === 0 ? (
        <EmptyState title="لا اختبارات متاحة" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((quiz) => (
            <Card key={quiz.id}>
              <h3 className="font-bold text-slate-800">{quiz.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {quiz.questionsCount ?? 0} سؤال · {quiz.durationMin ?? 0} دقيقة · {quiz.teacherName ?? 'معلم'}
              </p>
              {quiz.description && <p className="mt-2 text-sm text-slate-600">{quiz.description}</p>}
              <div className="mt-3 flex items-center gap-2">
                {quiz.attempt ? (
                  <Badge tone="green">
                    نتيجتك: {quiz.attempt.score} / {quiz.attempt.total}
                  </Badge>
                ) : (
                  <NavLink to={`/student/quizzes/${quiz.id}`} className="btn-primary">
                    بدء الاختبار
                  </NavLink>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizRunner() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<any>(`/api/student/quizzes/${id}`)
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الاختبار'));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل الاختبار…" />;

  const quiz = data.quiz ?? data;
  const questions: { id: string; text: string; options: string[] }[] = quiz.questions ?? [];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = questions.map((question) => answers[question.id] ?? -1);
      const response = await api.post<any>(`/api/student/quizzes/${id}/submit`, { answers: payload });
      setResult(response);
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تسليم الاختبار');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const attempt = result.attempt ?? {};
    return (
      <div>
        <PageHeader title="نتيجة الاختبار" subtitle={quiz.title} />
        <Card>
          <p className="text-lg font-bold text-slate-800">
            {attempt.score ?? 0} من {attempt.total ?? questions.length}
          </p>
          <Progress value={attempt.total ? Math.round(((attempt.score ?? 0) / attempt.total) * 100) : 0} />
          <p className="mt-2 text-sm text-slate-600">تم حفظ النتيجة. يمكنك مراجعة نتائجك من صفحة النتائج.</p>
          <NavLink to="/student/results" className="btn-primary mt-4 inline-flex">
            عرض كل النتائج
          </NavLink>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={quiz.title} subtitle={`${questions.length} سؤال · ${quiz.durationMin ?? 0} دقيقة`} />
      {data.attempt && <Alert tone="warn">لقد أدّيت هذا الاختبار مسبقًا، وإعادة الإرسال قد تُحدّث نتيجتك.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <Card key={question.id}>
            <p className="font-semibold text-slate-800">
              {index + 1}. {question.text}
            </p>
            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === optionIndex}
                    onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <button type="button" onClick={submit} disabled={busy} className="btn-primary mt-4">
        {busy ? 'جارٍ التسليم…' : 'تسليم الاختبار'}
      </button>
    </div>
  );
}

function Results() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<any>('/api/student/results')
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل النتائج'));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل النتائج…" />;

  const attempts: any[] = data.attempts ?? [];
  const graded: any[] = data.gradedAssignments ?? [];

  return (
    <div>
      <PageHeader title="النتائج" subtitle="نتائج الاختبارات والواجبات المصححة" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="نتائج الاختبارات" />
          {attempts.length === 0 ? (
            <EmptyState title="لا نتائج بعد" />
          ) : (
            <div className="space-y-2">
              {attempts.map((attempt, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">{attempt.quizTitle}</span>
                    <span className="text-slate-600">{attempt.percentage ?? 0}%</span>
                  </div>
                  <Progress value={attempt.percentage ?? 0} />
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle title="الواجبات المصححة" />
          {graded.length === 0 ? (
            <EmptyState title="لا واجبات مصححة بعد" />
          ) : (
            <div className="space-y-2">
              {graded.map((row, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">{row.assignmentTitle}</span>
                    <span className="text-slate-600">
                      {row.score} / {row.maxScore}
                    </span>
                  </div>
                  <Progress value={row.percentage ?? 0} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Live() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState<LiveToken | null>(null);
  const [title, setTitle] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    api
      .get<any>('/api/student/live')
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل المحاضرات'));
  }, []);

  useEffect(load, [load]);

  const join = async (session: LiveSession) => {
    setError('');
    setBusyId(session.id);
    try {
      const response = await api.post<LiveToken & { token: string }>(`/api/student/live/${session.id}/join`);
      setToken(response);
      setTitle(session.title);
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر الانضمام للمحاضرة');
    } finally {
      setBusyId('');
    }
  };

  const leave = async () => {
    setToken(null);
    load();
  };

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل المحاضرات…" />;

  const sessions: LiveSession[] = asList<LiveSession>(data, 'sessions');
  const livekit = data.livekit ?? {};

  return (
    <div>
      <PageHeader title="المحاضرات المباشرة" subtitle="انضم للمحاضرات القادمة أو شاهد التسجيلات" />
      {!livekit.configured && (
        <Alert tone="warn">
          خدمة البث المباشر غير مهيأة على الخادم بعد. أضف LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET من إعدادات البيئة لتفعيل البث.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {sessions.length === 0 ? (
        <EmptyState title="لا محاضرات مجدولة" description="ستظهر المحاضرات التي ينشئها معلموك هنا." />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800">{session.title}</h3>
                  <p className="text-xs text-slate-500">
                    {session.subjectName ?? 'مادة'} · {formatDateTime(session.scheduledAt ?? session.startedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={session.status === 'live' ? 'green' : session.status === 'ended' ? 'slate' : 'brand'}>
                    {session.status === 'live' ? 'مباشر' : session.status === 'ended' ? 'منتهية' : 'مجدولة'}
                  </Badge>
                  {session.status === 'live' && (
                    <button type="button" className="btn-primary" disabled={busyId === session.id} onClick={() => join(session)}>
                      {busyId === session.id ? 'جارٍ الاتصال…' : 'انضمام'}
                    </button>
                  )}
                  {session.status === 'ended' && session.recordingUrl && (
                    <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                      مشاهدة التسجيل
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {token && <LiveRoom title={title} token={token} role="student" onClose={leave} />}
    </div>
  );
}

function Notifications() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get<any>('/api/student/notifications')
      .then((data) => setRows(asList<Notification>(data, 'notifications')))
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الإشعارات'));
  }, []);

  useEffect(load, [load]);

  const markAll = async () => {
    await api.post('/api/student/notifications/read-all').catch(() => undefined);
    load();
  };

  return (
    <div>
      <PageHeader
        title="الإشعارات"
        subtitle="تنبيهات الواجبات والمحاضرات والإعلانات"
        action={
          <button type="button" className="btn-secondary" onClick={markAll}>
            تعليم الكل كمقروء
          </button>
        }
      />
      {error && <ErrorBox message={error} />}
      {rows.length === 0 ? (
        <EmptyState title="لا إشعارات" />
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <Card key={item.id} className={item.read ? '' : 'border-brand-200 bg-brand-50/40'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                </div>
                {!item.read && <Badge tone="brand">جديد</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Messages() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ toId: '', body: '' });

  const load = useCallback(() => {
    api
      .get<any>('/api/student/messages')
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل الرسائل'));
  }, []);

  useEffect(load, [load]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/student/messages', form);
      setForm({ toId: form.toId, body: '' });
      setNotice('تم إرسال الرسالة.');
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إرسال الرسالة');
    }
  };

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل الرسائل…" />;

  const messages: Message[] = data.messages ?? [];
  const teachers: { id: string; fullName: string; subjectName?: string }[] = data.teachers ?? [];

  return (
    <div>
      <PageHeader title="التواصل مع المعلمين" subtitle="أسئلة ومتابعة دراسية داخل المنصة" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="المحادثات" />
          {messages.length === 0 ? (
            <EmptyState title="لا رسائل بعد" description="اختر معلمًا وابدأ المحادثة." />
          ) : (
            <div className="space-y-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-xl p-3 text-sm ${
                    message.direction === 'out' ? 'mr-auto bg-brand-600 text-white' : 'ml-auto bg-slate-100 text-slate-800'
                  }`}
                >
                  <p className="text-xs opacity-70">{message.direction === 'out' ? 'أنت' : message.fromName ?? 'معلم'}</p>
                  <p className="mt-1">{message.body}</p>
                  <p className="mt-1 text-[10px] opacity-60">{formatDateTime(message.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle title="رسالة جديدة" />
          <form onSubmit={send} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">المعلم</span>
              <select
                className="input"
                value={form.toId}
                onChange={(event) => setForm({ ...form, toId: event.target.value })}
                required
              >
                <option value="">اختر معلمًا</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.fullName} {teacher.subjectName ? `— ${teacher.subjectName}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">الرسالة</span>
              <textarea
                className="input min-h-24"
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                required
              />
            </label>
            <button className="btn-primary w-full">إرسال</button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function StudentPortal() {
  const items = useMemo(() => nav, []);
  return (
    <div className="container-page py-8">
      <PortalNav />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="lessons/:id" element={<LessonDetail />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="quizzes" element={<Quizzes />} />
        <Route path="quizzes/:id" element={<QuizRunner />} />
        <Route path="results" element={<Results />} />
        <Route path="live" element={<Live />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="messages" element={<Messages />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>
      <p className="sr-only">{items.length} أقسام</p>
    </div>
  );
}
