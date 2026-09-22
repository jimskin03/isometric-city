#!/usr/bin/env node

const argv = process.argv.slice(2);

function takeFlag(name) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  argv.splice(index, value === undefined ? 1 : 2);
  return value;
}

const baseUrl = (takeFlag('--url') || process.env.PARADISE_CITY_URL || 'http://localhost:3000').replace(/\/$/, '');
const explicitSessionId = takeFlag('--session');
const agentName = takeFlag('--agent') || process.env.PARADISE_AGENT_NAME || 'Paradise Agent';
const agentId = takeFlag('--agent-id') || process.env.PARADISE_AGENT_ID || `agent-${agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'planner'}`;
const token = process.env.PARADISE_AGENT_TOKEN;
const inviteCode = takeFlag('--invite') || process.env.PARADISE_INVITE_CODE;
const actor = { id: agentId, name: agentName };
const [action, ...args] = argv;

function headers(withJson = false) {
  const value = {};
  if (withJson) value['content-type'] = 'application/json';
  if (token) value['x-paradise-agent-token'] = token;
  if (inviteCode) value['x-paradise-invite-code'] = inviteCode;
  return value;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
    return null;
  }
  return payload;
}

async function queue(command, positionalSessionId) {
  const sessionId = explicitSessionId || positionalSessionId;
  return request('/api/agent/commands', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ sessionId, command, actor }),
  });
}

function usage() {
  console.log(`Paradise City agent CLI

Usage:
  npm run agent -- state [sessionId] [--session ID] [--url URL]
  npm run agent -- instructions [--url URL]
  npm run agent -- bootstrap [sessionId] [--agent NAME] [--session ID]
  npm run agent -- place <tool> <x> <y> [sessionId] [--agent NAME]
  npm run agent -- speed 1 [sessionId] [--agent NAME]
  npm run agent -- tax <0-100> [sessionId] [--agent NAME]
  npm run agent -- chat <message> [sessionId] [--agent NAME]

Global flags:
  --url URL             Paradise City server URL
  --session ID          Browser/agent bridge session ID (defaults to the live publishing session)
  --agent NAME          Agent display name, e.g. A.Ira
  --agent-id ID         Stable machine identity for the agent
  --invite CODE          Co-op invite code (valid for 24 hours)

Simulation speed is locked to 1x for invited guests and agents.

Environment:
  PARADISE_CITY_URL
  PARADISE_AGENT_TOKEN
  PARADISE_AGENT_NAME
  PARADISE_AGENT_ID
  PARADISE_INVITE_CODE

For shared sessions, state.sharedSession contains the room code, participants and recent human/agent chat. Agents should inspect state, coordinate through chat when useful, execute legal actions, then inspect state again.`);
}

let result;
switch (action) {
  case 'state': {
    const sessionId = explicitSessionId || args[0];
    result = await request(`/api/agent/state${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`, { headers: headers() });
    break;
  }
  case 'instructions':
    result = await request('/api/agent/instructions', { headers: headers() });
    break;
  case 'bootstrap':
    result = await queue({ type: 'bootstrap_city' }, args[0]);
    break;
  case 'place': {
    const [tool, xRaw, yRaw, positionalSessionId] = args;
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!tool || !Number.isInteger(x) || !Number.isInteger(y)) {
      usage();
      process.exit(1);
    }
    result = await queue({ type: 'place', tool, x, y }, positionalSessionId);
    break;
  }
  case 'speed': {
    const speed = Number(args[0]);
    if (speed !== 1) {
      usage();
      process.exit(1);
    }
    result = await queue({ type: 'set_speed', speed }, args[1]);
    break;
  }
  case 'tax': {
    const rate = Number(args[0]);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      usage();
      process.exit(1);
    }
    result = await queue({ type: 'set_tax', rate }, args[1]);
    break;
  }
  case 'chat': {
    if (args.length === 0) {
      usage();
      process.exit(1);
    }
    let positionalSessionId;
    let messageArgs = args;
    if (!explicitSessionId && args.length > 1 && /^[0-9a-f-]{16,}$/i.test(args.at(-1))) {
      positionalSessionId = args.at(-1);
      messageArgs = args.slice(0, -1);
    }
    const message = messageArgs.join(' ').trim();
    result = await queue({ type: 'chat', message }, positionalSessionId);
    break;
  }
  default:
    usage();
    process.exit(action ? 1 : 0);
}

if (result) console.log(JSON.stringify(result, null, 2));
