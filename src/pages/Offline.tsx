import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSavedBookUrl, listSavedBooks, offlineSizeKb, removeBookOffline, type SavedBook } from '../lib/offline';
import { formatDate, fileSize } from '../lib/format';
import { Card, EmptyState, PageHeader } from '../components/ui';

export default function Offline() {
  const [params] = useSearchParams();
  const [books, setBooks] = useState<SavedBook[]>([]);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    setBooks(listSavedBooks());
    const handler = () => setOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

  useEffect(() => {
    const bookId = params.get('book');
    if (!bookId) return;
    getSavedBookUrl(bookId)
      .then((url) => {
        if (!url) {
          setError('هذا الكتاب غير محفوظ على هذا الجهاز.');
          return;
        }
        const item = listSavedBooks().find((book) => book.id === bookId);
        setPreview({ title: item?.title ?? 'كتاب محفوظ', url });
      })
      .catch(() => setError('تعذّر فتح الملف المحفوظ.'));
  }, [params]);

  return (
    <div className="container-page py-8">
      <PageHeader
        title="الدراسة دون إنترنت"
        subtitle="الكتب التي حفظتها على هذا الجهاز تبقى متاحة للقراءة دون اتصال"
        action={
          <span className={`badge ${online ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
            {online ? 'متصل بالإنترنت' : 'وضع دون اتصال'}
          </span>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">كتب محفوظة</p>
          <p className="mt-1 text-2xl font-bold">{books.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">الحجم على الجهاز</p>
          <p className="mt-1 text-2xl font-bold">{fileSize(offlineSizeKb())}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">البث المباشر</p>
          <p className="mt-1 text-sm font-semibold text-amber-600">يتطلب اتصالًا بالإنترنت</p>
        </Card>
      </div>

      {error && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{error}</div>}

      {preview && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-bold">{preview.title}</h2>
            <a href={preview.url} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 text-xs">
              فتح في تبويب جديد
            </a>
          </div>
          <iframe title={preview.title} src={preview.url} className="h-[70vh] w-full" />
        </Card>
      )}

      {books.length === 0 ? (
        <EmptyState
          title="لا توجد كتب محفوظة بعد"
          hint="افتح المكتبة واختر «تنزيل للدراسة دون إنترنت» لتحفظ الكتاب على جهازك."
        />
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <Card key={book.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-slate-800">{book.title}</p>
                <p className="text-xs text-slate-500">
                  {fileSize(book.sizeKb)} • حُفظ {formatDate(book.savedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !py-2 text-xs"
                  onClick={async () => {
                    const url = await getSavedBookUrl(book.id);
                    if (url) setPreview({ title: book.title, url });
                    else setError('تعذّر العثور على الملف المحفوظ.');
                  }}
                >
                  قراءة
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-2 text-xs text-rose-600"
                  onClick={async () => {
                    await removeBookOffline(book.id);
                    setBooks(listSavedBooks());
                    setPreview(null);
                  }}
                >
                  حذف
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 p-5 text-sm leading-8 text-slate-600">
        <h2 className="mb-2 font-bold text-slate-800">كيف يعمل العمل دون إنترنت؟</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>تُحفظ الكتب التي تنزّلها داخل ذاكرة المتصفح (Cache API) وتبقى متاحة بعد إغلاق التطبيق.</li>
          <li>تُخزَّن واجهة المنصة عبر Service Worker لتفتح بسرعة، مع إظهار صفحة بديلة عند انقطاع الشبكة.</li>
          <li>المحاضرات المباشرة والدردشة تحتاج اتصالًا دائمًا بالإنترنت، وتُعاد المحاولة تلقائيًا عند العودة.</li>
        </ul>
      </Card>
    </div>
  );
}
