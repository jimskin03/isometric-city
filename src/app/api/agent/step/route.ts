import { NextRequest, NextResponse } from 'next/server';
import { stepServerSimulation, getServerCityState } from '@/lib/agent/serverSimulation';
import { agentWriteAuthorized } from '@/lib/agent/serverBridge';
import { validateCoopInvite } from '@/lib/coop/inviteStore';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const inviteCode =
    request.headers.get('x-paradise-invite-code') ||
    request.nextUrl.searchParams.get('inviteCode');

  const isAuthorized =
    agentWriteAuthorized(request) || (inviteCode ? !!validateCoopInvite(inviteCode) : false);

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: invite code or agent token required' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { steps?: number };
  const steps = Math.min(100, Math.max(1, body.steps || 1));

  const updatedState = stepServerSimulation(steps);

  return NextResponse.json({
    ok: true,
    steps,
    city: {
      name: updatedState.cityName,
      population: updatedState.stats.population,
      jobs: updatedState.stats.jobs,
      money: updatedState.stats.money,
      date: {
        year: updatedState.year,
        month: updatedState.month,
        day: updatedState.day,
        hour: updatedState.hour,
      },
      demand: updatedState.stats.demand,
      gameVersion: updatedState.gameVersion,
    },
  });
}

export async function GET() {
  const state = getServerCityState();
  return NextResponse.json({
    ok: true,
    city: {
      name: state.cityName,
      population: state.stats.population,
      jobs: state.stats.jobs,
      money: state.stats.money,
      date: { year: state.year, month: state.month, day: state.day, hour: state.hour },
    },
  });
}
