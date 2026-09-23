// Co-op invite store.
//
// An invite code is a capability token: the guest (human or agent) that presents
// a valid code may build inside the shared Paradise City session.
//
// The authoritative copy lives in Supabase (public.coop_invites) so a code stays
// valid across serverless instances and process restarts — an in-process Map
// silently loses every invite whenever the server scales, sleeps or redeploys,
// which made freshly generated codes report "invalid or expired".
//
// A process-local cache keeps the hot path fast and keeps the feature working
// before supabase/migrations/20260923_coop_invites.sql has been applied.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type CoopInvite = {
  code: string;
  userId: string;
  userDisplayName: string;
  sessionId?: string;
  createdAt: number;
  roomCode?: string;
  expiresAt?: number;
};

/** Invites are valid for 24 hours unless the row says otherwise. */
export const COOP_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type InviteStore = { byCode: Map<string, CoopInvite>; byUser: Map<string, string> };

declare global {
  var __paradiseCoopInvites: InviteStore | undefined;
}

const DEFAULT_SUPABASE_URL = 'https://vlnocfdiexkqcnfbjhqt.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ys0Cl98LLqAdNEiNY1f7Mg_lddIzr6F';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PREFIX = 'PARADISE-';

let client: SupabaseClient | null | undefined;
let warnedAboutTable = false;

function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  try {
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  } catch (error) {
    console.warn('[coop] Supabase client unavailable, using in-process invites only:', error);
    client = null;
  }
  return client;
}

function warnOnce(error: unknown): void {
  if (warnedAboutTable) return;
  warnedAboutTable = true;
  console.warn(
    '[coop] coop_invites unavailable (apply supabase/migrations/20260923_coop_invites.sql); ' +
      'falling back to in-process invites, which do not survive restarts:',
    error,
  );
}

function store(): InviteStore {
  if (!globalThis.__paradiseCoopInvites) {
    globalThis.__paradiseCoopInvites = { byCode: new Map(), byUser: new Map() };
  }
  return globalThis.__paradiseCoopInvites;
}

type InviteRow = {
  code: string;
  user_id: string | null;
  user_display_name: string | null;
  session_id: string | null;
  room_code: string | null;
  created_at: string | null;
  expires_at: string | null;
};

function timeOrUndefined(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function rowToInvite(row: InviteRow): CoopInvite {
  return {
    code: row.code,
    userId: row.user_id ?? '',
    userDisplayName: row.user_display_name || 'Paradise Host',
    sessionId: row.session_id ?? undefined,
    roomCode: row.room_code ?? undefined,
    createdAt: timeOrUndefined(row.created_at) ?? Date.now(),
    expiresAt: timeOrUndefined(row.expires_at),
  };
}

function isExpired(invite: CoopInvite): boolean {
  return typeof invite.expiresAt === 'number' && invite.expiresAt <= Date.now();
}

function cacheInvite(invite: CoopInvite): CoopInvite {
  const s = store();
  s.byCode.set(invite.code, invite);
  if (invite.userId) s.byUser.set(invite.userId, invite.code);
  return invite;
}

function forget(code: string): void {
  const s = store();
  const invite = s.byCode.get(code);
  s.byCode.delete(code);
  if (invite?.userId) s.byUser.delete(invite.userId);
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${CODE_PREFIX}${suffix}`;
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Create (or rotate) the invite owned by a user. The invite is bound to the host
 * room so the guest lands in the shared session the code was issued for.
 */
export async function createCoopInvite(
  userId: string,
  userDisplayName: string,
  sessionId?: string,
  roomCode?: string,
): Promise<CoopInvite> {
  await revokeCoopInvite(userId);

  const createdAt = Date.now();
  const expiresAt = createdAt + COOP_INVITE_TTL_MS;
  const invite: CoopInvite = { code: randomCode(), userId, userDisplayName, sessionId, roomCode, createdAt, expiresAt };

  const db = supabase();
  if (db) {
    // A code collision is astronomically unlikely (32^6 space); retry anyway so
    // the primary key can never turn into a failed invite for the user.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await db.from('coop_invites').insert({
        code: invite.code,
        user_id: userId || null,
        user_display_name: userDisplayName,
        session_id: sessionId ?? null,
        room_code: roomCode ?? null,
        created_at: new Date(createdAt).toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
      });
      if (!error) return cacheInvite(invite);
      if (error.code === '23505') {
        invite.code = randomCode();
        continue;
      }
      warnOnce(error);
      break;
    }
  }

  return cacheInvite(invite);
}

/** Resolve a presented code, checking the local cache first and Supabase second. */
export async function validateCoopInvite(code: string): Promise<CoopInvite | null> {
  const normalized = normalize(code);
  if (!normalized) return null;

  const cached = store().byCode.get(normalized);
  if (cached) {
    if (!isExpired(cached)) return cached;
    forget(normalized);
    return null;
  }

  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.from('coop_invites').select('*').eq('code', normalized).maybeSingle();
  if (error) {
    warnOnce(error);
    return null;
  }
  if (!data) return null;

  const invite = rowToInvite(data as InviteRow);
  if (isExpired(invite)) return null;
  return cacheInvite(invite);
}

/** Revoke by user id (sign-out, rotation) or by code. */
export async function revokeCoopInvite(userIdOrCode: string): Promise<boolean> {
  const value = userIdOrCode.trim();
  if (!value) return false;

  const s = store();
  const asCode = normalize(value);
  const cachedCode = s.byCode.has(asCode) ? asCode : s.byUser.get(value);
  let revoked = false;
  if (cachedCode) {
    forget(cachedCode);
    revoked = true;
  }

  const db = supabase();
  if (db) {
    const column = UUID_PATTERN.test(value) ? 'user_id' : 'code';
    const match = column === 'user_id' ? value : asCode;
    const { count, error } = await db
      .from('coop_invites')
      .delete({ count: 'exact' })
      .eq(column, match);
    if (error) warnOnce(error);
    else if (count && count > 0) revoked = true;
  }

  return revoked;
}

/** The invite a signed-in host already owns, so reloading does not orphan it. */
export async function getCoopInviteByUserId(userId: string): Promise<CoopInvite | null> {
  const s = store();
  const cachedCode = s.byUser.get(userId);
  if (cachedCode) {
    const cached = s.byCode.get(cachedCode);
    if (cached && !isExpired(cached)) return cached;
    if (cached) forget(cachedCode);
  }

  const db = supabase();
  if (!db) return null;

  const { data, error } = await db
    .from('coop_invites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    warnOnce(error);
    return null;
  }
  if (!data) return null;

  const invite = rowToInvite(data as InviteRow);
  if (isExpired(invite)) {
    await revokeCoopInvite(invite.code);
    return null;
  }
  return cacheInvite(invite);
}

export function listActiveInvites(): CoopInvite[] {
  return Array.from(store().byCode.values()).filter((i) => !isExpired(i));
}