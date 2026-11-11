import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fileSize } from '../lib/format';
import { saveBookOffline, isBookSaved, removeBookOffline } from '../lib/offline';
import { Badge, Card, EmptyState, Loading, PageHeader } from '../components/ui';
import type { Book, EducationLevel, Grade, Subject } from '../../shared/types';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [levels, setLevels] = useState<(EducationLevel & { grades: Grade[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const gradeId = params.get('grade') ?? '';
  const subjectId = params.get('subject') ?? '';
  const term = params.get('term') ?? '';
  const q = params.get('q') ?? '';

  useEffect(() => {
    Promise.all([
      api.get<Book[]>('/api/public/books'),
      api.get<Subject[]>('/api/public/subjects'),
      api.get<Grade[]>('/api/public/grades'),
      api.get<(EducationLevel & { grades: Grade[] })[]>('/api/public/levels'),
    ])
      .then(([b, s, g, l]) => {
        setBooks(b);
        setSubjects(s);
        setGrades(g);
        setLevels(l);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(books.map(async (book) => [book.id, await isBookSaved(book.id)] as const)).then((entries) => {
      if (!cancelled) setSaved(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [books]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const gradeName = (id: string) => grades.find((grade) => grade.id === id)?.name ?? '';
  const subjectName = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? '';

  const filtered = useMemo(() => {
    return books.filter((book) => {
      if (gradeId && book.gradeId !== gradeId) return false;
      if (subjectId && book.subjectId !== subjectId) return false;
      if (term && String(book.term) !== term) return false;
      if (q) {
        const text = `${book.title} ${subjectName(book.subjectId)} ${gradeName(book.gradeId)}`;
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [books, gradeId, subjectId, term, q, grades, subjects]);

  const download = useCallback(async (book: Book) => {
    setBusy(book.id);
    setMessage('');
    try {
      await saveBookOffline(book);
      setSaved((prev) => ({ ...prev, [book.id]: true }));
      setMessage(`تم حفظ «${book.title}» للدراسة دون إنترنت.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر حفظ الملف');
    } finally {
      setBusy('');
    }
  }, []);

  if (loading) return <Loading />;

  const subjectOptions = gradeId ? subjects.filter((subject) => subject.gradeId === gradeId) : subjects;

  return (
    <div className="container-page py-8">
      <PageHeader
        title="المكتبة والمناهج الدراسية"
        subtitle="كتب ومواد بصيغة PDF — للقراءة أونلاين أو التنزيل للدراسة دون إنترنت"
        action={<Badge tone="brand">{filtered.length} كتاب</Badge>}
      />

      {message && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">{message}</div>
      )}

      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">الصف</label>
            <select className="field" value={gradeId} onChange={(event) => update('grade', event.target.value)}>
              <option value="">كل الصفوف</option>
              {levels.map((level) => (
                <optgroup key={level.id} label={level.name}>
                  {level.grades.map((grade) => (
                    <option key={grade.id} value={grade.id}>{grade.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المادة</label>
            <select className="field" value={subjectId} onChange={(event) => update('subject', event.target.value)}>
              <option value="">كل المواد</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">الفصل الدراسي</label>
            <select className="field" value={term} onChange={(event) => update('term', event.target.value)}>
              <option value="">الفصلان</option>
              <option value="1">الفصل الأول</option>
              <option value="2">الفصل الثاني</option>
            </select>
          </div>
          <div>
            <label className="label">بحث</label>
            <input
              className="field"
              value={q}
              onChange={(event) => update('q', event.target.value)}
              placeholder="عنوان الكتاب"
            />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="لا توجد كتب مطابقة" hint="غيّر الصف أو المادة أو كلمة البحث." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((book) => (
            <Card key={book.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-xl">📕</span>
                <div className="min-w-0">
                  <h3 className="font-bold leading-6 text-slate-800">{book.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {gradeName(book.gradeId)} • {subjectName(book.subjectId)}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{book.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge>الفصل {book.term}</Badge>
                <span>{book.pages} صفحة</span>
                <span>• {fileSize(book.sizeKb)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={book.fileUrl} target="_blank" rel="noreferrer" className="btn-secondary !py-2 text-xs">
                  عرض PDF
                </a>
                {saved[book.id] ? (
                  <>
                    <a href={`/offline?book=${book.id}`} className="btn-primary !py-2 text-xs">قراءة محفوظة</a>
                    <button
                      type="button"
                      className="btn-ghost !py-2 text-xs text-rose-600"
                      onClick={async () => {
                        await removeBookOffline(book.id);
                        setSaved((prev) => ({ ...prev, [book.id]: false }));
                      }}
                    >
                      إزالة
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-primary !py-2 text-xs"
                    disabled={busy === book.id}
                    onClick={() => void download(book)}
                  >
                    {busy === book.id ? 'جارٍ الحفظ…' : 'تنزيل للدراسة دون إنترنت'}
                  </button>
                )}
              </div>
              {!user && (
                <p className="mt-2 text-[11px] text-amber-600">
                  يمكنك حفظ الكتب دون تسجيل، لكن الدروس والواجبات تتطلب حسابًا.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
