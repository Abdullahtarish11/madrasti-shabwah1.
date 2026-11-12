# ربط «مدرستي شبوة» بمشروع Supabase الحالي

المشروع المستهدف (موجود مسبقًا، لا يُنشأ مشروع جديد):

```
https://qxbvmspoegazzpryzcce.supabase.co
```

## 1. المتغيرات المطلوبة

تُضاف من **Settings → Environment variables** في AppJet (أو عبر زر **Connect Supabase**). لا تُكتب في الكود ولا تُرسل في المحادثة.

| المتغير | إلزامي | الاستخدام |
| --- | --- | --- |
| `SUPABASE_ANON_KEY` | نعم | تسجيل الدخول/التسجيل عبر Supabase Auth + طلبات المستخدم الخاضعة لـ RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | مُستحسن | قراءة الكتالوج العام على الخادم فقط (لا يصل للمتصفح أبدًا) |
| `SUPABASE_URL` | لا | افتراضيًا يستخدم رابط المشروع أعلاه |
| `SUPABASE_STORAGE_BUCKET` | لا | افتراضيًا `madrasti-files` |
| `VITE_SUPABASE_ANON_KEY` | بديل | يُقرأ كبديل عن `SUPABASE_ANON_KEY` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | للبث | توليد توكنات المحاضرات المباشرة على الخادم |

> ملاحظة: `service_role` لا يُستخدم في المتصفح إطلاقًا. الواجهة تتصل بالخادم فقط، والخادم يستخدم توكن المستخدم عند القراءة/الكتابة المحمية.

## 2. كيف يعمل الوضعان

- **وضع Supabase (الإنتاج):** يُفعّل تلقائيًا بمجرد وجود `SUPABASE_ANON_KEY` أو `SUPABASE_SERVICE_ROLE_KEY`.
  - لا يتم تسجيل الدخول بكلمات مرور محلية إطلاقًا، ولا تُقبل الحسابات التجريبية.
  - بيانات المدارس والمديريات والصفوف والمواد والكتب والجامعات تُقرأ من الجداول الحقيقية فقط، ولا تُخلط ببيانات البذرة التجريبية.
  - الملفات تُرفع إلى bucket `madrasti-files` وتُنزّل عبر الخادم بتوكن المستخدم.
- **الوضع التجريبي المعزول:** يُستخدم فقط عند غياب المفاتيح، ويحفظ في `DATA_DIR` على الخادم. منفصل تمامًا عن قاعدة البيانات الحقيقية.

## 3. الجداول الحالية المستخدمة (13 جدولًا — دون أي تعديل)

`districts`, `schools`, `education_levels`, `grades`, `subjects`, `books`, `colleges`, `college_programs`, `profiles`, `courses`, `lessons`, `enrollments`, `announcements`

القراءة تتحمل اختلاف أسماء الأعمدة (`district_id`/`districtId`، `full_name`/`name`، `file_url`/`pdf_url` …) حتى لا نغيّر مخططك.

## 4. جداول إضافية مقترحة — تحتاج موافقتك قبل أي SQL

لم تُنفّذ أي تغييرات على قاعدة البيانات. هذه الجداول لازمة لبقية مزايا المنصة (واجبات، اختبارات، محاضرات مباشرة، إشعارات، رسائل، حضور، إكمال الدروس):

```sql
-- مقترح فقط: لا يُنفّذ إلا بموافقتك الصريحة
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete cascade,
  title text not null,
  description text default '',
  due_at timestamptz,
  max_score int default 100,
  created_at timestamptz default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  content text default '',
  file_path text,
  score int,
  feedback text,
  submitted_at timestamptz default now(),
  unique (assignment_id, student_id)
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete cascade,
  title text not null,
  questions jsonb default '[]'::jsonb,
  duration_min int default 30,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  answers jsonb default '{}'::jsonb,
  score int default 0,
  submitted_at timestamptz default now()
);

create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete cascade,
  room_name text unique not null,
  title text not null,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  body text default '',
  kind text default 'general',
  link text,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade,
  recipient_id uuid references profiles(id) on delete cascade,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references live_sessions(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  left_at timestamptz,
  unique (session_id, student_id)
);

create table if not exists lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references lessons(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  completed_at timestamptz default now(),
  unique (lesson_id, student_id)
);
```

مع سياسات RLS مقترحة (أمثلة): الطالب يرى صفوفه فقط، المعلم يعدّل ما يخصه فقط، والإدارة ترى الكل عبر `is_admin()`.

## 5. تحقق سريع

```bash
npm run supabase:check
```

يطبع: هل المفاتيح موجودة، حالة الجداول الـ13، حالة bucket، وهل الاتصال يعمل. بدون مفاتيح يطبع `SKIP` بدل الفشل.
