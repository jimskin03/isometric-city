'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCoop } from '@/context/CoopContext';
import { useMultiplayerOptional } from '@/context/MultiplayerContext';
import { useGame } from '@/context/GameContext';
import { PARADISE_CITY } from '@/config/paradise';

export type BootPhase =
  | 'loading_auth'
  | 'validating_invite'
  | 'joining_room'
  | 'loading_city'
  | 'ready'
  | 'error';

export interface AgentReadinessContract {
  ready: boolean;
  phase: BootPhase;
  roomCode: string;
  cityId: string | null;
  cityName: string;
  canBuild: boolean;
  authenticatedActor: {
    id: string;
    name: string;
    role: 'signed_in_user' | 'coop_guest' | 'spectator';
  };
  stateVersion: number;
  simulationTick: number;
  lastTickAt: number;
  lastStateChangeAt: number;
  lastPublisherSeenAt: number;
  error?: {
    code: string;
    message: string;
    retryGuidance: string;
  } | null;
}

declare global {
  interface Window {
    __PARADISE_READINESS__?: AgentReadinessContract;
  }
}

const ReadinessContext = createContext<AgentReadinessContract | null>(null);

let gLastTickAt = 0;
let gLastStateChangeAt = 0;

export function ReadinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, displayName } = useAuth();
  const { isCoopWithCode, coopGuestInfo } = useCoop();
  const multiplayer = useMultiplayerOptional();
  const game = useGame();

  const canBuild = !!user || isCoopWithCode;

  // Track timestamps in effects
  const currentGameVersion = game.state.gameVersion;
  useEffect(() => {
    gLastStateChangeAt = Date.now();
  }, [currentGameVersion]);

  const currentMonth = game.state.month;
  const currentYear = game.state.year;
  const currentDay = game.state.day;
  useEffect(() => {
    gLastTickAt = Date.now();
  }, [currentMonth, currentYear, currentDay]);

  // Derive boot phase purely from underlying context states without setState
  let phase: BootPhase = 'ready';
  if (authLoading) {
    phase = 'loading_auth';
  } else if (multiplayer && multiplayer.connectionState === 'connecting') {
    phase = 'joining_room';
  } else if (!game.isStateReady) {
    phase = 'loading_city';
  }

  // Derive simulation tick and state version directly from game state
  const simulationTick =
    (game.state.year - 2024) * 360 + game.state.month * 30 + game.state.day;
  const stateVersion = game.state.gameVersion || 1;

  const authenticatedActor = useMemo(() => {
    if (user) {
      return {
        id: user.id,
        name: displayName || user.email || 'Citizen Host',
        role: 'signed_in_user' as const,
      };
    }
    if (isCoopWithCode && coopGuestInfo) {
      return {
        id: `guest-${coopGuestInfo.code.toLowerCase()}`,
        name: `Guest (${coopGuestInfo.userDisplayName})`,
        role: 'coop_guest' as const,
      };
    }
    return {
      id: 'spectator',
      name: 'Spectator Visitor',
      role: 'spectator' as const,
    };
  }, [user, displayName, isCoopWithCode, coopGuestInfo]);

  const readiness: AgentReadinessContract = useMemo(() => {
    const isReady = phase === 'ready';
    return {
      ready: isReady,
      phase,
      roomCode: multiplayer?.roomCode || PARADISE_CITY.unifiedRoomCode,
      cityId: game.state.id || null,
      cityName: game.state.cityName || PARADISE_CITY.name,
      canBuild,
      authenticatedActor,
      stateVersion,
      simulationTick,
      lastTickAt: gLastTickAt,
      lastStateChangeAt: gLastStateChangeAt,
      lastPublisherSeenAt: gLastStateChangeAt || gLastTickAt || 0,
      error: null,
    };
  }, [phase, multiplayer?.roomCode, game.state.id, game.state.cityName, stateVersion, canBuild, authenticatedActor, simulationTick]);

  // Expose to window.__PARADISE_READINESS__ for headless Chromium and automated tools
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__PARADISE_READINESS__ = readiness;
    }
  }, [readiness]);

  return (
    <ReadinessContext.Provider value={readiness}>
      {/* Hidden DOM element with explicit data attributes for reliable headless scraping */}
      <div
        id="paradise-agent-readiness"
        style={{ display: 'none' }}
        data-ready={readiness.ready ? 'true' : 'false'}
        data-phase={readiness.phase}
        data-room={readiness.roomCode}
        data-can-build={readiness.canBuild ? 'true' : 'false'}
        data-actor-role={readiness.authenticatedActor.role}
        data-actor-name={readiness.authenticatedActor.name}
        data-city-name={readiness.cityName}
        data-simulation-tick={readiness.simulationTick}
        data-state-version={readiness.stateVersion}
      />
      {children}
    </ReadinessContext.Provider>
  );
}

export function useReadiness() {
  const ctx = useContext(ReadinessContext);
  if (!ctx) {
    throw new Error('useReadiness must be used within a ReadinessProvider');
  }
  return ctx;
}
