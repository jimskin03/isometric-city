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
  joinRoom: (roomCode: string) => Promise<RoomData>;
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

export function MultiplayerContextProvider({ children }: { children: React.ReactNode }) {
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

  const joinRoom = useCallback(async (code: string): Promise<RoomData> => {
    setConnectionState('connecting');
    setError(null);
    setChatMessages([]);
    try {
      const normalizedCode = code.toUpperCase();
      const nextProvider = await createMultiplayerProvider({
        roomCode: normalizedCode,
        cityName: gt('Shared City'),
        playerName: displayName || undefined,
        participantType: 'human',
        userId: user?.id,
        userEmail: user?.email,
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
        cityName: gt('Shared City'),
        createdAt: Date.now(),
        playerCount: 1,
      };
    } catch (err) {
      setConnectionState('error');
      setError(err instanceof Error ? err.message : gt('Failed to join room'));
      throw err;
    }
  }, [displayName, gt, providerCallbacks, user]);

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
