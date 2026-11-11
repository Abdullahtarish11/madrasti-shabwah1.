export type Role = 'student' | 'teacher' | 'school_manager' | 'admin';

export interface District {
  id: string;
  name: string;
  description: string;
  schoolsCount?: number;
}

export interface EducationLevel {
  id: string;
  name: string;
  order: number;
}

export interface Grade {
  id: string;
  levelId: string;
  name: string;
  order: number;
}

export interface School {
  id: string;
  districtId: string;
  levelId: string;
  name: string;
  gender: 'بنين' | 'بنات' | 'مختلط';
  address: string;
  phone: string;
  studentsCount: number;
  teachersCount: number;
  gradeIds: string[];
  createdAt: string;
}

export interface Subject {
  id: string;
  gradeId: string;
  name: string;
  code: string;
  description: string;
}

export interface Book {
  id: string;
  title: string;
  gradeId: string;
  subjectId: string;
  term: 1 | 2;
  pages: number;
  sizeKb: number;
  description: string;
  fileUrl: string;
  createdAt: string;
}

export interface CollegeProgram {
  id: string;
  collegeId: string;
  name: string;
  degree: string;
  years: number;
  description: string;
}

export interface College {
  id: string;
  name: string;
  universityName: string;
  districtId: string;
  description: string;
  dean: string;
  programs?: CollegeProgram[];
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone: string;
  bio: string;
  avatarUrl: string;
  districtId: string | null;
  schoolId: string | null;
  gradeId: string | null;
  collegeId: string | null;
  subjectIds: string[];
  approved: boolean;
  createdAt: string;
}

export interface PublicUser extends User {
  schoolName?: string;
  districtName?: string;
  gradeName?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  gradeId: string;
  subjectId: string;
  published: boolean;
  createdAt: string;
}

export interface Lesson {
  id: string;
  courseId: string | null;
  teacherId: string;
  title: string;
  description: string;
  content: string;
  videoUrl: string;
  fileUrl: string;
  gradeId: string;
  subjectId: string;
  published: boolean;
  order: number;
  durationMin: number;
  createdAt: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'students' | 'teachers' | 'parents';
  authorId: string;
  authorName: string;
  districtId: string | null;
  schoolId: string | null;
  pinned: boolean;
  createdAt: string;
}

export interface Assignment {
  id: string;
  teacherId: string;
  lessonId: string | null;
  gradeId: string;
  subjectId: string;
  title: string;
  description: string;
  dueAt: string;
  maxScore: number;
  published: boolean;
  createdAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  text: string;
  fileUrl: string;
  submittedAt: string;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
}

export interface Quiz {
  id: string;
  teacherId: string;
  gradeId: string;
  subjectId: string;
  title: string;
  description: string;
  durationMin: number;
  published: boolean;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  answers: number[];
  score: number;
  total: number;
  submittedAt: string;
}

export interface LiveParticipant {
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  minutes: number;
}

export interface LiveSession {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  gradeId: string;
  subjectId: string;
  roomName: string;
  scheduledAt: string;
  durationMin: number;
  status: 'scheduled' | 'live' | 'ended';
  recordEnabled: boolean;
  recordingUrl: string;
  maxParticipants: number;
  participants: LiveParticipant[];
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'announcement' | 'assignment' | 'grade' | 'live' | 'account';
  link: string;
  read: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent' | 'late';
  minutes: number;
}

export interface LessonCompletion {
  id: string;
  lessonId: string;
  studentId: string;
  createdAt: string;
}

export interface Upload {
  id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  ownerId: string;
  createdAt: string;
}

export interface AppDatabase {
  version: number;
  districts: District[];
  levels: EducationLevel[];
  grades: Grade[];
  schools: School[];
  subjects: Subject[];
  books: Book[];
  colleges: College[];
  programs: CollegeProgram[];
  users: User[];
  passwordHashes: Record<string, string>;
  sessions: { token: string; userId: string; expiresAt: string }[];
  courses: Course[];
  lessons: Lesson[];
  enrollments: Enrollment[];
  announcements: Announcement[];
  assignments: Assignment[];
  submissions: Submission[];
  quizzes: Quiz[];
  attempts: QuizAttempt[];
  liveSessions: LiveSession[];
  notifications: Notification[];
  messages: Message[];
  attendance: AttendanceRecord[];
  completions: LessonCompletion[];
  uploads: Upload[];
  resetTokens: { token: string; userId: string; expiresAt: string }[];
}
