import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Home from './pages/Home';
import Schools from './pages/Schools';
import SchoolDetail from './pages/SchoolDetail';
import Library from './pages/Library';
import Universities from './pages/Universities';
import Announcements from './pages/Announcements';
import Search from './pages/Search';
import Offline from './pages/Offline';
import Profile from './pages/Profile';
import { Login, Register, ForgotPassword, ResetPassword } from './pages/Auth';
import StudentPortal from './pages/student/StudentPortal';
import TeacherPortal from './pages/teacher/TeacherPortal';
import AdminPortal from './pages/admin/AdminPortal';
import ManagerPortal from './pages/manager/ManagerPortal';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/schools" element={<Schools />} />
        <Route path="/schools/:id" element={<SchoolDetail />} />
        <Route path="/library" element={<Library />} />
        <Route path="/universities" element={<Universities />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/search" element={<Search />} />
        <Route path="/offline" element={<Offline />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute roles={['student', 'teacher', 'school_manager', 'admin']}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/*"
          element={
            <ProtectedRoute roles={['student', 'admin']}>
              <StudentPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/*"
          element={
            <ProtectedRoute roles={['teacher', 'admin']}>
              <TeacherPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/*"
          element={
            <ProtectedRoute roles={['school_manager', 'admin']}>
              <ManagerPortal />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
