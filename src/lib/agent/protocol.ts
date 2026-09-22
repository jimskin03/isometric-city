import type { GameState, Tool } from '@/types/game';

export type AgentActor = {
  id: string;
  name: string;
};

export type AgentPlaceAction = {
  tool: Tool;
  x: number;
  y: number;
};

export type AgentCommand =
  | { type: 'place'; tool: Tool; x: number; y: number }
  | { type: 'batch_place'; actions: AgentPlaceAction[] }
  | { type: 'set_speed'; speed: 1 }
  | { type: 'set_tax'; rate: number }
  | { type: 'bootstrap_city' }
  | { type: 'chat'; message: string };

export type AgentCommandEnvelope = {
  id: string;
  sessionId: string;
  command: AgentCommand;
  actor?: AgentActor;
  createdAt: number;
};

export type AgentCitySnapshot = {
  sessionId: string;
  observedAt: number;
  city: {
    id: string;
    name: string;
    gridSize: number;
    date: { year: number; month: number; day: number; hour: number };
    speed: number;
    taxRate: number;
  };
  stats: GameState['stats'];
  map: {
    legend: Record<string, string>;
    rows: string[];
  };
  sharedSession?: {
    roomCode: string | null;
    participants: Array<{ id: string; name: string; kind: string }>;
    recentMessages: Array<{ senderName: string; senderType: string; body: string; createdAt: number }>;
  };
  buildings: Array<{
    x: number;
    y: number;
    type: string;
    zone: string;
    powered: boolean;
    watered: boolean;
  }>;
};

function tileSymbol(state: GameState, x: number, y: number): string {
  const tile = state.grid[y][x];
  const type = tile.building.type;
  if (type === 'water') return '~';
  if (type === 'road' || type === 'bridge') return '=';
  if (type === 'rail') return '#';
  if (type === 'tree') return 't';
  if (tile.zone === 'residential') return 'r';
  if (tile.zone === 'commercial') return 'c';
  if (tile.zone === 'industrial') return 'i';
  if (type !== 'grass' && type !== 'empty') return 'B';
  return '.';
}

export function createAgentSnapshot(
  state: GameState,
  sessionId: string,
  sharedSession?: AgentCitySnapshot['sharedSession'],
): AgentCitySnapshot {
  const buildings: AgentCitySnapshot['buildings'] = [];
  const rows = state.grid.map((row, y) =>
    row.map((tile, x) => {
      if (!['grass', 'empty', 'water', 'tree', 'road', 'rail', 'bridge'].includes(tile.building.type)) {
        buildings.push({
          x,
          y,
          type: tile.building.type,
          zone: tile.zone,
          powered: Boolean(tile.building.powered),
          watered: Boolean(tile.building.watered),
        });
      }
      return tileSymbol(state, x, y);
    }).join(''),
  );

  return {
    sessionId,
    observedAt: Date.now(),
    city: {
      id: state.id,
      name: state.cityName,
      gridSize: state.gridSize,
      date: { year: state.year, month: state.month, day: state.day, hour: state.hour },
      speed: state.speed,
      taxRate: state.taxRate,
    },
    stats: state.stats,
    sharedSession,
    map: {
      legend: {
        '.': 'open land',
        t: 'tree',
        '~': 'water',
        '=': 'road or bridge',
        '#': 'rail',
        r: 'residential zone',
        c: 'commercial zone',
        i: 'industrial zone',
        B: 'civic/special building',
      },
      rows,
    },
    buildings,
  };
}

export function isBlankCity(state: GameState): boolean {
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.zone !== 'none') return false;
      if (!['grass', 'empty', 'water', 'tree'].includes(tile.building.type)) return false;
    }
  }
  return true;
}

function isBuildable(tile: GameState['grid'][number][number]): boolean {
  return tile.building.type !== 'water' && tile.building.type !== 'bridge';
}

export function createFounderPlan(state: GameState): AgentPlaceAction[] {
  const radius = 6;
  let best = { x: Math.floor(state.gridSize / 2), y: Math.floor(state.gridSize / 2), score: -Infinity };

  for (let y = radius + 2; y < state.gridSize - radius - 2; y += 2) {
    for (let x = radius + 2; x < state.gridSize - radius - 2; x += 2) {
      const center = state.gridSize / 2;
      let score = -Math.hypot(x - center, y - center) * 0.25;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const tile = state.grid[y + dy]?.[x + dx];
          if (!tile || !isBuildable(tile)) score -= 20;
          else if (tile.building.type === 'tree') score += 0;
          else score += 2;
        }
      }
      if (score > best.score) best = { x, y, score };
    }
  }

  const actions: AgentPlaceAction[] = [];
  const planned = new Map<string, AgentPlaceAction>();
  const add = (action: AgentPlaceAction) => planned.set(`${action.x}:${action.y}`, action);

  for (let d = -radius; d <= radius; d++) {
    add({ tool: 'road', x: best.x + d, y: best.y });
    add({ tool: 'road', x: best.x, y: best.y + d });
  }

  const zoneRect = (tool: Tool, x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) add({ tool, x, y });
    }
  };

  zoneRect('zone_residential', best.x - 5, best.y - 5, best.x - 1, best.y - 1);
  zoneRect('zone_residential', best.x - 5, best.y + 1, best.x - 1, best.y + 4);
  zoneRect('zone_commercial', best.x + 1, best.y - 4, best.x + 4, best.y - 1);
  zoneRect('zone_industrial', best.x + 1, best.y + 1, best.x + 5, best.y + 5);

  for (const action of planned.values()) {
    const tile = state.grid[action.y]?.[action.x];
    if (!tile || !isBuildable(tile)) continue;
    if (tile.building.type === 'tree') actions.push({ tool: 'bulldoze', x: action.x, y: action.y });
    actions.push(action);
  }

  return actions;
}
