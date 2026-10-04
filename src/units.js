import { UNIT_DEFS, COUNTERS, HEROES } from './config.js';

// README-2 § Units and heroes: stats, x1.5 counter triangle, hero abilities.

export function counterMultiplier(attackerType, defenderType) {
  const row = COUNTERS[attackerType];
  if (row && row[defenderType]) return row[defenderType];
  return 1;
}

export function unitCost(type) {
  return { ...(UNIT_DEFS[type]?.cost || {}) };
}

export function heroFor(kingdomIndex) {
  const keys = Object.keys(HEROES);
  return { key: keys[kingdomIndex % keys.length], ...HEROES[keys[kingdomIndex % keys.length]] };
}

// Job state machine states for workers:
// IDLE -> MOVE_TO_NODE -> HARVEST -> CARRY -> MOVE_TO_DROP -> DEPOSIT
//        \-> ASSIGNED_TO_MILL (stationary, working)
export const WORKER_JOBS = ['IDLE', 'MOVE_TO_NODE', 'HARVEST', 'CARRY', 'MOVE_TO_DROP', 'DEPOSIT', 'ASSIGNED_TO_MILL'];

export function describeUnit(type) {
  const d = UNIT_DEFS[type];
  if (!d) return type;
  return `${d.name} — HP ${d.hp}, ${d.speed.toFixed(1)} m/s`;
}
