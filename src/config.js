export const CONFIG = {
  mapSize: 500,               // vast continent: 30 kingdoms rise far apart
  kingdoms: 30,               // 1 human + 29 AI
  kingdomSpacing: 76,         // hard floor (metres) between any two kingdoms; the
                              // candidate site grid is sized from this value
  startLogs: 300,             // opening timber stockpile (logs from trees)
  startCrystals: 300,         // deprecated alias (use startLogs)
  workerCost: 50,
  soldierCost: 100,
  tankCost: 175,
  scoutCost: 60,
  artilleryCost: 200,
  bruteCost: 130,             // caveman club brawler
  hunterCost: 85,             // caveman spear thrower
  barracksCost: 150,
  turretCost: 120,
  wallCost: 5,                // cheap blocker: walls are the game's bread & butter
  rallyClearance: 1.0,        // rally/staging searches keep this breathing room
  stagingStep: 1.7,           // rally-ring spacing so trained units do not stack
  demolishRefund: 0.5,        // demolish returns this fraction of the build cost
  supplyPerHQ: 26,
  supplyPerBarracks: 8,
  supplyPerTurret: 0,

  // slow strategic pacing (~1 hour to dominate): slower training + harvest,
  // tougher buildings so wars are sieges, not raids
  trainTime: { worker: 7, soldier: 9, tank: 14, scout: 7, artillery: 15, brute: 12, hunter: 8 },

  units: {
    worker:   { hp: 75,  speed: 7.5, damage: 5,  range: 1.8, cooldown: 0.9, aggro: 6, sight: 13, harvestRate: 8, harvestTime: 2.2, radius: 0.7 },
    soldier:  { hp: 150, speed: 7.0, damage: 12, range: 9.0, cooldown: 0.9, aggro: 15, sight: 16, radius: 0.75 },
    tank:     { hp: 300, speed: 5.2, damage: 26, range: 11.0, cooldown: 1.6, aggro: 16, sight: 17, radius: 1.0 },
    scout:    { hp: 60,  speed: 9.8, damage: 6,  range: 7.0, cooldown: 0.7, aggro: 13, sight: 28, radius: 0.6 },
    artillery:{ hp: 130, speed: 4.6, damage: 42, range: 16.0, cooldown: 2.8, aggro: 13, sight: 16, splash: 3.2, radius: 0.85 },
    // caveman troops: same Cave Man rig as the workers, different weapons
    brute:    { hp: 280, speed: 6.2, damage: 22, range: 2.1, cooldown: 1.1, aggro: 14, sight: 15, radius: 0.85 },
    hunter:   { hp: 105, speed: 8.4, damage: 10, range: 7.5, cooldown: 0.65, aggro: 16, sight: 19, radius: 0.68 },
  },

  walls: {
    // walls are elastic segments: the fort planner hands each piece the exact
    // slot length so runs tile edge-to-edge with no gaps to squeeze through.
    keepHalf: 10,              // starter keep wall half-extent around every kingdom
    keepGate: 8,               // gate width (must fit the 3m path grid)
  },

  buildings: {
    hq:       { hp: 2200, size: 6,   sight: 20 },
    barracks: { hp: 800,  size: 4.5, sight: 15 },
    turret:   { hp: 650,  size: 3.4, sight: 19, range: 13, damage: 15, cooldown: 1.0 },
    // long + thin + rotatable; hp is sized per metre so a wall line is as tough
    // as the old 1.7m cube but 5x cheaper to lay down
    wall:     { hp: 1500, size: 4.6, thick: 1.0, sight: 6 },
  },

  ai: {
    tick: 0.7,
    defendRadius: 42,
    thinkEvery: [2.2, 3.6],     // staggered brain ticks (perf + each kingdom thinks alone)
    // every kingdom rolls its OWN values inside these ranges (personality)
    maxWorkers: [8, 11],
    maxArmy: [14, 26],
    maxBarracks: [3, 5],
    fortHalf: [16, 21],        // outer fort half-extent (outside the starter keep)
    gateWidth: 10,             // gap between wall ends: 3m path grid needs >= 6
    wallStep: 4.6,             // default wall segment length (walls stretch to fit)
    readyAt: [420, 780],        // earliest time a kingdom may start its own wars
    peaceMin: 240,              // nobody launches a campaign before this
  },

  terrain: {
    waterLevel: -1.0,
    blockHeight: 5.0,        // above this = mountain, impassable
    riverWidth: 11,
    bridges: [-150, -55, 45, 140], // 4 crossings spread along the river
    bridgeHalf: 4.5,
    treeColliders: 240,
  },

  resource: {
    treeAmount: [60, 120],    // logs per terrain tree (workers visibly work through them)
    regrowTime: [55, 115],    // seconds a chopped tree needs to grow back
    carryMax: 10,             // logs a worker hauls per trip
  },
};

// 30 distinct kingdom colors. Index 0 is always the human (blue).
const PALETTE = [
  0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xa855f7, 0x06b6d4,
  0xf97316, 0xec4899, 0x84cc16, 0x14b8a6, 0xfacc15, 0x8b5cf6,
  0xfb7185, 0x34d399, 0xfbbf24, 0x60a5fa, 0xf472b6, 0xa3e635,
  0x2dd4bf, 0xfb923c, 0xe879f9, 0x99f6e4, 0xfdba74, 0xc084fc,
  0xbef264, 0xfde047, 0x7dd3fc, 0xfca5a5, 0x6ee7b7, 0xd8b4fe,
];

export const COLORS = {
  player: PALETTE[0],
  enemy: 0xef4444,
  log: 0x4ade80,              // harvestable trees on minimap / pings
  crystal: 0x4ade80,          // deprecated alias (was crystal cyan)
  select: 0x4ade80,
};

export function kingdomColor(i) {
  return PALETTE[i % PALETTE.length];
}

export function kingdomName(i) {
  if (i === 0) return 'You';
  const titles = ['Ash', 'Birch', 'Cinder', 'Dune', 'Ember', 'Fern', 'Gale', 'Holly',
    'Iron', 'Juniper', 'Kite', 'Lark', 'Moss', 'Nettle', 'Onyx', 'Pine', 'Quartz',
    'Reed', 'Slate', 'Thorn', 'Umber', 'Vex', 'Willow', 'Yew', 'Zinc', 'Flint',
    'Grouse', 'Heron', 'Ivy'];
  return `${titles[(i - 1) % titles.length]} Kingdom`;
}
