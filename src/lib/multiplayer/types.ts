// Shared-session types for human + agent collaborative city gameplay

import { Tool, GameState, Budget } from '@/types/game';

export type MultiplayerGameState = GameState;
export type MultiplayerTool = Tool;
export type ParticipantType = 'human' | 'agent' | 'system';

interface BaseAction {
  timestamp: number;
  playerId: string;
}

export type GameAction =
  | (BaseAction & { type: 'place'; x: number; y: number; tool: MultiplayerTool })
  | (BaseAction & { type: 'placeBatch'; placements: Array<{ x: number; y: number; tool: MultiplayerTool }> })
  | (BaseAction & { type: 'bulldoze'; x: number; y: number })
  | (BaseAction & { type: 'setTaxRate'; rate: number })
  | (BaseAction & { type: 'setBudget'; key: keyof Budget; funding: number })
  | (BaseAction & { type: 'setSpeed'; speed: 1 })
  | (BaseAction & { type: 'setDisasters'; enabled: boolean })
  | (BaseAction & { type: 'createBridges'; pathTiles: Array<{ x: number; y: number }>; trackType: 'road' | 'rail' })
  | (BaseAction & { type: 'fullState'; state: MultiplayerGameState })
  | (BaseAction & { type: 'tick'; tickData: TickData });

export type PlaceAction = { type: 'place'; x: number; y: number; tool: MultiplayerTool };
export type PlaceBatchAction = { type: 'placeBatch'; placements: Array<{ x: number; y: number; tool: MultiplayerTool }> };
export type BulldozeAction = { type: 'bulldoze'; x: number; y: number };
export type SetTaxRateAction = { type: 'setTaxRate'; rate: number };
export type SetBudgetAction = { type: 'setBudget'; key: keyof Budget; funding: number };
export type SetSpeedAction = { type: 'setSpeed'; speed: 1 };
export type SetDisastersAction = { type: 'setDisasters'; enabled: boolean };
export type CreateBridgesAction = { type: 'createBridges'; pathTiles: Array<{ x: number; y: number }>; trackType: 'road' | 'rail' };
export type FullStateAction = { type: 'fullState'; state: MultiplayerGameState };
export type TickAction = { type: 'tick'; tickData: TickData };

export type GameActionInput =
  | PlaceAction
  | PlaceBatchAction
  | BulldozeAction
  | SetTaxRateAction
  | SetBudgetAction
  | SetSpeedAction
  | SetDisastersAction
  | CreateBridgesAction
  | FullStateAction
  | TickAction;

export interface TickData {
  year: number;
  month: number;
  day: number;
  hour: number;
  tick: number;
  stats: GameState['stats'];
  changedTiles?: Array<{
    x: number;
    y: number;
    tile: GameState['grid'][0][0];
  }>;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type PlayerRole = 'host' | 'guest' | 'solo';

export interface Player {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  isHost: boolean;
  kind: Exclude<ParticipantType, 'system'>;
  userId?: string;
  email?: string;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  senderId: string;
  senderName: string;
  senderType: ParticipantType;
  body: string;
  createdAt: number;
}

export interface RoomData {
  code: string;
  hostId: string;
  cityName: string;
  createdAt: number;
  playerCount: number;
  stateRevision?: number;
}

export interface AwarenessState {
  player: Player;
  cursor?: { x: number; y: number };
  selectedTool?: MultiplayerTool;
}

const ADJECTIVES = [
  'Red', 'Blue', 'Green', 'Golden', 'Silver', 'Purple', 'Orange', 'Pink',
  'Swift', 'Brave', 'Clever', 'Happy', 'Lucky', 'Cosmic', 'Mighty', 'Gentle',
  'Wild', 'Calm', 'Bold', 'Bright', 'Fluffy', 'Speedy', 'Tiny', 'Giant',
];

const ANIMALS = [
  'Panda', 'Fox', 'Wolf', 'Bear', 'Eagle', 'Owl', 'Tiger', 'Lion',
  'Falcon', 'Dolphin', 'Otter', 'Koala', 'Penguin', 'Rabbit', 'Deer', 'Hawk',
  'Lynx', 'Raven', 'Cobra', 'Crane', 'Shark', 'Whale', 'Badger', 'Moose',
];

export function generatePlayerName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}${animal}`;
}

export function generatePlayerColor(): string {
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generatePlayerId(): string {
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
