import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Dev-only login bypass. Double-guarded: only when running the Vite dev server
// (import.meta.env.DEV) AND VITE_AUTH_BYPASS=true in .env.local. A production
// build sets DEV=false, so this can never ship. The mock profile uses a null
// id so uploaded_by (a nullable FK to user_profiles) won't violate the FK.
// Note: DB calls still run as the anon Supabase role under bypass, so RLS may
// block writes that require an authenticated role.
const AUTH_BYPASS = import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
const MOCK_SESSION = { user: { id: null, email: 'dev@local' } };
const MOCK_PROFILE = {
  id: null,
  email: 'dev@local',
  full_name: 'Dev User',
  role: 'admin',
  title: 'Local Dev (bypass)',
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(AUTH_BYPASS ? MOCK_SESSION : null);
  const [profile, setProfile] = useState(AUTH_BYPASS ? MOCK_PROFILE : null);
  const [loading, setLoading] = useState(!AUTH_BYPASS);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) return;
    if (!session?.user) {
      setProfile(null);
      return;
    }
    supabase
      .from('user_profiles')
      .select('id, email, full_name, role, title')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  const signInWithEmail = (email) =>
    supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

  // Password sign-in fallback for the demo (and for any future user who
  // would rather not click an email link). Pre-provisioned in the Supabase
  // dashboard (Auth → Users → Add user → set password + Auto-confirm).
  const signInWithPassword = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => (AUTH_BYPASS ? Promise.resolve() : supabase.auth.signOut());

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signInWithEmail, signInWithPassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
