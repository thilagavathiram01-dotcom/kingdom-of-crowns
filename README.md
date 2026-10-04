# War of Crowns — 30-Kingdom RTS

> Giant-continent 3D RTS in the browser. 30 kingdoms (you + 29 independent AI brains) harvest crystals, wood, stone, food and gold, raise armies, wall the bridges and fight for the shattered Crown.

Live: https://kingdom-of-crowns.pages.dev

---

## Table of contents

1. [Quick start](#quick-start)
2. [Story](#story)
3. [Art direction and kingdom colour scheme](#art-direction-and-kingdom-colour-scheme)
4. [Free models (CC0 / no copyright)](#free-models-cc0--no-copyright)
5. [Model implementation](#model-implementation)
6. [Resources](#resources)
7. [Economy: workers, mills and farms](#economy-workers-mills-and-farms)
8. [Buildings](#buildings)
9. [Units and heroes](#units-and-heroes)
10. [Movement](#movement)
11. [Placement](#placement)
12. [Tech ages](#tech-ages)
13. [Diplomacy and AI](#diplomacy-and-ai)
14. [World events](#world-events)
15. [UI, controls and quality of life](#ui-controls-and-quality-of-life)
16. [Config reference](#config-reference)
17. [Project structure](#project-structure)
18. [Roadmap](#roadmap)
19. [Licensing](#licensing)

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (deployed on Cloudflare Pages)
```

## Story

The old Crown of the continent shattered into **30 shards**. Each kingdom holds one. Reunite them and rule, or become a tyrant and break them again.

There is **no fixed war timer**. The story advances by what the world is doing, not by the clock. Kingdoms stay at peace as long as they like and go to war the moment they are ready (see [War declaration](#war-declaration-no-timer)).

| Chapter | Starts when | What happens |
|---|---|---|
| I. The Long Peace | Game start | Kingdoms boom: workers, farms, mills, forts. Only bandits and wolves threaten anyone. |
| II. The Whisper | The first kingdom declares war | Spies and scouts report troop musters. First wars, grudges form. |
| III. The Shattering War | A third of all kingdoms are at war, or 5+ wars are active | Invasions, sieges, alliances and betrayals. |
| IV. The Last Crown | 8 or fewer kingdoms alive, or anyone starts the Crown Hall | Remaining kingdoms race to finish the Wonder or conquer everyone. |

A slow, careful world can stay in Chapter I for a long time. A warlike world can skip ahead quickly. Both are fine.

**Win conditions**

- **Conquest:** destroy the HQ of all 29 rivals.
- **Crown Hall:** build the Wonder and hold it for 5 minutes.
- **Shard Collector:** hold 15 of the 30 crown shards at once.

**Rival lords** (names shown in rank panel and messages): Lord Varn the Paranoid (turtles behind walls), Queen Isolde the Merchant (trades, rarely attacks), Warlord Kharg (early rushes), Magister Oren (tech-first), Baron Tull (grudge-holder, revenge waves).

---

## Art direction and kingdom colour scheme

The game keeps its current **procedural low-poly style**: flat-shaded geometry, simple silhouettes, soft fog, animated water. Every imported model must be low-poly, flat-shaded, and recoloured with the owner's kingdom colour.

### World palette (neutral)

| Element | Hex | Notes |
|---|---|---|
| Grass | `#6aa84f` | Meadow base |
| Dry grass | `#a9b665` | Highlands |
| Forest floor | `#3d6b35` | Under trees |
| Rock | `#8a8f98` | Mountain, boulders |
| Snow | `#eef2f5` | Peaks |
| River | `#3b82c4` | Animated water |
| Sand / bank | `#d8c690` | River edge |
| Fog of war (unexplored) | `#0b0f14` | |
| Fog of war (explored) | `#0b0f14` at 55% alpha | |

### Kingdom colours (30 distinct)

Do not hand-pick 30 colours. Generate them with the golden angle so neighbours never look alike, then keep the player fixed and bright.

```js
// src/palette.js
export const PLAYER_COLOR = 0x2f6fed; // royal blue, always the human

export function kingdomColor(index) {
  if (index === 0) return PLAYER_COLOR;
  const hue = (index * 137.508) % 360;             // golden angle
  const sat = 0.65 + (index % 3) * 0.1;            // 0.65 / 0.75 / 0.85
  const light = 0.5 + ((index >> 1) % 2) * 0.08;   // 0.50 / 0.58
  return new THREE.Color().setHSL(hue / 360, sat, light);
}
```

Reserve these for non-kingdom things so they never collide: **neutral/bandits** `#5b4b3a` (dark brown), **selection ring** `#ffffff`, **enemy hover** `#ff4d4d`, **ally hover** `#4dff88`.

### Where the colour is applied

| Object | Tinted part |
|---|---|
| Buildings | Roof, banners, flags |
| Units | Tabard/cloak, shield, helmet plume |
| Walls and towers | Banner on each tower |
| Minimap | Dot / territory tint |
| Fog edge | Soft glow around owned territory |

Everything else (stone, wood, skin) stays natural so the team colour pops.

---

## Free models (CC0 / no copyright)

Only use packs released under **CC0 (public domain)**. Always open the pack's page and confirm the licence before downloading, since packs and terms can change.

| Source | What to get | Style fit |
|---|---|---|
| **Kenney** (kenney.nl/assets) | Medieval/fantasy town kit, castle kit, nature kit, tower defense kit | Clean low-poly, perfect match |
| **Quaternius** (quaternius.com) | Medieval village pack, fantasy characters, stylized nature, animated characters | Low-poly, rigged and animated |
| **KayKit** (kaylousberg.itch.io) | Medieval Builder pack, Adventurers, Skeletons, Dungeon pack | Low-poly, rigged, free (CC0) tier |
| **Poly Pizza** (poly.pizza) | Single props (barrels, carts, banners) | **Mixed licences.** Filter by CC0 only |
| **OpenGameArt** (opengameart.org) | Props, icons, sounds | **Mixed licences.** Filter by CC0 only |

**Rules**

1. Download **glTF / GLB** where offered.
2. Keep a `public/models/CREDITS.md` listing each pack, author, URL and licence even though CC0 does not require it.
3. Never mix in CC-BY or unknown-licence assets without adding attribution.
4. Prefer packs with one shared colour atlas so draw calls stay low.

### Suggested model map

| Game object | Pack | Model |
|---|---|---|
| HQ (Keep) | Kenney Castle Kit | Keep + gate |
| House / Granary | Quaternius Medieval Village | House, barn |
| Barracks | Kenney Medieval Town | Large house with weapon rack |
| Mill | Quaternius Medieval Village | Windmill (blades animate) |
| Farm | Kenney Nature / Medieval | Fields + fence |
| Lumber Camp | Kenney Medieval | Wood shed + log pile |
| Mine / Quarry | Kenney Castle / Nature | Stone shed + rock pile |
| Walls, towers, gate | Kenney Castle Kit | Wall, corner tower, gate |
| Worker | KayKit Medieval Builder | Builder |
| Swordsman / Knight / Archer | KayKit Adventurers or Quaternius Characters | Knight, Ranger |
| Catapult | Kenney Castle Kit or Quaternius | Catapult |
| Trees, boulders | Kenney Nature Kit | Pine, oak, rock |

If you do not want to import anything yet, the **procedural fallback** below keeps the game running.

---

## Model implementation

### Folder layout

```
public/
  models/
    buildings/    hq.glb  barracks.glb  mill.glb  farm.glb ...
    units/        worker.glb  swordsman.glb  archer.glb ...
    props/        tree_pine.glb  rock_a.glb  rock_b.glb ...
    CREDITS.md
```

### Loader with cache and team tinting

```js
// src/models.js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

const loader = new GLTFLoader();
const cache = new Map();

export async function preload(manifest) {
  await Promise.all(Object.entries(manifest).map(async ([key, url]) => {
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material.flatShading = true;
      }
    });
    cache.set(key, gltf);
  }));
}

// Clone with its own materials so team colour does not leak between kingdoms
export function spawnModel(key, teamColor, targetHeight) {
  const gltf = cache.get(key);
  if (!gltf) return proceduralFallback(key, teamColor);
  const root = SkeletonUtils.clone(gltf.scene);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    // Convention: any material named "Team" or "team_*" gets the kingdom colour
    if (/^team/i.test(o.material.name)) o.material.color.set(teamColor);
  });
  // Normalise size so every pack matches the world scale
  const box = new THREE.Box3().setFromObject(root);
  const s = targetHeight / (box.max.y - box.min.y);
  root.scale.setScalar(s);
  return { root, clips: gltf.animations };
}
```

### Team colour in free models

Most free packs have no "Team" material. Two simple options:

1. **Rename in Blender (recommended, 1 minute per model):** pick the roof/cloak material, rename it `Team`, export GLB.
2. **Code only:** tint by name or by index.

```js
const TEAM_PARTS = { hq: ['Roof', 'Banner'], worker: ['Hat'], swordsman: ['Cape', 'Shield'] };
```

### Procedural fallback (works with zero downloads)

Keeps your existing "no downloads" style. Used whenever a GLB is missing.

```js
function proceduralFallback(key, color) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
  if (key === 'mill') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 6, 8), mat(0xd9c9a3));
    base.position.y = 3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.4, 8), mat(color));
    roof.position.y = 7.2;
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.1), mat(0x8b5a2b));
      b.position.y = 2.5;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i * Math.PI) / 2;
      pivot.add(b);
      blades.add(pivot);
    }
    blades.position.set(0, 5, 2.3);
    blades.name = 'blades';
    g.add(base, roof, blades);
  }
  return { root: g, clips: [] };
}
```

### Animation rules

| State | Clip name (rename if needed) | Loop |
|---|---|---|
| Idle | `Idle` | yes |
| Walk | `Walk` | yes, speed scaled by velocity |
| Harvest | `Chop` / `Work` | yes |
| Attack | `Attack` | once per hit |
| Death | `Death` | once, then fade out in 3 s |

Mill blades spin at `0.4 rad/s` when a worker is assigned, and stop when idle. Use one `AnimationMixer` per unit and only update units inside the camera frustum.

### Performance

- Use `InstancedMesh` for **trees, rocks, walls and wall segments** (thousands of copies).
- Use shared geometries and a texture atlas wherever possible.
- Skip animation updates for units hidden by fog or outside the frustum.
- Budget: aim for under 300 draw calls with 30 kingdoms.

---

## Resources

| Resource | Source | Gathered by | Used for |
|---|---|---|---|
| **Crystal** (existing) | Crystal nodes | Worker | Units, upgrades, magic |
| **Wood** | Trees in forests | Worker at Lumber Camp | Buildings, walls, siege |
| **Stone** | **Rocks scattered around the terrain** | Worker at Quarry | Walls, towers, upgrades |
| **Food** | **Farms processed at a Mill** | Worker assigned to Mill | Unit upkeep, population growth |
| **Gold** | Trade caravans, captured villages | Passive / market | Mercenaries, tribute, diplomacy |

### Stone from rocks around the terrain

Terrain already spawns boulders. Make them **harvestable nodes**:

```js
// each boulder becomes a node
{ type: 'rock', amount: 400, radius: 2.0, workersMax: 3 }
```

- Right-click a rock with workers selected: worker walks to it, plays the work animation, carries **10 stone** per trip.
- Rock **shrinks in scale** as it depletes (`scale = 0.4 + 0.6 * amount / max`) and disappears at 0.
- Large mountain rocks: 800 stone. Small boulders: 150 stone.
- A **Quarry** built next to a rock cluster raises carry capacity to **20** and cuts the return trip.

### Wood

- Trees are harvestable (`amount: 100`). Felled trees leave a stump and regrow after 10 minutes.
- Lumber Camp is the drop-off point.

### Crystal

- Unchanged: glowing nodes, drop-off at HQ or a **Crystal Depot**.

### Gold

- **Caravans:** a Market sends a caravan across a bridge to a friendly kingdom every 90 s and earns gold. Raiders can steal it.
- **Villages:** capture neutral villages for `+2 gold/s` each.

### Pickups on the map

| Pickup | Effect | Spawn |
|---|---|---|
| Treasure chest | `+150` gold | Random, guarded by bandits |
| Crown shard | Counts toward Shard Collector win | Fixed 30 spots, one per start |
| Ancient ruins | Reveals 40 m of map, small boost | Mountain areas |
| Healing spring | Heals units standing in it | Meadows |

---

## Economy: workers, mills and farms

### Food chain

```
Farm  --(grain)-->  Mill  --(workers assigned)-->  Food
```

1. Build a **Farm**. It produces **grain** automatically (`+1 grain / 4 s`, max 40 stored).
2. Build a **Mill** within 25 m of a farm.
3. **Assign workers to the Mill** (select the Mill and press `1`, or right-click Mill with workers). Each assigned worker converts grain to food.
4. Food is added to your stockpile. No workers assigned means the blades stop and no food is made.

```js
// src/economy.js
const MILL = {
  slots: 4,                // max workers per mill
  grainPerWorkerPerSec: 0.5,
  foodPerGrain: 1,
  linkRadius: 25           // farms within this feed the mill
};

function tickMill(mill, dt) {
  const farms = farmsNear(mill, MILL.linkRadius);
  let grain = farms.reduce((s, f) => s + f.grain, 0);
  const capacity = mill.workers.length * MILL.grainPerWorkerPerSec * dt;
  const used = Math.min(grain, capacity);
  consumeGrain(farms, used);
  kingdoms[mill.owner].food += used * MILL.foodPerGrain;
  mill.blades.visible = used > 0;
}
```

### Worker job state machine

```
IDLE -> MOVE_TO_NODE -> HARVEST -> CARRY (full) -> MOVE_TO_DROP -> DEPOSIT -> MOVE_TO_NODE
                       \-> ASSIGNED_TO_MILL (stationary, working)
```

| State | Behaviour |
|---|---|
| IDLE | Wait, look for nearest node of last job after 3 s |
| HARVEST | Plays work clip, gathers `1` unit per `0.8 s` |
| CARRY | Carries a coloured resource prop (stone chunk, log, crystal) above head |
| ASSIGNED_TO_MILL | Stands at a mill work slot, spins blades |

### Upkeep

Each unit costs **food** over time. If food hits zero:

- Workers slow down by 30%.
- Soldiers lose 1 HP per 10 s until food returns.

This prevents mass-army spam and makes mills worth defending.

---

## Buildings

Footprints are in metres on the 4 m grid.

| Building | Footprint | Cost | Purpose | Notes |
|---|---|---|---|---|
| **HQ (Keep)** | 5×5 | start | Drop-off, trains workers, hero | Lose it = lose the kingdom |
| **House** | 2×2 | 40 wood | +5 population | |
| **Farm** | 3×3 | 50 wood | Produces grain | Max 4 per mill |
| **Mill** | 3×3 | 80 wood, 20 stone | Converts grain to food with workers | Animated blades |
| **Lumber Camp** | 2×2 | 40 wood | Wood drop-off | Place near forest |
| **Quarry** | 2×2 | 50 wood | Stone drop-off, +carry | Place near rocks |
| **Crystal Depot** | 2×2 | 60 wood | Crystal drop-off | |
| **Barracks** | 4×4 | 120 wood, 40 stone | Trains swordsmen, spearmen | Existing building |
| **Archery Range** | 4×3 | 100 wood, 30 stone | Archers | |
| **Stable** | 4×4 | 140 wood, 60 stone | Knights, scouts | Age II |
| **Siege Workshop** | 5×4 | 200 wood, 120 stone | Catapults, rams | Age III |
| **Blacksmith** | 3×3 | 100 wood, 60 stone | Attack/armor upgrades | |
| **Temple** | 3×3 | 120 stone, 40 gold | Healers, heals nearby | |
| **Watchtower** | 2×2 | 60 wood, 60 stone | Vision +40 m, shoots | Existing turret becomes this |
| **Wall / Gate / Corner Tower** | 1×n | 5 stone / segment | Defence | Existing |
| **Market** | 3×3 | 100 wood, 50 stone | Trade, caravans, gold | |
| **Embassy** | 3×3 | 150 gold | Alliances, ceasefires | |
| **Crown Hall (Wonder)** | 8×8 | 1500 stone, 1000 wood, 800 gold | Win condition | 5 min hold |

---

## Units and heroes

| Unit | Role | Cost | HP | Speed (m/s) | Counter to |
|---|---|---|---|---|---|
| **Worker** | Gather, build, mill | 50 food | 40 | 4.0 | – |
| **Swordsman** | Frontline | 60 food, 20 crystal | 100 | 4.2 | Archers |
| **Spearman** | Anti-cavalry | 50 food, 20 wood | 90 | 4.0 | Cavalry |
| **Archer** | Ranged | 50 wood, 30 gold | 60 | 4.4 | Infantry |
| **Knight** | Fast heavy | 90 food, 40 crystal | 160 | 6.5 | Archers |
| **Scout** | Vision, raids | 40 food | 40 | 8.0 | – |
| **Healer** | Heals | 60 gold | 50 | 4.0 | – |
| **Catapult** | Siege | 120 wood, 60 stone | 120 | 2.5 | Walls, towers |
| **Ram** | Gate breaker | 100 wood | 200 | 3.0 | Gates |
| **Spy** | Reveals enemy, sabotages | 100 gold | 30 | 5.5 | – |

**Counter triangle:** Spearman beats Knight, Knight beats Archer, Archer beats Swordsman and Spearman, Swordsman beats Spearman at close range only when flanked. Damage multiplier on counter: `x1.5`.

**Heroes** (one per kingdom, trained at HQ in Age II):

| Hero | Ability | Cooldown |
|---|---|---|
| **The King/Queen** | Rally Cry: +20% speed and damage in 20 m for 10 s | 60 s |
| **The Champion** | Shield Wall: nearby units take -30% damage for 8 s | 45 s |
| **The Archmage** | Crystal Storm: area damage at target | 90 s |

**Neutrals:** Bandit camps (guard chests), mercenary camps (hire for gold), wolves (roam forests, hunt lone workers).

---

## Movement

Existing system: **A\* on a 4 m grid** plus spatial-hash queries. Extend with:

### Speeds and terrain

| Terrain | Speed multiplier |
|---|---|
| Road / bridge | x1.2 |
| Meadow | x1.0 |
| Forest | x0.7 |
| Shallow river bank | x0.6 |
| Steep slope (>30°) | blocked |
| Deep water | blocked |

### Steering

1. Follow the A\* path waypoints.
2. Add **separation** (push away from units within 1.2 m) so units do not stack.
3. Add **avoidance** around buildings using grid blocking.
4. **Smooth rotation:** turn at `8 rad/s`, never snap.
5. Walk animation `timeScale = speed / baseSpeed`.

### Formations

| Formation | Use |
|---|---|
| Box | Default group move |
| Line | Right-click drag to place a line |
| Column | Over bridges (auto when crossing) |

Group moves at the speed of the **slowest** unit. Hold `Shift` while right-clicking to queue waypoints.

### Bridges

Only 3 bridges cross the river. Mark them as **chokepoints**: AI and players path through them, towers and gates can be built next to them, and units auto-switch to column formation.

---

## Placement

### Build mode

1. Pick a building from the menu (or hotkey).
2. A **ghost model** follows the cursor, snapped to the 4 m grid, rotated with `R`.
3. Ghost tint: **green** = valid, **red** = invalid.
4. Left click places the foundation, nearest idle workers walk over and build it.
5. Right click or `Esc` cancels.

### Validity rules

| Rule | Check |
|---|---|
| Terrain slope | Max 18° across the footprint |
| Not on water or river | Height above water level |
| No overlap | Grid cells free of buildings, trees, rocks |
| Inside territory | Within 60 m of an owned HQ, Keep or Watchtower (Barracks and Watchtower may go up to 90 m) |
| Resource buildings | Lumber Camp needs a tree within 12 m, Quarry needs a rock within 12 m, Mill needs a Farm within 25 m |
| Walls | Snap to existing wall ends; drag to draw a line |
| Resources | Enough in stockpile when placing |

```js
function canPlace(def, gx, gz, rot) {
  const cells = footprintCells(def, gx, gz, rot);
  if (!cells.every(c => grid.isFree(c))) return 'blocked';
  if (slopeAcross(cells) > 18) return 'too steep';
  if (cells.some(c => isWater(c))) return 'water';
  if (!inTerritory(gx, gz, def)) return 'out of territory';
  if (def.needs && !hasNearby(def.needs, gx, gz)) return `needs ${def.needs.type}`;
  return null; // valid
}
```

### Auto layout hints for AI

AI brains already pick styles (hub, ring, frontier, rear). Add placement rules per resource building:

- Farms in a ring around the Mill.
- Quarry on the closest rock cluster.
- Lumber Camp at forest edge, not inside it.
- Houses behind the keep, away from the nearest enemy.

### Construction

Buildings rise from the ground over `buildTime`, each extra worker adds `+60%` speed with diminishing returns. Show scaffolding, then swap to the final model when done.

---

## Tech ages

| Age | Unlock cost | Unlocks |
|---|---|---|
| **I. Village** | start | Workers, houses, farm, mill, lumber, quarry, swordsman, wall |
| **II. Castle** | 300 food, 200 wood, 100 stone | Barracks upgrades, archer, spearman, stable, blacksmith, temple, hero |
| **III. Kingdom** | 600 food, 400 stone, 300 gold | Knights, healers, siege workshop, market, embassy |
| **IV. Empire** | 1000 food, 800 stone, 600 gold | Archmage, Crown Hall, elite upgrades |

Blacksmith upgrades (3 levels each): melee attack, ranged attack, infantry armor, cavalry armor, wall HP, tower damage.

---

## Diplomacy and AI

Existing: each AI brain has a personality, private grudges, a private bias about rival strength, and no shared knowledge. Keep that. Add:

| Feature | Behaviour |
|---|---|
| **Ceasefire** | Pay tribute at the Embassy, 10 min peace, AI may break it if it thinks you are weak |
| **Alliance** | Shared vision, AI sends help once, can betray when you are the leader |
| **Tribute demands** | Strong AI asks you for gold, refusing may raise grudge |
| **Resource-aware AI** | Brains also build mills, farms, quarries and defend them |
| **Raid targets** | AI prefers undefended mills and caravans |
| **Personality tuning** | Paranoid: more walls. Merchant: more caravans. Warlord: early barracks. Tech: age up fast |

Privacy rule stays: a brain only learns about damage dealt to itself or what its own units and towers see.

### War declaration (no timer)

AI kingdoms **declare war on their own** when they are strong enough. There is no scheduled invasion time. Each brain checks its readiness every ~10 s (inside its staggered think turn) and declares war only when every gate passes.

**1. Readiness gates** (all must pass)

| Gate | Passes when |
|---|---|
| **Defence** | Fort at least 70% complete (keep, walls, corner and gate towers), minimum towers built, and the **home guard** (30% of army) stays behind |
| **Army** | Strike force power is at least `1.2 x` the brain's own estimate of the target's power, with at least a minimum number of units |
| **Resources** | Stockpile covers a **campaign reserve** (replace about half the army) and income is positive |
| **Supply** | Food income covers upkeep for the army plus the strike force |
| **Not exhausted** | Not recently lost a war, no active war cooldown |

```js
// src/ai.js
function warReadiness(brain) {
  const g = {
    defence:   brain.fortCompletion() >= WAR.minFort && brain.towers >= WAR.minTowers,
    army:      brain.strikePower() >= WAR.powerRatio * brain.estimateTarget(brain.bestTarget),
    resources: brain.canAfford(WAR.reserve) && brain.netIncome() > 0,
    supply:    brain.foodIncome() >= brain.upkeepWithStrikeForce(),
    rested:    brain.now() >= brain.warCooldownUntil
  };
  return { ready: Object.values(g).every(Boolean), gates: g };
}

function maybeDeclareWar(brain) {
  if (brain.activeWars >= brain.personality.maxWars) return;
  const { ready } = warReadiness(brain);
  if (!ready) return;
  const target = brain.chooseTarget();   // see targeting below
  if (target) brain.declareWar(target);
}
```

**2. Target choice**

A brain picks the target with the best score from its own knowledge:

| Factor | Effect on score |
|---|---|
| Private grudge (they damaged me) | Strong plus |
| Looks weak (own estimate, with the brain's private misjudgement bias) | Plus |
| Close to me (short march) | Plus |
| Holds a crown shard or rich resource area | Plus |
| Strong allies or high walls | Minus |
| Currently the leader in rank | Plus (everyone wants to topple the leader) |
| Allied or under ceasefire with me | Excluded |

Nothing is shared between brains. A brain only uses what its own units, scouts, spies and towers have seen.

**3. Personalities change the thresholds**

| Personality | Min fort | Power ratio | Reserve | Max wars |
|---|---|---|---|---|
| Paranoid (Varn) | 0.95 | 1.6 | high | 1 |
| Merchant (Isolde) | 0.80 | 1.5 | very high | 1 |
| Warlord (Kharg) | 0.50 | 1.1 | low | 2 |
| Tech-first (Oren) | 0.80 | 1.4 | high | 1 |
| Grudge-holder (Tull) | 0.65 | 1.2 | medium | 2 |

A warlord will go to war early and often. A paranoid lord may sit behind walls for a very long time and only attack when overwhelming. This variety replaces the old fixed timeline.

**4. What happens when war is declared**

1. A message appears: "Kingdom of Varn declared war on Kingdom of Tull." If the player is the target, a **war horn** sounds.
2. The strike force **musters** (stage point outside its own fort), then marches to **stage outside the target fort**. This takes real time, so the player usually gets a **30-60 s warning** while the army approaches.
3. Assault order stays: fighters first, then turrets, then the objective. Retreat when losing.
4. The brain keeps producing and replacing units from its reserve while the war lasts.

**5. Ending a war**

| Trigger | Result |
|---|---|
| Strike force destroyed, or readiness falls under 50% | Brain **sues for peace** (ceasefire offer) |
| Target accepts tribute | Ceasefire, 10 min peace |
| Target HQ destroyed | Target eliminated, loot split to attackers |
| Brain loses a war | Sets a **war cooldown** (3 min base, longer for paranoid) |

**6. Anti-snowball and fairness**

- **Max wars at once** per personality (table above) so one lord cannot fight everyone.
- **Player is not forced into war early.** The player is a normal target, scored like everyone else, with no extra bias.
- **Leader pressure:** strong kingdoms attract more declarations, so the game stays competitive late.
- **Early guard:** nobody can declare war while a kingdom has fewer than a minimum number of buildings (stops day-one rushes). This is a readiness check, not a timer.
- **Scout and spy intel:** the player can see another kingdom's status ("Peaceful", "Building up", "Mustering", "At war") if a scout or spy is nearby. This lets a smart player predict attacks.


---

## World events

Random events, announced with a message banner. Spacing is random and never targets only the player. Events are flavour and never replace the readiness-based war system.

| Event | Effect |
|---|---|
| **Harsh Winter** | Food production -40% for 3 min |
| **Plague** | Random kingdom loses 20% workers |
| **Good Harvest** | Farms produce +50% for 3 min |
| **Dragon Sighting** | A neutral dragon attacks a random base, kill it for a crown shard bonus |
| **Rebellion** | A big kingdom spawns rebel units inside its base |
| **Merchant Fair** | Market caravans earn x2 for 2 min |
| **Earthquake** | Walls in one region lose 30% HP, new rocks appear |

---

## UI, controls and quality of life

### Controls (existing plus new)

| Input | Action |
|---|---|
| Left click / drag | Select |
| Right click | Move / harvest / attack / rally / assign to mill |
| `WASD` / arrows / edge pan | Camera |
| Wheel | Zoom |
| `Q` / `E` or middle-drag | Rotate camera |
| `1` | Workers, `A` army, `H` HQ |
| `Space` | Focus selection |
| `S` | Stop |
| `Ctrl+1..9` / `1..9` | **New:** set / recall control groups |
| `B` | **New:** open build menu |
| `R` | **New:** rotate ghost while placing |
| `Shift + right-click` | **New:** queue waypoints |
| `F5` / `F9` | **New:** quick save / load |
| `Esc` | Cancel / open menu |

### HUD

- Top bar: **Crystal, Wood, Stone, Food, Gold**, population `used/max`, current age.
- Food shows a red warning when upkeep exceeds income.
- Minimap: terrain, kingdom colours, attack pings (flashing red ring), rival territory glow.
- Rank panel: alive count and your rank, plus rival lord names.
- Selection panel: portrait, HP bar, current job, mill workers `2/4`.
- Message log: "Kingdom of Varn declared war on Queen Isolde".

### Feedback and polish

- Floating `+10` icons when resources are deposited.
- Dust trail on running units, smoke from mills and barracks, sparks on combat hits.
- Day/night cycle with torches lighting at night and vision range dropping.
- Weather: light rain and fog layers.
- Audio: use CC0 packs from Kenney (audio) and OpenGameArt filtered to CC0.
- Save/load to `localStorage` (game state JSON plus seed).

---

## Config reference

Add these to `src/config.js`. Names are suggestions, so align them with the keys already in your file.

```js
export const RESOURCES = {
  crystal: { color: 0x7de8ff, carry: 10 },
  wood:    { color: 0x8b5a2b, carry: 10 },
  stone:   { color: 0x9aa0a8, carry: 10 },
  food:    { color: 0xe3b23c, carry: 0  }, // produced, not carried
  gold:    { color: 0xffd34d, carry: 0  }
};

export const NODES = {
  rock_small: { amount: 150, workersMax: 2 },
  rock_large: { amount: 800, workersMax: 3 },
  tree:       { amount: 100, workersMax: 1, regrowSec: 600 },
  crystal:    { amount: 500, workersMax: 4 }
};

export const MILL = { slots: 4, grainPerWorkerPerSec: 0.5, foodPerGrain: 1, linkRadius: 25 };
export const UPKEEP = { workerFood: 0.02, soldierFood: 0.04 }; // per second

export const PLACEMENT = { maxSlopeDeg: 18, territoryRadius: 60, frontierRadius: 90, grid: 4 };

export const WAR = {
  checkEverySec: 10,        // how often each brain tests readiness
  minFort: 0.7,             // fort completion 0-1
  minTowers: 4,
  homeGuardFraction: 0.3,   // part of the army that never leaves
  powerRatio: 1.2,          // strike power vs estimated target power
  minStrikeUnits: 20,
  minBuildings: 15,         // no day-one rushes
  reserve: { food: 400, wood: 300, stone: 200, crystal: 200 },
  cooldownSec: 180,         // after losing a war
  peaceThreshold: 0.5       // readiness below this: sue for peace
};

export const PERSONALITY_WAR = {
  paranoid: { minFort: 0.95, powerRatio: 1.6, reserveMul: 1.5, maxWars: 1 },
  merchant: { minFort: 0.80, powerRatio: 1.5, reserveMul: 2.0, maxWars: 1 },
  warlord:  { minFort: 0.50, powerRatio: 1.1, reserveMul: 0.6, maxWars: 2 },
  tech:     { minFort: 0.80, powerRatio: 1.4, reserveMul: 1.5, maxWars: 1 },
  grudge:   { minFort: 0.65, powerRatio: 1.2, reserveMul: 1.0, maxWars: 2 }
};

export const WORLD_EVENTS = { minGapSec: 300, maxGapSec: 480 };
```

---

## Project structure

Existing files stay. New files are marked.

```
src/
  config.js        balance, costs, kingdom count, palette
  terrain.js       heightfield, river, bridges, forests, rocks (rocks now harvestable)
  game.js          scene, units, buildings, combat, economy, input, fog, camera
  ai.js            KingdomBrain per AI + AIManager (war readiness, targeting, muster, peace)
  ui.js            HUD, build menu, minimap, messages
  main.js          boot + loop
  palette.js       NEW  kingdom colour generator
  models.js        NEW  GLTF loader, cache, team tint, procedural fallback
  economy.js       NEW  resources, nodes, mills, farms, upkeep
  buildings.js     NEW  building definitions and placement rules
  units.js         NEW  unit stats, counters, heroes, job state machine
  events.js        NEW  world events
  diplomacy.js     NEW  ceasefire, alliance, tribute
  save.js          NEW  save / load
public/models/     NEW  GLB assets and CREDITS.md
```

---

## Roadmap

1. **Phase 1, economy:** Wood, stone from rocks, quarry, lumber camp, resource HUD.
2. **Phase 2, food:** Farm, mill with assigned workers, upkeep.
3. **Phase 3, models:** `models.js`, import Kenney/Quaternius/KayKit packs, team tint, animation.
4. **Phase 4, military:** Archers, spearmen, knights, counters, stable, blacksmith, ages.
5. **Phase 5, AI:** Resource-aware brains, personalities, rival lord names, **readiness-based war declaration** (no timer), muster and peace logic.
6. **Phase 6, diplomacy and events:** Embassy, alliances, world events, crown shards.
7. **Phase 7, polish:** Siege, heroes, Crown Hall win, day/night, audio, save/load.
8. **Phase 8, campaign:** Missions such as "Survive 10 minutes", "Defend the bridge", "Capture 3 shards".

---

## Licensing

- Game code: add your preferred licence (for example MIT) in `LICENSE`.
- Models and audio: only CC0 packs are used. Credits are tracked in `public/models/CREDITS.md`.
- No third-party trademarks, characters or copyrighted artwork are used.
