import type {
  AgentActor,
  AgentCitySnapshot,
  AgentCommand,
  AgentCommandEnvelope,
  CommandExecutionResult,
} from './protocol';

type SessionState = {
  snapshot: AgentCitySnapshot;
  updatedAt: number;
  inviteCode?: string;
};

type AgentBridgeStore = {
  sessions: Map<string, SessionState>;
  queues: Map<string, AgentCommandEnvelope[]>;
  results: Map<string, CommandExecutionResult>;
  latestSessionId: string | null;
};

declare global {
  var __paradiseAgentBridge: AgentBridgeStore | undefined;
}

function store(): AgentBridgeStore {
  if (!globalThis.__paradiseAgentBridge) {
    globalThis.__paradiseAgentBridge = {
      sessions: new Map(),
      queues: new Map(),
      results: new Map(),
      latestSessionId: null,
    };
  }
  return globalThis.__paradiseAgentBridge;
}

export function publishAgentSnapshot(sessionId: string, snapshot: AgentCitySnapshot, inviteCode?: string): void {
  const s = store();
  s.sessions.set(sessionId, { snapshot, updatedAt: Date.now(), inviteCode });
  s.latestSessionId = sessionId;
}

export function sessionInviteValid(sessionId: string | null | undefined, inviteCode: string | null | undefined): boolean {
  if (!sessionId || !inviteCode) return false;
  const current = store().sessions.get(sessionId);
  return !!current?.inviteCode && current.inviteCode === inviteCode.trim().toUpperCase();
}

/**
 * Find the browser session that published a given invite code. An agent that
 * presents a valid code should be routed to the session that code belongs to,
 * not to whichever browser happens to have published state most recently.
 */
export function findSessionIdWithInvite(inviteCode: string | null | undefined): string | null {
  if (!inviteCode) return null;
  const code = inviteCode.trim().toUpperCase();
  let best: { sessionId: string; updatedAt: number } | null = null;
  for (const [sessionId, state] of store().sessions.entries()) {
    if (state.inviteCode !== code) continue;
    if (!best || state.updatedAt > best.updatedAt) best = { sessionId, updatedAt: state.updatedAt };
  }
  return best?.sessionId ?? null;
}

/**
 * Resolve the session a command should target. Agents normally do not know the
 * browser session id, and the command queue already falls back to the session
 * that is actively publishing state, so authorization must use the same target.
 */
export function resolveAgentSessionId(sessionId?: string | null): string | null {
  const s = store();
  return sessionId || s.latestSessionId;
}

export function getAgentSnapshot(sessionId?: string | null): SessionState | null {
  const s = store();
  const id = sessionId || s.latestSessionId;
  if (!id) return null;
  return s.sessions.get(id) ?? null;
}

export function isExecutorAlive(sessionId?: string | null): boolean {
  const snapshot = getAgentSnapshot(sessionId);
  if (!snapshot) return false;
  return Date.now() - snapshot.updatedAt < 5000;
}

export function queueAgentCommand(
  command: AgentCommand,
  sessionId?: string | null,
  actor?: AgentActor
): AgentCommandEnvelope {
  const s = store();
  const target = sessionId || s.latestSessionId;
  if (!target) {
    // If no target yet, generate a default canonical session id so server can process
    const fallbackId = 'canonical-paradise-session';
    s.latestSessionId = fallbackId;
  }

  const resolvedTarget = sessionId || s.latestSessionId || 'canonical-paradise-session';

  const envelope: AgentCommandEnvelope = {
    id: crypto.randomUUID(),
    sessionId: resolvedTarget,
    command,
    actor,
    createdAt: Date.now(),
  };

  // Register initial 'queued' status
  s.results.set(envelope.id, {
    commandId: envelope.id,
    status: 'queued',
    totalCostCharged: 0,
  });

  const queue = s.queues.get(resolvedTarget) ?? [];
  queue.push(envelope);
  s.queues.set(resolvedTarget, queue.slice(-200));
  return envelope;
}

export function drainAgentCommands(sessionId: string): AgentCommandEnvelope[] {
  const s = store();
  const queue = s.queues.get(sessionId) ?? [];
  s.queues.set(sessionId, []);
  return queue;
}

export function recordCommandResult(result: CommandExecutionResult): void {
  const s = store();
  s.results.set(result.commandId, result);
}

export function getCommandResult(commandId: string): CommandExecutionResult | null {
  const s = store();
  return s.results.get(commandId) ?? null;
}

export function listAgentSessions(): Array<{ sessionId: string; updatedAt: number; cityName: string }> {
  return [...store().sessions.entries()]
    .map(([sessionId, value]) => ({
      sessionId,
      updatedAt: value.updatedAt,
      cityName: value.snapshot?.city?.name ?? 'Paradise City',
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function agentWriteAuthorized(request: Request): boolean {
  const configuredToken = process.env.PARADISE_AGENT_TOKEN;
  if (!configuredToken) return false;
  return request.headers.get('x-paradise-agent-token') === configuredToken;
}
