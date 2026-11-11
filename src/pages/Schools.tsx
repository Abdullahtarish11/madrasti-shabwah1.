import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Card, EmptyState, Loading, PageHeader } from '../components/ui';
import type { District, EducationLevel, Grade, School } from '../../shared/types';

type SchoolRow = School & { districtName?: string };

export default function Schools() {
  const [params, setParams] = useSearchParams();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [levels, setLevels] = useState<(EducationLevel & { grades: Grade[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const districtId = params.get('district') ?? '';
  const levelId = params.get('level') ?? '';
  const gradeId = params.get('grade') ?? '';
  const gender = params.get('gender') ?? '';

  useEffect(() => {
    Promise.all([
      api.get<District[]>('/api/public/districts'),
      api.get<(EducationLevel & { grades: Grade[] })[]>('/api/public/levels'),
    ])
      .then(([d, l]) => {
        setDistricts(d);
        setLevels(l);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams();
    if (districtId) query.set('districtId', districtId);
    if (levelId) query.set('levelId', levelId);
    if (gradeId) query.set('gradeId', gradeId);
    if (gender) query.set('gender', gender);
    if (q.trim()) query.set('q', q.trim());
    api
      .get<SchoolRow[]>(`/api/public/schools?${query.toString()}`)
      .then(setSchools)
      .catch(() => setSchools([]))
      .finally(() => setLoading(false));
  }, [districtId, levelId, gradeId, gender, q]);

  const grades = useMemo(() => {
    const list = levels.flatMap((level) => level.grades);
    return levelId ? list.filter((grade) => grade.levelId === levelId) : list;
  }, [levels, levelId]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'level') next.delete('grade');
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page py-8">
      <PageHeader
        title="مدارس محافظة شبوة"
        subtitle="تصفّح المدارس حسب المديرية والمرحلة والصف"
        action={<Badge tone="brand">{schools.length} مدرسة</Badge>}
      />

      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">المديرية</label>
            <select className="field" value={districtId} onChange={(event) => update('district', event.target.value)}>
              <option value="">كل المديريات</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المرحلة</label>
            <select className="field" value={levelId} onChange={(event) => update('level', event.target.value)}>
              <option value="">كل المراحل</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الصف</label>
            <select className="field" value={gradeId} onChange={(event) => update('grade', event.target.value)}>
              <option value="">كل الصفوف</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">النوع</label>
            <select className="field" value={gender} onChange={(event) => update('gender', event.target.value)}>
              <option value="">الكل</option>
              <option value="بنين">بنين</option>
              <option value="بنات">بنات</option>
              <option value="مختلط">مختلط</option>
            </select>
          </div>
          <div>
            <label className="label">بحث</label>
            <input
              className="field"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="اسم المدرسة أو العنوان"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <Loading />
      ) : schools.length === 0 ? (
        <EmptyState title="لا توجد مدارس مطابقة" hint="جرّب تغيير المديرية أو المرحلة أو كلمة البحث." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((school) => (
            <Link
              key={school.id}
              to={`/schools/${school.id}`}
              className="card flex flex-col justify-between p-5 transition hover:border-brand-300 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-800">{school.name}</h3>
                  <Badge tone={school.gender === 'بنات' ? 'rose' : school.gender === 'بنين' ? 'sky' : 'brand'}>
                    {school.gender}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {school.districtName} • {school.address}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>👨‍🎓 {school.studentsCount} طالب</span>
                <span>👩‍🏫 {school.teachersCount} معلم</span>
                <span className="font-semibold text-brand-600">التفاصيل ←</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
