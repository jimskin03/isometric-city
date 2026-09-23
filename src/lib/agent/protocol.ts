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
  | { type: 'set_speed'; speed: 0 | 1 | 2 | 3 }
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

export type CommandExecutionState = 'queued' | 'applied' | 'rejected';

export type ActionExecutionResult = {
  tool: Tool;
  x: number;
  y: number;
  status: 'applied' | 'rejected';
  costCharged: number;
  reason?: 'occupied' | 'water' | 'insufficient_funds' | 'out_of_bounds' | 'not_authorized' | 'invalid_tool';
  buildingType?: string;
};

export type CommandExecutionResult = {
  commandId: string;
  status: CommandExecutionState;
  appliedAt?: number;
  totalCostCharged: number;
  reason?: string;
  actionResults?: ActionExecutionResult[];
};

export type CityAlert = {
  id: string;
  type: 'fire' | 'abandoned' | 'unpowered' | 'unwatered' | 'crime' | 'pollution' | 'budget_deficit';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  count: number;
  locations?: Array<{ x: number; y: number }>;
};

export type AgentCitySnapshot = {
  sessionId: string;
  observedAt: number;
  stateVersion: number;
  simulationTick: number;
  lastTickAt: number;
  lastStateChangeAt: number;
  lastPublisherSeenAt: number;
  city: {
    id: string;
    name: string;
    gridSize: number;
    date: { year: number; month: number; day: number; hour: number };
    speed: number;
    taxRate: number;
  };
  stats: GameState['stats'];
  disastersEnabled: boolean;
  alerts: CityAlert[];
  notifications: Array<{ id: string; title: string; description: string; timestamp: number }>;
  advisorMessages: Array<{ name: string; messages: string[]; priority: string }>;
  servicesSummary: {
    fireCoverageAvg: number;
    policeCoverageAvg: number;
    healthCoverageAvg: number;
    educationCoverageAvg: number;
  };
  budget?: {
    totalIncome: number;
    totalExpenses: number;
    categories: Record<string, { funding: number; cost: number }>;
  };
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
    onFire?: boolean;
    fireProgress?: number;
    abandoned?: boolean;
    constructionProgress?: number;
    capacity?: number;
    jobs?: number;
    level?: number;
  }>;
};

function tileSymbol(state: GameState, x: number, y: number): string {
  const tile = state.grid[y][x];
  if (tile.building.onFire) return 'F';
  if (tile.building.abandoned) return 'x';
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
  const fireLocations: Array<{ x: number; y: number }> = [];
  const abandonedLocations: Array<{ x: number; y: number }> = [];
  const unpoweredLocations: Array<{ x: number; y: number }> = [];
  const unwateredLocations: Array<{ x: number; y: number }> = [];

  let totalFireCov = 0;
  let totalPoliceCov = 0;
  let totalHealthCov = 0;
  let totalEduCov = 0;
  let tileCount = 0;

  const rows = state.grid.map((row, y) =>
    row.map((tile, x) => {
      tileCount++;
      if (state.services) {
        if (state.services.fire?.[y]?.[x] !== undefined) totalFireCov += state.services.fire[y][x];
        if (state.services.police?.[y]?.[x] !== undefined) totalPoliceCov += state.services.police[y][x];
        if (state.services.health?.[y]?.[x] !== undefined) totalHealthCov += state.services.health[y][x];
        if (state.services.education?.[y]?.[x] !== undefined) totalEduCov += state.services.education[y][x];
      }

      const isNonEmpty = !['grass', 'empty', 'water', 'tree', 'road', 'rail', 'bridge'].includes(tile.building.type);

      if (tile.building.onFire) {
        fireLocations.push({ x, y });
      }
      if (tile.building.abandoned) {
        abandonedLocations.push({ x, y });
      }
      if (isNonEmpty && !tile.building.powered) {
        unpoweredLocations.push({ x, y });
      }
      if (isNonEmpty && !tile.building.watered) {
        unwateredLocations.push({ x, y });
      }

      if (isNonEmpty) {
        buildings.push({
          x,
          y,
          type: tile.building.type,
          zone: tile.zone,
          powered: Boolean(tile.building.powered),
          watered: Boolean(tile.building.watered),
          onFire: Boolean(tile.building.onFire),
          fireProgress: tile.building.fireProgress ?? 0,
          abandoned: Boolean(tile.building.abandoned),
          constructionProgress: tile.building.constructionProgress ?? 100,
          level: tile.building.level ?? 1,
        });
      }
      return tileSymbol(state, x, y);
    }).join(''),
  );

  const alerts: CityAlert[] = [];

  if (fireLocations.length > 0) {
    alerts.push({
      id: 'alert-fire',
      type: 'fire',
      severity: 'critical',
      title: 'Fire Outbreak',
      description: `${fireLocations.length} building(s) currently burning! Extinguish with fire station coverage or bulldoze adjacent tiles as firebreaks.`,
      count: fireLocations.length,
      locations: fireLocations.slice(0, 50),
    });
  }

  if (abandonedLocations.length > 0) {
    alerts.push({
      id: 'alert-abandoned',
      type: 'abandoned',
      severity: 'warning',
      title: 'Abandoned Buildings',
      description: `${abandonedLocations.length} building(s) abandoned. Clear with bulldoze or improve demand and service coverage.`,
      count: abandonedLocations.length,
      locations: abandonedLocations.slice(0, 50),
    });
  }

  if (unpoweredLocations.length > 0) {
    alerts.push({
      id: 'alert-unpowered',
      type: 'unpowered',
      severity: 'warning',
      title: 'Power Outages',
      description: `${unpoweredLocations.length} building(s) lack electrical power. Build power plants or ensure power connectivity.`,
      count: unpoweredLocations.length,
      locations: unpoweredLocations.slice(0, 50),
    });
  }

  if (unwateredLocations.length > 0) {
    alerts.push({
      id: 'alert-unwatered',
      type: 'unwatered',
      severity: 'warning',
      title: 'Water Outages',
      description: `${unwateredLocations.length} building(s) lack water service. Build water towers.`,
      count: unwateredLocations.length,
      locations: unwateredLocations.slice(0, 50),
    });
  }

  if (state.stats && state.stats.expenses > state.stats.income) {
    alerts.push({
      id: 'alert-deficit',
      type: 'budget_deficit',
      severity: 'warning',
      title: 'Monthly Deficit',
      description: `Expenses ($${state.stats.expenses}/mo) exceed income ($${state.stats.income}/mo). Net burn: -$${state.stats.expenses - state.stats.income}/mo.`,
      count: 1,
    });
  }

  const servicesSummary = {
    fireCoverageAvg: tileCount > 0 ? Math.round(totalFireCov / tileCount) : 0,
    policeCoverageAvg: tileCount > 0 ? Math.round(totalPoliceCov / tileCount) : 0,
    healthCoverageAvg: tileCount > 0 ? Math.round(totalHealthCov / tileCount) : 0,
    educationCoverageAvg: tileCount > 0 ? Math.round(totalEduCov / tileCount) : 0,
  };

  const budgetSummary = state.budget
    ? {
        totalIncome: state.stats?.income || 0,
        totalExpenses: state.stats?.expenses || 0,
        categories: Object.entries(state.budget).reduce((acc, [cat, val]) => {
          acc[cat] = { funding: val.funding, cost: val.cost };
          return acc;
        }, {} as Record<string, { funding: number; cost: number }>),
      }
    : undefined;

  const now = Date.now();
  const ticks = (state.stats.population || 0) + (state.stats.jobs || 0) + (state.month || 0);

  return {
    sessionId,
    observedAt: now,
    stateVersion: state.gameVersion || 1,
    simulationTick: ticks,
    lastTickAt: now,
    lastStateChangeAt: now,
    lastPublisherSeenAt: now,
    city: {
      id: state.id,
      name: state.cityName,
      gridSize: state.gridSize,
      date: { year: state.year, month: state.month, day: state.day, hour: state.hour },
      speed: state.speed,
      taxRate: state.taxRate,
    },
    stats: state.stats,
    disastersEnabled: Boolean(state.disastersEnabled),
    alerts,
    notifications: (state.notifications || []).slice(-10).map((n) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      timestamp: n.timestamp,
    })),
    advisorMessages: (state.advisorMessages || []).map((m) => ({
      name: m.name,
      messages: m.messages,
      priority: m.priority,
    })),
    servicesSummary,
    budget: budgetSummary,
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
        F: 'building on fire (EMERGENCY)',
        x: 'abandoned building',
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
