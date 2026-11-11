import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { homeForRole, useAuth } from '../lib/auth';
import { roleLabel } from '../lib/format';

const NAV = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/schools', label: 'المدارس' },
  { to: '/library', label: 'المكتبة والمناهج' },
  { to: '/universities', label: 'الجامعات' },
  { to: '/announcements', label: 'الإعلانات' },
  { to: '/offline', label: 'الدراسة دون إنترنت' },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
        م
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-slate-900">مدرستي شبوة</span>
        <span className="block text-[11px] text-slate-500">منصة التعليم الإلكتروني</span>
      </span>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, mode } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(term.trim())}`);
    setOpen(false);
  };

  return (
    <div className="flex min-h-screen flex-col">
      {!online && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          أنت غير متصل بالإنترنت — الكتب والدروس المحفوظة متاحة، والبث المباشر والدردشة تحتاجان اتصالًا.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-ghost !px-2 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="القائمة"
            >
              ☰
            </button>
            <Logo />
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <form onSubmit={submitSearch} className="hidden md:block">
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="ابحث عن مدرسة، كتاب، مادة…"
                className="w-52 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:w-60"
                aria-label="بحث"
              />
            </form>
            {user ? (
              <div className="flex items-center gap-2">
                <Link to={homeForRole(user.role)} className="btn-primary !px-3 !py-2 text-xs sm:text-sm">
                  لوحة {roleLabel(user.role)}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                  className="btn-ghost !px-2 !py-2 text-xs"
                >
                  خروج
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="btn-secondary !px-3 !py-2 text-xs sm:text-sm">
                  دخول
                </Link>
                <Link to="/register" className="btn-primary !px-3 !py-2 text-xs sm:text-sm">
                  حساب جديد
                </Link>
              </div>
            )}
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
            <form onSubmit={submitSearch} className="mb-2">
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="ابحث في المنصة…"
                className="field"
                aria-label="بحث"
              />
            </form>
            <div className="grid grid-cols-2 gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm leading-7 text-slate-500">
              منصة تعليمية تجمع مدارس مديريات شبوة والجامعات والكليات والدروس والمحاضرات المباشرة في مكان واحد.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              وضع التشغيل: {mode === 'supabase' ? 'متصل بقاعدة Supabase' : 'تخزين محلي (أضف مفاتيح Supabase للربط)'}
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">التعليم المدرسي</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/schools" className="hover:text-brand-700">المدارس والمديريات</Link></li>
              <li><Link to="/library" className="hover:text-brand-700">الكتب والمناهج PDF</Link></li>
              <li><Link to="/library" className="hover:text-brand-700">المواد الدراسية</Link></li>
              <li><Link to="/offline" className="hover:text-brand-700">التنزيل والدراسة دون إنترنت</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">التعليم الجامعي</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/universities" className="hover:text-brand-700">الجامعات والكليات</Link></li>
              <li><Link to="/universities" className="hover:text-brand-700">التخصصات والبرامج</Link></li>
              <li><Link to="/announcements" className="hover:text-brand-700">الأخبار التعليمية</Link></li>
              <li><Link to="/search" className="hover:text-brand-700">البحث الشامل</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">الحسابات</h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/login" className="hover:text-brand-700">تسجيل الدخول</Link></li>
              <li><Link to="/register" className="hover:text-brand-700">إنشاء حساب</Link></li>
              <li><Link to="/forgot-password" className="hover:text-brand-700">استعادة كلمة المرور</Link></li>
              <li><Link to="/profile" className="hover:text-brand-700">الملف الشخصي</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} مدرستي شبوة — محافظة شبوة، اليمن
        </div>
      </footer>
    </div>
  );
}
