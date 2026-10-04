import { MILL, UPKEEP } from './config.js';

// README-2 § Economy: workers, mills and farms.
// Farm --(grain)--> Mill --(assigned workers)--> Food.
// Pure-logic helper: Game owns the entities, this owns the rules.

export const MILL_DEF = MILL;

export function farmsNear(game, mill, radius = MILL.linkRadius) {
  const out = [];
  for (const b of game.buildings) {
    if (b.dead || b.owner !== mill.owner || b.type !== 'farm') continue;
    // farms store grain on b.grain (auto-produced); default 0
    if (Math.hypot(b.x - mill.x, b.z - mill.z) <= radius) out.push(b);
  }
  return out;
}

export function tickFarm(farm, dt) {
  farm.grain = Math.min(40, (farm.grain || 0) + dt * (1 / 4)); // +1 grain / 4s
}

export function tickMill(game, mill, dt) {
  const workers = mill.workers || (mill.workers = []);
  const farms = farmsNear(game, mill);
  let grain = farms.reduce((s, f) => s + (f.grain || 0), 0);
  const capacity = workers.length * MILL.grainPerWorkerPerSec * dt;
  const used = Math.min(grain, capacity);
  if (used > 0) {
    let need = used;
    for (const f of farms) {
      const take = Math.min(f.grain || 0, need);
      f.grain -= take;
      need -= take;
      if (need <= 0) break;
    }
    const pl = game.players[mill.owner];
    if (pl) pl.food = (pl.food || 0) + used * MILL.foodPerGrain;
  }
  mill.active = used > 0;
  return used;
}

// Upkeep: each unit costs food/sec. Starvation slows workers 30% and
// drains soldier HP 1 per 10s.
export function tickUpkeep(game, dt) {
  for (const id of Object.keys(game.players)) {
    const pl = game.players[id];
    if (!pl.alive) continue;
    let due = 0;
    for (const u of game.units) {
      if (u.dead || u.owner !== id) continue;
      due += (u.type === 'worker' ? UPKEEP.workerFood : UPKEEP.soldierFood) * dt;
    }
    pl.food = Math.max(0, (pl.food || 0) - due);
    pl.starving = (pl.food || 0) <= 0 && due > 0;
  }
}

export function workerSpeedMul(game, unit) {
  const pl = game.players[unit.owner];
  if (pl?.starving && unit.type === 'worker') return 0.7;
  return 1;
}

export function tickStarvationDamage(game, dt) {
  game._starveT = (game._starveT || 0) + dt;
  if (game._starveT < 10) return; // 1 HP per 10s
  game._starveT = 0;
  for (const u of game.units) {
    if (u.dead || u.type === 'worker') continue;
    if (game.players[u.owner]?.starving) {
      u.hp -= 1;
      if (u.hp <= 0) game.killUnit?.(u);
    }
  }
}
