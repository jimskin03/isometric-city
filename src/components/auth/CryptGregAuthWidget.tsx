'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LogIn, LogOut, User as UserIcon, KeyRound } from 'lucide-react';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: 'signin' | 'signup' | 'magic';
}

export function AuthDialog({ open, onOpenChange, defaultMode = 'signin' }: AuthDialogProps) {
  const { error, signIn, signUp, sendMagicLink } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setIsSubmitting(true);
    try {
      const ok = mode === 'signin'
        ? await signIn(email, password)
        : mode === 'signup'
          ? await signUp(email, password)
          : await sendMagicLink(email);

      if (ok) {
        if (mode === 'signin') {
          setStatus('Signed in successfully.');
          setTimeout(() => onOpenChange(false), 400);
        } else if (mode === 'signup') {
          setStatus('Account created. Check email if verification is required.');
        } else {
          setStatus('Magic link sent. Check your email inbox to log in.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-light tracking-wide flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-cyan-400" />
            {mode === 'signin' ? 'Sign in to Paradise City' : mode === 'signup' ? 'Register Citizen Account' : 'Passwordless Magic Link'}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            {mode === 'signin'
              ? 'Sign in to edit and build alongside humans and autonomous agents in the unified world.'
              : mode === 'signup'
                ? 'Create a registered account to unlock building tools, zoning, and continuous city edits.'
                : 'Enter your email to receive an instant one-click login link.'}
          </DialogDescription>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 -mx-6 px-6 pt-1 gap-4 text-xs font-medium text-slate-400">
          <button
            type="button"
            onClick={() => { setMode('signin'); setStatus(null); }}
            className={`pb-2 transition-colors border-b-2 ${mode === 'signin' ? 'border-cyan-400 text-cyan-300' : 'border-transparent hover:text-white'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setStatus(null); }}
            className={`pb-2 transition-colors border-b-2 ${mode === 'signup' ? 'border-cyan-400 text-cyan-300' : 'border-transparent hover:text-white'}`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setStatus(null); }}
            className={`pb-2 transition-colors border-b-2 ${mode === 'magic' ? 'border-cyan-400 text-cyan-300' : 'border-transparent hover:text-white'}`}
          >
            Magic Link
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 rounded-sm"
            />
          </div>

          {mode !== 'magic' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 rounded-sm"
              />
            </div>
          )}

          {(error || status) && (
            <div className={`text-xs p-2 rounded ${error ? 'bg-red-950/60 border border-red-800 text-red-300' : 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'}`}>
              {error || status}
            </div>
          )}

          <div className="pt-2 flex flex-col gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || !email || (mode !== 'magic' && !password)}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-sm"
            >
              {isSubmitting
                ? 'Processing…'
                : mode === 'signin'
                  ? 'Sign In & Build'
                  : mode === 'signup'
                    ? 'Create Account & Build'
                    : 'Send Magic Link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AuthModalButton({ className }: { className?: string }) {
  const { user, loading, displayName, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <div className="text-xs text-slate-400 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" />
        <span className="text-[11px]">Checking account…</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className={`flex items-center gap-2 text-xs ${className || ''}`}>
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono text-slate-200 max-w-32 truncate">{displayName || user.email}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => void signOut()}
          title="Sign out of Paradise City"
        >
          <LogOut className="w-3.5 h-3.5 mr-1" />
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        size="sm"
        className={`h-7 px-3 text-xs bg-cyan-600/90 hover:bg-cyan-500 text-white font-medium tracking-wide shadow-sm flex items-center gap-1.5 rounded ${className || ''}`}
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign in to build</span>
      </Button>
      <AuthDialog open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}

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
