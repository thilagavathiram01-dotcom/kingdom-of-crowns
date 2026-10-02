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
- `src/ai.js` — one fully independent `KingdomBrain` per AI + staggered `AIManager`
  (3 brains think per frame). Each brain rolls its own personality and:
  - spends on every building type by utility (workers, barracks for supply/production,
    turrets, walls, army) instead of attack-only logic
  - plans a real fort: rectangular keep, corner towers, gate towers, continuous walls built
    in walking order, open gates for its own traffic, destroyed walls rebuilt
  - places barracks by its own style (hub / ring / frontier / rear)
  - keeps private grudges: whoever damages it gets a revenge wave on a RANDOM enemy base
  - judges rivals itself (private misjudgement bias) and launches invasions on kingdoms it
    thinks are weak; waves muster, stage outside the enemy fort, assault in priority order
    (fighters > turrets > objective) and retreat when losing
  - nothing is shared between brains; a brain only hears about damage dealt to itself
- `src/ui.js` — HUD, rank/alive counter, build menu, terrain minimap, messages
- `src/main.js` — boot + loop
