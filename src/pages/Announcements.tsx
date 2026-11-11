import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader } from '../components/ui';
import type { Announcement } from '../../shared/types';

const AUDIENCES = [
  { value: '', label: 'الجميع' },
  { value: 'student', label: 'الطلاب' },
  { value: 'teacher', label: 'المعلمون' },
  { value: 'all', label: 'عام' },
];

export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [audience, setAudience] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = audience ? `?audience=${audience}` : '';
    api
      .get<Announcement[]>(`/api/public/announcements${query}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [audience]);

  return (
    <div className="container-page py-8">
      <PageHeader title="الإعلانات والأخبار التعليمية" subtitle="أحدث إعلانات المنصة والمدارس والمحاضرات" />

      <div className="mb-5 flex flex-wrap gap-2">
        {AUDIENCES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setAudience(item.value)}
            className={`rounded-xl px-3 py-1.5 text-sm transition ${
              audience === item.value
                ? 'bg-brand-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="لا توجد إعلانات" hint="ستظهر هنا إعلانات الإدارة والمعلمين." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-slate-800">{item.title}</h2>
                <div className="flex items-center gap-2">
                  {item.pinned && <Badge tone="amber">مثبت</Badge>}
                  <Badge tone={item.audience === 'student' ? 'brand' : 'sky'}>
                    {item.audience === 'student' ? 'للطلاب' : item.audience === 'teacher' ? 'للمعلمين' : 'عام'}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-8 text-slate-600">{item.body}</p>
              <p className="mt-3 text-[11px] text-slate-400">{formatDate(item.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
