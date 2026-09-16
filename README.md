# Paradise City

Paradise City is a compact isometric city-building simulation built with Next.js, TypeScript, and HTML5 Canvas. This branch is the dedicated Paradise City codebase: the separate theme-park/coaster game has been removed so the city simulation can evolve independently.

![Paradise City](public/readme-image.png)

## Core features

- **Isometric rendering engine** — HTML5 Canvas rendering with depth sorting, layers, sprites, zoom, and mobile controls.
- **City simulation** — residential, commercial, and industrial zoning with economy and growth logic.
- **Transport simulation** — roads, rail, cars, trains, buses, aircraft, boats, bridges, and pedestrians.
- **City services** — utilities, education, health, police, fire, parks, and civic buildings.
- **Persistent cities** — local save/load support for multiple cities.
- **Co-op foundation** — the existing city multiplayer layer is retained for future Paradise City human/agent interaction.
- **Paradise configuration seam** — product identity and persistence keys are centralized in `src/config/paradise.ts` so auth, agent, and world configuration can be added without spreading constants across the app.

## Tech stack

- Next.js 16 + React 19
- TypeScript
- HTML5 Canvas
- Tailwind CSS / Radix UI
- Supabase client support

## Development

```bash
git clone https://github.com/jimskin03/isometric-city.git
cd isometric-city
git checkout paradise-city-base
npm install
npm run dev
```

Open `http://localhost:3000`.

For production validation, `npx next build` runs the Next.js build directly. The repository's `npm run build` also runs the image-compression script first and therefore requires a working platform-specific Sharp installation.

## Agent play

Paradise City exposes an agent bridge so a headless planner can inspect the city and build through legal game actions rather than mouse automation.

Agent-facing endpoints:

- `GET /api/agent/instructions` — planner instructions (not rendered in the human UI)
- `GET /api/agent/state` — current semantic city snapshot, ASCII map, stats, buildings, and active session ID
- `POST /api/agent/commands` — queue a legal city action for the active browser session

CLI examples:

```bash
npm run agent -- instructions --url https://isometric-city.onrender.com
npm run agent -- state --url https://isometric-city.onrender.com
npm run agent -- bootstrap --url https://isometric-city.onrender.com
npm run agent -- place road 20 20 --url https://isometric-city.onrender.com
npm run agent -- speed 2 --url https://isometric-city.onrender.com
```

Set `PARADISE_AGENT_TOKEN` on the server and in the agent environment to protect command writes. If no token is configured, command writes are intentionally open for development.

When a genuinely blank city opens, the built-in founder planner automatically establishes a small starter road/zoning district and starts simulation speed 2. It uses the same placement and treasury rules as human construction, so the world can begin without waiting for a human player.

## Project direction

Paradise City remains a city builder. Agentic support operates the city-building simulation through explicit state and command APIs rather than replacing the game with character control.

## Upstream

Paradise City is derived from the open-source [amilich/isometric-city](https://github.com/amilich/isometric-city) project. The original upstream also included IsoCoaster; that independent game subsystem is intentionally not part of the Paradise City branch.

## License

Distributed under the MIT License. See `LICENSE` for more information.
