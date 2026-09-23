'use client';

import { useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { useMultiplayerOptional } from '@/context/MultiplayerContext';
import { useCoopOptional } from '@/context/CoopContext';
import type { AgentCommandEnvelope } from '@/lib/agent/protocol';
import { createAgentSnapshot, createFounderPlan, isBlankCity } from '@/lib/agent/protocol';

const SESSION_STORAGE_KEY = 'paradise-agent-session-id';

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

export function AgentBridge() {
  const {
    latestStateRef,
    isStateReady,
    executeToolAtTile,
    setSpeed,
    setTaxRate,
    addNotification,
  } = useGame();
  const founderStartedRef = useRef(false);
  const multiplayer = useMultiplayerOptional();
  const coop = useCoopOptional();
  const multiplayerRef = useRef(multiplayer);

  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);

  useEffect(() => {
    if (!isStateReady) return;

    const sessionId = getOrCreateSessionId();
    // The session must publish whichever code it holds: the code a guest joined
    // with, the code a signed-in host generated (activeUserInviteCode), or the
    // code from the join link. Otherwise the write gate cannot match a valid code
    // against this session and every agent/guest build is rejected.
    const inviteCode =
      coop?.coopInvite?.code ||
      coop?.activeUserInviteCode ||
      new URLSearchParams(window.location.search).get('invite') ||
      undefined;
    let stopped = false;

    const publish = async () => {
      if (stopped) return;
      try {
        const mp = multiplayerRef.current;
        const snapshot = createAgentSnapshot(latestStateRef.current, sessionId, {
          roomCode: mp?.roomCode ?? null,
          participants: (mp?.players ?? []).map((player) => ({
            id: player.id,
            name: player.name,
            kind: player.kind || 'human',
          })),
          recentMessages: (mp?.chatMessages ?? []).slice(-20).map((message) => ({
            senderName: message.senderName,
            senderType: message.senderType,
            body: message.body,
            createdAt: message.createdAt,
          })),
        });
        await fetch('/api/agent/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, snapshot, inviteCode }),
          cache: 'no-store',
        });
      } catch (error) {
        console.warn('Agent state publish failed:', error);
      }
    };

    const executeFounder = () => {
      const current = latestStateRef.current;
      if (!isBlankCity(current)) return;
      const plan = createFounderPlan(current);
      for (const action of plan) executeToolAtTile(action.tool, action.x, action.y);
      setSpeed(1);
      addNotification(
        'Founder planner active',
        `An autonomous planner established the first district with ${plan.length} legal build actions.`,
        'city_hall',
      );
    };

    const reportResult = async (result: import('@/lib/agent/protocol').CommandExecutionResult) => {
      try {
        await fetch('/api/agent/commands', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ result }),
        });
      } catch (err) {
        console.warn('Failed to report command result:', err);
      }
    };

    const executeCommand = (envelope: AgentCommandEnvelope) => {
      const command = envelope.command;
      const state = latestStateRef.current;
      switch (command.type) {
        case 'place': {
          const inBounds = command.x >= 0 && command.x < state.gridSize && command.y >= 0 && command.y < state.gridSize;
          if (!inBounds) {
            void reportResult({
              commandId: envelope.id,
              status: 'rejected',
              appliedAt: Date.now(),
              totalCostCharged: 0,
              reason: 'out_of_bounds',
            });
            return;
          }
          executeToolAtTile(command.tool, command.x, command.y);
          void reportResult({
            commandId: envelope.id,
            status: 'applied',
            appliedAt: Date.now(),
            totalCostCharged: 0,
            actionResults: [{
              tool: command.tool,
              x: command.x,
              y: command.y,
              status: 'applied',
              costCharged: 0,
            }],
          });
          break;
        }
        case 'batch_place': {
          const actionResults: import('@/lib/agent/protocol').ActionExecutionResult[] = [];
          for (const action of command.actions.slice(0, 250)) {
            const inBounds = action.x >= 0 && action.x < state.gridSize && action.y >= 0 && action.y < state.gridSize;
            if (inBounds) {
              executeToolAtTile(action.tool, action.x, action.y);
              actionResults.push({
                tool: action.tool,
                x: action.x,
                y: action.y,
                status: 'applied',
                costCharged: 0,
              });
            } else {
              actionResults.push({
                tool: action.tool,
                x: action.x,
                y: action.y,
                status: 'rejected',
                costCharged: 0,
                reason: 'out_of_bounds',
              });
            }
          }
          void reportResult({
            commandId: envelope.id,
            status: actionResults.some((r) => r.status === 'applied') ? 'applied' : 'rejected',
            appliedAt: Date.now(),
            totalCostCharged: 0,
            actionResults,
          });
          break;
        }
        case 'set_speed':
          setSpeed(1);
          void reportResult({ commandId: envelope.id, status: 'applied', appliedAt: Date.now(), totalCostCharged: 0 });
          break;
        case 'set_tax':
          setTaxRate(command.rate);
          void reportResult({ commandId: envelope.id, status: 'applied', appliedAt: Date.now(), totalCostCharged: 0 });
          break;
        case 'bootstrap_city':
          executeFounder();
          void reportResult({ commandId: envelope.id, status: 'applied', appliedAt: Date.now(), totalCostCharged: 0 });
          break;
        case 'chat': {
          const mp = multiplayerRef.current;
          if (mp?.connectionState === 'connected') {
            void mp.sendChat(command.message, {
              id: envelope.actor?.id || `agent-${envelope.id}`,
              name: envelope.actor?.name || 'Paradise Agent',
              type: 'agent',
            });
          }
          void reportResult({ commandId: envelope.id, status: 'applied', appliedAt: Date.now(), totalCostCharged: 0 });
          break;
        }
      }
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/agent/commands?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = await response.json() as { commands?: AgentCommandEnvelope[] };
        for (const command of payload.commands ?? []) executeCommand(command);
      } catch (error) {
        console.warn('Agent command poll failed:', error);
      }
    };

    void publish();
    const publishTimer = window.setInterval(() => void publish(), 2000);
    const pollTimer = window.setInterval(() => void poll(), 750);

    const founderTimer = window.setInterval(() => {
      if (founderStartedRef.current || !isBlankCity(latestStateRef.current)) {
        window.clearInterval(founderTimer);
        return;
      }
      const mp = multiplayerRef.current;
      if (mp?.connectionState === 'connected' && !mp.isHost) return;

      founderStartedRef.current = true;
      executeFounder();
      window.clearInterval(founderTimer);
      window.setTimeout(() => void publish(), 250);
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(publishTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(founderTimer);
    };
  }, [addNotification, coop?.activeUserInviteCode, coop?.coopInvite?.code, executeToolAtTile, isStateReady, latestStateRef, setSpeed, setTaxRate]);

  return null;
}
