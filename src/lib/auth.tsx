import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { PublicUser } from '../../shared/types';

interface LivekitStatus {
  configured: boolean;
  url?: string;
  plan?: string;
}

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  mode: 'local' | 'supabase';
  supabaseAuth: boolean;
  livekit: LivekitStatus;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  user: PublicUser | null;
  mode: 'local' | 'supabase';
  supabaseAuth: boolean;
  livekit: LivekitStatus;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'local' | 'supabase'>('local');
  const [supabaseAuth, setSupabaseAuth] = useState(false);
  const [livekit, setLivekit] = useState<LivekitStatus>({ configured: false });

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me');
      setUser(data.user);
      setMode(data.mode);
      setSupabaseAuth(data.supabaseAuth);
      setLivekit(data.livekit ?? { configured: false });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ user: PublicUser; pendingApproval: boolean }>('/api/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, mode, supabaseAuth, livekit, refresh, login, logout, setUser }),
    [user, loading, mode, supabaseAuth, livekit, refresh, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homeForRole(role: string): string {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  if (role === 'school_manager') return '/manager';
  return '/student';
}
