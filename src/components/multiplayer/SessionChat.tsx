'use client';

import React, { FormEvent, useMemo, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useMultiplayerOptional } from '@/context/MultiplayerContext';

export function SessionChat({ className = '' }: { className?: string }) {
  const multiplayer = useMultiplayerOptional();
  const [open, setOpen] = useState(true);
  const [body, setBody] = useState('');

  const messages = useMemo(() => multiplayer?.chatMessages.slice(-80) ?? [], [multiplayer?.chatMessages]);
  if (!multiplayer || multiplayer.connectionState !== 'connected') return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody('');
    void multiplayer.sendChat(text);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${className} rounded border border-slate-700 bg-slate-950/90 p-2 text-slate-300 shadow-lg`} title="Open shared-session chat">
        <MessageSquare className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className={`${className} w-80 max-w-[calc(100vw-1rem)] border border-slate-700 bg-slate-950/95 shadow-2xl`}>
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
        <div>
          <span className="font-semibold text-white">Shared Session</span>
          {multiplayer.roomCode && <span className="ml-2 font-mono text-slate-500">{multiplayer.roomCode}</span>}
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="h-56 overflow-y-auto px-3 py-2 text-xs">
        {messages.length === 0 ? (
          <div className="text-slate-600">No messages yet. Humans and agents share this channel.</div>
        ) : messages.map((message) => (
          <div key={message.id} className="mb-2">
            <div className="flex items-center gap-1.5">
              <span className={message.senderType === 'agent' ? 'text-cyan-400' : message.senderType === 'system' ? 'text-amber-400' : 'text-emerald-400'}>
                {message.senderType === 'agent' ? 'AGENT' : message.senderType === 'system' ? 'SYSTEM' : 'HUMAN'}
              </span>
              <span className="font-medium text-slate-300">{message.senderName}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-slate-400">{message.body}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex border-t border-slate-800">
        <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Message humans or agents…" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600" />
        <button type="submit" className="px-3 text-slate-400 hover:text-white" aria-label="Send message"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
