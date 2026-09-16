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

## Project direction

Paradise City remains a city builder. Future agentic support should integrate through explicit simulation/control APIs rather than replacing the city-building gameplay with a character-control game.

## Upstream

Paradise City is derived from the open-source [amilich/isometric-city](https://github.com/amilich/isometric-city) project. The original upstream also included IsoCoaster; that independent game subsystem is intentionally not part of the Paradise City branch.

## License

Distributed under the MIT License. See `LICENSE` for more information.
