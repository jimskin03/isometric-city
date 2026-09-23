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
  const userId = request.nextUrl.searchParams.get('userId');

  if (code) {
    const invite = await validateCoopInvite(code);
    return invite
      ? NextResponse.json({ ok: true, valid: true, invite })
      : NextResponse.json({ ok: false, valid: false, error: 'Invite code is invalid or expired' }, { status: 404 });
  }

  if (userId) {
    const invite = await getCoopInviteByUserId(userId);
    return NextResponse.json({ ok: true, invite: invite ?? null });
  }

  return NextResponse.json({ ok: false, error: 'code or userId query parameter required' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    userDisplayName?: string;
    sessionId?: string;
    roomCode?: string;
  };

  const userId = user?.id || body.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  const displayName = String(
    user?.user_metadata?.display_name ||
      user?.user_metadata?.name ||
      user?.email?.split('@')[0] ||
      body.userDisplayName ||
      'Paradise Host'
  );

  // Bind the invite to the shared room so a guest that joins with the code lands
  // in the session it was issued for instead of an unbound local city.
  const roomCode = body.roomCode?.trim() || PARADISE_CITY.unifiedRoomCode;
  const existing = await getCoopInviteByUserId(userId);
  const invite = existing ?? (await createCoopInvite(userId, displayName, body.sessionId, roomCode));
  return NextResponse.json({ ok: true, invite });
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser(request);
  const body = (await request.json().catch(() => ({}))) as { userId?: string; code?: string };
  const target = user?.id || body.userId || body.code;
  if (!target) {
    return NextResponse.json({ ok: false, error: 'Authentication or identifier required' }, { status: 401 });
  }
  await revokeCoopInvite(target);
  return NextResponse.json({ ok: true });
}
