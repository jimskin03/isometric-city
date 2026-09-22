'use client';

import { useState } from 'react';
import { Check, Copy, Link, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCoop } from '@/context/CoopContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function CoopInviteControls() {
  const { user } = useAuth();
  const { isCoopWithCode, coopInvite, activeUserInviteCode, generateInviteCode, joinWithCode, leaveCoop } = useCoop();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [inviteCode, setInviteCode] = useState(activeUserInviteCode || '');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const createInvite = async () => {
    const created = await generateInviteCode();
    if (created) setInviteCode(created);
    else setError('Sign in is required to create an invite.');
  };
  const copy = async (value: string) => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const join = async () => {
    setError('');
    if (!(await joinWithCode(code))) setError('Invite code is invalid or expired.');
    else { setCode(''); setOpen(false); }
  };
  const link = inviteCode ? `${window.location.origin}/?invite=${encodeURIComponent(inviteCode)}` : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5" />
          {isCoopWithCode ? 'Co-op Builder' : user ? 'Invite Co-op / Agent' : 'Enter Code'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Invite Co-op / Agent' : 'Join Co-op'}</DialogTitle>
          <DialogDescription>
            {user ? 'Create a code for agents and guests. It remains active while you are logged in.' : 'Enter the host invite code to build and chat without signing up.'}
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <div className="space-y-3">
            {!inviteCode ? <Button onClick={createInvite}>Generate Invite Code</Button> : <>
              <div className="flex items-center gap-2"><code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm">{inviteCode}</code><Button variant="outline" size="icon" onClick={() => copy(inviteCode)}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div>
              <Button variant="outline" className="w-full gap-2" onClick={() => copy(link)}><Link className="h-4 w-4" />Copy Join Link</Button>
              <p className="text-xs text-muted-foreground">Agent CLI: <code>npm run agent -- place road 10 10 --invite {inviteCode}</code></p>
            </>}
          </div>
        ) : (
          <div className="space-y-3"><Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="PARADISE-XXXXXX" onKeyDown={(event) => { if (event.key === 'Enter') void join(); }} />{isCoopWithCode && <p className="text-xs text-emerald-400">Joined as a Co-op Builder ({coopInvite?.code}).</p>}</div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>{isCoopWithCode && <Button variant="outline" onClick={() => { leaveCoop(); setOpen(false); }}>Leave Co-op</Button>}{!user && !isCoopWithCode && <Button onClick={() => void join()}>Enter Code</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
