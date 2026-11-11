import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Card, Loading, PageHeader } from '../components/ui';
import type { College, CollegeProgram } from '../../shared/types';

type CollegeRow = College & { programsCount?: number };

export default function Universities() {
  const [colleges, setColleges] = useState<CollegeRow[]>([]);
  const [programs, setPrograms] = useState<(CollegeProgram & { collegeName?: string })[]>([]);
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<CollegeRow[]>('/api/public/colleges'),
      api.get<(CollegeProgram & { collegeName?: string })[]>('/api/public/programs'),
    ])
      .then(([c, p]) => {
        setColleges(c);
        setPrograms(p);
        if (c[0]) setActive(c[0].id);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const current = colleges.find((college) => college.id === active);
  const currentPrograms = programs.filter((program) => program.collegeId === active);

  return (
    <div className="container-page py-8">
      <PageHeader
        title="الجامعات والكليات"
        subtitle="الكليات والأقسام والتخصصات والمقررات الجامعية في محافظة شبوة"
        action={<Badge tone="brand">{colleges.length} كلية • {programs.length} تخصص</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          {colleges.map((college) => (
            <button
              key={college.id}
              type="button"
              onClick={() => setActive(college.id)}
              className={`w-full rounded-xl border p-4 text-right transition ${
                active === college.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 bg-white hover:border-brand-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-800">{college.name}</h3>
                <Badge>{college.programsCount ?? 0} تخصص</Badge>
              </div>
              <p className="mt-1 text-xs leading-6 text-slate-500">{college.description}</p>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {current && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-slate-800">{current.name}</h2>
              <p className="mt-1 text-sm leading-7 text-slate-500">{current.description}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-xs text-slate-500">الدرجة العلمية</span>
                  <p className="font-medium">{current.degree}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-xs text-slate-500">مدة الدراسة</span>
                  <p className="font-medium">{current.durationYears} سنوات</p>
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {currentPrograms.map((program) => (
              <Card key={program.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-800">{program.name}</h3>
                  <Badge tone="sky">{program.degree}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-500">{program.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="rounded-lg bg-slate-100 px-2 py-1">المقررات: {program.coursesCount}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1">الساعات: {program.creditHours}</span>
                  <span className="rounded-lg bg-slate-100 px-2 py-1">الرسوم: {program.feesNote}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
