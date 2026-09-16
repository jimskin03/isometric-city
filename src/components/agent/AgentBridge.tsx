'use client';

import { useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
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

  useEffect(() => {
    if (!isStateReady) return;

    const sessionId = getOrCreateSessionId();
    let stopped = false;

    const publish = async () => {
      if (stopped) return;
      try {
        const snapshot = createAgentSnapshot(latestStateRef.current, sessionId);
        await fetch('/api/agent/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, snapshot }),
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
      setSpeed(2);
      addNotification(
        'Founder planner active',
        `An autonomous planner established the first district with ${plan.length} legal build actions.`,
        'city_hall',
      );
    };

    const executeCommand = (envelope: AgentCommandEnvelope) => {
      const command = envelope.command;
      switch (command.type) {
        case 'place':
          executeToolAtTile(command.tool, command.x, command.y);
          break;
        case 'batch_place':
          for (const action of command.actions.slice(0, 250)) {
            executeToolAtTile(action.tool, action.x, action.y);
          }
          break;
        case 'set_speed':
          setSpeed(command.speed);
          break;
        case 'set_tax':
          setTaxRate(command.rate);
          break;
        case 'bootstrap_city':
          executeFounder();
          break;
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

    const founderTimer = window.setTimeout(() => {
      if (!founderStartedRef.current && isBlankCity(latestStateRef.current)) {
        founderStartedRef.current = true;
        executeFounder();
        window.setTimeout(() => void publish(), 250);
      }
    }, 1200);

    return () => {
      stopped = true;
      window.clearInterval(publishTimer);
      window.clearInterval(pollTimer);
      window.clearTimeout(founderTimer);
    };
  }, [addNotification, executeToolAtTile, isStateReady, latestStateRef, setSpeed, setTaxRate]);

  return null;
}
