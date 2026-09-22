import { NextRequest, NextResponse } from 'next/server';
import type { AgentCitySnapshot } from '@/lib/agent/protocol';
import { getAgentSnapshot, listAgentSessions, publishAgentSnapshot } from '@/lib/agent/serverBridge';
import { validateCoopInvite } from '@/lib/coop/inviteStore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const current = getAgentSnapshot(sessionId);
  if (!current) {
    return NextResponse.json({
      ok: false,
      error: 'No active Paradise City browser session is publishing state yet.',
      sessions: listAgentSessions(),
    }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    updatedAt: current.updatedAt,
    snapshot: current.snapshot,
    sessions: listAgentSessions(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { sessionId?: string; snapshot?: AgentCitySnapshot; inviteCode?: string };
  if (!body.sessionId || !body.snapshot) {
    return NextResponse.json({ ok: false, error: 'sessionId and snapshot are required' }, { status: 400 });
  }
  if (body.inviteCode && !(await validateCoopInvite(body.inviteCode))) {
    return NextResponse.json({ ok: false, error: 'Invalid invite code' }, { status: 401 });
  }

  publishAgentSnapshot(body.sessionId, body.snapshot, body.inviteCode);
  return NextResponse.json({ ok: true });
}
