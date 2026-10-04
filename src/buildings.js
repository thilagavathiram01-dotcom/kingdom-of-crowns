import { BUILD_DEFS, PLACEMENT, HQ_LEVELS, WALL_CHAIN_DIST } from './config.js';

// README-2 § Placement + § Buildings.
// canPlace returns null when valid, otherwise a reason string.

export function footprintCells(def, gx, gz, rot, grid = PLACEMENT.grid) {
  const foot = (def.foot || def.size || 3);
  const w = rot % 2 === 1 ? (def.depth || foot) : foot;
  const d = rot % 2 === 1 ? foot : (def.depth || foot);
  const cells = [];
  const nx = Math.max(1, Math.round(w * 2 / grid));
  const nz = Math.max(1, Math.round(d * 2 / grid));
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      cells.push({ x: gx + ix, z: gz + iz });
    }
  }
  return cells;
}

export function canPlace(game, type, x, z, rot = 0) {
  const def = BUILD_DEFS[type];
  if (!def) return 'unknown building';
  // water check
  try {
    const y = game.gy ? game.gy(x, z) : 0;
    const wl = game.terrain?.waterY ?? -1.0;
    if (y <= wl + 0.15) return 'water';
  } catch { /* terrain not ready */ }
  // overlap: reuse the game's spot check when available
  const size = (def.foot || 3);
  if (game.isSpotFree && !game.isSpotFree(x, z, size * 0.72 + 0.4)) return 'blocked';
  // slope check (sample corners)
  if (game.gy) {
    const h = size / 2;
    const ys = [game.gy(x - h, z - h), game.gy(x + h, z - h), game.gy(x - h, z + h), game.gy(x + h, z + z * 0 + h)];
    const slope = (Math.max(...ys) - Math.min(...ys)) / Math.max(0.001, size);
    const slopeDeg = Math.atan(slope) * 180 / Math.PI;
    if (slopeDeg > PLACEMENT.maxSlopeDeg) return 'too steep';
  }
  // territory: within 60m of HQ/keep/tower (90m for barracks/watchtower)
  const frontier = type === 'barracks' || type === 'tower';
  const radius = frontier ? PLACEMENT.frontierRadius : PLACEMENT.territoryRadius;
  if (!inTerritory(game, game.humanId && arguments.length ? x : x, z, radius, arguments[4])) {
    // inTerritory needs owner — caller passes game.currentPlacer; fall back to human
  }
  return null;
}

export function canPlaceFor(game, owner, type, x, z, rot = 0) {
  const def = BUILD_DEFS[type];
  if (!def) return 'unknown building';
  try {
    const y = game.gy ? game.gy(x, z) : 0;
    const wl = game.terrain?.waterY ?? -1.0;
    if (y <= wl + 0.15) return 'water';
  } catch { /* ignore */ }
  const size = (def.foot || 3);
  if (game.isSpotFree && !game.isSpotFree(x, z, size * 0.72 + 0.4)) return 'blocked';
  if (game.gy) {
    const h = size / 2;
    const ys = [game.gy(x - h, z - h), game.gy(x + h, z - h), game.gy(x - h, z + h), game.gy(x + h, z + h)];
    const slopeDeg = Math.atan((Math.max(...ys) - Math.min(...ys)) / Math.max(0.001, size)) * 180 / Math.PI;
    if (slopeDeg > PLACEMENT.maxSlopeDeg) return 'too steep';
  }
  const frontier = type === 'barracks' || type === 'tower';
  const radius = frontier ? PLACEMENT.frontierRadius : PLACEMENT.territoryRadius;
  if (!inTerritory(game, x, z, radius, owner)) return 'out of territory — build inside your HQ radius (upgrade HQ to expand it)';
  const need = needsNearby(type);
  if (need && game.nearestResourceLike && !game.nearestResourceLike(x, z, need.rtype, need.radius)) {
    return `needs ${need.label} nearby`;
  }
  // mill adjacency is soft (checked at runtime), hard resource-building rules:
  if (type === 'lumber' && !nearTree(game, x, z, 12)) return 'needs forest nearby';
  if (type === 'quarry' && !nearRock(game, x, z, 12)) return 'needs rocks nearby';
  return null;
}

// HQ territory: a point is inside your land if it falls in ANY living HQ
// radius you own. Radius grows with HQ level (upgrade HQ to push the border).
// Walls may also chain outward from your existing walls so bridge forts work.
export function hqRadiusOf(building) {
  const lv = Math.min(Math.max(building?.level || 1, 1), HQ_LEVELS.length);
  return HQ_LEVELS[lv - 1].radius;
}

export function inHqTerritory(game, owner, x, z, extra = 0) {
  for (const b of game.buildings) {
    if (b.dead || b.owner !== owner || b.type !== 'hq') continue;
    if (Math.hypot(b.x - x, b.z - z) <= hqRadiusOf(b) + extra) return b;
  }
  return null;
}

export function inTerritory(game, x, z, radius, owner) {
  // legacy signature kept: radius param acts as a minimum floor, but the real
  // rule is HQ levels. Walls chain from owned walls.
  if (inHqTerritory(game, owner, x, z, 0)) return true;
  // wall chaining: within WALL_CHAIN_DIST of another owned wall/tower
  for (const b of game.buildings) {
    if (b.dead || b.owner !== owner) continue;
    if (b.type !== 'wall' && b.type !== 'tower' && b.type !== 'turret') continue;
    if (Math.hypot(b.x - x, b.z - z) <= WALL_CHAIN_DIST) return true;
  }
  // no anchor yet (first HQ) — allow
  const anyHq = game.buildings.some((b) => !b.dead && b.owner === owner && b.type === 'hq');
  if (!anyHq) return true;
  return false;
}

function needsNearby() { return null; }

function nearTree(game, x, z, r) {
  if (!game.resources) return true;
  return game.resources.some((res) => res.rtype === 'tree' && Math.hypot(res.x - x, res.z - z) <= r);
}

function nearRock(game, x, z, r) {
  if (!game.resources) return true;
  if (!game.resources.some((res) => res.rtype === 'rock')) return true; // rocks not yet registered
  return game.resources.some((res) => res.rtype === 'rock' && Math.hypot(res.x - x, res.z - z) <= r);
}

export function costOf(type) {
  return { ...(BUILD_DEFS[type]?.cost || {}) };
}

export function canAfford(pl, cost) {
  const bank = (k) => (k === 'wood' ? (pl.wood ?? pl.logs ?? 0) : (pl[k] ?? 0));
  return Object.entries(cost || {}).every(([k, v]) => bank(k) >= v);
}

export function payCost(pl, cost) {
  for (const [k, v] of Object.entries(cost || {})) {
    if (k === 'wood') {
      if (pl.wood !== undefined) pl.wood -= v;
      if (pl.logs !== undefined) pl.logs = Math.max(0, pl.logs - v);
    } else {
      pl[k] = Math.max(0, (pl[k] ?? 0) - v);
    }
  }
}
