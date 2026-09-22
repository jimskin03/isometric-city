export type CoopInvite = {
  code: string;
  userId: string;
  userDisplayName: string;
  sessionId?: string;
  createdAt: number;
  roomCode?: string;
};

type InviteStore = { byCode: Map<string, CoopInvite>; byUser: Map<string, string> };

declare global {
  var __paradiseCoopInvites: InviteStore | undefined;
}

function store(): InviteStore {
  if (!globalThis.__paradiseCoopInvites) {
    globalThis.__paradiseCoopInvites = { byCode: new Map(), byUser: new Map() };
  }
  return globalThis.__paradiseCoopInvites;
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `PARADISE-${suffix}`;
}

export function createCoopInvite(userId: string, userDisplayName: string, sessionId?: string, roomCode?: string): CoopInvite {
  revokeCoopInvite(userId);
  const s = store();
  let code = randomCode();
  while (s.byCode.has(code)) code = randomCode();
  const invite = { code, userId, userDisplayName, sessionId, roomCode, createdAt: Date.now() };
  s.byCode.set(code, invite);
  s.byUser.set(userId, code);
  return invite;
}

export function validateCoopInvite(code: string): CoopInvite | null {
  return store().byCode.get(code.trim().toUpperCase()) ?? null;
}

export function revokeCoopInvite(userIdOrCode: string): boolean {
  const s = store();
  const value = userIdOrCode.trim();
  const code = s.byCode.has(value.toUpperCase()) ? value.toUpperCase() : s.byUser.get(value);
  if (!code) return false;
  const invite = s.byCode.get(code);
  s.byCode.delete(code);
  if (invite) s.byUser.delete(invite.userId);
  return !!invite;
}

export function getCoopInviteByUserId(userId: string): CoopInvite | null {
  const code = store().byUser.get(userId);
  return code ? validateCoopInvite(code) : null;
}
