#!/usr/bin/env node

const argv = process.argv.slice(2);
const urlIndex = argv.indexOf('--url');
const baseUrl = (urlIndex >= 0 ? argv[urlIndex + 1] : process.env.PARADISE_CITY_URL || 'http://localhost:3000').replace(/\/$/, '');
if (urlIndex >= 0) argv.splice(urlIndex, 2);

const token = process.env.PARADISE_AGENT_TOKEN;
const [action, ...args] = argv;

function headers(withJson = false) {
  const value = {};
  if (withJson) value['content-type'] = 'application/json';
  if (token) value['x-paradise-agent-token'] = token;
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

async function queue(command, sessionId) {
  return request('/api/agent/commands', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ sessionId, command }),
  });
}

function usage() {
  console.log(`Paradise City agent CLI

Usage:
  npm run agent -- state [sessionId] [--url URL]
  npm run agent -- instructions [--url URL]
  npm run agent -- bootstrap [sessionId] [--url URL]
  npm run agent -- place <tool> <x> <y> [sessionId] [--url URL]
  npm run agent -- speed <0|1|2|3> [sessionId] [--url URL]
  npm run agent -- tax <0-100> [sessionId] [--url URL]

Environment:
  PARADISE_CITY_URL       Default server URL
  PARADISE_AGENT_TOKEN    Optional write token matching the Render environment

Agents should read instructions, inspect state, act, then inspect state again.`);
}

let result;
switch (action) {
  case 'state': {
    const sessionId = args[0];
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
    const [tool, xRaw, yRaw, sessionId] = args;
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!tool || !Number.isInteger(x) || !Number.isInteger(y)) {
      usage();
      process.exit(1);
    }
    result = await queue({ type: 'place', tool, x, y }, sessionId);
    break;
  }
  case 'speed': {
    const speed = Number(args[0]);
    if (![0, 1, 2, 3].includes(speed)) {
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
  default:
    usage();
    process.exit(action ? 1 : 0);
}

if (result) console.log(JSON.stringify(result, null, 2));
