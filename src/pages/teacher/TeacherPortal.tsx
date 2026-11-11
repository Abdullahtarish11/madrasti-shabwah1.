import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
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
  SectionTitle,
  StatCard,
} from '../../components/ui';
import { LiveRoom, type LiveToken } from '../../components/LiveRoom';

const nav = [
  { to: '/teacher', label: 'لوحة التحكم', end: true },
  { to: '/teacher/lessons', label: 'الدروس' },
  { to: '/teacher/assignments', label: 'الواجبات' },
  { to: '/teacher/quizzes', label: 'الاختبارات' },
  { to: '/teacher/students', label: 'الطلاب' },
  { to: '/teacher/live', label: 'المحاضرات المباشرة' },
  { to: '/teacher/announcements', label: 'الإعلانات' },
  { to: '/teacher/messages', label: 'الرسائل' },
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

interface Option {
  id: string;
  name: string;
}

function useCatalog() {
  const [grades, setGrades] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  useEffect(() => {
    const list = (data: any, key: string): Option[] => (Array.isArray(data) ? data : data?.[key] ?? []);
    api.get<any>('/api/public/grades').then((data) => setGrades(list(data, 'grades'))).catch(() => undefined);
    api.get<any>('/api/public/subjects').then((data) => setSubjects(list(data, 'subjects'))).catch(() => undefined);
  }, []);
  return { grades, subjects };
}

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<any>('/api/teacher/dashboard')
      .then(setData)
      .catch((err) => setError(err?.message ?? 'تعذّر تحميل لوحة التحكم'));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل لوحة المعلم…" />;

  const stats = data.stats ?? {};
  return (
    <div>
      <PageHeader
        title={`أهلًا ${data.user?.fullName ?? 'أستاذ'}`}
        subtitle={[data.school?.name, data.user?.status === 'active' ? 'حساب معتمد' : 'بانتظار الاعتماد'].filter(Boolean).join(' · ')}
      />
      {data.user?.status !== 'active' && (
        <Alert tone="warn">حسابك بانتظار اعتماد إدارة المنصة، ولا يمكنك النشر أو بدء البث قبل الاعتماد.</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الدروس" value={stats.lessons ?? 0} />
        <StatCard label="الواجبات" value={stats.assignments ?? 0} tone="brand" />
        <StatCard label="تسليمات بانتظار التصحيح" value={stats.pendingSubmissions ?? 0} tone="amber" />
        <StatCard label="الطلاب" value={stats.students ?? 0} tone="green" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="آخر التسليمات" />
          {(data.recentSubmissions ?? []).length === 0 ? (
            <EmptyState title="لا تسليمات جديدة" />
          ) : (
            <div className="space-y-2 text-sm">
              {data.recentSubmissions.slice(0, 6).map((row: any) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
                  <div>
                    <p className="font-semibold text-slate-800">{row.studentName ?? 'طالب'}</p>
                    <p className="text-xs text-slate-500">{row.assignmentTitle}</p>
                  </div>
                  <Badge tone={row.score != null ? 'green' : 'amber'}>{row.score != null ? `مصحح: ${row.score}` : 'بانتظار'}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle title="المحاضرات القادمة" />
          {(data.upcoming ?? []).length === 0 ? (
            <EmptyState title="لا محاضرات مجدولة" />
          ) : (
            <div className="space-y-2 text-sm">
              {data.upcoming.slice(0, 6).map((session: any) => (
                <div key={session.id} className="rounded-lg border border-slate-200 p-2">
                  <p className="font-semibold text-slate-800">{session.title}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(session.scheduledAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Lessons() {
  const { grades, subjects } = useCatalog();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', gradeId: '', subjectId: '', description: '', content: '', videoUrl: '', fileUrl: '', durationMin: 30 });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    api.get<any>('/api/teacher/lessons').then((data) => setRows(Array.isArray(data) ? data : data.lessons ?? [])).catch((err) => setError(err?.message ?? 'تعذّر تحميل الدروس'));
  }, []);

  useEffect(load, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/api/teacher/lessons', form);
      setNotice('تم إنشاء الدرس. يمكنك نشره من القائمة.');
      setForm({ title: '', gradeId: form.gradeId, subjectId: form.subjectId, description: '', content: '', videoUrl: '', fileUrl: '', durationMin: 30 });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إنشاء الدرس');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (lesson: any) => {
    try {
      await api.patch(`/api/teacher/lessons/${lesson.id}`, { published: !lesson.published });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحديث حالة النشر');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('حذف الدرس نهائيًا؟')) return;
    try {
      await api.del(`/api/teacher/lessons/${id}`);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر حذف الدرس');
    }
  };

  const attach = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setForm((prev) => ({ ...prev, fileUrl: uploaded.url }));
    } catch (err: any) {
      setError(err?.message ?? 'فشل رفع الملف');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader title="الدروس" subtitle="أنشئ الدروس وارفع الملفات وانشرها لطلابك" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle title="دروسي" />
          {rows.length === 0 ? (
            <EmptyState title="لا دروس بعد" description="ابدأ بإنشاء درس جديد." />
          ) : (
            <div className="space-y-2">
              {rows.map((lesson) => (
                <div key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="font-semibold text-slate-800">{lesson.title}</p>
                    <p className="text-xs text-slate-500">
                      {lesson.subjectName ?? lesson.subjectId} · {formatDate(lesson.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={lesson.published ? 'green' : 'slate'}>{lesson.published ? 'منشور' : 'مسودة'}</Badge>
                    <button type="button" className="btn-secondary text-xs" onClick={() => togglePublish(lesson)}>
                      {lesson.published ? 'إلغاء النشر' : 'نشر'}
                    </button>
                    <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => remove(lesson.id)}>
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="درس جديد" />
          <form onSubmit={create} className="space-y-3">
            <input className="input" placeholder="عنوان الدرس" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })} required>
                <option value="">الصف</option>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">المادة</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea className="input min-h-20" placeholder="وصف مختصر" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <textarea className="input min-h-32" placeholder="شرح الدرس" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <input className="input" placeholder="رابط فيديو (اختياري)" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input type="file" onChange={(e) => { const file = e.target.files?.[0]; if (file) attach(file); }} />
              {uploading && <span className="text-xs text-slate-500">جارٍ الرفع…</span>}
              {form.fileUrl && <Badge tone="green">ملف مرفوع</Badge>}
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'إنشاء الدرس'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Assignments() {
  const { grades, subjects } = useCatalog();
  const [rows, setRows] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', gradeId: '', subjectId: '', description: '', dueAt: '', maxScore: 20 });
  const [grading, setGrading] = useState<{ id: string; score: string; feedback: string } | null>(null);

  const load = useCallback(() => {
    api.get<any>('/api/teacher/assignments').then((data) => setRows(Array.isArray(data) ? data : data.assignments ?? [])).catch((err) => setError(err?.message ?? 'تعذّر تحميل الواجبات'));
  }, []);

  useEffect(load, [load]);

  const openSubmissions = async (assignment: any) => {
    setActiveAssignment(assignment);
    setError('');
    try {
      const data = await api.get<any>(`/api/teacher/assignments/${assignment.id}/submissions`);
      setSubmissions(Array.isArray(data) ? data : data.submissions ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحميل التسليمات');
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/teacher/assignments', { ...form, dueAt: form.dueAt || undefined });
      setNotice('تم إنشاء الواجب وإشعار الطلاب.');
      setForm({ title: '', gradeId: form.gradeId, subjectId: form.subjectId, description: '', dueAt: '', maxScore: 20 });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إنشاء الواجب');
    }
  };

  const grade = async (event: FormEvent) => {
    event.preventDefault();
    if (!grading) return;
    try {
      await api.post(`/api/teacher/submissions/${grading.id}/grade`, { score: Number(grading.score), feedback: grading.feedback });
      setNotice('تم رصد الدرجة وإشعار الطالب.');
      setGrading(null);
      if (activeAssignment) openSubmissions(activeAssignment);
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر رصد الدرجة');
    }
  };

  return (
    <div>
      <PageHeader title="الواجبات والتصحيح" subtitle="أنشئ واجبات ورصد الدرجات" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle title="واجباتي" />
          {rows.length === 0 ? (
            <EmptyState title="لا واجبات بعد" />
          ) : (
            <div className="space-y-2">
              {rows.map((assignment) => (
                <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="font-semibold text-slate-800">{assignment.title}</p>
                    <p className="text-xs text-slate-500">
                      آخر موعد {formatDate(assignment.dueAt)} · الدرجة {assignment.maxScore}
                    </p>
                  </div>
                  <button type="button" className="btn-secondary text-xs" onClick={() => openSubmissions(assignment)}>
                    التسليمات ({assignment.submissionsCount ?? 0})
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeAssignment && (
            <div className="mt-6">
              <SectionTitle title={`تسليمات: ${activeAssignment.title}`} />
              {submissions.length === 0 ? (
                <EmptyState title="لا تسليمات" />
              ) : (
                <div className="space-y-2">
                  {submissions.map((submission) => (
                    <div key={submission.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{submission.studentName ?? 'طالب'}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(submission.submittedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {submission.fileUrl && (
                            <a href={submission.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700">
                              الملف
                            </a>
                          )}
                          <Badge tone={submission.score != null ? 'green' : 'amber'}>
                            {submission.score != null ? `${submission.score}` : 'بانتظار التصحيح'}
                          </Badge>
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand-700"
                            onClick={() => setGrading({ id: submission.id, score: String(submission.score ?? ''), feedback: submission.feedback ?? '' })}
                          >
                            رصد الدرجة
                          </button>
                        </div>
                      </div>
                      {submission.text && <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">{submission.text}</p>}
                    </div>
                  ))}
                </div>
              )}
              {grading && (
                <form onSubmit={grade} className="mt-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={activeAssignment.maxScore ?? 100}
                    placeholder="الدرجة"
                    value={grading.score}
                    onChange={(e) => setGrading({ ...grading, score: e.target.value })}
                    required
                  />
                  <textarea
                    className="input min-h-16"
                    placeholder="ملاحظة للطالب"
                    value={grading.feedback}
                    onChange={(e) => setGrading({ ...grading, feedback: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button className="btn-primary">حفظ الدرجة</button>
                    <button type="button" className="btn-secondary" onClick={() => setGrading(null)}>
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="واجب جديد" />
          <form onSubmit={create} className="space-y-3">
            <input className="input" placeholder="عنوان الواجب" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })} required>
                <option value="">الصف</option>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">المادة</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea className="input min-h-20" placeholder="تعليمات الواجب" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">آخر موعد للتسليم</span>
              <input className="input" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            </label>
            <input className="input" type="number" min={1} placeholder="الدرجة القصوى" value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })} />
            <button className="btn-primary w-full">إنشاء الواجب</button>
          </form>
        </Card>
      </div>
    </div>
  );
}

interface DraftQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

function Quizzes() {
  const { grades, subjects } = useCatalog();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', gradeId: '', subjectId: '', description: '', durationMin: 20 });
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ text: '', options: ['', ''], correctIndex: 0 }]);

  const load = useCallback(() => {
    api.get<any>('/api/teacher/quizzes').then((data) => setRows(Array.isArray(data) ? data : data.quizzes ?? [])).catch((err) => setError(err?.message ?? 'تعذّر تحميل الاختبارات'));
  }, []);

  useEffect(load, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/teacher/quizzes', { ...form, questions });
      setNotice('تم إنشاء الاختبار.');
      setForm({ title: '', gradeId: form.gradeId, subjectId: form.subjectId, description: '', durationMin: 20 });
      setQuestions([{ text: '', options: ['', ''], correctIndex: 0 }]);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إنشاء الاختبار');
    }
  };

  return (
    <div>
      <PageHeader title="الاختبارات" subtitle="اختبارات قصيرة تُصحّح تلقائيًا" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle title="اختباراتي" />
          {rows.length === 0 ? (
            <EmptyState title="لا اختبارات بعد" />
          ) : (
            <div className="space-y-2">
              {rows.map((quiz) => (
                <div key={quiz.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-800">{quiz.title}</p>
                    <p className="text-xs text-slate-500">
                      {quiz.questionsCount ?? quiz.questions?.length ?? 0} سؤال · {quiz.durationMin} دقيقة
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-rose-600"
                    onClick={async () => {
                      if (!window.confirm('حذف الاختبار؟')) return;
                      await api.del(`/api/teacher/quizzes/${quiz.id}`).catch((err) => setError(err?.message ?? 'تعذّر الحذف'));
                      load();
                    }}
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="اختبار جديد" />
          <form onSubmit={create} className="space-y-3">
            <input className="input" placeholder="عنوان الاختبار" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })} required>
                <option value="">الصف</option>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">المادة</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <input className="input" type="number" min={5} placeholder="المدة بالدقائق" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />

            <div className="space-y-3">
              {questions.map((question, qIndex) => (
                <div key={qIndex} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">سؤال {qIndex + 1}</span>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-rose-600"
                        onClick={() => setQuestions(questions.filter((_, index) => index !== qIndex))}
                      >
                        إزالة
                      </button>
                    )}
                  </div>
                  <input
                    className="input mt-2"
                    placeholder="نص السؤال"
                    value={question.text}
                    onChange={(e) => {
                      const next = [...questions];
                      next[qIndex] = { ...question, text: e.target.value };
                      setQuestions(next);
                    }}
                    required
                  />
                  {question.options.map((option, oIndex) => (
                    <div key={oIndex} className="mt-2 flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={question.correctIndex === oIndex}
                        onChange={() => {
                          const next = [...questions];
                          next[qIndex] = { ...question, correctIndex: oIndex };
                          setQuestions(next);
                        }}
                      />
                      <input
                        className="input"
                        placeholder={`الخيار ${oIndex + 1}`}
                        value={option}
                        onChange={(e) => {
                          const next = [...questions];
                          const options = [...question.options];
                          options[oIndex] = e.target.value;
                          next[qIndex] = { ...question, options };
                          setQuestions(next);
                        }}
                        required
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-brand-700"
                    onClick={() => {
                      const next = [...questions];
                      next[qIndex] = { ...question, options: [...question.options, ''] };
                      setQuestions(next);
                    }}
                  >
                    + إضافة خيار
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => setQuestions([...questions, { text: '', options: ['', ''], correctIndex: 0 }])}
            >
              + إضافة سؤال
            </button>
            <button className="btn-primary w-full">إنشاء الاختبار</button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Students() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<any>('/api/teacher/students').then((data) => setRows(Array.isArray(data) ? data : data.students ?? [])).catch((err) => setError(err?.message ?? 'تعذّر تحميل الطلاب'));
  }, []);

  return (
    <div>
      <PageHeader title="الطلاب" subtitle="طلاب صفوفك ومتابعة تقدّمهم" />
      {error && <ErrorBox message={error} />}
      {rows.length === 0 ? (
        <EmptyState title="لا طلاب مرتبطون بصفوفك بعد" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-slate-500">
                <tr>
                  <th className="p-2">الطالب</th>
                  <th className="p-2">الصف</th>
                  <th className="p-2">المدرسة</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium text-slate-800">{student.fullName}</td>
                    <td className="p-2 text-slate-600">{student.gradeName ?? '—'}</td>
                    <td className="p-2 text-slate-600">{student.schoolName ?? '—'}</td>
                    <td className="p-2">
                      <Badge tone={student.status === 'active' ? 'green' : 'amber'}>{student.status === 'active' ? 'نشط' : 'موقوف'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Live() {
  const { grades, subjects } = useCatalog();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', gradeId: '', subjectId: '', description: '', scheduledAt: '', durationMin: 60, recordEnabled: false });
  const [token, setToken] = useState<LiveToken | null>(null);
  const [title, setTitle] = useState('');
  const [attendance, setAttendance] = useState<any[] | null>(null);

  const load = useCallback(() => {
    api.get<any>('/api/teacher/live').then(setData).catch((err) => setError(err?.message ?? 'تعذّر تحميل المحاضرات'));
  }, []);

  useEffect(load, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/teacher/live', { ...form, scheduledAt: form.scheduledAt || undefined });
      setNotice('تم إنشاء المحاضرة وإشعار الطلاب.');
      setForm({ title: '', gradeId: form.gradeId, subjectId: form.subjectId, description: '', scheduledAt: '', durationMin: 60, recordEnabled: false });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إنشاء المحاضرة');
    }
  };

  const startAndJoin = async (session: any) => {
    setError('');
    try {
      if (session.status !== 'live') await api.post(`/api/teacher/live/${session.id}/start`);
      const response = await api.post<LiveToken>(`/api/teacher/live/${session.id}/join`);
      setToken(response);
      setTitle(session.title);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر بدء البث');
    }
  };

  const end = async (session: any) => {
    if (!window.confirm('إنهاء المحاضرة لجميع الطلاب؟')) return;
    try {
      await api.post(`/api/teacher/live/${session.id}/end`);
      setNotice('تم إنهاء المحاضرة.');
      load();
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر إنهاء المحاضرة');
    }
  };

  const showAttendance = async (session: any) => {
    try {
      const response = await api.get<any>(`/api/teacher/attendance?sessionId=${session.id}`);
      setAttendance(Array.isArray(response) ? response : response.records ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحميل الحضور');
    }
  };

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل المحاضرات…" />;

  const sessions: any[] = data.sessions ?? [];
  const livekit = data.livekit ?? {};

  return (
    <div>
      <PageHeader title="المحاضرات المباشرة" subtitle="ابدأ البث من كاميرا وميكروفون جهازك" />
      {!livekit.configured && (
        <Alert tone="warn">
          خدمة LiveKit غير مهيأة. أضف LIVEKIT_URL و LIVEKIT_API_KEY و LIVEKIT_API_SECRET في متغيرات البيئة لتفعيل البث الفعلي.
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle title="محاضراتي" />
          {sessions.length === 0 ? (
            <EmptyState title="لا محاضرات بعد" />
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{session.title}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(session.scheduledAt)} · {session.maxParticipants ?? 40} مشارك كحد أقصى</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={session.status === 'live' ? 'green' : session.status === 'ended' ? 'slate' : 'brand'}>
                        {session.status === 'live' ? 'مباشر' : session.status === 'ended' ? 'منتهية' : 'مجدولة'}
                      </Badge>
                      {session.status !== 'ended' && (
                        <button type="button" className="btn-primary text-xs" onClick={() => startAndJoin(session)}>
                          {session.status === 'live' ? 'دخول البث' : 'بدء البث'}
                        </button>
                      )}
                      {session.status === 'live' && (
                        <button type="button" className="btn-secondary text-xs" onClick={() => end(session)}>
                          إنهاء
                        </button>
                      )}
                      <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => showAttendance(session)}>
                        الحضور
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {attendance && (
            <div className="mt-4">
              <SectionTitle title="سجل الحضور" action={<button type="button" className="text-xs text-slate-500" onClick={() => setAttendance(null)}>إغلاق</button>} />
              {attendance.length === 0 ? (
                <EmptyState title="لا سجلات حضور" />
              ) : (
                <div className="space-y-1 text-sm">
                  {attendance.map((record, index) => (
                    <div key={index} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                      <span>{record.studentName ?? record.name ?? 'طالب'}</span>
                      <span className="text-xs text-slate-500">
                        {record.minutes != null ? `${record.minutes} دقيقة` : formatDateTime(record.joinedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="محاضرة جديدة" />
          <form onSubmit={create} className="space-y-3">
            <input className="input" placeholder="عنوان المحاضرة" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })} required>
                <option value="">الصف</option>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
              <select className="input" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
                <option value="">المادة</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <input className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            <input className="input" type="number" min={15} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.recordEnabled} onChange={(e) => setForm({ ...form, recordEnabled: e.target.checked })} />
              طلب تسجيل المحاضرة (إن كانت الخطة تدعمه)
            </label>
            <button className="btn-primary w-full">جدولة المحاضرة</button>
          </form>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
            البث يعمل من كاميرا وميكروفون الهاتف أو الحاسوب، ويحتاج اتصالًا بالإنترنت. الدردشة داخل الغرفة عبر LiveKit.
          </p>
        </Card>
      </div>
      {token && <LiveRoom title={title} token={token} role="teacher" onClose={() => { setToken(null); load(); }} />}
    </div>
  );
}

function Announcements() {
  const { grades } = useCatalog();
  const [form, setForm] = useState({ title: '', body: '', gradeId: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/teacher/announcements', form);
      setNotice('تم نشر الإعلان وإشعار الطلاب.');
      setForm({ title: '', body: '', gradeId: form.gradeId });
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر نشر الإعلان');
    }
  };

  return (
    <div>
      <PageHeader title="الإعلانات والإشعارات" subtitle="أرسل إعلانًا لطلاب صفك" />
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Card className="max-w-2xl">
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="عنوان الإعلان" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <select className="input" value={form.gradeId} onChange={(e) => setForm({ ...form, gradeId: e.target.value })}>
            <option value="">كل صفوفي</option>
            {grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
          <textarea className="input min-h-28" placeholder="نص الإعلان" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <button className="btn-primary">نشر الإعلان</button>
        </form>
      </Card>
    </div>
  );
}

function Messages() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<any>('/api/teacher/messages').then(setData).catch((err) => setError(err?.message ?? 'تعذّر تحميل الرسائل'));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading label="جارٍ تحميل الرسائل…" />;

  const messages: any[] = Array.isArray(data) ? data : data.messages ?? [];

  return (
    <div>
      <PageHeader title="رسائل الطلاب" subtitle="أسئلة الطلاب ومتابعاتهم" />
      {messages.length === 0 ? (
        <EmptyState title="لا رسائل" />
      ) : (
        <div className="space-y-2">
          {messages.map((message) => (
            <Card key={message.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{message.fromName ?? message.studentName ?? 'طالب'}</p>
                  <p className="mt-1 text-sm text-slate-600">{message.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(message.createdAt)}</p>
                </div>
                {!message.read && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-700"
                    onClick={async () => {
                      await api.post(`/api/teacher/messages/${message.id}/read`).catch(() => undefined);
                      setData({ ...data, messages: messages.map((row) => (row.id === message.id ? { ...row, read: true } : row)) });
                    }}
                  >
                    تعليم كمقروء
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeacherPortal() {
  return (
    <div className="container-page py-8">
      <PortalNav />
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="quizzes" element={<Quizzes />} />
        <Route path="students" element={<Students />} />
        <Route path="live" element={<Live />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="messages" element={<Messages />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </div>
  );
}
