'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type CoopInvite = { code: string; userId: string; userDisplayName: string; sessionId?: string; roomCode?: string; createdAt: number; expiresAt?: number };
type CoopContextValue = {
  isCoopWithCode: boolean;
  coopInvite: CoopInvite | null;
  activeUserInviteCode: string | null;
  generateInviteCode: () => Promise<string | null>;
  revokeInviteCode: () => Promise<void>;
  joinWithCode: (code: string) => Promise<boolean>;
  leaveCoop: () => void;
};
const CoopContext = createContext<CoopContextValue | null>(null);
const STORAGE_KEY = 'paradise-coop-invite';

export function CoopProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [coopInvite, setCoopInvite] = useState<CoopInvite | null>(null);
  const [activeUserInviteCode, setActiveUserInviteCode] = useState<string | null>(null);

  const joinWithCode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return false;
    const response = await fetch(`/api/coop/invite?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!response.ok) return false;
    const payload = await response.json() as { invite?: CoopInvite };
    if (!payload.invite) return false;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload.invite));
    setCoopInvite(payload.invite);
    return true;
  }, []);

  useEffect(() => {
    if (!sessionStorage) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setCoopInvite(JSON.parse(stored) as CoopInvite); } catch { sessionStorage.removeItem(STORAGE_KEY); }
    }
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) void joinWithCode(code);
  }, [joinWithCode]);

  const generateInviteCode = useCallback(async () => {
    if (!user || !session?.access_token) return null;
    const response = await fetch('/api/coop/invite', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as { invite?: CoopInvite };
    const code = payload.invite?.code ?? null;
    setActiveUserInviteCode(code);
    return code;
  }, [session, user]);

  const revokeInviteCode = useCallback(async () => {
    if (session?.access_token) await fetch('/api/coop/invite', { method: 'DELETE', headers: { authorization: `Bearer ${session.access_token}` } }).catch(() => undefined);
    setActiveUserInviteCode(null);
  }, [session]);

  // A signed-in host owns a durable invite. Restore it after a reload so the
  // browser session keeps publishing the code that agents and guests were given.
  useEffect(() => {
    if (!user || !session?.access_token || activeUserInviteCode) return;
    let cancelled = false;
    void fetch('/api/coop/invite', {
      method: 'POST',
      headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(async (response) => (response.ok ? ((await response.json()) as { invite?: CoopInvite }) : null))
      .then((payload) => {
        if (!cancelled && payload?.invite?.code) setActiveUserInviteCode(payload.invite.code);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeUserInviteCode, session, user]);

  const leaveCoop = useCallback(() => { sessionStorage.removeItem(STORAGE_KEY); setCoopInvite(null); }, []);
  const value = useMemo(() => ({ isCoopWithCode: !!coopInvite, coopInvite, activeUserInviteCode, generateInviteCode, revokeInviteCode, joinWithCode, leaveCoop }), [coopInvite, activeUserInviteCode, generateInviteCode, revokeInviteCode, joinWithCode, leaveCoop]);
  return <CoopContext.Provider value={value}>{children}</CoopContext.Provider>;
}
export function useCoop() { const value = useContext(CoopContext); if (!value) throw new Error('useCoop must be used inside CoopProvider'); return value; }
export function useCoopOptional() { return useContext(CoopContext); }
