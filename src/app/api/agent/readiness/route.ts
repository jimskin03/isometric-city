import { NextRequest, NextResponse } from 'next/server';
import { getAgentSnapshot } from '@/lib/agent/serverBridge';
import { PARADISE_CITY } from '@/config/paradise';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const session = getAgentSnapshot(sessionId);

  if (!session) {
    return NextResponse.json({
      ok: true,
      ready: false,
      phase: 'waiting_for_bridge',
      roomCode: PARADISE_CITY.unifiedRoomCode,
      cityName: PARADISE_CITY.name,
      canBuild: false,
      message: 'No active Paradise City browser executor or server session has published a snapshot yet.',
      guidance: 'Open the game in browser or run an agent worker with an invite code.',
    });
  }

  const snapshot = session.snapshot;
  const lastPublisherSeenAt = session.updatedAt;

  return NextResponse.json({
    ok: true,
    ready: true,
    phase: 'ready',
    roomCode: snapshot.sharedSession?.roomCode || PARADISE_CITY.unifiedRoomCode,
    cityId: snapshot.city.name,
    cityName: snapshot.city.name,
    canBuild: true,
    stateVersion: snapshot.stateVersion || 1,
    simulationTick: snapshot.simulationTick || (snapshot.stats.population + snapshot.stats.jobs),
    lastTickAt: snapshot.lastTickAt || session.updatedAt,
    lastStateChangeAt: snapshot.lastStateChangeAt || session.updatedAt,
    lastPublisherSeenAt,
    population: snapshot.stats.population,
    funds: snapshot.stats.money,
    date: `${snapshot.city.date.month} ${snapshot.city.date.year}`,
    participants: snapshot.sharedSession?.participants ?? [],
    activeFires: snapshot.alerts?.find((a) => a.type === 'fire')?.count ?? 0,
    criticalAlerts: snapshot.alerts?.filter((a) => a.severity === 'critical').length ?? 0,
    disastersEnabled: snapshot.disastersEnabled ?? true,
    alerts: snapshot.alerts ?? [],
  });
}
