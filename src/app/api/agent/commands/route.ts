import { NextRequest, NextResponse } from 'next/server';
import type { AgentActor, AgentCommand } from '@/lib/agent/protocol';
import { agentWriteAuthorized, drainAgentCommands, queueAgentCommand, sessionInviteValid } from '@/lib/agent/serverBridge';
import { validateCoopInvite } from '@/lib/coop/inviteStore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId is required' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, commands: drainAgentCommands(sessionId) });
}

export async function POST(request: NextRequest) {
  const inviteCode = request.headers.get('x-paradise-invite-code');
  const inviteValid = !!inviteCode && !!validateCoopInvite(inviteCode);
  if (!inviteValid && !agentWriteAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid agent token or invite code' }, { status: 401 });
  }

  const body = await request.json() as { sessionId?: string; inviteCode?: string; command?: AgentCommand; actor?: AgentActor };
  const bodyInviteValid = !!body.inviteCode && !!validateCoopInvite(body.inviteCode);
  const sessionId = body.sessionId;
  const scopedInviteValid = (inviteValid || bodyInviteValid) && sessionInviteValid(sessionId, inviteCode || body.inviteCode);
  if (!scopedInviteValid && !agentWriteAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid agent token or invite code' }, { status: 401 });
  }
  if (!body.command || typeof body.command.type !== 'string') {
    return NextResponse.json({ ok: false, error: 'command is required' }, { status: 400 });
  }

  try {
    const queued = queueAgentCommand(body.command, body.sessionId, body.actor);
    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to queue command' }, { status: 409 });
  }
}
