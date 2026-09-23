import { NextResponse } from 'next/server';
import { getServerCityState } from '@/lib/agent/serverSimulation';
import { PARADISE_CITY } from '@/config/paradise';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getServerCityState();
  return NextResponse.json({
    ok: true,
    roomCode: PARADISE_CITY.unifiedRoomCode,
    cityName: state.cityName || PARADISE_CITY.name,
    gameState: state,
    stateVersion: state.gameVersion || 1,
    population: state.stats.population,
    funds: state.stats.money,
    date: { year: state.year, month: state.month, day: state.day },
  });
}
