import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, EmptyState, Loading, PageHeader } from '../components/ui';
import type { Book, College, CollegeProgram, District, School, Subject } from '../../shared/types';

interface Results {
  query: string;
  districts: District[];
  schools: (School & { districtName?: string })[];
  books: (Book & { gradeName?: string })[];
  subjects: Subject[];
  colleges: College[];
  programs: CollegeProgram[];
}

const EMPTY: Results = {
  query: '',
  districts: [],
  schools: [],
  books: [],
  subjects: [],
  colleges: [],
  programs: [],
};

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [data, setData] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = params.get('q') ?? '';
    if (!query.trim()) {
      setData(EMPTY);
      return;
    }
    setLoading(true);
    api
      .get<Results>(`/api/public/search?q=${encodeURIComponent(query)}`)
      .then(setData)
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false));
  }, [params]);

  const total = useMemo(
    () =>
      data.schools.length +
      data.books.length +
      data.subjects.length +
      data.colleges.length +
      data.programs.length +
      data.districts.length,
    [data],
  );

  return (
    <div className="container-page py-8">
      <PageHeader title="البحث في المنصة" subtitle="ابحث عن مدرسة أو كتاب أو مادة أو كلية أو تخصص" />

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams();
          if (q.trim()) next.set('q', q.trim());
          setParams(next);
        }}
      >
        <input
          className="field flex-1"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="مثال: عتق، رياضيات، كلية التربية…"
          autoFocus
        />
        <button type="submit" className="btn-primary">بحث</button>
      </form>

      {loading && <Loading label="جارٍ البحث…" />}

      {!loading && data.query && total === 0 && (
        <EmptyState title="لا توجد نتائج" hint={`لم نجد نتائج مطابقة لـ «${data.query}».`} />
      )}

      {!loading && total > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            {total} نتيجة لـ «{data.query}»
          </p>

          {data.schools.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">المدارس ({data.schools.length})</h2>
              <ul className="divide-y divide-slate-100">
                {data.schools.map((school) => (
                  <li key={school.id} className="py-2.5">
                    <Link to={`/schools/${school.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-700">
                      {school.name}
                    </Link>
                    <span className="mr-2 text-xs text-slate-500">{school.districtName}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.books.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">الكتب ({data.books.length})</h2>
              <ul className="divide-y divide-slate-100">
                {data.books.map((book) => (
                  <li key={book.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{book.title}</span>
                    <span className="text-xs text-slate-500">{book.gradeName}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.subjects.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">المواد الدراسية ({data.subjects.length})</h2>
              <div className="flex flex-wrap gap-2">
                {data.subjects.map((subject) => (
                  <Link
                    key={subject.id}
                    to={`/library?subject=${subject.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-300"
                  >
                    {subject.name}
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {data.colleges.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">الكليات ({data.colleges.length})</h2>
              <ul className="divide-y divide-slate-100">
                {data.colleges.map((college) => (
                  <li key={college.id} className="py-2.5 text-sm">
                    <Link to="/universities" className="font-medium text-slate-800 hover:text-brand-700">
                      {college.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.programs.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">التخصصات ({data.programs.length})</h2>
              <ul className="divide-y divide-slate-100">
                {data.programs.map((program) => (
                  <li key={program.id} className="py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{program.name}</span>
                    <span className="mr-2 text-xs text-slate-500">{program.degree}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.districts.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">المديريات ({data.districts.length})</h2>
              <div className="flex flex-wrap gap-2">
                {data.districts.map((district) => (
                  <Link
                    key={district.id}
                    to={`/schools?district=${district.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm hover:border-brand-300"
                  >
                    {district.name}
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
