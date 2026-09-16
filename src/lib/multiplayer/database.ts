// Supabase database functions for multiplayer game state persistence
// 
// Required Supabase table schema (run this in Supabase SQL editor):
// 
// CREATE TABLE game_rooms (
//   room_code TEXT PRIMARY KEY,
//   city_name TEXT NOT NULL,
//   game_state TEXT NOT NULL, -- Compressed game state (LZ-string)
//   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
//   player_count INTEGER DEFAULT 1
// );
// 
// -- Enable RLS
// ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
// 
// -- Allow anyone to read/write (for anonymous multiplayer)
// CREATE POLICY "Allow public access" ON game_rooms
//   FOR ALL USING (true) WITH CHECK (true);
// 
// -- Auto-update updated_at
// CREATE OR REPLACE FUNCTION update_updated_at()
// RETURNS TRIGGER AS $$
// BEGIN
//   NEW.updated_at = NOW();
//   RETURN NEW;
// END;
// $$ LANGUAGE plpgsql;
// 
// CREATE TRIGGER game_rooms_updated_at
//   BEFORE UPDATE ON game_rooms
//   FOR EACH ROW
//   EXECUTE FUNCTION update_updated_at();

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { ChatMessage, MultiplayerGameState } from './types';
import { getSupabaseClient } from '@/lib/supabase';
import { serializeAndCompressForDBAsync } from '@/lib/saveWorkerManager';

// Maximum city size limit for Supabase storage (20MB)
const MAX_CITY_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class CitySizeLimitError extends Error {
  public readonly sizeBytes: number;
  public readonly limitBytes: number;
  
  constructor(sizeBytes: number, limitBytes: number = MAX_CITY_SIZE_BYTES) {
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    const limitMB = (limitBytes / (1024 * 1024)).toFixed(0);
    super(`City size (${sizeMB}MB) exceeds maximum allowed size (${limitMB}MB)`);
    this.name = 'CitySizeLimitError';
    this.sizeBytes = sizeBytes;
    this.limitBytes = limitBytes;
  }
}

/**
 * Check if compressed data exceeds the size limit
 * @throws CitySizeLimitError if size exceeds limit
 */
function checkCitySize(compressed: string): void {
  // For URI-encoded strings (ASCII), byte length ≈ string length
  const sizeBytes = compressed.length;
  if (sizeBytes > MAX_CITY_SIZE_BYTES) {
    throw new CitySizeLimitError(sizeBytes);
  }
}

export interface GameRoomRow {
  room_code: string;
  city_name: string;
  game_state: string; // Compressed
  created_at: string;
  updated_at: string;
  player_count: number;
  state_revision: number;
}

/**
 * Create a new game room in the database
 * PERF: Uses Web Worker for serialization + compression - no main thread blocking!
 * @throws CitySizeLimitError if the city size exceeds the maximum allowed size
 */
export async function createGameRoom(
  roomCode: string,
  cityName: string,
  gameState: MultiplayerGameState,
  createdBy?: string | null
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  try {
    // PERF: Both JSON.stringify and lz-string compression happen in the worker
    const compressed = await serializeAndCompressForDBAsync(gameState);
    
    // Check if city size exceeds limit before saving
    checkCitySize(compressed);
    
    const { error } = await supabase
      .from('game_rooms')
      .insert({
        room_code: roomCode.toUpperCase(),
        city_name: cityName,
        game_state: compressed,
        player_count: 1,
        created_by: createdBy || null,
        state_revision: 0,
      });

    if (error) {
      console.error('[Database] Failed to create room:', error);
      return false;
    }

    return true;
  } catch (e) {
    // Re-throw CitySizeLimitError so callers can handle it specifically
    if (e instanceof CitySizeLimitError) {
      throw e;
    }
    console.error('[Database] Error creating room:', e);
    return false;
  }
}

/**
 * Load game state from a room
 */
export async function loadGameRoom(
  roomCode: string
): Promise<{ gameState: MultiplayerGameState; cityName: string; stateRevision: number } | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('game_state, city_name, state_revision')
      .eq('room_code', roomCode.toUpperCase())
      .single();

    if (error || !data) {
      console.error('[Database] Failed to load room:', error);
      return null;
    }

    const decompressed = decompressFromEncodedURIComponent(data.game_state);
    if (!decompressed) {
      console.error('[Database] Failed to decompress state');
      return null;
    }

    const gameState = JSON.parse(decompressed) as MultiplayerGameState;
    return {
      gameState,
      cityName: data.city_name,
      stateRevision: Number(data.state_revision || 0),
    };
  } catch (e) {
    console.error('[Database] Error loading room:', e);
    return null;
  }
}

/**
 * Update game state in a room
 * PERF: Uses Web Worker for serialization + compression - no main thread blocking!
 * @throws CitySizeLimitError if the city size exceeds the maximum allowed size
 */
export async function updateGameRoom(
  roomCode: string,
  gameState: MultiplayerGameState,
  expectedRevision: number,
  nextRevision: number
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  try {
    // PERF: Both JSON.stringify and lz-string compression happen in the worker
    const compressed = await serializeAndCompressForDBAsync(gameState);
    
    // Check if city size exceeds limit before saving
    checkCitySize(compressed);
    
    const { data, error } = await supabase
      .from('game_rooms')
      .update({ game_state: compressed, state_revision: nextRevision })
      .eq('room_code', roomCode.toUpperCase())
      .eq('state_revision', expectedRevision)
      .select('state_revision')
      .maybeSingle();

    if (error) {
      console.error('[Database] Failed to update room:', error);
      return false;
    }

    if (!data) {
      console.warn('[Database] Rejected stale room update:', {
        roomCode: roomCode.toUpperCase(),
        expectedRevision,
        nextRevision,
      });
      return false;
    }

    return Number(data.state_revision) === nextRevision;
  } catch (e) {
    // Re-throw CitySizeLimitError so callers can handle it specifically
    if (e instanceof CitySizeLimitError) {
      throw e;
    }
    console.error('[Database] Error updating room:', e);
    return false;
  }
}

/**
 * Check if a room exists
 */
export async function roomExists(roomCode: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('room_code')
      .eq('room_code', roomCode.toUpperCase())
      .single();

    return !error && !!data;
  } catch {
    return false;
  }
}

/**
 * Update player count for a room
 */
export async function updatePlayerCount(
  roomCode: string,
  count: number
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase
      .from('game_rooms')
      .update({ player_count: count })
      .eq('room_code', roomCode.toUpperCase());
  } catch (e) {
    console.error('[Database] Error updating player count:', e);
  }
}



export async function loadGameRoomMessages(roomCode: string, limit = 100): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('game_room_messages')
    .select('id, room_code, sender_id, sender_name, sender_type, body, created_at')
    .eq('room_code', roomCode.toUpperCase())
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (error || !data) {
    console.error('[Database] Failed to load room messages:', error);
    return [];
  }
  return data.map((row) => ({
    id: String(row.id),
    roomCode: row.room_code,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderType: row.sender_type,
    body: row.body,
    createdAt: new Date(row.created_at).getTime(),
  })) as ChatMessage[];
}

export async function createGameRoomMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const body = input.body.trim().slice(0, 2000);
  if (!body) return null;
  const { data, error } = await supabase
    .from('game_room_messages')
    .insert({
      room_code: input.roomCode.toUpperCase(),
      sender_id: input.senderId,
      sender_name: input.senderName,
      sender_type: input.senderType,
      body,
    })
    .select('id, room_code, sender_id, sender_name, sender_type, body, created_at')
    .single();
  if (error || !data) {
    console.error('[Database] Failed to save room message:', error);
    return null;
  }
  return {
    id: String(data.id),
    roomCode: data.room_code,
    senderId: data.sender_id,
    senderName: data.sender_name,
    senderType: data.sender_type,
    body: data.body,
    createdAt: new Date(data.created_at).getTime(),
  } as ChatMessage;
}
