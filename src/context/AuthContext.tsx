'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  displayName: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  sendMagicLink: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 1500);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      clearTimeout(timeout);
      return;
    }

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
        clearTimeout(timeout);
      })
      .catch((err) => {
        console.warn('[Auth] getSession failed, continuing as guest:', err);
        if (mounted) {
          setLoading(false);
          clearTimeout(timeout);
        }
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(authError.message);
      return false;
    }
    return true;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setError(null);
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (authError) {
      setError(authError.message);
      return false;
    }
    return true;
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.href : undefined },
    });
    if (authError) {
      setError(authError.message);
      return false;
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    const currentUserId = session?.user?.id;
    if (currentUserId) {
      try {
        await fetch(`/api/coop/invite?userId=${encodeURIComponent(currentUserId)}`, {
          method: 'DELETE',
        });
      } catch {
        // Silently continue
      }
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setError(null);
    const { error: authError } = await supabase.auth.signOut();
    if (authError) setError(authError.message);
  }, [session?.user?.id]);

  const user = session?.user ?? null;
  const displayName = useMemo(() => {
    if (!user) return null;
    const metadataName = user.user_metadata?.display_name || user.user_metadata?.name;
    if (typeof metadataName === 'string' && metadataName.trim()) return metadataName.trim();
    return user.email?.split('@')[0] || 'CryptGreg User';
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, loading, error, displayName, signIn, signUp, sendMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
