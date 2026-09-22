'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  MultiplayerProvider,
  createMultiplayerProvider,
  type ChatActorOverride,
} from '@/lib/multiplayer/supabaseProvider';
import {
  ChatMessage,
  GameAction,
  GameActionInput,
  Player,
  ConnectionState,
  RoomData,
  MultiplayerGameState,
} from '@/lib/multiplayer/types';
import { useGT } from 'gt-next';
import { useAuth } from '@/context/AuthContext';
import { PARADISE_CITY } from '@/config/paradise';
import { createInitialGameState, DEFAULT_GRID_SIZE } from '@/lib/simulation';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface MultiplayerContextValue {
  connectionState: ConnectionState;
  roomCode: string | null;
  players: Player[];
  chatMessages: ChatMessage[];
  error: string | null;
  createRoom: (cityName: string, initialState: MultiplayerGameState) => Promise<string>;
  joinRoom: (roomCode: string, fallbackInitialState?: MultiplayerGameState) => Promise<RoomData>;
  connectUnifiedRoom: (fallbackInitialState?: MultiplayerGameState) => Promise<RoomData>;
  leaveRoom: () => void;
  dispatchAction: (action: GameActionInput) => void;
  sendChat: (body: string, actor?: ChatActorOverride) => Promise<ChatMessage | null>;
  initialState: MultiplayerGameState | null;
  onRemoteAction: ((action: GameAction) => void) | null;
  setOnRemoteAction: (callback: ((action: GameAction) => void) | null) => void;
  updateGameState: (state: MultiplayerGameState) => void;
  provider: MultiplayerProvider | null;
  isHost: boolean;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerContextProvider({
  children,
  autoConnectUnified = false,
}: {
  children: React.ReactNode;
  autoConnectUnified?: boolean;
}) {
  const gt = useGT();
  const { user, displayName } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<MultiplayerGameState | null>(null);
  const [provider, setProvider] = useState<MultiplayerProvider | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [onRemoteAction, setOnRemoteAction] = useState<((action: GameAction) => void) | null>(null);

  const providerRef = useRef<MultiplayerProvider | null>(null);
  const onRemoteActionRef = useRef<((action: GameAction) => void) | null>(null);

  const appendChat = useCallback((message: ChatMessage) => {
    setChatMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
      return [...current, message].sort((a, b) => a.createdAt - b.createdAt).slice(-200);
    });
  }, []);

  const handleSetOnRemoteAction = useCallback((callback: ((action: GameAction) => void) | null) => {
    onRemoteActionRef.current = callback;
    setOnRemoteAction(callback);
  }, []);

  const providerCallbacks = useCallback(() => ({
    onConnectionChange: (connected: boolean) => setConnectionState(connected ? 'connected' : 'disconnected'),
    onPlayersChange: (newPlayers: Player[]) => setPlayers(newPlayers),
    onHostChange: (host: boolean) => setIsHost(host),
    onStateReceived: (state: MultiplayerGameState) => setInitialState(state),
    onAction: (action: GameAction) => onRemoteActionRef.current?.(action),
    onChatMessage: appendChat,
    onChatHistory: (messages: ChatMessage[]) => setChatMessages(messages.slice(-200)),
    onError: (message: string) => {
      setError(message);
      setConnectionState('error');
    },
  }), [appendChat]);

  const createRoom = useCallback(async (cityName: string, gameState: MultiplayerGameState): Promise<string> => {
    setConnectionState('connecting');
    setError(null);
    setChatMessages([]);
    try {
      const newRoomCode = generateRoomCode();
      const nextProvider = await createMultiplayerProvider({
        roomCode: newRoomCode,
        cityName,
        initialGameState: gameState,
        playerName: displayName || undefined,
        participantType: 'human',
        userId: user?.id,
        userEmail: user?.email,
        ...providerCallbacks(),
      });
      providerRef.current = nextProvider;
      setProvider(nextProvider);
      setRoomCode(newRoomCode);
      setConnectionState('connected');
      return newRoomCode;
    } catch (err) {
      setConnectionState('error');
      setError(err instanceof Error ? err.message : gt('Failed to create room'));
      throw err;
    }
  }, [displayName, gt, providerCallbacks, user]);

  const joinRoom = useCallback(async (code: string, fallbackInitialState?: MultiplayerGameState): Promise<RoomData> => {
    setConnectionState('connecting');
    setError(null);
    setChatMessages([]);
    try {
      const normalizedCode = code.toUpperCase();
      const isUnified = normalizedCode === PARADISE_CITY.unifiedRoomCode.toUpperCase();
      const nextProvider = await createMultiplayerProvider({
        roomCode: normalizedCode,
        cityName: isUnified ? PARADISE_CITY.name : gt('Shared City'),
        playerName: displayName || undefined,
        participantType: 'human',
        userId: user?.id,
        userEmail: user?.email,
        initialGameState: fallbackInitialState,
        ...providerCallbacks(),
        onStateReceived: (state) => setInitialState(state),
      });
      providerRef.current = nextProvider;
      setProvider(nextProvider);
      setRoomCode(normalizedCode);
      setConnectionState('connected');
      return {
        code: normalizedCode,
        hostId: '',
        cityName: isUnified ? PARADISE_CITY.name : gt('Shared City'),
        createdAt: Date.now(),
        playerCount: 1,
      };
    } catch (err) {
      setConnectionState('error');
      setError(err instanceof Error ? err.message : gt('Failed to join room'));
      throw err;
    }
  }, [displayName, gt, providerCallbacks, user]);

  const connectUnifiedRoom = useCallback(async (fallbackInitialState?: MultiplayerGameState): Promise<RoomData> => {
    const fallback = fallbackInitialState || (createInitialGameState(DEFAULT_GRID_SIZE, PARADISE_CITY.name) as MultiplayerGameState);
    return joinRoom(PARADISE_CITY.unifiedRoomCode, fallback);
  }, [joinRoom]);

  // Sync auth state changes into active player presence
  useEffect(() => {
    if (providerRef.current) {
      providerRef.current.updatePlayer({
        name: displayName || undefined,
        userId: user?.id ?? null,
        email: user?.email ?? null,
      });
    }
  }, [user, displayName]);

  // Auto-connect to unified room if configured
  useEffect(() => {
    if (autoConnectUnified && connectionState === 'disconnected' && !roomCode) {
      void connectUnifiedRoom().catch((err) => {
        console.warn('Auto-connect to unified room encountered an error, falling back to local simulation:', err);
      });
    }
  }, [autoConnectUnified, connectionState, roomCode, connectUnifiedRoom]);

  const leaveRoom = useCallback(() => {
    providerRef.current?.destroy();
    providerRef.current = null;
    setProvider(null);
    setConnectionState('disconnected');
    setRoomCode(null);
    setPlayers([]);
    setChatMessages([]);
    setIsHost(false);
    setError(null);
    setInitialState(null);
  }, []);

  const dispatchAction = useCallback((action: GameActionInput) => {
    providerRef.current?.dispatchAction(action);
  }, []);

  const sendChat = useCallback(async (body: string, actor?: ChatActorOverride) => {
    return providerRef.current?.sendChat(body, actor) ?? null;
  }, []);

  const updateGameState = useCallback((state: MultiplayerGameState) => {
    providerRef.current?.updateGameState(state);
  }, []);

  useEffect(() => () => providerRef.current?.destroy(), []);

  const value: MultiplayerContextValue = {
    connectionState,
    roomCode,
    players,
    chatMessages,
    error,
    createRoom,
    joinRoom,
    connectUnifiedRoom,
    leaveRoom,
    dispatchAction,
    sendChat,
    initialState,
    onRemoteAction,
    setOnRemoteAction: handleSetOnRemoteAction,
    updateGameState,
    provider,
    isHost,
  };

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
}

export function useMultiplayer() {
  const context = useContext(MultiplayerContext);
  if (!context) throw new Error('useMultiplayer must be used within a MultiplayerContextProvider');
  return context;
}

export function useMultiplayerOptional() {
  return useContext(MultiplayerContext);
}
