import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { Badge, Card, Loading, SectionTitle, StatCard } from '../components/ui';
import type { Announcement, Book, District } from '../../shared/types';

interface Overview {
  counts: {
    districts: number;
    schools: number;
    books: number;
    subjects: number;
    colleges: number;
    programs: number;
    students: number;
    teachers: number;
    lessons: number;
    liveSessions: number;
  };
  announcements: Announcement[];
  districts: District[];
  latestBooks: Book[];
  sources: { local: boolean; supabase: boolean };
  livekit: { configured: boolean };
  mode: 'local' | 'supabase';
}

const FEATURES = [
  { icon: '🏫', title: 'مدارس المديريات', text: 'تصفح مدارس شبوة حسب المديرية والمرحلة والصف.' },
  { icon: '📘', title: 'الكتب والمناهج', text: 'كتب ومقررات PDF قابلة للتنزيل والقراءة دون إنترنت.' },
  { icon: '🎓', title: 'الجامعات والكليات', text: 'الكليات والأقسام والتخصصات والمقررات الجامعية.' },
  { icon: '🎥', title: 'محاضرات مباشرة', text: 'بث صوت وصورة من هاتف المعلم مع دردشة وأسئلة.' },
];

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Overview>('/api/public/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="container-page py-16">
        <Card className="p-6 text-center text-rose-600">{error}</Card>
      </div>
    );
  }
  if (!data) return <Loading label="جارٍ تحميل المنصة…" />;

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-bl from-brand-800 via-brand-700 to-brand-900 text-white">
        <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_45%),radial-gradient(circle_at_80%_0,white_0,transparent_40%)]" />
        <div className="container-page relative grid gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <span className="badge bg-white/15 text-white">محافظة شبوة — اليمن</span>
            <h1 className="mt-4 text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">
              مدرستي شبوة
              <span className="mt-2 block text-lg font-medium text-brand-100 sm:text-xl">
                مدارس وجامعات ودروس ومحاضرات مباشرة في منصة واحدة
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-8 text-brand-50/90 sm:text-base">
              منصة تعليمية متكاملة تخدم جميع مديريات محافظة شبوة: تصفح المدارس والمناهج، تابع دروسك وواجباتك،
              واحضر المحاضرات المباشرة من هاتف معلمك — مع إمكانية الدراسة دون إنترنت للكتب والملفات المحفوظة.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={user ? '/student' : '/register'} className="btn bg-white text-brand-800 hover:bg-brand-50">
                {user ? 'الدخول إلى لوحتي' : 'أنشئ حسابك الآن'}
              </Link>
              <Link to="/schools" className="btn border border-white/40 text-white hover:bg-white/10">
                تصفح المدارس
              </Link>
              <Link to="/library" className="btn border border-white/40 text-white hover:bg-white/10">
                المكتبة والمناهج
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'مديرية', value: data.counts.districts },
                { label: 'مدرسة', value: data.counts.schools },
                { label: 'كتاب ومنهج', value: data.counts.books },
                { label: 'كلية جامعية', value: data.counts.colleges },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
                  <p className="text-xl font-bold">{item.value}</p>
                  <p className="text-[11px] text-brand-100">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 self-start rounded-2xl bg-white/10 p-4 backdrop-blur">
            <h2 className="text-sm font-bold text-white">حالة الخدمات</h2>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-xs">
              <span>قاعدة البيانات</span>
              <span className="font-semibold">
                {data.mode === 'supabase' ? 'Supabase متصلة' : 'تخزين محلي'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-xs">
              <span>البث المباشر</span>
              <span className="font-semibold">{data.livekit.configured ? 'LiveKit جاهز' : 'بانتظار مفاتيح LiveKit'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-xs">
              <span>دروس منشورة</span>
              <span className="font-semibold">{data.counts.lessons}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-xs">
              <span>معلمون معتمدون</span>
              <span className="font-semibold">{data.counts.teachers}</span>
            </div>
            <p className="text-[11px] leading-5 text-brand-100">
              البث المباشر والدردشة يحتاجان اتصالًا بالإنترنت. الكتب المحفوظة تعمل دون اتصال.
            </p>
          </div>
        </div>
      </section>

      <section className="container-page -mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <Card key={feature.title} className="p-5">
            <span className="text-2xl">{feature.icon}</span>
            <h3 className="mt-2 font-bold">{feature.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{feature.text}</p>
          </Card>
        ))}
      </section>

      <section className="container-page py-12">
        <SectionTitle
          title="مديريات محافظة شبوة"
          subtitle="اختر مديريتك لعرض المدارس التابعة لها"
          action={
            <Link to="/schools" className="text-sm font-semibold text-brand-700 hover:underline">
              جميع المدارس ←
            </Link>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.districts.map((district) => (
            <Link
              key={district.id}
              to={`/schools?district=${district.id}`}
              className="card group flex items-center justify-between p-4 transition hover:border-brand-300 hover:shadow-md"
            >
              <div>
                <p className="font-semibold text-slate-800 group-hover:text-brand-700">{district.name}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{district.description}</p>
              </div>
              <Badge tone="brand">{district.schoolsCount ?? 0} مدرسة</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-white py-12">
        <div className="container-page grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <SectionTitle
              title="أحدث الكتب والمناهج"
              subtitle="ملفات PDF متاحة للقراءة والتنزيل"
              action={
                <Link to="/library" className="text-sm font-semibold text-brand-700 hover:underline">
                  المكتبة ←
                </Link>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {data.latestBooks.map((book) => (
                <Link key={book.id} to={`/library?book=${book.id}`} className="card flex items-center gap-3 p-4 hover:border-brand-300">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-lg">📕</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{book.title}</p>
                    <p className="text-xs text-slate-500">
                      الفصل {book.term} • {book.pages} صفحة
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle
              title="الإعلانات والأخبار"
              action={
                <Link to="/announcements" className="text-sm font-semibold text-brand-700 hover:underline">
                  المزيد ←
                </Link>
              }
            />
            <div className="space-y-3">
              {data.announcements.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-800">{item.title}</h3>
                    {item.pinned && <Badge tone="amber">مثبت</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{item.body}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{formatDate(item.createdAt)}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="المواد الدراسية" value={data.counts.subjects} icon="📗" />
          <StatCard label="البرامج الجامعية" value={data.counts.programs} tone="sky" icon="🎓" />
          <StatCard label="الطلاب المسجلون" value={data.counts.students} tone="amber" icon="🧑‍🎓" />
          <StatCard label="المحاضرات" value={data.counts.liveSessions} tone="rose" icon="🎥" />
        </div>

        <div className="card mt-8 grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { role: 'طالب', text: 'دروس، كتب، واجبات، اختبارات، وبث مباشر', to: '/register' },
            { role: 'معلم', text: 'انشر دروسك وواجباتك وابدأ البث من هاتفك', to: '/register' },
            { role: 'مدير مدرسة', text: 'تابع مدرستك ومعلميها وطلابها', to: '/register' },
            { role: 'مسؤول المنصة', text: 'إدارة المحتوى والحسابات والتقارير', to: '/login' },
          ].map((item) => (
            <div key={item.role} className="rounded-xl border border-slate-200 p-4">
              <p className="font-bold text-brand-700">{item.role}</p>
              <p className="mt-1 text-xs leading-6 text-slate-500">{item.text}</p>
              <Link to={item.to} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
                ابدأ الآن ←
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
