# War of Crowns — 30-Kingdom RTS

Giant-continent RTS: 30 kingdoms spawn (you + 29 independent AI brains). Harvest crystals,
raise an army, wall the bridges, and dominate all 29 rivals to take the crown.

Pacing is deliberately slow: long peace while kingdoms boom, then random raids and
invasions — mostly AI-vs-AI, sometimes aimed at you.

Terrain is fully procedural (no downloads): heightfield continent with mountain massifs,
a serpentine river crossed by 3 lantern bridges, pine/broadleaf forests, meadows,
boulders, and animated water.

## Run

```powershell
npm install
npm run dev
# open http://localhost:5173
```

## Controls

- Left click / drag: select
- Right click: move / harvest / attack / rally
- WASD / arrows / edge pan: camera, wheel: zoom, Q/E or middle-drag: rotate
- 1: workers, A: army, H: HQ, Space: focus selection, S: stop

## Structure

- `src/config.js` — balance, costs, kingdom count/map size, slow-war tuning, palette
- `src/terrain.js` — seeded heightfield: mountains, river + bridges, forests, biomes
- `src/game.js` — scene, multi-kingdom spawns, units, buildings, combat, economy,
  spatial-hash queries, A* on a 4m grid, input, fog of war, camera
- `src/ai.js` — `KingdomBrain` per AI (econ/defense/fortify/random rivals) +
  staggered `AIManager` (3 brains think per frame)
- `src/ui.js` — HUD, rank/alive counter, build menu, terrain minimap, messages
- `src/main.js` — boot + loop
