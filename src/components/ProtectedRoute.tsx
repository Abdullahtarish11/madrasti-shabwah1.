import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { homeForRole, useAuth } from '../lib/auth';
import { Loading } from './ui';
import type { Role } from '../../shared/types';

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) {
    return (
      <div className="container-page py-16">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <p className="text-3xl">🔒</p>
          <h2 className="mt-3 text-xl font-bold">لا تملك صلاحية الوصول</h2>
          <p className="mt-2 text-sm text-slate-500">
            هذه الصفحة مخصصة لحساب بدور مختلف. يمكنك العودة إلى لوحتك الخاصة.
          </p>
          <a href={homeForRole(user.role)} className="btn-primary mt-5">
            العودة إلى لوحتي
          </a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
