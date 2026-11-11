import type {
  AppDatabase,
  Assignment,
  Book,
  College,
  CollegeProgram,
  District,
  EducationLevel,
  Grade,
  Lesson,
  LiveSession,
  Quiz,
  School,
  Subject,
  User,
} from '../shared/types';

/** Demo catalog for Shabwah governorate. Stored locally only, never written to Supabase. */
export const SHABWAH_DISTRICTS: string[] = [
  'عتق',
  'بيحان',
  'ميفعة',
  'حبان',
  'الروضة',
  'نصاب',
  'عرماء',
  'الصعيد',
  'الطلح',
  'جردان',
  'مرخة السفلى',
  'مرخة العليا',
  'رضوم',
  'دهر',
  'حطيب',
  'عزان',
  'أسيّلان',
];

const SUBJECTS_BASIC = [
  ['القرآن الكريم', 'QUR'],
  ['اللغة العربية', 'ARB'],
  ['الرياضيات', 'MATH'],
  ['العلوم', 'SCI'],
  ['الدراسات الاجتماعية', 'SOC'],
  ['اللغة الإنجليزية', 'ENG'],
  ['التربية الإسلامية', 'ISL'],
];

const SUBJECTS_SECONDARY = [
  ['القرآن الكريم', 'QUR'],
  ['اللغة العربية', 'ARB'],
  ['الرياضيات', 'MATH'],
  ['الفيزياء', 'PHY'],
  ['الكيمياء', 'CHM'],
  ['الأحياء', 'BIO'],
  ['اللغة الإنجليزية', 'ENG'],
  ['التاريخ', 'HIS'],
  ['الجغرافيا', 'GEO'],
];

const now = () => new Date().toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export function buildSeedDatabase(): AppDatabase {
  const districts: District[] = SHABWAH_DISTRICTS.map((name, index) => ({
    id: `d${index + 1}`,
    name,
    description: `مديرية ${name} - محافظة شبوة`,
  }));

  const levels: EducationLevel[] = [
    { id: 'lv1', name: 'التعليم الأساسي', order: 1 },
    { id: 'lv2', name: 'التعليم الثانوي', order: 2 },
  ];

  const grades: Grade[] = [];
  for (let i = 1; i <= 9; i += 1) {
    grades.push({ id: `g${i}`, levelId: 'lv1', name: `الصف ${arabicOrdinal(i)} الأساسي`, order: i });
  }
  for (let i = 10; i <= 12; i += 1) {
    grades.push({ id: `g${i}`, levelId: 'lv2', name: `الصف ${arabicOrdinal(i)} الثانوي`, order: i });
  }

  const subjects: Subject[] = [];
  for (const grade of grades) {
    const list = grade.levelId === 'lv2' ? SUBJECTS_SECONDARY : SUBJECTS_BASIC;
    list.forEach(([name, code], idx) => {
      subjects.push({
        id: `${grade.id}-s${idx + 1}`,
        gradeId: grade.id,
        name,
        code: `${code}-${grade.order}`,
        description: `مقرر ${name} لـ${grade.name}`,
      });
    });
  }

  const books: Book[] = [];
  for (const subject of subjects) {
    const grade = grades.find((g) => g.id === subject.gradeId)!;
    for (const term of [1, 2] as const) {
      books.push({
        id: `b-${subject.id}-t${term}`,
        title: `كتاب ${subject.name} - ${grade.name} - الفصل ${term === 1 ? 'الأول' : 'الثاني'}`,
        gradeId: subject.gradeId,
        subjectId: subject.id,
        term,
        pages: 96 + ((grade.order * 7 + term * 13) % 80),
        sizeKb: 1200 + ((grade.order * 131 + term * 271) % 2600),
        description: `المنهج الرسمي لمادة ${subject.name} للصف ${grade.name}، الفصل الدراسي ${
          term === 1 ? 'الأول' : 'الثاني'
        }.`,
        fileUrl: `/api/public/books/b-${subject.id}-t${term}/file`,
        createdAt: now(),
      });
    }
  }

  const schools: School[] = [];
  let schoolSeq = 0;
  districts.forEach((district, dIndex) => {
    const count = dIndex < 6 ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      schoolSeq += 1;
      const isSecondary = i === 2 || (dIndex >= 6 && i === 1);
      const gender = schoolSeq % 3 === 0 ? 'بنات' : schoolSeq % 3 === 1 ? 'بنين' : 'مختلط';
      schools.push({
        id: `sch${schoolSeq}`,
        districtId: district.id,
        levelId: isSecondary ? 'lv2' : 'lv1',
        name: `مدرسة ${district.name} ${isSecondary ? 'الثانوية' : 'الأساسية'} ${
          gender === 'بنات' ? 'للبنات' : gender === 'بنين' ? 'للبنين' : 'المختلطة'
        } ${i + 1}`,
        gender,
        address: `مديرية ${district.name} - محافظة شبوة`,
        phone: `+9677${(10000000 + schoolSeq * 137).toString().slice(0, 8)}`,
        studentsCount: 180 + ((schoolSeq * 53) % 620),
        teachersCount: 12 + ((schoolSeq * 7) % 30),
        gradeIds: isSecondary
          ? ['g10', 'g11', 'g12']
          : grades.filter((g) => g.order <= 9).map((g) => g.id),
        createdAt: now(),
      });
    }
  });

  const colleges: College[] = [
    {
      id: 'col1',
      name: 'كلية التربية',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'إعداد المعلمين والمعلمات في التخصصات التربوية والعلمية.',
      dean: 'أ.د. محمد صالح بن عوض',
    },
    {
      id: 'col2',
      name: 'كلية العلوم التطبيقية',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'تخصصات العلوم الطبيعية والتطبيقية والبحوث الميدانية.',
      dean: 'أ.د. سالم عوض الحارثي',
    },
    {
      id: 'col3',
      name: 'كلية الطب والعلوم الصحية',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'برامج الطب البشري والعلوم الصحية المساندة.',
      dean: 'أ.د. عبدالله ناصر بامطرف',
    },
    {
      id: 'col4',
      name: 'كلية الهندسة',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'هندسة المدنية والكهربائية والميكانيكية.',
      dean: 'د. فهد علي الجفري',
    },
    {
      id: 'col5',
      name: 'كلية العلوم الإدارية',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'إدارة الأعمال والمحاسبة والتمويل والمصارف.',
      dean: 'د. نصر محسن الكازمي',
    },
    {
      id: 'col6',
      name: 'كلية الحاسوب وتقنية المعلومات',
      universityName: 'جامعة شبوة',
      districtId: 'd1',
      description: 'علوم الحاسوب والشبكات وأمن المعلومات وتطوير البرمجيات.',
      dean: 'د. أحمد سعيد القحطاني',
    },
  ];

  const programSeed: [string, string, string, number, string][] = [
    ['col1', 'بكالوريوس معلم مجال - رياضيات', 'بكالوريوس', 4, 'تأهيل معلمي الرياضيات للمرحلتين الأساسية والثانوية.'],
    ['col1', 'بكالوريوس معلم مجال - لغة عربية', 'بكالوريوس', 4, 'تأهيل معلمي اللغة العربية.'],
    ['col1', 'دبلوم عالي - مناهج وطرق تدريس', 'دبلوم عالي', 1, 'دراسات عليا في المناهج وطرق التدريس.'],
    ['col2', 'بكالوريوس علوم - أحياء', 'بكالوريوس', 4, 'علوم الحياة والتطبيقات المختبرية.'],
    ['col2', 'بكالوريوس علوم - فيزياء', 'بكالوريوس', 4, 'الفيزياء النظرية والتطبيقية.'],
    ['col3', 'بكالوريوس طب بشري', 'بكالوريوس', 6, 'برنامج الطب البشري العام.'],
    ['col3', 'بكالوريوس مختبرات طبية', 'بكالوريوس', 4, 'التحاليل الطبية والمختبرات.'],
    ['col4', 'بكالوريوس هندسة مدنية', 'بكالوريوس', 5, 'تصميم وتنفيذ المنشآت.'],
    ['col4', 'بكالوريوس هندسة كهربائية', 'بكالوريوس', 5, 'أنظمة الطاقة والتحكم.'],
    ['col5', 'بكالوريوس محاسبة', 'بكالوريوس', 4, 'المحاسبة والمراجعة.'],
    ['col5', 'بكالوريوس إدارة أعمال', 'بكالوريوس', 4, 'إدارة المنظمات والمشاريع.'],
    ['col6', 'بكالوريوس علوم حاسوب', 'بكالوريوس', 4, 'البرمجيات والخوارزميات.'],
    ['col6', 'بكالوريوس تقنية معلومات', 'بكالوريوس', 4, 'الشبكات وأمن المعلومات.'],
  ];
  const programs: CollegeProgram[] = programSeed.map(([collegeId, name, degree, years, description], i) => ({
    id: `p${i + 1}`,
    collegeId,
    name,
    degree,
    years,
    description,
  }));

  const users: User[] = [
    {
      id: 'u-admin',
      email: 'admin@madrasti.ye',
      fullName: 'مسؤول المنصة',
      role: 'admin',
      phone: '+967770000001',
      bio: 'إدارة منصة مدرستي شبوة',
      avatarUrl: '',
      districtId: 'd1',
      schoolId: null,
      gradeId: null,
      collegeId: null,
      subjectIds: [],
      approved: true,
      createdAt: now(),
    },
    {
      id: 'u-teacher',
      email: 'teacher@madrasti.ye',
      fullName: 'أ. عبدالرحمن عوض',
      role: 'teacher',
      phone: '+967770000002',
      bio: 'معلم رياضيات - الصفوف الثانوية',
      avatarUrl: '',
      districtId: 'd1',
      schoolId: 'sch1',
      gradeId: null,
      collegeId: null,
      subjectIds: ['g10-s3', 'g11-s3', 'g12-s3'],
      approved: true,
      createdAt: now(),
    },
    {
      id: 'u-teacher2',
      email: 'teacher2@madrasti.ye',
      fullName: 'أ. فاطمة أحمد',
      role: 'teacher',
      phone: '+967770000003',
      bio: 'معلمة لغة عربية',
      avatarUrl: '',
      districtId: 'd2',
      schoolId: 'sch4',
      gradeId: null,
      collegeId: null,
      subjectIds: ['g10-s2'],
      approved: false,
      createdAt: now(),
    },
    {
      id: 'u-manager',
      email: 'manager@madrasti.ye',
      fullName: 'أ. خالد بن سعيد',
      role: 'school_manager',
      phone: '+967770000004',
      bio: 'مدير مدرسة عتق الثانوية',
      avatarUrl: '',
      districtId: 'd1',
      schoolId: 'sch3',
      gradeId: null,
      collegeId: null,
      subjectIds: [],
      approved: true,
      createdAt: now(),
    },
    {
      id: 'u-student',
      email: 'student@madrasti.ye',
      fullName: 'الطالب يوسف الحارثي',
      role: 'student',
      phone: '+967770000005',
      bio: 'طالب في الصف العاشر الثانوي',
      avatarUrl: '',
      districtId: 'd1',
      schoolId: 'sch3',
      gradeId: 'g10',
      collegeId: null,
      subjectIds: [],
      approved: true,
      createdAt: now(),
    },
  ];

  const courses: AppDatabase['courses'] = [
    {
      id: 'c1',
      title: 'الرياضيات - الصف العاشر',
      description: 'مقرر الرياضيات للصف العاشر الثانوي، الفصل الأول.',
      teacherId: 'u-teacher',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      published: true,
      createdAt: now(),
    },
    {
      id: 'c2',
      title: 'اللغة العربية - الصف العاشر',
      description: 'مقرر اللغة العربية للصف العاشر الثانوي.',
      teacherId: 'u-teacher',
      gradeId: 'g10',
      subjectId: 'g10-s2',
      published: true,
      createdAt: now(),
    },
  ];

  const lessons: Lesson[] = [
    {
      id: 'l1',
      courseId: 'c1',
      teacherId: 'u-teacher',
      title: 'المعادلات التربيعية - مقدمة',
      description: 'التعريف بالمعادلات التربيعية وطرق حلها.',
      content:
        'المعادلة التربيعية هي معادلة على الصورة ax² + bx + c = 0 حيث a ≠ 0.\n\nفي هذا الدرس نتعرف على:\n1) مفهوم المعادلة التربيعية.\n2) طريقة التحليل إلى العوامل.\n3) القانون العام للحل.\n\nأمثلة محلولة وخطوات الحل بالتفصيل مع تمارين تطبيقية في نهاية الدرس.',
      videoUrl: '',
      fileUrl: '',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      published: true,
      order: 1,
      durationMin: 35,
      createdAt: now(),
    },
    {
      id: 'l2',
      courseId: 'c1',
      teacherId: 'u-teacher',
      title: 'الدوال والتمثيل البياني',
      description: 'دراسة الدوال الخطية والتربيعية وتمثيلها.',
      content:
        'نتناول في هذا الدرس مفهوم الدالة، والمجال والمدى، والتمثيل البياني للدوال الخطية والتربيعية، مع تطبيقات عملية.',
      videoUrl: '',
      fileUrl: '',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      published: true,
      order: 2,
      durationMin: 40,
      createdAt: now(),
    },
    {
      id: 'l3',
      courseId: 'c2',
      teacherId: 'u-teacher',
      title: 'الأساليب البلاغية في النص الأدبي',
      description: 'التشبيه والاستعارة والكناية.',
      content: 'شرح الأساليب البلاغية مع أمثلة من النصوص المقررة وتحليل تطبيقي.',
      videoUrl: '',
      fileUrl: '',
      gradeId: 'g10',
      subjectId: 'g10-s2',
      published: true,
      order: 1,
      durationMin: 30,
      createdAt: now(),
    },
  ];

  const enrollments: AppDatabase['enrollments'] = [
    { id: 'e1', studentId: 'u-student', courseId: 'c1', createdAt: now() },
    { id: 'e2', studentId: 'u-student', courseId: 'c2', createdAt: now() },
  ];

  const announcements: AppDatabase['announcements'] = [
    {
      id: 'a1',
      title: 'بدء التسجيل للفصل الدراسي الثاني',
      body: 'تعلن إدارة منصة مدرستي شبوة عن بدء التسجيل للفصل الدراسي الثاني لجميع الصفوف. يرجى من الطلاب استكمال بياناتهم في الملف الشخصي والتأكد من اختيار الصف والمدرسة.',
      audience: 'all',
      authorId: 'u-admin',
      authorName: 'مسؤول المنصة',
      districtId: null,
      schoolId: null,
      pinned: true,
      createdAt: daysFromNow(-2),
    },
    {
      id: 'a2',
      title: 'جدول المحاضرات المباشرة للأسبوع الحالي',
      body: 'تم نشر جدول المحاضرات المباشرة لمادة الرياضيات للصف العاشر الثانوي. الدخول من بوابة الطالب ثم المحاضرات المباشرة قبل الموعد بعشر دقائق.',
      audience: 'students',
      authorId: 'u-teacher',
      authorName: 'أ. عبدالرحمن عوض',
      districtId: null,
      schoolId: 'sch3',
      pinned: false,
      createdAt: daysFromNow(-1),
    },
    {
      id: 'a3',
      title: 'ورشة تدريبية للمعلمين حول التعليم عن بعد',
      body: 'تنظم إدارة المنصة ورشة تدريبية للمعلمين المعتمدين حول إدارة الفصول الافتراضية والاختبارات الإلكترونية.',
      audience: 'teachers',
      authorId: 'u-admin',
      authorName: 'مسؤول المنصة',
      districtId: null,
      schoolId: null,
      pinned: false,
      createdAt: daysFromNow(-3),
    },
  ];

  const assignments: Assignment[] = [
    {
      id: 'as1',
      teacherId: 'u-teacher',
      lessonId: 'l1',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      title: 'واجب المعادلات التربيعية',
      description: 'حل التمارين من 1 إلى 10 في الكتاب المقرر، وإرفاق صورة الحل أو كتابته في الحقل المخصص.',
      dueAt: daysFromNow(4),
      maxScore: 20,
      published: true,
      createdAt: daysFromNow(-1),
    },
    {
      id: 'as2',
      teacherId: 'u-teacher',
      lessonId: 'l3',
      gradeId: 'g10',
      subjectId: 'g10-s2',
      title: 'تحليل نص أدبي',
      description: 'استخرج ثلاثة أساليب بلاغية من النص المقرر واشرح أثرها في المعنى.',
      dueAt: daysFromNow(6),
      maxScore: 15,
      published: true,
      createdAt: now(),
    },
  ];

  const quizzes: Quiz[] = [
    {
      id: 'q1',
      teacherId: 'u-teacher',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      title: 'اختبار قصير - المعادلات التربيعية',
      description: 'اختبار من خمسة أسئلة، مدة الاختبار 10 دقائق.',
      durationMin: 10,
      published: true,
      questions: [
        {
          id: 'q1-1',
          text: 'ما حلول المعادلة x² - 5x + 6 = 0 ؟',
          options: ['2 و 3', '1 و 6', '-2 و -3', '0 و 5'],
          correctIndex: 0,
        },
        {
          id: 'q1-2',
          text: 'المميز في المعادلة التربيعية يُرمز له بالرمز:',
          options: ['Δ = b² - 4ac', 'Δ = b - 4ac', 'Δ = a² - 4bc', 'Δ = 4ac - b²'],
          correctIndex: 0,
        },
        {
          id: 'q1-3',
          text: 'إذا كان المميز سالبًا فإن المعادلة:',
          options: ['ليس لها حلول حقيقية', 'لها حلان مختلفان', 'لها حل واحد', 'لها عدد لا نهائي من الحلول'],
          correctIndex: 0,
        },
        {
          id: 'q1-4',
          text: 'أي المعادلات التالية تربيعية؟',
          options: ['2x² + 3x - 1 = 0', '3x + 5 = 0', 'x³ + 1 = 0', '1/x = 4'],
          correctIndex: 0,
        },
        {
          id: 'q1-5',
          text: 'حلول المعادلة (x - 2)(x + 3) = 0 هي:',
          options: ['2 و -3', '-2 و 3', '2 و 3', '-2 و -3'],
          correctIndex: 0,
        },
      ],
      createdAt: now(),
    },
  ];

  const liveSessions: LiveSession[] = [
    {
      id: 'ls1',
      teacherId: 'u-teacher',
      title: 'محاضرة مباشرة: مراجعة المعادلات التربيعية',
      description: 'مراجعة شاملة وحل تمارين مع أسئلة الطلاب المباشرة.',
      gradeId: 'g10',
      subjectId: 'g10-s3',
      roomName: 'madrasti-ls1',
      scheduledAt: daysFromNow(1),
      durationMin: 60,
      status: 'scheduled',
      recordEnabled: true,
      recordingUrl: '',
      maxParticipants: 40,
      participants: [],
      createdAt: now(),
    },
  ];

  return {
    version: 1,
    districts,
    levels,
    grades,
    schools,
    subjects,
    books,
    colleges,
    programs,
    users,
    passwordHashes: {},
    sessions: [],
    courses,
    lessons,
    enrollments,
    announcements,
    assignments,
    submissions: [],
    quizzes,
    attempts: [],
    liveSessions,
    notifications: [],
    messages: [],
    attendance: [],
    completions: [],
    uploads: [],
    resetTokens: [],
  };
}

export function arabicOrdinal(n: number): string {
  const map: Record<number, string> = {
    1: 'الأول',
    2: 'الثاني',
    3: 'الثالث',
    4: 'الرابع',
    5: 'الخامس',
    6: 'السادس',
    7: 'السابع',
    8: 'الثامن',
    9: 'التاسع',
    10: 'العاشر',
    11: 'الحادي عشر',
    12: 'الثاني عشر',
  };
  return map[n] ?? String(n);
}

export const DEMO_ACCOUNTS = [
  { email: 'admin@madrasti.ye', password: 'Admin@12345', role: 'مسؤول المنصة' },
  { email: 'teacher@madrasti.ye', password: 'Teacher@12345', role: 'معلم معتمد' },
  { email: 'manager@madrasti.ye', password: 'Manager@12345', role: 'مدير مدرسة' },
  { email: 'student@madrasti.ye', password: 'Student@12345', role: 'طالب' },
];
