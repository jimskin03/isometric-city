'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCoop } from '@/context/CoopContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, Copy, Key, LogOut, Sparkles, Terminal, UserPlus, Users } from 'lucide-react';

export function CoopModalButton({ isMobile = false }: { isMobile?: boolean }) {
  const { user } = useAuth();
  const {
    isCoopWithCode,
    coopGuestInfo,
    activeHostCode,
    generateInviteCode,
    revokeInviteCode,
    joinWithCode,
    leaveCoop,
    openInviteDialog,
    setOpenInviteDialog,
    openJoinDialog,
    setOpenJoinDialog,
  } = useCoop();

  const [inputCode, setInputCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);

  const handleCopy = (text: string, type: 'code' | 'link' | 'cli') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else if (type === 'cli') {
        setCopiedCli(true);
        setTimeout(() => setCopiedCli(false), 2000);
      }
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateInviteCode();
    setIsGenerating(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setIsJoining(true);
    setJoinError(null);
    const success = await joinWithCode(inputCode.trim());
    setIsJoining(false);
    if (success) {
      setOpenJoinDialog(false);
      setInputCode('');
    } else {
      setJoinError('Invalid or expired invite code. Ask the host for a new code.');
    }
  };

  const inviteUrl =
    typeof window !== 'undefined' && activeHostCode
      ? `${window.location.origin}/?invite=${encodeURIComponent(activeHostCode)}`
      : '';

  const cliExample = activeHostCode
    ? `npm run agent -- place road 10 10 --invite ${activeHostCode}`
    : '';

  // 1. If signed-in: Show "Invite Co-op / Agent" button
  if (user) {
    return (
      <>
        <Button
          variant={activeHostCode ? 'secondary' : 'outline'}
          size={isMobile ? 'sm' : 'sm'}
          onClick={() => {
            if (!activeHostCode) {
              void handleGenerate();
            }
            setOpenInviteDialog(true);
          }}
          className={`flex items-center gap-1.5 ${
            activeHostCode
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
          }`}
          title="Invite autonomous agents or co-op partners"
        >
          {activeHostCode ? <Key className="h-3.5 w-3.5 text-amber-400" /> : <UserPlus className="h-3.5 w-3.5 text-slate-400" />}
          <span>{activeHostCode ? (isMobile ? 'Code Active' : `Invite: ${activeHostCode}`) : 'Invite Co-op'}</span>
          {activeHostCode && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </Button>

        {/* Host Invite Dialog */}
        <Dialog open={openInviteDialog} onOpenChange={setOpenInviteDialog}>
          <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Key className="h-5 w-5 text-amber-400" />
                Co-op & Agent Invite Code
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Invite autonomous AI agents or human partners to build with you in real time without signing up.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <strong>Session Persistence:</strong> This unique code persists{' '}
                <em>only as long as you stay logged in</em>. Once you sign out, the code is immediately invalidated.
              </div>

              {activeHostCode ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Your Unique Invite Code
                    </label>
                    <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                      <span className="font-mono text-base font-bold tracking-wider text-amber-300">
                        {activeHostCode}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(activeHostCode, 'code')}
                        className="h-7 text-xs text-slate-300 hover:text-white"
                      >
                        {copiedCode ? <Check className="h-3.5 w-3.5 text-green-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copiedCode ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  {inviteUrl && (
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Direct Join Link
                      </label>
                      <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs">
                        <span className="truncate font-mono text-slate-400 mr-2">{inviteUrl}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(inviteUrl, 'link')}
                          className="h-7 text-xs text-slate-300 hover:text-white shrink-0"
                        >
                          {copiedLink ? <Check className="h-3.5 w-3.5 text-green-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          {copiedLink ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {cliExample && (
                    <div>
                      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                        Autonomous Agent Command
                      </div>
                      <div className="mt-1 flex items-center justify-between rounded-lg border border-cyan-900/50 bg-slate-900 px-3 py-2 text-xs">
                        <code className="truncate font-mono text-cyan-300 text-[11px] mr-2">
                          {cliExample}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(cliExample, 'cli')}
                          className="h-7 text-xs text-cyan-300 hover:text-white shrink-0"
                        >
                          {copiedCli ? <Check className="h-3.5 w-3.5 text-green-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                          {copiedCli ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400"
                  >
                    {isGenerating ? 'Generating...' : 'Generate New Invite Code'}
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-slate-800 pt-3">
              {activeHostCode ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    await revokeInviteCode();
                  }}
                  className="text-xs"
                >
                  Revoke Code
                </Button>
              ) : <div />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenInviteDialog(false)}
                className="border-slate-700 text-slate-300"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // 2. If guest joined with invite code: Show "Co-op Builder" status
  if (isCoopWithCode && coopGuestInfo) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-xs text-cyan-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span className="font-medium">Co-op Builder</span>
          <span className="hidden sm:inline font-mono text-[10px] text-cyan-400/80">({coopGuestInfo.code})</span>
          <button
            onClick={leaveCoop}
            className="ml-1 p-0.5 rounded text-cyan-400 hover:text-white hover:bg-cyan-900/60"
            title="Leave co-op session"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  // 3. If spectator: Show "Enter Code" button next to "Sign in to build"
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpenJoinDialog(true)}
        className="flex items-center gap-1.5 border border-dashed border-slate-700 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80"
        title="Enter an invite code to build together"
      >
        <Key className="h-3.5 w-3.5 text-amber-400" />
        <span>Enter Code</span>
      </Button>

      {/* Guest Join Dialog */}
      <Dialog open={openJoinDialog} onOpenChange={setOpenJoinDialog}>
        <DialogContent className="sm:max-w-sm bg-slate-950 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-cyan-400" />
              Join Co-op Session
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Have an invite code from a citizen? Enter it below to unlock building tools and chat without signing up.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleJoin} className="space-y-4 py-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Invite Code
              </label>
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="e.g. PARADISE-7K2X9M"
                maxLength={20}
                required
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm tracking-wider text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              {joinError && <p className="mt-1.5 text-xs text-red-400">{joinError}</p>}
            </div>

            <DialogFooter className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenJoinDialog(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isJoining || !inputCode.trim()}
                className="bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400"
              >
                {isJoining ? 'Verifying...' : 'Join & Build'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
