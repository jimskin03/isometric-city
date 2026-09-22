import { NextRequest, NextResponse } from 'next/server';
import type { AgentActor, AgentCommand } from '@/lib/agent/protocol';
import { agentWriteAuthorized, drainAgentCommands, findSessionIdWithInvite, queueAgentCommand, resolveAgentSessionId, sessionInviteValid } from '@/lib/agent/serverBridge';
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
  const headerInviteCode = request.headers.get('x-paradise-invite-code');
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    inviteCode?: string;
    command?: AgentCommand;
    actor?: AgentActor;
  };

  const tokenAuthorized = agentWriteAuthorized(request);
  const presentedCode = headerInviteCode || body.inviteCode || null;
  const invite = presentedCode ? await validateCoopInvite(presentedCode) : null;

  if (!invite && !tokenAuthorized) {
    return NextResponse.json({ ok: false, error: 'Invalid agent token or invite code' }, { status: 401 });
  }

  // Agents usually do not know the browser session id: `npm run agent -- place ...`
  // sends none. Route the command to the session that published the presented
  // code, falling back to the session that is actively publishing state — which
  // is what the command queue already targets — instead of rejecting a valid code.
  const sessionId =
    body.sessionId ||
    findSessionIdWithInvite(invite?.code) ||
    resolveAgentSessionId(null);

  if (invite && !tokenAuthorized) {
    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'No Paradise City browser session is publishing state yet. Open the game, then retry.' },
        { status: 409 },
      );
    }
    if (!sessionInviteValid(sessionId, invite.code)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invite code ${invite.code} is not bound to browser session ${sessionId}. Open the game with ?invite=${invite.code} or pass --session <id>.`,
        },
        { status: 401 },
      );
    }
  }

  if (!body.command || typeof body.command.type !== 'string') {
    return NextResponse.json({ ok: false, error: 'command is required' }, { status: 400 });
  }

  try {
    const queued = queueAgentCommand(body.command, sessionId, body.actor);
    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to queue command' }, { status: 409 });
  }
}
