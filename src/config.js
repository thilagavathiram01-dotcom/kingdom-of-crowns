import { PLAYER_COLOR, kingdomColor as goldenColor } from './palette.js';

export const CONFIG = {
  mapSize: 500,               // vast continent: 30 kingdoms rise far apart
  kingdoms: 30,               // 1 human + 29 AI
  kingdomSpacing: 76,         // hard floor (metres) between any two kingdoms
  startLogs: 300,             // opening timber stockpile (logs from trees)
  startCrystals: 300,         // deprecated alias (use startLogs)
  // opening multi-resource stockpiles (README-2 economy)
  startWood: 300,
  startStone: 150,
  startFood: 250,
  startGold: 100,
  startCrystal: 300,
  workerCost: 50,
  soldierCost: 100,
  tankCost: 175,
  scoutCost: 60,
  artilleryCost: 200,
  bruteCost: 130,
  hunterCost: 85,
  barracksCost: 150,
  turretCost: 120,
  wallCost: 5,
  rallyClearance: 1.0,
  stagingStep: 1.7,
  demolishRefund: 0.5,
  supplyPerHQ: 26,
  supplyPerBarracks: 8,
  supplyPerTurret: 0,
  supplyPerHouse: 5,

  trainTime: { worker: 7, soldier: 9, tank: 14, scout: 7, artillery: 15, brute: 12, hunter: 8, hero_king: 25, hero_champion: 25, hero_archmage: 30 },

  units: {
    worker:   { hp: 75,  speed: 7.5, damage: 5,  range: 1.8, cooldown: 0.9, aggro: 6, sight: 13, harvestRate: 8, harvestTime: 2.2, radius: 0.7 },
    soldier:  { hp: 150, speed: 7.0, damage: 12, range: 9.0, cooldown: 0.9, aggro: 15, sight: 16, radius: 0.75 },
    tank:     { hp: 300, speed: 5.2, damage: 26, range: 11.0, cooldown: 1.6, aggro: 16, sight: 17, radius: 1.0 },
    scout:    { hp: 60,  speed: 9.8, damage: 6,  range: 7.0, cooldown: 0.7, aggro: 13, sight: 28, radius: 0.6 },
    artillery:{ hp: 130, speed: 4.6, damage: 42, range: 16.0, cooldown: 2.8, aggro: 13, sight: 16, splash: 3.2, radius: 0.85 },
    brute:    { hp: 280, speed: 6.2, damage: 22, range: 2.1, cooldown: 1.1, aggro: 14, sight: 15, radius: 0.85 },
    hunter:   { hp: 105, speed: 8.4, damage: 10, range: 7.5, cooldown: 0.65, aggro: 16, sight: 19, radius: 0.68 },
    // README-2 roster (aliases map onto the tuned bodies above)
    swordsman:{ hp: 100, speed: 4.2, damage: 12, range: 1.8, cooldown: 0.9, aggro: 14, sight: 15, radius: 0.7 },
    spearman: { hp: 90,  speed: 4.0, damage: 11, range: 2.2, cooldown: 1.0, aggro: 14, sight: 15, radius: 0.7 },
    archer:   { hp: 60,  speed: 4.4, damage: 10, range: 12.0, cooldown: 1.1, aggro: 16, sight: 18, radius: 0.65 },
    knight:   { hp: 160, speed: 6.5, damage: 18, range: 2.0, cooldown: 1.0, aggro: 15, sight: 16, radius: 0.8 },
    healer:   { hp: 50,  speed: 4.0, damage: 0,  range: 10.0, cooldown: 1.5, aggro: 0, sight: 16, radius: 0.6 },
    catapult: { hp: 120, speed: 2.5, damage: 45, range: 18.0, cooldown: 3.0, aggro: 13, sight: 16, splash: 4.0, radius: 0.9 },
    ram:      { hp: 200, speed: 3.0, damage: 30, range: 2.0, cooldown: 1.8, aggro: 8, sight: 12, radius: 0.9 },
    spy:      { hp: 30,  speed: 5.5, damage: 4,  range: 1.5, cooldown: 1.0, aggro: 0, sight: 24, radius: 0.55 },
    hero_king:{ hp: 400, speed: 5.0, damage: 30, range: 2.2, cooldown: 1.0, aggro: 18, sight: 20, radius: 0.85 },
    hero_champion: { hp: 500, speed: 4.6, damage: 26, range: 2.0, cooldown: 1.1, aggro: 18, sight: 18, radius: 0.9 },
    hero_archmage: { hp: 220, speed: 4.4, damage: 40, range: 14.0, cooldown: 2.2, aggro: 16, sight: 20, splash: 3.0, radius: 0.75 },
  },

  walls: {
    keepHalf: 10,
    keepGate: 8,
  },

  buildings: {
    hq:       { hp: 2200, size: 6,   sight: 20 },
    barracks: { hp: 800,  size: 4.5, sight: 15 },
    turret:   { hp: 650,  size: 3.4, sight: 19, range: 13, damage: 15, cooldown: 1.0 },
    wall:     { hp: 1500, size: 4.6, thick: 1.0, sight: 6 },
    // README-2 economy / tech buildings (footprint metres on the 4m grid)
    house:    { hp: 350, size: 2.5, sight: 8 },
    farm:     { hp: 300, size: 3.2, sight: 8 },
    mill:     { hp: 500, size: 3.4, sight: 10 },
    lumber:   { hp: 350, size: 2.6, sight: 8 },
    quarry:   { hp: 400, size: 2.6, sight: 8 },
    depot:    { hp: 350, size: 2.6, sight: 8 },
    archery:  { hp: 750, size: 4.2, sight: 14 },
    stable:   { hp: 800, size: 4.4, sight: 14 },
    siege:    { hp: 900, size: 5.0, sight: 14 },
    smith:    { hp: 600, size: 3.2, sight: 10 },
    temple:   { hp: 600, size: 3.4, sight: 12 },
    tower:    { hp: 700, size: 2.6, sight: 40, range: 14, damage: 16, cooldown: 1.0 },
    market:   { hp: 600, size: 3.4, sight: 10 },
    embassy:  { hp: 500, size: 3.4, sight: 10 },
    wonder:   { hp: 5000, size: 8.0, sight: 24 },
  },

  ai: {
    tick: 0.7,
    defendRadius: 42,
    thinkEvery: [2.2, 3.6],
    maxWorkers: [8, 11],
    maxArmy: [14, 26],
    maxBarracks: [3, 5],
    fortHalf: [16, 21],
    gateWidth: 10,
    wallStep: 4.6,
    readyAt: [420, 780],
    peaceMin: 240,
  },

  terrain: {
    waterLevel: -1.0,
    blockHeight: 5.0,
    riverWidth: 11,
    bridges: [-150, -55, 45, 140],
    bridgeHalf: 4.5,
    treeColliders: 240,
  },

  resource: {
    treeAmount: [60, 120],
    regrowTime: [55, 115],
    carryMax: 10,
  },
};

// ---- README-2 § Config reference (canonical balance tables) ----
export const RESOURCES = {
  crystal: { color: 0x7de8ff, carry: 10 },
  wood:    { color: 0x8b5a2b, carry: 10 },
  stone:   { color: 0x9aa0a8, carry: 10 },
  food:    { color: 0xe3b23c, carry: 0 }, // produced, not carried
  gold:    { color: 0xffd34d, carry: 0 },
};

export const NODES = {
  rock_small: { amount: 150, workersMax: 2 },
  rock_large: { amount: 800, workersMax: 3 },
  tree:       { amount: 100, workersMax: 1, regrowSec: 600 },
  crystal:    { amount: 500, workersMax: 4 },
};

export const MILL = { slots: 4, grainPerWorkerPerSec: 0.5, foodPerGrain: 1, linkRadius: 25 };
export const UPKEEP = { workerFood: 0.02, soldierFood: 0.04 }; // per second

export const PLACEMENT = { maxSlopeDeg: 18, territoryRadius: 60, frontierRadius: 90, grid: 4 };

export const WAR = {
  checkEverySec: 10,
  minFort: 0.7,
  minTowers: 4,
  homeGuardFraction: 0.3,
  powerRatio: 1.2,
  minStrikeUnits: 20,
  minBuildings: 15, // no day-one rushes (readiness gate, not a timer)
  reserve: { food: 400, wood: 300, stone: 200, crystal: 200 },
  cooldownSec: 180,
  peaceThreshold: 0.5,
};

export const PERSONALITY_WAR = {
  paranoid: { minFort: 0.95, powerRatio: 1.6, reserveMul: 1.5, maxWars: 1 },
  merchant: { minFort: 0.80, powerRatio: 1.5, reserveMul: 2.0, maxWars: 1 },
  warlord:  { minFort: 0.50, powerRatio: 1.1, reserveMul: 0.6, maxWars: 2 },
  tech:     { minFort: 0.80, powerRatio: 1.4, reserveMul: 1.5, maxWars: 1 },
  grudge:   { minFort: 0.65, powerRatio: 1.2, reserveMul: 1.0, maxWars: 2 },
};

export const WORLD_EVENTS = { minGapSec: 300, maxGapSec: 480 };

export const AGES = [
  { id: 0, name: 'I. Village', cost: null },
  { id: 1, name: 'II. Castle', cost: { food: 300, wood: 200, stone: 100 } },
  { id: 2, name: 'III. Kingdom', cost: { food: 600, stone: 400, gold: 300 } },
  { id: 3, name: 'IV. Empire', cost: { food: 1000, stone: 800, gold: 600 } },
];

export const BUILD_DEFS = {
  hq:      { name: 'HQ (Keep)', foot: 5, cost: {}, purpose: 'Drop-off, trains workers, hero' },
  house:   { name: 'House', foot: 2, cost: { wood: 40 }, purpose: '+5 population' },
  farm:    { name: 'Farm', foot: 3, cost: { wood: 50 }, purpose: 'Produces grain' },
  mill:    { name: 'Mill', foot: 3, cost: { wood: 80, stone: 20 }, purpose: 'Converts grain to food' },
  lumber:  { name: 'Lumber Camp', foot: 2, cost: { wood: 40 }, purpose: 'Wood drop-off' },
  quarry:  { name: 'Quarry', foot: 2, cost: { wood: 50 }, purpose: 'Stone drop-off, +carry' },
  depot:   { name: 'Crystal Depot', foot: 2, cost: { wood: 60 }, purpose: 'Crystal drop-off' },
  barracks:{ name: 'Barracks', foot: 4, cost: { wood: 120, stone: 40 }, purpose: 'Trains swordsmen, spearmen' },
  archery: { name: 'Archery Range', foot: 4, cost: { wood: 100, stone: 30 }, purpose: 'Archers' },
  stable:  { name: 'Stable', foot: 4, cost: { wood: 140, stone: 60 }, purpose: 'Knights, scouts (Age II)' },
  siege:   { name: 'Siege Workshop', foot: 5, cost: { wood: 200, stone: 120 }, purpose: 'Catapults, rams (Age III)' },
  smith:   { name: 'Blacksmith', foot: 3, cost: { wood: 100, stone: 60 }, purpose: 'Attack/armor upgrades' },
  temple:  { name: 'Temple', foot: 3, cost: { stone: 120, gold: 40 }, purpose: 'Healers, heals nearby' },
  tower:   { name: 'Watchtower', foot: 2, cost: { wood: 60, stone: 60 }, purpose: 'Vision +40m, shoots' },
  wall:    { name: 'Wall / Gate / Tower', foot: 1, cost: { stone: 5 }, purpose: 'Defence' },
  market:  { name: 'Market', foot: 3, cost: { wood: 100, stone: 50 }, purpose: 'Trade, caravans, gold' },
  embassy: { name: 'Embassy', foot: 3, cost: { gold: 150 }, purpose: 'Alliances, ceasefires' },
  wonder:  { name: 'Crown Hall (Wonder)', foot: 8, cost: { stone: 1500, wood: 1000, gold: 800 }, purpose: 'Win: hold 5 min' },
};

export const UNIT_DEFS = {
  worker:    { name: 'Worker', cost: { food: 50 }, hp: 40, speed: 4.0 },
  swordsman: { name: 'Swordsman', cost: { food: 60, crystal: 20 }, hp: 100, speed: 4.2 },
  spearman:  { name: 'Spearman', cost: { food: 50, wood: 20 }, hp: 90, speed: 4.0 },
  archer:    { name: 'Archer', cost: { wood: 50, gold: 30 }, hp: 60, speed: 4.4 },
  knight:    { name: 'Knight', cost: { food: 90, crystal: 40 }, hp: 160, speed: 6.5 },
  scout:     { name: 'Scout', cost: { food: 40 }, hp: 40, speed: 8.0 },
  healer:    { name: 'Healer', cost: { gold: 60 }, hp: 50, speed: 4.0 },
  catapult:  { name: 'Catapult', cost: { wood: 120, stone: 60 }, hp: 120, speed: 2.5 },
  ram:       { name: 'Ram', cost: { wood: 100 }, hp: 200, speed: 3.0 },
  spy:       { name: 'Spy', cost: { gold: 100 }, hp: 30, speed: 5.5 },
  hero_king: { name: 'The King/Queen', cost: { food: 200, gold: 200 }, hp: 400, speed: 5.0 },
  hero_champion: { name: 'The Champion', cost: { food: 200, gold: 200 }, hp: 500, speed: 4.6 },
  hero_archmage: { name: 'The Archmage', cost: { crystal: 200, gold: 250 }, hp: 220, speed: 4.4 },
};

// Counter triangle: spear > knight > archer > swordsman/spearman (x1.5)
export const COUNTERS = {
  spearman: { knight: 1.5 },
  knight: { archer: 1.5 },
  archer: { swordsman: 1.5, spearman: 1.5 },
};

export const HEROES = {
  king: { name: 'The King/Queen', ability: 'Rally Cry: +20% speed & damage in 20m for 10s', cooldown: 60 },
  champion: { name: 'The Champion', ability: 'Shield Wall: -30% damage for 8s', cooldown: 45 },
  archmage: { name: 'The Archmage', ability: 'Crystal Storm: area damage', cooldown: 90 },
};

// Movement terrain multipliers (README-2 § Movement)
export const TERRAIN_SPEED = {
  road: 1.2, meadow: 1.0, forest: 0.7, bank: 0.6, steep: 0, water: 0,
};

export const COLORS = {
  player: PLAYER_COLOR,
  enemy: 0xef4444,
  log: 0x4ade80,
  crystal: 0x4ade80,
  select: 0x4ade80,
};

export function kingdomColor(i) {
  return goldenColor(i);
}

const TITLES = ['Ash', 'Birch', 'Cinder', 'Dune', 'Ember', 'Fern', 'Gale', 'Holly',
  'Iron', 'Juniper', 'Kite', 'Lark', 'Moss', 'Nettle', 'Onyx', 'Pine', 'Quartz',
  'Reed', 'Slate', 'Thorn', 'Umber', 'Vex', 'Willow', 'Yew', 'Zinc', 'Flint',
  'Grouse', 'Heron', 'Ivy'];

export function kingdomName(i) {
  if (i === 0) return 'You';
  return `${TITLES[(i - 1) % TITLES.length]} Kingdom`;
}

// Rival lord personas (shown in rank panel + messages)
export const LORDS = [
  { name: 'Lord Varn the Paranoid', style: 'paranoid', desc: 'turtles behind walls' },
  { name: 'Queen Isolde the Merchant', style: 'merchant', desc: 'trades, rarely attacks' },
  { name: 'Warlord Kharg', style: 'warlord', desc: 'early rushes' },
  { name: 'Magister Oren', style: 'tech', desc: 'tech-first' },
  { name: 'Baron Tull the Grudge-holder', style: 'grudge', desc: 'revenge waves' },
];

export function lordOf(i) {
  if (i === 0) return { name: 'You', style: 'player', desc: 'the human crown' };
  return LORDS[(i - 1) % LORDS.length];
}
