'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export type CoopInvite = {
  code: string;
  userId: string;
  userDisplayName: string;
  sessionId?: string;
  roomCode?: string;
  createdAt: number;
  expiresAt?: number;
};
export type CoopGuestInfo = CoopInvite;

export type CoopContextValue = {
  isCoopWithCode: boolean;
  coopInvite: CoopInvite | null;
  coopGuestInfo: CoopGuestInfo | null;
  activeUserInviteCode: string | null;
  activeHostCode: string | null;
  generateInviteCode: () => Promise<string | null>;
  revokeInviteCode: () => Promise<void>;
  joinWithCode: (code: string) => Promise<boolean>;
  leaveCoop: () => void;
  openInviteDialog: boolean;
  setOpenInviteDialog: (open: boolean) => void;
  openJoinDialog: boolean;
  setOpenJoinDialog: (open: boolean) => void;
};
const CoopContext = createContext<CoopContextValue | null>(null);
const STORAGE_KEY = 'paradise-coop-invite';

export function CoopProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [coopInvite, setCoopInvite] = useState<CoopInvite | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as CoopInvite) : null;
    } catch {
      return null;
    }
  });
  const [activeUserInviteCode, setActiveUserInviteCode] = useState<string | null>(null);

  const joinWithCode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return false;
    const response = await fetch(`/api/coop/invite?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!response.ok) return false;
    const payload = (await response.json()) as { invite?: CoopInvite };
    if (!payload.invite) return false;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload.invite));
    }
    setCoopInvite(payload.invite);
    return true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) {
      const timer = setTimeout(() => {
        void joinWithCode(code);
      }, 0);
      return () => clearTimeout(timer);
    }
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

  const [openInviteDialog, setOpenInviteDialog] = useState(false);
  const [openJoinDialog, setOpenJoinDialog] = useState(false);

  const leaveCoop = useCallback(() => { sessionStorage.removeItem(STORAGE_KEY); setCoopInvite(null); }, []);
  const effectiveHostCode = user ? activeUserInviteCode : null;
  const value = useMemo(
    () => ({
      isCoopWithCode: !!coopInvite,
      coopInvite,
      coopGuestInfo: coopInvite,
      activeUserInviteCode: effectiveHostCode,
      activeHostCode: effectiveHostCode,
      generateInviteCode,
      revokeInviteCode,
      joinWithCode,
      leaveCoop,
      openInviteDialog,
      setOpenInviteDialog,
      openJoinDialog,
      setOpenJoinDialog,
    }),
    [
      coopInvite,
      effectiveHostCode,
      generateInviteCode,
      revokeInviteCode,
      joinWithCode,
      leaveCoop,
      openInviteDialog,
      openJoinDialog,
    ]
  );
  return <CoopContext.Provider value={value}>{children}</CoopContext.Provider>;
}
export function useCoop() { const value = useContext(CoopContext); if (!value) throw new Error('useCoop must be used inside CoopProvider'); return value; }
export function useCoopOptional() { return useContext(CoopContext); }
