import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { roleLabel } from '../lib/format';
import { Alert, Badge, Card, Loading, PageHeader, SectionTitle } from '../components/ui';

interface Option {
  id: string;
  name: string;
}

export default function Profile() {
  const { user, refresh, loading } = useAuth();
  const [districts, setDistricts] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [grades, setGrades] = useState<Option[]>([]);
  const [form, setForm] = useState({ fullName: '', phone: '', bio: '', districtId: '', schoolId: '', gradeId: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      phone: user.phone ?? '',
      bio: user.bio ?? '',
      districtId: user.districtId ?? '',
      schoolId: user.schoolId ?? '',
      gradeId: user.gradeId ?? '',
    });
  }, [user]);

  useEffect(() => {
    api
      .get<{ districts: Option[]; schools: Option[]; grades: Option[] }>('/api/public/options')
      .then((data) => {
        setDistricts(data.districts ?? []);
        setSchools(data.schools ?? []);
        setGrades(data.grades ?? []);
      })
      .catch(() => undefined);
  }, []);

  if (loading) return <Loading label="جارٍ تحميل الملف الشخصي…" />;
  if (!user) return <Alert tone="warn">سجّل الدخول للوصول إلى ملفك الشخصي.</Alert>;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.patch('/api/auth/profile', {
        fullName: form.fullName,
        phone: form.phone,
        bio: form.bio,
        districtId: form.districtId || null,
        schoolId: form.schoolId || null,
        gradeId: form.gradeId || null,
      });
      await refresh();
      setNotice('تم حفظ بيانات الملف الشخصي.');
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/auth/change-password', passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      setNotice('تم تحديث كلمة المرور.');
    } catch (err: any) {
      setError(err?.message ?? 'تعذّر تحديث كلمة المرور');
    }
  };

  const filteredSchools = form.districtId
    ? schools.filter((school: any) => !school.districtId || school.districtId === form.districtId)
    : schools;

  return (
    <div className="container-page py-8">
      <PageHeader title="الملف الشخصي" subtitle="حدّث بياناتك وبيانات مدرستك وكلمة المرور" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
              {(user.fullName ?? 'م').slice(0, 1)}
            </div>
            <div>
              <p className="font-bold">{user.fullName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p className="flex items-center justify-between">
              <span>نوع الحساب</span>
              <Badge tone="brand">{roleLabel(user.role)}</Badge>
            </p>
            <p className="flex items-center justify-between">
              <span>حالة الحساب</span>
              <Badge tone={user.status === 'active' ? 'green' : 'amber'}>
                {user.status === 'active' ? 'نشط' : 'بانتظار الاعتماد'}
              </Badge>
            </p>
          </div>
          {user.role === 'teacher' && user.status !== 'active' && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              لا يمكن نشر الدروس أو بدء البث قبل اعتماد حسابك من إدارة المنصة.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="البيانات الأساسية" />
          {notice && <Alert tone="success">{notice}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">الاسم الكامل</span>
              <input
                className="input"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">رقم الهاتف</span>
              <input
                className="input"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="7xxxxxxxx"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">المديرية</span>
              <select
                className="input"
                value={form.districtId}
                onChange={(event) => setForm({ ...form, districtId: event.target.value, schoolId: '' })}
              >
                <option value="">بدون تحديد</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">المدرسة</span>
              <select
                className="input"
                value={form.schoolId}
                onChange={(event) => setForm({ ...form, schoolId: event.target.value })}
              >
                <option value="">بدون تحديد</option>
                {filteredSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
            {user.role === 'student' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">الصف</span>
                <select
                  className="input"
                  value={form.gradeId}
                  onChange={(event) => setForm({ ...form, gradeId: event.target.value })}
                >
                  <option value="">بدون تحديد</option>
                  {grades.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">نبذة</span>
              <textarea
                className="input min-h-24"
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                maxLength={500}
              />
            </label>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
              </button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2 lg:col-start-2">
          <SectionTitle title="كلمة المرور" subtitle="٨ أحرف على الأقل" />
          <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">كلمة المرور الحالية</span>
              <input
                type="password"
                className="input"
                value={passwords.currentPassword}
                onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">كلمة المرور الجديدة</span>
              <input
                type="password"
                className="input"
                value={passwords.newPassword}
                onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                minLength={8}
                required
              />
            </label>
            <div className="sm:col-span-2">
              <button className="btn-secondary">تحديث كلمة المرور</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
