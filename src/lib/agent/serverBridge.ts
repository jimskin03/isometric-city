import type { AgentActor, AgentCitySnapshot, AgentCommand, AgentCommandEnvelope } from './protocol';

type SessionState = {
  snapshot: AgentCitySnapshot;
  updatedAt: number;
};

type AgentBridgeStore = {
  sessions: Map<string, SessionState>;
  queues: Map<string, AgentCommandEnvelope[]>;
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
      latestSessionId: null,
    };
  }
  return globalThis.__paradiseAgentBridge;
}

export function publishAgentSnapshot(sessionId: string, snapshot: AgentCitySnapshot): void {
  const s = store();
  s.sessions.set(sessionId, { snapshot, updatedAt: Date.now() });
  s.latestSessionId = sessionId;
}

export function getAgentSnapshot(sessionId?: string | null): SessionState | null {
  const s = store();
  const id = sessionId || s.latestSessionId;
  if (!id) return null;
  return s.sessions.get(id) ?? null;
}

export function queueAgentCommand(command: AgentCommand, sessionId?: string | null, actor?: AgentActor): AgentCommandEnvelope {
  const s = store();
  const target = sessionId || s.latestSessionId;
  if (!target) throw new Error('No active Paradise City game session is connected.');

  const envelope: AgentCommandEnvelope = {
    id: crypto.randomUUID(),
    sessionId: target,
    command,
    actor,
    createdAt: Date.now(),
  };
  const queue = s.queues.get(target) ?? [];
  queue.push(envelope);
  s.queues.set(target, queue.slice(-200));
  return envelope;
}

export function drainAgentCommands(sessionId: string): AgentCommandEnvelope[] {
  const s = store();
  const queue = s.queues.get(sessionId) ?? [];
  s.queues.set(sessionId, []);
  return queue;
}

export function listAgentSessions(): Array<{ sessionId: string; updatedAt: number; cityName: string }> {
  return [...store().sessions.entries()]
    .map(([sessionId, value]) => ({
      sessionId,
      updatedAt: value.updatedAt,
      cityName: value.snapshot.city.name,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function agentWriteAuthorized(request: Request): boolean {
  const configuredToken = process.env.PARADISE_AGENT_TOKEN;
  if (!configuredToken) return true;
  return request.headers.get('x-paradise-agent-token') === configuredToken;
}
