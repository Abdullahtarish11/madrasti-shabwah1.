import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Card, Loading, PageHeader } from '../components/ui';
import type { District, Grade, School } from '../../shared/types';

interface Detail {
  school: School & { districtName?: string; levelName?: string };
  grades: Grade[];
  teachers: { id: string; fullName: string; subjectIds: string[] }[];
  stats: { students: number; lessons: number; liveSessions: number };
}

export default function SchoolDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Detail>(`/api/public/schools/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <div className="container-page py-16">
        <Card className="p-6 text-center text-rose-600">{error}</Card>
      </div>
    );
  }
  if (!data) return <Loading />;

  const { school } = data;

  return (
    <div className="container-page py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link to="/schools" className="hover:text-brand-700">المدارس</Link>
        <span className="mx-2">/</span>
        <span>{school.name}</span>
      </nav>

      <PageHeader
        title={school.name}
        subtitle={`${school.districtName ?? ''} • ${school.address}`}
        action={<Badge tone={school.gender === 'بنات' ? 'rose' : 'brand'}>{school.gender}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">معلومات المدرسة</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['المديرية', school.districtName ?? '—'],
                ['المرحلة', school.levelName ?? '—'],
                ['الهاتف', school.phone || '—'],
                ['العنوان', school.address || '—'],
                ['عدد الطلاب', `${school.studentsCount}`],
                ['عدد المعلمين', `${school.teachersCount}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-bold">الصفوف المتاحة</h2>
            {data.grades.length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد صفوف مسجلة لهذه المدرسة.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.grades.map((grade) => (
                  <Link
                    key={grade.id}
                    to={`/library?grade=${grade.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700"
                  >
                    {grade.name}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-bold">معلمو المدرسة</h2>
            {data.teachers.length === 0 ? (
              <p className="text-sm text-slate-500">لا يوجد معلمون معتمدون مسجلون بعد.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.teachers.map((teacher) => (
                  <li key={teacher.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{teacher.fullName}</span>
                    <span className="text-xs text-slate-500">معلم</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">إحصاءات</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">طلاب مسجلون</span><span className="font-semibold">{data.stats.students}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">دروس منشورة</span><span className="font-semibold">{data.stats.lessons}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">محاضرات</span><span className="font-semibold">{data.stats.liveSessions}</span></div>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-bold">انضم إلى المدرسة</h2>
            <p className="text-sm leading-7 text-slate-500">
              عند إنشاء حساب طالب اختر مديريتك ومدرستك وصفك لتظهر لك الدروس والواجبات والمحاضرات الخاصة بك.
            </p>
            <Link to="/register" className="btn-primary mt-3 w-full">إنشاء حساب</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
