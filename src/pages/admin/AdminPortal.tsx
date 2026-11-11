import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { formatDate, roleLabel } from '../../lib/format';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  SectionTitle,
  StatCard,
  Tabs,
} from '../../components/ui';

interface Overview {
  counts: Record<string, number>;
  recentUsers: { id: string; fullName: string; email: string; role: string; createdAt: string }[];
  pendingTeachers: { id: string; fullName: string; email: string; schoolName?: string | null }[];
  sources: { table: string; count: number; source: string }[];
  mode: string;
  livekit: { configured: boolean; url?: string };
}

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  schoolId?: string | null;
  gradeId?: string | null;
  districtId?: string | null;
  createdAt?: string;
}

type FieldType = 'text' | 'textarea' | 'number' | 'select';

interface Field {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface Entity {
  key: string;
  label: string;
  primary: string;
  fields: Field[];
}

const GENDERS = [
  { value: 'بنين', label: 'بنين' },
  { value: 'بنات', label: 'بنات' },
  { value: 'مختلط', label: 'مختلط' },
];

const AUDIENCES = [
  { value: 'all', label: 'الجميع' },
  { value: 'students', label: 'الطلاب' },
  { value: 'teachers', label: 'المعلمون' },
  { value: 'parents', label: 'أولياء الأمور' },
];

export default function AdminPortal() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [lookups, setLookups] = useState<Record<string, { id: string; name: string }[]>>({});
  const [entity, setEntity] = useState('districts');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    const [data, list] = await Promise.all([
      api.get<Overview>('/api/admin/overview'),
      api.get<AdminUser[]>('/api/admin/users'),
    ]);
    setOverview(data);
    setUsers(list);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الإدارة');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadOverview]);

  const loadLookups = useCallback(async () => {
    const fetchList = async (path: string) => {
      try {
        const data = await api.get<{ id: string; name: string }[] | { data?: { id: string; name: string }[] }>(path);
        const list = Array.isArray(data) ? data : (data as { data?: { id: string; name: string }[] }).data ?? [];
        return list.map((item) => ({ id: item.id, name: item.name }));
      } catch {
        return [];
      }
    };
    const [districts, levels, grades, colleges, subjects] = await Promise.all([
      fetchList('/api/public/districts'),
      fetchList('/api/public/levels'),
      fetchList('/api/public/grades'),
      fetchList('/api/admin/colleges'),
      fetchList('/api/admin/subjects'),
    ]);
    setLookups({ districts, levels, grades, colleges, subjects });
  }, []);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  const entities: Entity[] = useMemo(() => {
    const options = (list: { id: string; name: string }[] = []) =>
      list.map((item) => ({ value: item.id, label: item.name }));
    return [
      {
        key: 'districts',
        label: 'المديريات',
        primary: 'name',
        fields: [
          { key: 'name', label: 'اسم المديرية', required: true },
          { key: 'description', label: 'الوصف', type: 'textarea' },
        ],
      },
      {
        key: 'schools',
        label: 'المدارس',
        primary: 'name',
        fields: [
          { key: 'name', label: 'اسم المدرسة', required: true },
          { key: 'districtId', label: 'المديرية', type: 'select', options: options(lookups.districts), required: true },
          { key: 'levelId', label: 'المرحلة', type: 'select', options: options(lookups.levels) },
          { key: 'gender', label: 'النوع', type: 'select', options: GENDERS },
          { key: 'address', label: 'العنوان' },
          { key: 'phone', label: 'الهاتف' },
          { key: 'studentsCount', label: 'عدد الطلاب', type: 'number' },
          { key: 'teachersCount', label: 'عدد المعلمين', type: 'number' },
        ],
      },
      {
        key: 'colleges',
        label: 'الكليات',
        primary: 'name',
        fields: [
          { key: 'name', label: 'اسم الكلية', required: true },
          { key: 'universityName', label: 'الجامعة' },
          { key: 'districtId', label: 'المديرية', type: 'select', options: options(lookups.districts) },
          { key: 'dean', label: 'العميد' },
          { key: 'description', label: 'الوصف', type: 'textarea' },
        ],
      },
      {
        key: 'programs',
        label: 'التخصصات',
        primary: 'name',
        fields: [
          { key: 'name', label: 'اسم التخصص', required: true },
          { key: 'collegeId', label: 'الكلية', type: 'select', options: options(lookups.colleges), required: true },
          { key: 'degree', label: 'الدرجة العلمية' },
          { key: 'years', label: 'عدد السنوات', type: 'number' },
          { key: 'description', label: 'الوصف', type: 'textarea' },
        ],
      },
      {
        key: 'subjects',
        label: 'المواد',
        primary: 'name',
        fields: [
          { key: 'name', label: 'اسم المادة', required: true },
          { key: 'gradeId', label: 'الصف', type: 'select', options: options(lookups.grades), required: true },
          { key: 'code', label: 'الرمز' },
          { key: 'description', label: 'الوصف', type: 'textarea' },
        ],
      },
      {
        key: 'books',
        label: 'الكتب',
        primary: 'title',
        fields: [
          { key: 'title', label: 'عنوان الكتاب', required: true },
          { key: 'gradeId', label: 'الصف', type: 'select', options: options(lookups.grades), required: true },
          { key: 'subjectId', label: 'المادة', type: 'select', options: options(lookups.subjects), required: true },
          { key: 'term', label: 'الفصل الدراسي', type: 'select', options: [{ value: '1', label: 'الأول' }, { value: '2', label: 'الثاني' }] },
          { key: 'pages', label: 'عدد الصفحات', type: 'number' },
          { key: 'description', label: 'الوصف', type: 'textarea' },
        ],
      },
      {
        key: 'announcements',
        label: 'الإعلانات',
        primary: 'title',
        fields: [
          { key: 'title', label: 'العنوان', required: true },
          { key: 'body', label: 'النص', type: 'textarea', required: true },
          { key: 'audience', label: 'الجمهور', type: 'select', options: AUDIENCES },
          { key: 'districtId', label: 'المديرية (اختياري)', type: 'select', options: options(lookups.districts) },
        ],
      },
    ];
  }, [lookups]);

  const current = entities.find((item) => item.key === entity) ?? entities[0];

  const loadRows = useCallback(
    async (key: string) => {
      setRowsLoading(true);
      setError('');
      try {
        const data = await api.get<Record<string, unknown>[]>(`/api/admin/${key}`);
        setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تحميل السجلات');
        setRows([]);
      } finally {
        setRowsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (tab === 'content') void loadRows(entity);
  }, [tab, entity, loadRows]);

  function openCreate() {
    const initial: Record<string, string> = {};
    current.fields.forEach((field) => {
      initial[field.key] = field.type === 'select' ? field.options?.[0]?.value ?? '' : '';
    });
    setForm(initial);
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    const initial: Record<string, string> = {};
    current.fields.forEach((field) => {
      initial[field.key] = row[field.key] == null ? '' : String(row[field.key]);
    });
    setForm(initial);
    setEditing(row);
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      current.fields.forEach((field) => {
        const value = form[field.key] ?? '';
        if (field.type === 'number') payload[field.key] = value === '' ? 0 : Number(value);
        else payload[field.key] = value;
      });
      if (editing) await api.patch(`/api/admin/${current.key}/${String(editing.id)}`, payload);
      else await api.post(`/api/admin/${current.key}`, payload);
      setFormOpen(false);
      setNotice(editing ? 'تم تحديث السجل بنجاح.' : 'تمت إضافة السجل بنجاح.');
      await Promise.all([loadRows(current.key), loadOverview(), loadLookups()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ السجل');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row: Record<string, unknown>) {
    if (!window.confirm('هل تريد حذف هذا السجل نهائيًا؟')) return;
    setError('');
    try {
      await api.delete(`/api/admin/${current.key}/${String(row.id)}`);
      setNotice('تم حذف السجل.');
      await loadRows(current.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف السجل');
    }
  }

  async function approveTeacher(user: AdminUser) {
    setError('');
    try {
      await api.post(`/api/admin/teachers/${user.id}/approve`, {});
      setNotice(`تم اعتماد ${user.fullName} وأصبح قادرًا على النشر والبث.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد المعلم');
    }
  }

  async function changeUser(user: AdminUser, patch: Record<string, string>) {
    setError('');
    try {
      await api.patch(`/api/admin/users/${user.id}`, patch);
      setNotice('تم تحديث بيانات المستخدم.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث المستخدم');
    }
  }

  async function removeUser(user: AdminUser) {
    if (!window.confirm(`حذف حساب ${user.fullName}؟`)) return;
    setError('');
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      setNotice('تم حذف الحساب.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الحساب');
    }
  }

  if (loading) return <Loading label="جارٍ تحميل لوحة الإدارة..." />;
  if (!overview) return <ErrorBox message={error || 'تعذر تحميل البيانات'} onRetry={loadOverview} />;

  const filteredUsers = roleFilter ? users.filter((user) => user.role === roleFilter) : users;
  const counts = overview.counts ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة إدارة المنصة"
        subtitle="إدارة المحتوى والمستخدمين والاعتماد والتقارير في منصة مدرستي شبوة"
        action={
          <Badge tone={overview.mode === 'supabase' ? 'success' : 'warning'}>
            {overview.mode === 'supabase' ? 'متصلة بـ Supabase' : 'وضع البيانات المحلية'}
          </Badge>
        }
      />

      {error && <Alert kind="error" message={error} />}
      {notice && <Alert kind="success" message={notice} />}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'نظرة عامة' },
          { key: 'users', label: 'المستخدمون' },
          { key: 'content', label: 'المحتوى' },
          { key: 'database', label: 'قاعدة البيانات' },
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="المستخدمون" value={counts.users ?? users.length} />
            <StatCard label="المدارس" value={counts.schools ?? 0} />
            <StatCard label="الدروس" value={counts.lessons ?? 0} />
            <StatCard label="الكتب" value={counts.books ?? 0} />
          </div>

          <Card>
            <SectionTitle title="معلمون بانتظار الاعتماد" subtitle="لا يمكن للمعلم النشر أو البث قبل الاعتماد" />
            {overview.pendingTeachers.length === 0 ? (
              <EmptyState title="لا توجد طلبات اعتماد معلقة" />
            ) : (
              <div className="space-y-2">
                {overview.pendingTeachers.map((teacher) => (
                  <div
                    key={teacher.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
                  >
                    <div>
                      <p className="font-semibold">{teacher.fullName}</p>
                      <p className="text-xs text-slate-600">
                        {teacher.email} {teacher.schoolName ? `— ${teacher.schoolName}` : ''}
                      </p>
                    </div>
                    <button className="btn btn-primary" onClick={() => approveTeacher(teacher as AdminUser)}>
                      اعتماد المعلم
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title="أحدث المسجلين" />
              {overview.recentUsers.length === 0 ? (
                <EmptyState title="لا يوجد مستخدمون" />
              ) : (
                <div className="space-y-2">
                  {overview.recentUsers.slice(0, 6).map((user) => (
                    <div key={user.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                      <div>
                        <p className="text-sm font-semibold">{user.fullName}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                      <Badge>{roleLabel(user.role)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle title="حالة الخدمات" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <span>قاعدة البيانات</span>
                  <Badge tone={overview.mode === 'supabase' ? 'success' : 'warning'}>
                    {overview.mode === 'supabase' ? 'Supabase' : 'محلية (Seed)'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <span>البث المباشر LiveKit</span>
                  <Badge tone={overview.livekit?.configured ? 'success' : 'warning'}>
                    {overview.livekit?.configured ? 'مفعّل' : 'بانتظار المفاتيح'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <span>تخزين الملفات</span>
                  <Badge tone="success">madrasti-files</Badge>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <Card>
          <SectionTitle
            title="إدارة المستخدمين"
            subtitle={`${filteredUsers.length} مستخدم`}
            action={
              <select className="input w-44" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="">كل الأدوار</option>
                <option value="student">الطلاب</option>
                <option value="teacher">المعلمون</option>
                <option value="manager">مديرو المدارس</option>
                <option value="admin">مسؤولو المنصة</option>
              </select>
            }
          />
          {filteredUsers.length === 0 ? (
            <EmptyState title="لا يوجد مستخدمون مطابقون" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2">الاسم</th>
                    <th className="py-2">الدور</th>
                    <th className="py-2">الحالة</th>
                    <th className="py-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 align-middle">
                      <td className="py-2">
                        <p className="font-medium">{user.fullName}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="py-2">
                        <select
                          className="input w-36"
                          value={user.role}
                          onChange={(event) => changeUser(user, { role: event.target.value })}
                        >
                          <option value="student">طالب</option>
                          <option value="teacher">معلم</option>
                          <option value="manager">مدير مدرسة</option>
                          <option value="admin">مسؤول</option>
                        </select>
                      </td>
                      <td className="py-2">
                        <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
                          {user.status === 'active' ? 'نشط' : user.status === 'pending' ? 'بانتظار الاعتماد' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          {user.status !== 'active' && (
                            <button className="btn btn-primary btn-sm" onClick={() => changeUser(user, { status: 'active' })}>
                              تفعيل
                            </button>
                          )}
                          {user.status === 'active' && user.role !== 'admin' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => changeUser(user, { status: 'suspended' })}>
                              إيقاف
                            </button>
                          )}
                          {user.role !== 'admin' && (
                            <button className="btn btn-danger btn-sm" onClick={() => removeUser(user)}>
                              حذف
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'content' && (
        <Card>
          <SectionTitle
            title={`إدارة ${current.label}`}
            subtitle={`${rows.length} سجل`}
            action={
              <div className="flex gap-2">
                <select className="input w-44" value={entity} onChange={(event) => setEntity(event.target.value)}>
                  {entities.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" onClick={openCreate}>
                  إضافة
                </button>
              </div>
            }
          />
          {rowsLoading ? (
            <Loading label="جارٍ تحميل السجلات..." />
          ) : rows.length === 0 ? (
            <EmptyState title="لا توجد سجلات في هذا القسم" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2">الاسم</th>
                    <th className="py-2">تفاصيل</th>
                    <th className="py-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{String(row[current.primary] ?? '—')}</td>
                      <td className="py-2 text-xs text-slate-500">
                        {current.fields
                          .filter((field) => field.key !== current.primary && row[field.key] != null && row[field.key] !== '')
                          .slice(0, 3)
                          .map((field) => `${field.label}: ${String(row[field.key])}`)
                          .join(' • ') || '—'}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
                            تعديل
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeRow(row)}>
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'database' && (
        <div className="space-y-6">
          <Card>
            <SectionTitle title="حالة الربط بقاعدة البيانات" subtitle="لا يتم إنشاء أو حذف جداول من الواجهة" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">الوضع الحالي</p>
                <p className="font-semibold">{overview.mode === 'supabase' ? 'Supabase (المشروع الحالي)' : 'بيانات محلية مؤقتة'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">LiveKit</p>
                <p className="font-semibold">{overview.livekit?.configured ? 'المفاتيح مضبوطة' : 'بانتظار المفاتيح'}</p>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle title="الجداول المتصلة" subtitle="المصدر وحجم البيانات لكل جدول" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs text-slate-500">
                    <th className="py-2">الجدول</th>
                    <th className="py-2">المصدر</th>
                    <th className="py-2">عدد السجلات</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.sources ?? []).map((source) => (
                    <tr key={source.table} className="border-b border-slate-100">
                      <td className="py-2 font-mono text-xs">{source.table}</td>
                      <td className="py-2">{source.source}</td>
                      <td className="py-2">{source.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {formOpen && (
        <Modal title={`${editing ? 'تعديل' : 'إضافة'} — ${current.label}`} onClose={() => setFormOpen(false)}>
          <form className="space-y-3" onSubmit={submitForm}>
            {current.fields.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-slate-600">{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    className="input min-h-20"
                    value={form[field.key] ?? ''}
                    required={field.required}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                ) : field.type === 'select' ? (
                  <select
                    className="input"
                    value={form[field.key] ?? ''}
                    required={field.required}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  >
                    <option value="">— اختر —</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={form[field.key] ?? ''}
                    required={field.required}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                )}
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
                إلغاء
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <p className="text-center text-xs text-slate-400">
        آخر تحديث للوحة: {formatDate(new Date().toISOString())}
      </p>
    </div>
  );
}
