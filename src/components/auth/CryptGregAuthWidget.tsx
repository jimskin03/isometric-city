'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CryptGregAuthWidget() {
  const { user, loading, error, displayName, signIn, signUp, sendMagicLink, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  if (loading) return <div className="text-xs text-white/40">Checking CryptGreg account…</div>;

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="truncate max-w-40">{displayName || user.email}</span>
        <Button variant="outline" size="sm" className="h-7 rounded-none border-white/15 bg-white/5 text-white/60" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="rounded-none border-white/15 bg-white/5 text-white/70 hover:bg-white/10" onClick={() => setOpen(true)}>
        Sign in with CryptGreg
      </Button>
    );
  }

  const run = async (mode: 'signin' | 'signup' | 'magic') => {
    setStatus(null);
    const ok = mode === 'signin'
      ? await signIn(email, password)
      : mode === 'signup'
        ? await signUp(email, password)
        : await sendMagicLink(email);
    if (ok) {
      setStatus(mode === 'magic' ? 'Magic link sent. Check your email.' : mode === 'signup' ? 'Account created. Check email if confirmation is required.' : 'Signed in.');
      if (mode === 'signin') setOpen(false);
    }
  };

  return (
    <div className="w-72 border border-white/15 bg-slate-950/95 p-3 text-sm text-white shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">CryptGreg account</span>
        <button className="text-white/40 hover:text-white" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      <div className="space-y-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-none bg-slate-900 border-white/15" />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="rounded-none bg-slate-900 border-white/15" />
        {(error || status) && <div className={`text-xs ${error ? 'text-red-400' : 'text-emerald-400'}`}>{error || status}</div>}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" className="rounded-none" onClick={() => void run('signin')} disabled={!email || !password}>Sign in</Button>
          <Button size="sm" variant="outline" className="rounded-none" onClick={() => void run('signup')} disabled={!email || !password}>Create account</Button>
        </div>
        <Button size="sm" variant="ghost" className="w-full rounded-none text-white/60" onClick={() => void run('magic')} disabled={!email}>Send magic link</Button>
      </div>
    </div>
  );
}
