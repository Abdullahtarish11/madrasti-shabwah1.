import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { homeForRole, useAuth } from '../lib/auth';
import { Card, PageHeader } from '../components/ui';
import type { District, Grade, PublicUser, School } from '../../shared/types';

const ROLES = [
  { value: 'student', label: 'طالب', hint: 'دروس، كتب، واجبات ومحاضرات' },
  { value: 'teacher', label: 'معلم', hint: 'يتطلب اعتماد الإدارة قبل النشر' },
  { value: 'school_manager', label: 'مدير مدرسة', hint: 'متابعة مدرستك ومعلميها' },
];

function Alert({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-xl border px-4 py-2.5 text-sm ${
        kind === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-brand-200 bg-brand-50 text-brand-800'
      }`}
    >
      {children}
    </div>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeForRole(result.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <PageHeader title="تسجيل الدخول" subtitle="ادخل إلى حسابك في منصة مدرستي شبوة" />
        <Card className="p-6">
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert kind="error">{error}</Alert>}
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                className="field"
                type="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">كلمة المرور</label>
              <input
                className="field"
                type="password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ الدخول…' : 'دخول'}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to="/forgot-password" className="text-brand-700 hover:underline">نسيت كلمة المرور؟</Link>
            <Link to="/register" className="text-slate-500 hover:underline">ليس لديك حساب؟ سجّل الآن</Link>
          </div>
        </Card>

        <Card className="mt-4 p-4 text-xs leading-7 text-slate-500">
          <p className="font-semibold text-slate-700">حسابات تجريبية للاختبار:</p>
          <p dir="ltr" className="text-left">admin@madrasti.shabwah — Admin@2024</p>
          <p dir="ltr" className="text-left">teacher@madrasti.shabwah — Teacher@2024</p>
          <p dir="ltr" className="text-left">student@madrasti.shabwah — Student@2024</p>
          <p dir="ltr" className="text-left">manager@madrasti.shabwah — Manager@2024</p>
        </Card>
      </div>
    </div>
  );
}

export function Register() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [levels, setLevels] = useState<{ id: string; name: string; grades: Grade[] }[]>([]);
  const [form, setForm] = useState({
    role: 'student',
    fullName: '',
    email: '',
    password: '',
    phone: '',
    districtId: '',
    schoolId: '',
    gradeId: '',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<District[]>('/api/public/districts'),
      api.get<School[]>('/api/public/schools'),
      api.get<{ id: string; name: string; grades: Grade[] }[]>('/api/public/levels'),
    ])
      .then(([d, s, l]) => {
        setDistricts(d);
        setSchools(s);
        setLevels(l);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const districtSchools = form.districtId ? schools.filter((school) => school.districtId === form.districtId) : schools;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.post<{ user: PublicUser; pendingApproval: boolean }>('/api/auth/register', form);
      await refresh();
      if (result.pendingApproval) {
        setNotice('تم إنشاء حساب المعلم. يبقى الحساب بانتظار اعتماد الإدارة قبل النشر أو البث.');
        setTimeout(() => navigate('/teacher', { replace: true }), 1200);
      } else {
        navigate(homeForRole(result.user.role), { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="إنشاء حساب جديد" subtitle="اختر نوع الحساب وأكمل بياناتك" />
        <Card className="p-6">
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert kind="error">{error}</Alert>}
            {notice && <Alert kind="success">{notice}</Alert>}

            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => set('role', role.value)}
                  className={`rounded-xl border p-3 text-right transition ${
                    form.role === role.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-brand-300'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-800">{role.label}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{role.hint}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">الاسم الكامل</label>
                <input className="field" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required minLength={3} />
              </div>
              <div>
                <label className="label">البريد الإلكتروني</label>
                <input className="field" type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} required />
              </div>
              <div>
                <label className="label">كلمة المرور</label>
                <input className="field" type="password" dir="ltr" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} />
              </div>
              <div>
                <label className="label">رقم الهاتف</label>
                <input className="field" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+967…" />
              </div>
              <div>
                <label className="label">المديرية</label>
                <select
                  className="field"
                  value={form.districtId}
                  onChange={(e) => {
                    set('districtId', e.target.value);
                    set('schoolId', '');
                  }}
                >
                  <option value="">اختر المديرية</option>
                  {districts.map((district) => (
                    <option key={district.id} value={district.id}>{district.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">المدرسة</label>
                <select className="field" value={form.schoolId} onChange={(e) => set('schoolId', e.target.value)}>
                  <option value="">اختر المدرسة</option>
                  {districtSchools.map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </div>
              {form.role === 'student' && (
                <div className="sm:col-span-2">
                  <label className="label">الصف الدراسي</label>
                  <select className="field" value={form.gradeId} onChange={(e) => set('gradeId', e.target.value)} required>
                    <option value="">اختر الصف</option>
                    {levels.map((level) => (
                      <optgroup key={level.id} label={level.name}>
                        {level.grades.map((grade) => (
                          <option key={grade.id} value={grade.id}>{grade.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">يحدد صفك الدروس والواجبات والمحاضرات التي تظهر لك.</p>
                </div>
              )}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            لديك حساب؟ <Link to="/login" className="text-brand-700 hover:underline">تسجيل الدخول</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ message: string; devToken?: string }>('/api/auth/forgot-password', { email });
      setMessage(result.message);
      setDevToken(result.devToken ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إرسال الطلب');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <PageHeader title="استعادة كلمة المرور" subtitle="أدخل بريدك لإنشاء رابط إعادة التعيين" />
        <Card className="space-y-4 p-6">
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert kind="error">{error}</Alert>}
            {message && <Alert kind="success">{message}</Alert>}
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input className="field" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'جارٍ الإرسال…' : 'إرسال رابط الاستعادة'}
            </button>
          </form>
          {devToken && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
              <p className="font-semibold text-slate-700">وضع التطوير: رابط الاستعادة المباشر</p>
              <Link to={`/reset-password?token=${devToken}`} className="break-all text-brand-700 hover:underline">
                /reset-password?token={devToken.slice(0, 12)}…
              </Link>
              <p className="mt-1">عند ربط Supabase Auth يُرسَل الرابط إلى البريد تلقائيًا.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const token = params.get('token') ?? '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تحديث كلمة المرور');
    }
  };

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-md">
        <PageHeader title="تعيين كلمة مرور جديدة" />
        <Card className="p-6">
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert kind="error">{error}</Alert>}
            {done && <Alert kind="success">تم تحديث كلمة المرور. جارٍ تحويلك لتسجيل الدخول…</Alert>}
            <div>
              <label className="label">كلمة المرور الجديدة</label>
              <input className="field" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div>
              <label className="label">تأكيد كلمة المرور</label>
              <input className="field" type="password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={!token || done}>حفظ كلمة المرور</button>
            {!token && <p className="text-xs text-rose-600">الرابط لا يحتوي رمز استعادة صالح.</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}
