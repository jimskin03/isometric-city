import { NextRequest, NextResponse } from 'next/server';
import type { AgentActor, AgentCommand, CommandExecutionResult } from '@/lib/agent/protocol';
import {
  agentWriteAuthorized,
  drainAgentCommands,
  findSessionIdWithInvite,
  getCommandResult,
  isExecutorAlive,
  queueAgentCommand,
  recordCommandResult,
  resolveAgentSessionId,
  sessionInviteValid,
} from '@/lib/agent/serverBridge';
import { validateCoopInvite } from '@/lib/coop/inviteStore';
import { executeCommandOnServer } from '@/lib/agent/serverSimulation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const commandId = request.nextUrl.searchParams.get('commandId');
  if (commandId) {
    const result = getCommandResult(commandId);
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Command not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, result });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId or commandId is required' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, commands: drainAgentCommands(sessionId) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    inviteCode?: string;
    command?: AgentCommand;
    actor?: AgentActor;
    result?: CommandExecutionResult;
  };

  // Support recording command results from browser executor
  if (body.result && body.result.commandId) {
    recordCommandResult(body.result);
    return NextResponse.json({ ok: true, recorded: true });
  }

  const headerInviteCode = request.headers.get('x-paradise-invite-code');
  const paramInviteCode = request.nextUrl.searchParams.get('inviteCode');
  const presentedCode = headerInviteCode || paramInviteCode || body.inviteCode || null;

  const tokenAuthorized = agentWriteAuthorized(request);
  const invite = presentedCode ? await validateCoopInvite(presentedCode) : null;

  if (!invite && !tokenAuthorized) {
    return NextResponse.json({ ok: false, error: 'Invalid agent token or invite code' }, { status: 401 });
  }

  if (!body.command || typeof body.command.type !== 'string') {
    return NextResponse.json({ ok: false, error: 'command is required' }, { status: 400 });
  }

  // Rule 3: Speed is locked to 1X
  if (body.command.type === 'set_speed') {
    body.command.speed = 1;
  }

  let actor = body.actor;
  if (invite) {
    actor = {
      id: body.actor?.id || `agent-guest-${invite.code.toLowerCase()}`,
      name: body.actor?.name || `Agent (Invited by ${invite.userDisplayName})`,
    };
  }

  // Agents usually do not know the browser session id: `npm run agent -- place ...`
  // sends none. Route the command to the session that published the presented
  // code, falling back to the session that is actively publishing state — which
  // is what the command queue already targets — instead of rejecting a valid code.
  const sessionId =
    body.sessionId ||
    findSessionIdWithInvite(invite?.code) ||
    resolveAgentSessionId(null);

  const hasLiveBrowser = isExecutorAlive(sessionId);

  try {
    if (hasLiveBrowser && sessionId) {
      if (invite && !tokenAuthorized && !sessionInviteValid(sessionId, invite.code)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Invite code ${invite.code} is not bound to browser session ${sessionId}. Open the game with ?invite=${invite.code} or pass --session <id>.`,
          },
          { status: 401 },
        );
      }
      const queued = queueAgentCommand(body.command, sessionId, actor);
      return NextResponse.json({
        ok: true,
        queued,
        result: {
          commandId: queued.id,
          status: 'queued',
          totalCostCharged: 0,
        },
      });
    }

    // Headless simulation execution fallback
    const commandId = crypto.randomUUID();
    const result = executeCommandOnServer(body.command, commandId, actor);
    return NextResponse.json({
      ok: true,
      executedLocally: true,
      commandId,
      result,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unable to execute command' }, { status: 409 });
  }
}
