import { MILL, UPKEEP } from './config.js';

// Economy: workers, mills, farms, and food upkeep.
// Workers stationed at Mills actively produce food. Adjacent Farms provide raw grain which mills grind for bonus food.

export const MILL_DEF = MILL;

export function farmsNear(game, mill, radius = MILL.linkRadius) {
  const out = [];
  for (const b of game.buildings) {
    if (b.dead || b.owner !== mill.owner || b.type !== 'farm') continue;
    if (Math.hypot(b.x - mill.x, b.z - mill.z) <= radius) out.push(b);
  }
  return out;
}

export function tickFarm(farm, dt) {
  farm.grain = Math.min(40, (farm.grain || 0) + dt * (1 / 3)); // +1 grain every 3s
}

export function tickMill(game, mill, dt) {
  const workers = mill.workers || (mill.workers = []);
  if (!workers.length) {
    mill.active = false;
    return 0;
  }

  // Base output: stationed workers actively generate food
  const baseRate = MILL.baseFoodPerWorkerPerSec ?? 0.6;
  const baseFood = workers.length * baseRate * dt;

  // Bonus output: grinding grain from nearby connected farms
  const farms = farmsNear(game, mill);
  const grainTotal = farms.reduce((sum, f) => sum + (f.grain || 0), 0);
  const grainCapacity = workers.length * (MILL.bonusGrainPerWorkerPerSec ?? 0.8) * dt;
  const usedGrain = Math.min(grainTotal, grainCapacity);

  if (usedGrain > 0) {
    let need = usedGrain;
    for (const f of farms) {
      const take = Math.min(f.grain || 0, need);
      f.grain -= take;
      need -= take;
      if (need <= 0) break;
    }
  }

  const totalFood = baseFood + usedGrain * (MILL.foodPerGrain ?? 1);
  const pl = game.players[mill.owner];
  if (pl) pl.food = (pl.food || 0) + totalFood;

  mill.active = totalFood > 0;
  mill._floatT = (mill._floatT || 0) + dt;
  if (mill.owner === game.humanId && mill._floatT > 2.5) {
    mill._floatT = 0;
    game.spawnFloat?.(mill.x, mill.z, `+${Math.round(totalFood * 2.5)}🌾`, '#e3b23c');
  }

  return totalFood;
}

// Upkeep: each unit costs food/sec. Starvation slows workers and damages soldiers
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
