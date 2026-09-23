import {
  GameState,
  Tool,
  TOOL_INFO,
} from '@/types/game';
import {
  createInitialGameState,
  simulateTick,
  DEFAULT_GRID_SIZE,
} from '@/lib/simulation';
import { applyToolAtTile } from '@/lib/toolApplication';
import { PARADISE_CITY } from '@/config/paradise';
import type {
  ActionExecutionResult,
  AgentActor,
  AgentCommand,
  CommandExecutionResult,
} from './protocol';
import { createAgentSnapshot } from './protocol';
import { publishAgentSnapshot, recordCommandResult } from './serverBridge';

declare global {
  var __paradiseServerCityState: GameState | undefined;
}

export function getServerCityState(): GameState {
  if (!globalThis.__paradiseServerCityState) {
    globalThis.__paradiseServerCityState = createInitialGameState(
      DEFAULT_GRID_SIZE,
      PARADISE_CITY.name
    );
    // Sync initial snapshot
    const initialSnapshot = createAgentSnapshot(
      globalThis.__paradiseServerCityState,
      'canonical-paradise-session',
      {
        roomCode: PARADISE_CITY.unifiedRoomCode,
        participants: [{ id: 'server-authority', name: 'Server Authority', kind: 'agent' }],
        recentMessages: [],
      }
    );
    publishAgentSnapshot('canonical-paradise-session', initialSnapshot);
  }
  return globalThis.__paradiseServerCityState;
}

export function setServerCityState(newState: GameState): void {
  globalThis.__paradiseServerCityState = newState;
  const snapshot = createAgentSnapshot(newState, 'canonical-paradise-session', {
    roomCode: PARADISE_CITY.unifiedRoomCode,
    participants: [{ id: 'server-authority', name: 'Server Authority', kind: 'agent' }],
    recentMessages: [],
  });
  publishAgentSnapshot('canonical-paradise-session', snapshot);
}

function evaluateToolLegality(
  state: GameState,
  tool: Tool,
  x: number,
  y: number
): { legal: boolean; reason?: 'occupied' | 'water' | 'insufficient_funds' | 'out_of_bounds' | 'invalid_tool'; cost: number } {
  if (x < 0 || x >= state.gridSize || y < 0 || y >= state.gridSize) {
    return { legal: false, reason: 'out_of_bounds', cost: 0 };
  }

  const cost = TOOL_INFO[tool]?.cost ?? 0;
  if (cost > state.stats.money) {
    return { legal: false, reason: 'insufficient_funds', cost: 0 };
  }

  const tile = state.grid[y][x];

  // Bulldoze logic
  if (tool === 'bulldoze') {
    return { legal: true, cost };
  }

  // Water check
  if (tile.building.type === 'water') {
    if (tool !== 'zone_land') {
      return { legal: false, reason: 'water', cost: 0 };
    }
  }

  // Occupied check (for placement on existing non-empty buildings)
  if (
    !['grass', 'empty', 'tree'].includes(tile.building.type) &&
    !tool.startsWith('zone_')
  ) {
    return { legal: false, reason: 'occupied', cost: 0 };
  }

  return { legal: true, cost };
}

export function executeCommandOnServer(
  command: AgentCommand,
  commandId: string,
  _actor?: AgentActor
): CommandExecutionResult {
  let state = getServerCityState();
  const actionResults: ActionExecutionResult[] = [];
  let totalCostCharged = 0;

  switch (command.type) {
    case 'place': {
      const check = evaluateToolLegality(state, command.tool, command.x, command.y);
      if (!check.legal) {
        const result: CommandExecutionResult = {
          commandId,
          status: 'rejected',
          appliedAt: Date.now(),
          totalCostCharged: 0,
          reason: check.reason || 'illegal_placement',
          actionResults: [
            {
              tool: command.tool,
              x: command.x,
              y: command.y,
              status: 'rejected',
              costCharged: 0,
              reason: check.reason,
            },
          ],
        };
        recordCommandResult(result);
        return result;
      }

      state = applyToolAtTile(state, command.tool, command.x, command.y);
      totalCostCharged = check.cost;
      actionResults.push({
        tool: command.tool,
        x: command.x,
        y: command.y,
        status: 'applied',
        costCharged: check.cost,
        buildingType: state.grid[command.y][command.x].building.type,
      });
      break;
    }

    case 'batch_place': {
      for (const action of command.actions.slice(0, 250)) {
        const check = evaluateToolLegality(state, action.tool, action.x, action.y);
        if (check.legal) {
          state = applyToolAtTile(state, action.tool, action.x, action.y);
          totalCostCharged += check.cost;
          actionResults.push({
            tool: action.tool,
            x: action.x,
            y: action.y,
            status: 'applied',
            costCharged: check.cost,
            buildingType: state.grid[action.y][action.x].building.type,
          });
        } else {
          actionResults.push({
            tool: action.tool,
            x: action.x,
            y: action.y,
            status: 'rejected',
            costCharged: 0,
            reason: check.reason,
          });
        }
      }
      break;
    }

    case 'set_tax': {
      const rate = Math.max(0, Math.min(100, command.rate));
      state = { ...state, taxRate: rate };
      break;
    }

    case 'set_speed': {
      // Locked to 1X
      state = { ...state, speed: 1 };
      break;
    }

    case 'bootstrap_city':
    case 'chat':
      // Handled or no-op
      break;
  }

  setServerCityState(state);

  const appliedStatus = actionResults.some((r) => r.status === 'applied')
    ? 'applied'
    : actionResults.length > 0
      ? 'rejected'
      : 'applied';

  const result: CommandExecutionResult = {
    commandId,
    status: appliedStatus,
    appliedAt: Date.now(),
    totalCostCharged,
    actionResults: actionResults.length > 0 ? actionResults : undefined,
  };

  recordCommandResult(result);
  return result;
}

export function stepServerSimulation(steps = 1): GameState {
  let state = getServerCityState();
  for (let i = 0; i < steps; i++) {
    state = simulateTick(state);
  }
  setServerCityState(state);
  return state;
}
