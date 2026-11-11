import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
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

interface ManagerTeacher {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  status: string;
  subjects: string[];
  lessonsCount: number;
}

interface ManagerStudent {
  id: string;
  fullName: string;
  email: string;
  status: string;
  gradeId?: string | null;
  gradeName?: string | null;
}

interface ManagerDashboard {
  user: { id: string; fullName: string; email: string; role: string };
  school: { id: string; name: string; address?: string; phone?: string; gender?: string } | null;
  district: { id: string; name: string } | null;
  stats: {
    teachers: number;
    pendingTeachers: number;
    students: number;
    lessons: number;
    assignments: number;
    submissions: number;
    liveSessions: number;
  };
  grades: { id: string; name: string }[];
  teachers: ManagerTeacher[];
  students: ManagerStudent[];
  liveSessions: {
    id: string;
    title: string;
    scheduledAt: string;
    status: string;
    teacherName?: string;
  }[];
  announcements: { id: string; title: string; body: string; createdAt: string }[];
}

export default function ManagerPortal() {
  const [data, setData] = useState<ManagerDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', body: '' });
  const [saving, setSaving] = useState(false);
  const [gradeFilter, setGradeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<ManagerDashboard>('/api/manager/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات المدرسة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await api.post('/api/manager/announcements', form);
      setForm({ title: '', body: '' });
      setNotice('تم نشر الإعلان وإشعار طلاب ومعلمي المدرسة.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر نشر الإعلان');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل بيانات المدرسة..." />;
  if (error && !data) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <ErrorBox message="لا توجد بيانات" onRetry={load} />;

  const students = gradeFilter
    ? data.students.filter((student) => student.gradeId === gradeFilter)
    : data.students;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.school ? `إدارة ${data.school.name}` : 'بوابة مدير المدرسة'}
        subtitle={`${data.district?.name ?? 'شبوة'} — متابعة المعلمين والطلاب والمحتوى داخل مدرستك`}
      />

      {error && <Alert kind="error" message={error} />}
      {notice && <Alert kind="success" message={notice} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="المعلمون" value={data.stats.teachers} hint={`${data.stats.pendingTeachers} بانتظار الاعتماد`} />
        <StatCard label="الطلاب" value={data.stats.students} />
        <StatCard label="الدروس المنشورة" value={data.stats.lessons} />
        <StatCard label="المحاضرات" value={data.stats.liveSessions} hint={`${data.stats.assignments} واجب`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="معلمو المدرسة" subtitle="الاعتماد النهائي يتم من إدارة المنصة" />
          {data.teachers.length === 0 ? (
            <EmptyState title="لا يوجد معلمون مسجلون في مدرستك بعد" />
          ) : (
            <div className="space-y-3">
              {data.teachers.map((teacher) => (
                <div key={teacher.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{teacher.fullName}</p>
                      <p className="text-xs text-slate-500">{teacher.email}</p>
                    </div>
                    <Badge tone={teacher.status === 'active' ? 'success' : 'warning'}>
                      {teacher.status === 'active' ? 'معتمد' : 'بانتظار الاعتماد'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {teacher.subjects.length ? teacher.subjects.join(' • ') : 'لم تُحدد المواد'} —{' '}
                    {teacher.lessonsCount} درس
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle title="إعلان لأبناء المدرسة" subtitle="يُرسل إشعارًا لطلاب ومعلمي المدرسة" />
          <form className="space-y-3" onSubmit={publish}>
            <input
              className="input"
              placeholder="عنوان الإعلان"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
            />
            <textarea
              className="input min-h-24"
              placeholder="نص الإعلان"
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
              required
            />
            <button className="btn btn-primary w-full" type="submit" disabled={saving}>
              {saving ? 'جارٍ النشر...' : 'نشر الإعلان'}
            </button>
          </form>

          {data.announcements.length > 0 && (
            <div className="mt-4 space-y-2">
              {data.announcements.slice(0, 4).map((announcement) => (
                <div key={announcement.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-semibold">{announcement.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(announcement.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="طلاب المدرسة"
          subtitle={`${students.length} طالبًا`}
          action={
            <select className="input w-48" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="">كل الصفوف</option>
              {data.grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          }
        />
        {students.length === 0 ? (
          <EmptyState title="لا يوجد طلاب مطابقون" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                  <th className="py-2">الطالب</th>
                  <th className="py-2">الصف</th>
                  <th className="py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100">
                    <td className="py-2">
                      <p className="font-medium">{student.fullName}</p>
                      <p className="text-xs text-slate-500">{student.email}</p>
                    </td>
                    <td className="py-2">{student.gradeName ?? '—'}</td>
                    <td className="py-2">
                      <Badge tone={student.status === 'active' ? 'success' : 'warning'}>
                        {student.status === 'active' ? 'نشط' : 'موقوف'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="محاضرات المعلمين" subtitle="أحدث المحاضرات المجدولة داخل المدرسة" />
        {data.liveSessions.length === 0 ? (
          <EmptyState title="لا توجد محاضرات مجدولة" />
        ) : (
          <div className="space-y-2">
            {data.liveSessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <p className="font-semibold">{session.title}</p>
                  <p className="text-xs text-slate-500">
                    {session.teacherName ?? 'معلم'} — {formatDateTime(session.scheduledAt)}
                  </p>
                </div>
                <Badge tone={session.status === 'live' ? 'success' : 'default'}>
                  {session.status === 'live' ? 'مباشر الآن' : session.status === 'ended' ? 'منتهية' : 'مجدولة'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
