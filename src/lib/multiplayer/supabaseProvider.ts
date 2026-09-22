// Supabase Realtime shared-session provider with one authoritative simulator.

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
  loadOrCreateGameRoom,
  updateGameRoom,
  updatePlayerCount,
  loadGameRoomMessages,
  createGameRoomMessage,
  CitySizeLimitError,
} from './database';
import { msg } from 'gt-next';
import { getSupabaseClient } from '@/lib/supabase';
import { PARADISE_CITY } from '@/config/paradise';

const STATE_SAVE_INTERVAL = 3000;

type ActionCommitPayload = {
  action: GameAction;
  authorityId: string;
};

type StateRevisionPayload = {
  revision: number;
  tick: number;
  authorityId: string;
};

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
  onStateReceived?: (state: MultiplayerGameState, revision: number) => void;
  onHostChange?: (isHost: boolean, hostId: string | null) => void;
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
  private isHostValue = false;
  private hostId: string | null = null;
  private stateRevision = 0;
  private lastStateSave = 0;
  private pendingStateSave: MultiplayerGameState | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private stateSaveInFlight = false;
  private subscribed = false;
  private hostElectionTimer: ReturnType<typeof setTimeout> | null = null;
  private hostReady = false;
  private pendingAuthorityActions: GameAction[] = [];

  constructor(options: MultiplayerProviderOptions) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Shared sessions require Supabase configuration');

    this.supabase = supabase;
    this.options = options;
    this.roomCode = options.roomCode.toUpperCase();
    this.peerId = generatePlayerId();
    this.gameState = options.initialGameState || null;
    this.isCreator = !!options.initialGameState;

    // The creator advertises itself as the initial authority. If it leaves,
    // remaining participants deterministically elect the oldest presence.
    this.player = {
      id: this.peerId,
      name: options.playerName || generatePlayerName(),
      color: generatePlayerColor(),
      joinedAt: Date.now(),
      isHost: this.isCreator,
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

    const isUnifiedRoom = this.roomCode === PARADISE_CITY.unifiedRoomCode.toUpperCase();
    if (this.isCreator && this.gameState) {
      try {
        const success = await createGameRoom(
          this.roomCode,
          this.options.cityName,
          this.gameState,
          this.options.userId ?? null,
        );
        if (!success) {
          // If room already exists, load existing room
          const loaded = await loadGameRoom(this.roomCode);
          if (loaded) {
            this.gameState = loaded.gameState;
            this.stateRevision = loaded.stateRevision;
            this.options.onStateReceived?.(loaded.gameState, loaded.stateRevision);
          } else {
            this.options.onError?.(msg('Failed to create room in database'));
            throw new Error(msg('Failed to create room in database'));
          }
        } else {
          this.stateRevision = 0;
        }
      } catch (error) {
        if (error instanceof CitySizeLimitError) this.options.onError?.(error.message);
        throw error;
      }
    } else {
      let roomData = await loadGameRoom(this.roomCode);
      if (!roomData && (isUnifiedRoom || this.options.initialGameState)) {
        if (this.options.initialGameState) {
          const loadedOrCreate = await loadOrCreateGameRoom(
            this.roomCode,
            this.options.cityName,
            this.options.initialGameState,
            this.options.userId ?? null
          );
          if (loadedOrCreate) {
            roomData = loadedOrCreate;
            if (loadedOrCreate.createdNew) {
              this.isHostValue = true;
              this.player.isHost = true;
            }
          }
        }
      }
      if (!roomData) {
        this.options.onError?.(msg('Room not found'));
        throw new Error(msg('Room not found'));
      }
      this.gameState = roomData.gameState;
      this.stateRevision = roomData.stateRevision;
      this.options.onStateReceived?.(roomData.gameState, roomData.stateRevision);
    }

    try {
      const history = await loadGameRoomMessages(this.roomCode, 100);
      this.options.onChatHistory?.(history);
    } catch (error) {
      console.warn('[SharedSession] Chat history unavailable:', error);
    }

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = this.channel.presenceState();
        this.players.clear();
        this.players.set(this.peerId, this.player);
        Object.entries(presenceState).forEach(([key, presences]) => {
          if (key === this.peerId || presences.length === 0) return;
          const presence = presences[0] as unknown as { player: Player };
          if (presence.player) this.players.set(key, presence.player);
        });
        this.reconcileHost();
        this.updateConnectionStatus(true);
        if (this.isHostValue) void updatePlayerCount(this.roomCode, this.players.size);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key === this.peerId || newPresences.length === 0) return;
        const presence = newPresences[0] as unknown as { player: Player };
        if (!presence.player) return;
        this.players.set(key, presence.player);
        this.reconcileHost();
        this.updateConnectionStatus(true);
        if (this.isHostValue) void updatePlayerCount(this.roomCode, this.players.size);
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this.players.delete(key);
        this.reconcileHost();
        this.updateConnectionStatus(true);
        if (this.isHostValue) void updatePlayerCount(this.roomCode, this.players.size);
      })
      .on('broadcast', { event: 'action-request' }, ({ payload }) => {
        if (!this.isHostValue) return;
        const action = payload as GameAction;
        if (!this.isValidAction(action) || action.playerId === this.peerId) return;

        if (!this.hostReady) {
          this.pendingAuthorityActions.push(action);
          return;
        }

        // The host serializes guest intents, applies them once, then commits the
        // accepted action ordering to all guests.
        this.applyAndCommitAuthorityAction(action);
      })
      .on('broadcast', { event: 'action-commit' }, ({ payload }) => {
        if (this.isHostValue) return;
        const commit = payload as ActionCommitPayload;
        if (!commit || commit.authorityId !== this.hostId || !this.isValidAction(commit.action)) return;
        // The origin already applied its own command optimistically.
        if (commit.action.playerId !== this.peerId) this.options.onAction?.(commit.action);
      })
      .on('broadcast', { event: 'state-revision' }, ({ payload }) => {
        if (this.isHostValue) return;
        const update = payload as StateRevisionPayload;
        if (!update || update.authorityId !== this.hostId || !Number.isFinite(update.revision)) return;
        if (update.revision > this.stateRevision) void this.refreshCanonicalState(update.revision);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const message = payload as ChatMessage;
        if (!message?.id || !message.body) return;
        this.options.onChatMessage?.(message);
      });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.subscribed = true;
          await this.channel.track({ player: this.player });
          this.options.onConnectionChange?.(true, this.players.size);

          // A reconnect can miss broadcasts; database state is the recovery path.
          if (!this.isCreator && settled) void this.refreshCanonicalState();

          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.subscribed = false;
          this.options.onConnectionChange?.(false, this.players.size);
          if (!settled) {
            settled = true;
            reject(new Error(`Realtime channel failed: ${status}`));
          }
        }
      });
    });
  }

  dispatchAction(action: GameActionInput): void {
    if (this.destroyed || !this.subscribed) return;
    const fullAction: GameAction = {
      ...action,
      timestamp: Date.now(),
      playerId: this.peerId,
    };

    if (this.isHostValue) {
      if (!this.hostReady) {
        // A newly elected host reloads canonical state before accepting writes.
        // Reapply this optimistic local command after the reload completes.
        this.pendingAuthorityActions.push(fullAction);
        return;
      }
      // The local host already applied this action through GameContext.
      void this.broadcastCommittedAction(fullAction);
    } else {
      void this.channel.send({
        type: 'broadcast',
        event: 'action-request',
        payload: fullAction,
      });
    }
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
    if (this.subscribed) {
      await this.channel.send({ type: 'broadcast', event: 'chat', payload: message });
    }
    return message;
  }

  updateGameState(state: MultiplayerGameState): void {
    if (!this.isHostValue || !this.hostReady || this.destroyed) return;

    this.gameState = state;
    const now = Date.now();
    const elapsed = now - this.lastStateSave;
    if (elapsed >= STATE_SAVE_INTERVAL) {
      void this.saveStateToDatabase(state);
      return;
    }

    this.pendingStateSave = state;
    if (!this.saveTimeout) {
      this.saveTimeout = setTimeout(() => {
        this.saveTimeout = null;
        const pending = this.pendingStateSave;
        this.pendingStateSave = null;
        if (pending && !this.destroyed && this.isHostValue) void this.saveStateToDatabase(pending);
      }, Math.max(0, STATE_SAVE_INTERVAL - elapsed));
    }
  }

  private isValidAction(action: GameAction | null | undefined): action is GameAction {
    return !!action && typeof action.type === 'string' && typeof action.playerId === 'string';
  }

  private applyAndCommitAuthorityAction(action: GameAction): void {
    if (this.destroyed || !this.isHostValue || !this.hostReady) return;
    this.options.onAction?.(action);
    void this.broadcastCommittedAction(action);
  }

  private async broadcastCommittedAction(action: GameAction): Promise<void> {
    if (this.destroyed || !this.subscribed || !this.isHostValue || !this.hostReady) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'action-commit',
      payload: { action, authorityId: this.peerId } satisfies ActionCommitPayload,
    });
  }

  private reconcileHost(forceSingleElection = false): void {
    const candidates = Array.from(this.players.values());
    const advertisedHosts = candidates.filter((candidate) => candidate.isHost);

    // Presence can briefly report only the joining guest before the creator's
    // presence arrives. Do not create a second authority during that window.
    if (
      advertisedHosts.length === 0 &&
      candidates.length === 1 &&
      !this.isCreator &&
      !forceSingleElection
    ) {
      const previousHostId = this.hostId;
      const wasHost = this.isHostValue;
      this.hostId = null;
      this.isHostValue = false;
      this.player = { ...this.player, isHost: false };
      this.players.set(this.peerId, this.player);
      this.options.onPlayersChange?.(Array.from(this.players.values()));
      if (previousHostId !== null || wasHost) this.options.onHostChange?.(false, null);

      if (!this.hostElectionTimer) {
        this.hostElectionTimer = setTimeout(() => {
          this.hostElectionTimer = null;
          if (!this.destroyed) this.reconcileHost(true);
        }, 1500);
      }
      return;
    }

    if (this.hostElectionTimer) {
      clearTimeout(this.hostElectionTimer);
      this.hostElectionTimer = null;
    }

    const pool = advertisedHosts.length > 0 ? advertisedHosts : candidates;
    pool.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

    const nextHostId = pool[0]?.id ?? null;
    const previousHostId = this.hostId;
    const wasHost = this.isHostValue;
    this.hostId = nextHostId;
    this.isHostValue = nextHostId === this.peerId;

    const normalized = new Map<string, Player>();
    for (const participant of candidates) {
      normalized.set(participant.id, { ...participant, isHost: participant.id === nextHostId });
    }
    this.players = normalized;

    const own = this.players.get(this.peerId);
    if (own) {
      const hostFlagChanged = this.player.isHost !== own.isHost;
      this.player = own;
      if (hostFlagChanged && this.subscribed) {
        void this.channel.track({ player: this.player });
      }
    }

    this.options.onPlayersChange?.(Array.from(this.players.values()));
    if (previousHostId !== nextHostId || wasHost !== this.isHostValue) {
      if (!this.isHostValue) {
        this.hostReady = false;
        this.pendingAuthorityActions = [];
        this.options.onHostChange?.(false, nextHostId);
      } else if (!wasHost) {
        if (this.isCreator) {
          this.hostReady = true;
          this.options.onHostChange?.(true, nextHostId);
        } else {
          this.hostReady = false;
          this.options.onHostChange?.(false, nextHostId);
          void this.prepareHostTakeover(nextHostId);
        }
      }
    }
  }

  private async prepareHostTakeover(expectedHostId: string): Promise<void> {
    await this.refreshCanonicalState();
    // Give React one turn to apply the canonical snapshot before replaying intents.
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.destroyed || !this.isHostValue || this.hostId !== expectedHostId) return;

    this.hostReady = true;
    this.options.onHostChange?.(true, expectedHostId);
    const queued = this.pendingAuthorityActions;
    this.pendingAuthorityActions = [];
    for (const action of queued) this.applyAndCommitAuthorityAction(action);
  }

  private async refreshCanonicalState(minRevision = 0): Promise<void> {
    if (this.destroyed) return;
    const roomData = await loadGameRoom(this.roomCode);
    if (!roomData || roomData.stateRevision < minRevision) return;
    if (roomData.stateRevision < this.stateRevision) return;

    this.stateRevision = roomData.stateRevision;
    this.gameState = roomData.gameState;
    this.options.onStateReceived?.(roomData.gameState, roomData.stateRevision);
  }

  private async saveStateToDatabase(state: MultiplayerGameState): Promise<void> {
    if (this.destroyed || !this.isHostValue || !this.hostReady) return;
    if (this.stateSaveInFlight) {
      this.pendingStateSave = state;
      return;
    }

    this.stateSaveInFlight = true;
    this.lastStateSave = Date.now();
    const expectedRevision = this.stateRevision;
    const nextRevision = expectedRevision + 1;

    try {
      const saved = await updateGameRoom(this.roomCode, state, expectedRevision, nextRevision);
      if (!saved) {
        // Another authority advanced the room. Never overwrite it with stale state.
        await this.refreshCanonicalState();
        return;
      }

      this.stateRevision = nextRevision;
      this.gameState = state;
      if (this.subscribed) {
        await this.channel.send({
          type: 'broadcast',
          event: 'state-revision',
          payload: {
            revision: nextRevision,
            tick: state.tick,
            authorityId: this.peerId,
          } satisfies StateRevisionPayload,
        });
      }
    } catch (error) {
      if (error instanceof CitySizeLimitError) {
        console.warn('[SharedSession] City too large to save:', error.message);
        this.options.onError?.(error.message);
      } else {
        console.error('[SharedSession] Failed to save state:', error);
      }
    } finally {
      this.stateSaveInFlight = false;
      const pending = this.pendingStateSave;
      this.pendingStateSave = null;
      if (pending && !this.destroyed && this.isHostValue) {
        const delay = Math.max(0, STATE_SAVE_INTERVAL - (Date.now() - this.lastStateSave));
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
          this.saveTimeout = null;
          void this.saveStateToDatabase(pending);
        }, delay);
      }
    }
  }

  updatePlayer(info: { name?: string; userId?: string | null; email?: string | null }): void {
    if (this.destroyed) return;
    if (info.name) this.player.name = info.name;
    if (info.userId !== undefined) this.player.userId = info.userId ?? undefined;
    if (info.email !== undefined) this.player.email = info.email ?? undefined;
    this.players.set(this.peerId, this.player);
    if (this.subscribed) {
      void this.channel.track({ player: this.player });
    }
    this.options.onPlayersChange?.(Array.from(this.players.values()));
  }

  private updateConnectionStatus(connected: boolean): void {
    this.options.onConnectionChange?.(connected, this.players.size);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.onHostChange?.(false, null);
    this.options.onConnectionChange?.(false, this.players.size);
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.hostElectionTimer) {
      clearTimeout(this.hostElectionTimer);
      this.hostElectionTimer = null;
    }
    this.pendingStateSave = null;
    this.pendingAuthorityActions = [];
    this.hostReady = false;
    void this.channel.unsubscribe();
    void this.supabase.removeChannel(this.channel);
  }
}

export async function createMultiplayerProvider(options: MultiplayerProviderOptions): Promise<MultiplayerProvider> {
  const provider = new MultiplayerProvider(options);
  await provider.connect();
  return provider;
}
