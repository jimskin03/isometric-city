import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PARADISE_CITY } from '@/config/paradise';
import {
  createCoopInvite,
  getCoopInviteByUserId,
  revokeCoopInvite,
  validateCoopInvite,
} from '@/lib/coop/inviteStore';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vlnocfdiexkqcnfbjhqt.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ys0Cl98LLqAdNEiNY1f7Mg_lddIzr6F';

async function currentUser(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return null;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase.auth.getUser(accessToken);
  return data.user ?? null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ ok: false, error: 'code is required' }, { status: 400 });
  const invite = await validateCoopInvite(code);
  return invite
    ? NextResponse.json({ ok: true, invite })
    : NextResponse.json({ ok: false, error: 'Invite code is invalid or expired' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { sessionId?: string; roomCode?: string };
  const displayName = String(user.user_metadata?.display_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Paradise Host');
  // Bind the invite to the shared room so a guest that joins with the code lands
  // in the session it was issued for instead of an unbound local city.
  const roomCode = body.roomCode?.trim() || PARADISE_CITY.unifiedRoomCode;
  const existing = await getCoopInviteByUserId(user.id);
  const invite = existing ?? (await createCoopInvite(user.id, displayName, body.sessionId, roomCode));
  return NextResponse.json({ ok: true, invite });
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  await revokeCoopInvite(user.id);
  return NextResponse.json({ ok: true });
}
