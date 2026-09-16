// Supabase Realtime shared-session provider with database-backed state + chat persistence

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  ChatMessage,
  GameAction,
  GameActionInput,
  Player,
  ParticipantType,
  generatePlayerId,
  generatePlayerColor,
  generatePlayerName,
  MultiplayerGameState,
} from './types';
import {
  createGameRoom,
  loadGameRoom,
  updateGameRoom,
  updatePlayerCount,
  loadGameRoomMessages,
  createGameRoomMessage,
  CitySizeLimitError,
} from './database';
import { msg } from 'gt-next';
import { getSupabaseClient } from '@/lib/supabase';

const STATE_SAVE_INTERVAL = 3000;

export interface MultiplayerProviderOptions {
  roomCode: string;
  cityName: string;
  playerName?: string;
  participantType?: 'human' | 'agent';
  userId?: string;
  userEmail?: string;
  initialGameState?: MultiplayerGameState;
  onConnectionChange?: (connected: boolean, peerCount: number) => void;
  onPlayersChange?: (players: Player[]) => void;
  onAction?: (action: GameAction) => void;
  onStateReceived?: (state: MultiplayerGameState) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onChatHistory?: (messages: ChatMessage[]) => void;
  onError?: (error: string) => void;
}

export type ChatActorOverride = {
  id: string;
  name: string;
  type: Extract<ParticipantType, 'human' | 'agent'>;
};

export class MultiplayerProvider {
  public readonly roomCode: string;
  public readonly peerId: string;
  public readonly isCreator: boolean;

  private readonly supabase: SupabaseClient;
  private channel: RealtimeChannel;
  private player: Player;
  private options: MultiplayerProviderOptions;
  private players: Map<string, Player> = new Map();
  private gameState: MultiplayerGameState | null = null;
  private destroyed = false;
  private hasReceivedInitialState = false;
  private lastStateSave = 0;
  private pendingStateSave: MultiplayerGameState | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MultiplayerProviderOptions) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Shared sessions require Supabase configuration');

    this.supabase = supabase;
    this.options = options;
    this.roomCode = options.roomCode.toUpperCase();
    this.peerId = generatePlayerId();
    this.gameState = options.initialGameState || null;
    this.isCreator = !!options.initialGameState;

    this.player = {
      id: this.peerId,
      name: options.playerName || generatePlayerName(),
      color: generatePlayerColor(),
      joinedAt: Date.now(),
      isHost: false,
      kind: options.participantType || 'human',
      userId: options.userId,
      email: options.userEmail,
    };

    this.players.set(this.peerId, this.player);
    this.channel = this.supabase.channel(`room-${this.roomCode}`, {
      config: {
        presence: { key: this.peerId },
        broadcast: { self: false },
      },
    });
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    if (this.isCreator && this.gameState) {
      this.hasReceivedInitialState = true;
      try {
        const success = await createGameRoom(
          this.roomCode,
          this.options.cityName,
          this.gameState,
          this.options.userId ?? null,
        );
        if (!success) {
          this.options.onError?.(msg('Failed to create room in database'));
          throw new Error(msg('Failed to create room in database'));
        }
      } catch (e) {
        if (e instanceof CitySizeLimitError) this.options.onError?.(e.message);
        throw e;
      }
    } else {
      const roomData = await loadGameRoom(this.roomCode);
      if (!roomData) {
        this.options.onError?.(msg('Room not found'));
        throw new Error(msg('Room not found'));
      }
      this.gameState = roomData.gameState;
      this.options.onStateReceived?.(roomData.gameState);
    }

    try {
      const history = await loadGameRoomMessages(this.roomCode, 100);
      this.options.onChatHistory?.(history);
    } catch (error) {
      console.warn('[SharedSession] Chat history unavailable:', error);
    }

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        this.players.clear();
        this.players.set(this.peerId, this.player);
        Object.entries(state).forEach(([key, presences]) => {
          if (key !== this.peerId && presences.length > 0) {
            const presence = presences[0] as unknown as { player: Player };
            if (presence.player) this.players.set(key, presence.player);
          }
        });
        this.notifyPlayersChange();
        this.updateConnectionStatus();
        void updatePlayerCount(this.roomCode, this.players.size);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key === this.peerId || newPresences.length === 0) return;
        const presence = newPresences[0] as unknown as { player: Player };
        if (!presence.player) return;
        this.players.set(key, presence.player);
        this.notifyPlayersChange();
        this.updateConnectionStatus();

        if (this.gameState) {
          setTimeout(() => {
            if (!this.destroyed && this.gameState) {
              void this.channel.send({
                type: 'broadcast',
                event: 'state-sync',
                payload: { state: this.gameState, to: key, from: this.peerId },
              });
            }
          }, Math.random() * 200);
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this.players.delete(key);
        this.notifyPlayersChange();
        this.updateConnectionStatus();
        void updatePlayerCount(this.roomCode, this.players.size);
      })
      .on('broadcast', { event: 'action' }, ({ payload }) => {
        const action = payload as GameAction;
        if (!action || !action.type || !action.playerId) return;
        if (action.playerId !== this.peerId) this.options.onAction?.(action);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = payload as ChatMessage;
        if (!message?.id || !message.body) return;
        this.options.onChatMessage?.(message);
      })
      .on('broadcast', { event: 'state-sync' }, ({ payload }) => {
        const { state, to, from } = payload as { state: MultiplayerGameState; to: string; from: string };
        if (
          to === this.peerId &&
          !this.isCreator &&
          !this.hasReceivedInitialState &&
          from !== this.peerId &&
          state &&
          this.options.onStateReceived
        ) {
          this.hasReceivedInitialState = true;
          this.gameState = state;
          this.options.onStateReceived(state);
        }
      });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel.track({ player: this.player });
          this.options.onConnectionChange?.(true, this.players.size);
          this.notifyPlayersChange();
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true;
          reject(new Error(`Realtime channel failed: ${status}`));
        }
      });
    });
  }

  dispatchAction(action: GameActionInput): void {
    if (this.destroyed) return;
    const fullAction: GameAction = {
      ...action,
      timestamp: Date.now(),
      playerId: this.peerId,
    };
    void this.channel.send({ type: 'broadcast', event: 'action', payload: fullAction });
  }

  async sendChat(body: string, actor?: ChatActorOverride): Promise<ChatMessage | null> {
    if (this.destroyed) return null;
    const text = body.trim().slice(0, 2000);
    if (!text) return null;

    const message = await createGameRoomMessage({
      roomCode: this.roomCode,
      senderId: actor?.id || this.player.id,
      senderName: actor?.name || this.player.name,
      senderType: actor?.type || this.player.kind,
      body: text,
    });
    if (!message) return null;

    this.options.onChatMessage?.(message);
    await this.channel.send({ type: 'broadcast', event: 'chat', payload: message });
    return message;
  }

  updateGameState(state: MultiplayerGameState): void {
    this.gameState = state;
    const now = Date.now();
    const elapsed = now - this.lastStateSave;
    if (elapsed >= STATE_SAVE_INTERVAL) {
      this.saveStateToDatabase(state);
      return;
    }
    this.pendingStateSave = state;
    if (!this.saveTimeout) {
      this.saveTimeout = setTimeout(() => {
        this.saveTimeout = null;
        if (this.pendingStateSave && !this.destroyed) {
          this.saveStateToDatabase(this.pendingStateSave);
          this.pendingStateSave = null;
        }
      }, STATE_SAVE_INTERVAL - elapsed);
    }
  }

  private saveStateToDatabase(state: MultiplayerGameState): void {
    this.lastStateSave = Date.now();
    updateGameRoom(this.roomCode, state).catch((e) => {
      if (e instanceof CitySizeLimitError) {
        console.warn('[SharedSession] City too large to save:', e.message);
        this.options.onError?.(e.message);
      } else {
        console.error('[SharedSession] Failed to save state:', e);
      }
    });
  }

  private updateConnectionStatus(): void {
    this.options.onConnectionChange?.(true, this.players.size);
  }

  private notifyPlayersChange(): void {
    this.options.onPlayersChange?.(Array.from(this.players.values()));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pendingStateSave) {
      this.saveStateToDatabase(this.pendingStateSave);
      this.pendingStateSave = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    void this.channel.unsubscribe();
    void this.supabase.removeChannel(this.channel);
  }
}

export async function createMultiplayerProvider(options: MultiplayerProviderOptions): Promise<MultiplayerProvider> {
  const provider = new MultiplayerProvider(options);
  await provider.connect();
  return provider;
}
