import { PLAYER_COLOR, kingdomColor as goldenColor } from './palette.js';

export const CONFIG = {
  mapSize: 500,               // vast continent: 30 kingdoms rise far apart
  kingdoms: 30,               // 1 human + 29 AI
  kingdomSpacing: 76,         // hard floor (metres) between any two kingdoms
  startLogs: 300,             // opening timber stockpile (logs from trees)
  startWood: 300,
  startFood: 250,
  workerCost: 50,
  soldierCost: 100,
  tankCost: 175,
  scoutCost: 50,
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

  trainTime: { worker: 6, soldier: 8, swordsman: 8, spearman: 8, archer: 8, knight: 12, tank: 14, scout: 6, artillery: 15, brute: 11, hunter: 8, healer: 10, catapult: 14, ram: 12, spy: 8, hero_king: 25, hero_champion: 25, hero_archmage: 30 },

  units: {
    worker:   { hp: 75,  speed: 7.5, damage: 5,  range: 1.8, cooldown: 0.9, aggro: 6, sight: 13, harvestRate: 8, harvestTime: 2.0, radius: 0.7 },
    soldier:  { hp: 150, speed: 7.0, damage: 12, range: 9.0, cooldown: 0.9, aggro: 15, sight: 16, radius: 0.75 },
    tank:     { hp: 300, speed: 5.2, damage: 26, range: 11.0, cooldown: 1.6, aggro: 16, sight: 17, radius: 1.0 },
    scout:    { hp: 60,  speed: 9.8, damage: 6,  range: 7.0, cooldown: 0.7, aggro: 13, sight: 28, radius: 0.6 },
    artillery:{ hp: 130, speed: 4.6, damage: 42, range: 16.0, cooldown: 2.8, aggro: 13, sight: 16, splash: 3.2, radius: 0.85 },
    brute:    { hp: 280, speed: 6.2, damage: 22, range: 2.1, cooldown: 1.1, aggro: 14, sight: 15, radius: 0.85 },
    hunter:   { hp: 105, speed: 8.4, damage: 10, range: 7.5, cooldown: 0.65, aggro: 16, sight: 19, radius: 0.68 },
    swordsman:{ hp: 110, speed: 5.5, damage: 14, range: 1.8, cooldown: 0.9, aggro: 14, sight: 15, radius: 0.7 },
    spearman: { hp: 95,  speed: 5.2, damage: 12, range: 2.2, cooldown: 1.0, aggro: 14, sight: 15, radius: 0.7 },
    archer:   { hp: 65,  speed: 5.4, damage: 11, range: 12.0, cooldown: 1.0, aggro: 16, sight: 18, radius: 0.65 },
    knight:   { hp: 175, speed: 7.2, damage: 20, range: 2.0, cooldown: 1.0, aggro: 15, sight: 16, radius: 0.8 },
    healer:   { hp: 60,  speed: 5.0, damage: 0,  range: 10.0, cooldown: 1.4, aggro: 0, sight: 16, radius: 0.6 },
    catapult: { hp: 125, speed: 3.2, damage: 48, range: 18.0, cooldown: 3.0, aggro: 13, sight: 16, splash: 4.0, radius: 0.9 },
    ram:      { hp: 220, speed: 3.6, damage: 35, range: 2.0, cooldown: 1.8, aggro: 8, sight: 12, radius: 0.9 },
    spy:      { hp: 35,  speed: 6.5, damage: 5,  range: 1.5, cooldown: 1.0, aggro: 0, sight: 24, radius: 0.55 },
    hero_king:{ hp: 450, speed: 5.5, damage: 32, range: 2.2, cooldown: 1.0, aggro: 18, sight: 20, radius: 0.85 },
    hero_champion: { hp: 550, speed: 5.0, damage: 28, range: 2.0, cooldown: 1.1, aggro: 18, sight: 18, radius: 0.9 },
    hero_archmage: { hp: 240, speed: 4.8, damage: 44, range: 14.0, cooldown: 2.2, aggro: 16, sight: 20, splash: 3.0, radius: 0.75 },
  },

  walls: {
    keepHalf: 10,
    keepGate: 8,
  },

  buildings: {
    hq:       { hp: 2400, size: 6,   sight: 20 },
    barracks: { hp: 850,  size: 4.5, sight: 15 },
    turret:   { hp: 650,  size: 3.4, sight: 19, range: 13, damage: 15, cooldown: 1.0 },
    wall:     { hp: 1500, size: 4.6, thick: 1.0, sight: 6 },
    house:    { hp: 350, size: 2.5, sight: 8 },
    farm:     { hp: 300, size: 3.2, sight: 8 },
    mill:     { hp: 550, size: 3.4, sight: 10 },
    lumber:   { hp: 350, size: 2.6, sight: 8 },
    archery:  { hp: 750, size: 4.2, sight: 14 },
    stable:   { hp: 850, size: 4.4, sight: 14 },
    siege:    { hp: 950, size: 5.0, sight: 14 },
    smith:    { hp: 650, size: 3.2, sight: 10 },
    temple:   { hp: 650, size: 3.4, sight: 12 },
    tower:    { hp: 750, size: 2.6, sight: 40, range: 14, damage: 16, cooldown: 1.0 },
    market:   { hp: 650, size: 3.4, sight: 10 },
    embassy:  { hp: 550, size: 3.4, sight: 10 },
    wonder:   { hp: 5000, size: 8.0, sight: 24 },
  },

  ai: {
    tick: 0.7,
    defendRadius: 42,
    thinkEvery: [2.2, 3.6],
    maxWorkers: [8, 12],
    maxArmy: [14, 28],
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
    treeAmount: [70, 140],
    regrowTime: [50, 100],
    carryMax: 10,
  },
};

// ---- Streamlined 2-Resource Economy: Wood (chopped) + Food (mills & farms) ----
export const RESOURCES = {
  wood:    { color: 0x8b5a2b, carry: 10, icon: '🪵' },
  food:    { color: 0xe3b23c, carry: 0, icon: '🌾' },
};

export const NODES = {
  tree: { amount: 100, workersMax: 1, regrowSec: 450 },
};

export const MILL = {
  slots: 4,
  baseFoodPerWorkerPerSec: 0.6,
  bonusGrainPerWorkerPerSec: 0.8,
  foodPerGrain: 1,
  linkRadius: 30,
};
export const UPKEEP = { workerFood: 0.015, soldierFood: 0.035 }; // food consumed per second

export const PLACEMENT = { maxSlopeDeg: 18, territoryRadius: 65, frontierRadius: 95, grid: 4 };

// HQ territory: every building must stand inside one of your HQ radii.
// Upgrade the HQ to push the border out; new HQs chain inside existing land.
export const HQ_LEVELS = [
  { level: 1, radius: 70, supply: 26, cost: null },
  { level: 2, radius: 95, supply: 34, cost: { wood: 400, food: 300 } },
  { level: 3, radius: 125, supply: 44, cost: { wood: 800, food: 600 } },
];
export const NEW_HQ_COST = { wood: 800, food: 500 };
export const MAX_HQ_PER_KINGDOM = 3;
export const WALL_CHAIN_DIST = 30; // walls may extend this far past owned walls

export const WAR = {
  checkEverySec: 10,
  minFort: 0.7,
  minTowers: 4,
  homeGuardFraction: 0.3,
  powerRatio: 1.2,
  minStrikeUnits: 20,
  minBuildings: 15,
  reserve: { food: 350, wood: 250 },
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
  { id: 1, name: 'II. Castle', cost: { food: 250, wood: 200 } },
  { id: 2, name: 'III. Kingdom', cost: { food: 500, wood: 400 } },
  { id: 3, name: 'IV. Empire', cost: { food: 900, wood: 800 } },
];
export const AGE_NAMES = ['I. Village', 'II. Castle', 'III. Kingdom', 'IV. Empire'];

// Prerequisites for buildings: required age level and required prerequisite building
export const BUILD_REQUIRES = {
  house:    { age: 0 },
  farm:     { age: 0 },
  mill:     { age: 0 },
  lumber:   { age: 0 },
  barracks: { age: 0 },
  wall:     { age: 0 },
  turret:   { age: 0, building: 'barracks', name: 'Barracks' },
  tower:    { age: 1, building: 'barracks', name: 'Barracks' },
  archery:  { age: 1, building: 'barracks', name: 'Barracks' },
  stable:   { age: 1, building: 'barracks', name: 'Barracks' },
  smith:    { age: 1 },
  temple:   { age: 1, building: 'smith', name: 'Blacksmith' },
  market:   { age: 2 },
  embassy:  { age: 2 },
  siege:    { age: 2, building: 'smith', name: 'Blacksmith' },
  wonder:   { age: 3 },
};

// Unit requirements: which building produces them, and what age is needed
export const UNIT_REQUIRES = {
  worker:        { building: 'hq', age: 0, name: 'Town Center (HQ)' },
  scout:         { building: 'hq', age: 0, name: 'Town Center (HQ)' },
  soldier:       { building: 'barracks', age: 0, name: 'Barracks' },
  swordsman:     { building: 'barracks', age: 0, name: 'Barracks' },
  spearman:      { building: 'barracks', age: 0, name: 'Barracks' },
  brute:         { building: 'barracks', age: 0, name: 'Barracks' },
  archer:        { building: 'archery', age: 1, name: 'Archery Range' },
  hunter:        { building: 'archery', age: 1, name: 'Archery Range' },
  knight:        { building: 'stable', age: 1, name: 'Stable' },
  tank:          { building: 'stable', age: 1, name: 'Stable' },
  catapult:      { building: 'siege', age: 2, name: 'Siege Workshop' },
  ram:           { building: 'siege', age: 2, name: 'Siege Workshop' },
  artillery:     { building: 'siege', age: 2, name: 'Siege Workshop' },
  healer:        { building: 'temple', age: 1, name: 'Temple' },
  spy:           { building: 'hq', age: 1, name: 'Town Center (Age II)' },
  hero_king:     { building: 'hq', age: 1, name: 'Castle Age (Age II)' },
  hero_champion: { building: 'hq', age: 1, name: 'Castle Age (Age II)' },
  hero_archmage: { building: 'hq', age: 2, name: 'Kingdom Age (Age III)' },
};

export const TRAIN_AGE = {
  hero_king: 1,
  hero_champion: 1,
  hero_archmage: 2,
};

// Building Definitions with comprehensive RTS descriptions, roles, and feature summaries
export const BUILD_DEFS = {
  hq: {
    name: 'Town Center (Keep)',
    icon: 'hq',
    foot: 5,
    cost: {},
    role: 'Capital Stronghold',
    purpose: 'Trains workers, scouts, and heroes. Central resource depot.',
    feature: 'Core of your empire. Trains workers to gather timber, delivers all chopped wood here, advances technology ages, and summons legendary royal champions.',
  },
  house: {
    name: 'House',
    icon: 'home',
    foot: 2,
    cost: { wood: 40 },
    role: 'Civilian Dwelling',
    purpose: '+5 population capacity',
    feature: 'Provides housing for your growing realm. Each house permanently raises maximum population support by +5 supply.',
  },
  farm: {
    name: 'Farm',
    icon: 'farm',
    foot: 3,
    cost: { wood: 50 },
    role: 'Agriculture',
    purpose: 'Produces grain for mills',
    feature: 'Cultivates crops and automatically stockpiles raw grain over time. Adjacent mills within 30m grind this grain into food at accelerated rates.',
  },
  mill: {
    name: 'Windmill',
    icon: 'mill',
    foot: 3,
    cost: { wood: 100 },
    role: 'Food Production',
    purpose: 'Converts labor & grain to Food',
    feature: 'Station up to 4 workers here to continuously grind grain into food. Generates baseline food continuously, plus bonus yields when farms are nearby.',
  },
  lumber: {
    name: 'Lumber Camp',
    icon: 'lumber',
    foot: 2,
    cost: { wood: 40 },
    role: 'Forest Outpost',
    purpose: 'Forward logging post',
    feature: 'Construct near dense timber stands to anchor expansion and provide a strategic rallying marker for forestry workers.',
  },
  barracks: {
    name: 'Barracks',
    icon: 'barracks',
    foot: 4,
    cost: { wood: 150 },
    role: 'Infantry Proving Ground',
    purpose: 'Trains infantry · +8 supply',
    feature: 'Drills frontline swordsmen, armor-piercing spearmen, and heavy club brutes. Expands military supply by +8.',
  },
  archery: {
    name: 'Archery Range',
    icon: 'archer',
    foot: 4,
    cost: { wood: 130, food: 30 },
    role: 'Ranged Facility',
    purpose: 'Trains Archers & Hunters (Age II)',
    feature: 'Trains long-range archers and javelin hunters. Ranged attacks deal 1.5× bonus counter damage against infantry lines.',
  },
  stable: {
    name: 'War Stable',
    icon: 'stable',
    foot: 4,
    cost: { wood: 200, food: 60 },
    role: 'Cavalry Garrison',
    purpose: 'Trains Knights & Scouts (Age II)',
    feature: 'Breeds sturdy warhorses to field armored Knights. High movement speed and charge attacks inflict 1.5× bonus counter damage against archers.',
  },
  siege: {
    name: 'Siege Workshop',
    icon: 'siege',
    foot: 5,
    cost: { wood: 320, food: 80 },
    role: 'Foundry of War',
    purpose: 'Builds Catapults & Rams (Age III)',
    feature: 'Fabricates heavy siege weapons. Catapults and Rams deal catastrophic structural splash damage against enemy walls, gates, and towers.',
  },
  smith: {
    name: 'Blacksmith',
    icon: 'smith',
    foot: 3,
    cost: { wood: 160, food: 40 },
    role: 'Forge & Armory',
    purpose: 'Military tech & unlocks (Age II)',
    feature: 'Forges iron gear, sharpening weapons and hardening armor across your army. Required prerequisite for Temples and Siege Workshops.',
  },
  temple: {
    name: 'Sanctuary Temple',
    icon: 'temple',
    foot: 3,
    cost: { wood: 120, food: 60 },
    role: 'Divine Sanctuary',
    purpose: 'Trains Healers · heals nearby (Age II)',
    feature: 'Consecrated grounds that train holy Healers. The sanctuary radiates a soothing aura that passively restores health to nearby friendly units.',
  },
  tower: {
    name: 'Watchtower',
    icon: 'tower',
    foot: 2,
    cost: { wood: 120 },
    role: 'Fortified Look-out',
    purpose: 'Vision +40m · defensive arrows (Age II)',
    feature: 'High stone watchtower that pierces the fog of war with +40m sight. Automatically fires volleys of arrows at approaching hostile units.',
  },
  turret: {
    name: 'Defense Turret',
    icon: 'turret',
    foot: 2,
    cost: { wood: 120 },
    role: 'Automated Bastion',
    purpose: 'Rapid automated defense',
    feature: 'Emplaces a rapid-fire defensive turret within your territory to guard chokepoints and defend against early enemy raids.',
  },
  wall: {
    name: 'Stone Wall / Gate',
    icon: 'wall',
    foot: 1,
    cost: { wood: 5 },
    role: 'Barrier Fortification',
    purpose: 'Impedes and funnels enemy forces',
    feature: 'Heavy barricades to seal mountain passes and bridgeheads. Forces invaders to pause and breach before advancing into your kingdom.',
  },
  market: {
    name: 'Market Bazaar',
    icon: 'market',
    foot: 3,
    cost: { wood: 150, food: 50 },
    role: 'Commerce Hub',
    purpose: 'Caravans yield food & trade (Age III)',
    feature: 'Establishes trade routes. Dispatches pack caravans across the continent every 90 seconds, returning with lucrative food shipments.',
  },
  embassy: {
    name: 'Diplomatic Embassy',
    icon: 'embassy',
    foot: 3,
    cost: { wood: 100, food: 50 },
    role: 'Diplomatic Chancellery',
    purpose: 'Alliances & ceasefires (Age III)',
    feature: 'Houses envoys to forge temporary non-aggression pacts, ceasefires, or full military alliances with neighboring AI lords.',
  },
  wonder: {
    name: 'Crown Hall (Wonder)',
    icon: 'wonder',
    foot: 8,
    cost: { wood: 1500, food: 1000 },
    role: 'Monument of Eternal Glory',
    purpose: 'Victory monument (Age IV)',
    feature: 'Erect the supreme wonder of the realm. Defend the Crown Hall and keep it standing for 5 minutes under enemy assault to claim ultimate victory!',
  },
};

export const UNIT_DEFS = {
  worker: {
    name: 'Worker',
    icon: 'worker',
    cost: { food: 50 },
    hp: 75,
    speed: 7.5,
    role: 'Laborer & Harvester',
    desc: 'Chops trees for timber, delivers logs to HQ, constructs buildings, and operates windmills.',
  },
  scout: {
    name: 'Scout',
    icon: 'scout',
    cost: { food: 40 },
    hp: 60,
    speed: 9.8,
    role: 'Reconnaissance Cavalry',
    desc: 'Swift horseman with massive 28m line of sight. Maps the terrain and tracks hostile troop movements.',
  },
  soldier: {
    name: 'Soldier',
    icon: 'soldier',
    cost: { food: 60, wood: 20 },
    hp: 150,
    speed: 7.0,
    role: 'Infantry Warrior',
    desc: 'Standard frontline foot soldier armed with shield and sword. Solid all-around melee combatant.',
  },
  swordsman: {
    name: 'Swordsman',
    icon: 'soldier',
    cost: { food: 60, wood: 20 },
    hp: 110,
    speed: 5.5,
    role: 'Frontline Blade',
    desc: 'Heavy infantry swordsman. Slices through defensive lines and shields archers.',
  },
  spearman: {
    name: 'Spearman',
    icon: 'spear',
    cost: { food: 50, wood: 20 },
    hp: 95,
    speed: 5.2,
    role: 'Anti-Cavalry Guard',
    desc: 'Wields long pikes with extended melee reach. Deals 1.5× lethal counter damage against charging Knights.',
  },
  brute: {
    name: 'Brute',
    icon: 'brute',
    cost: { food: 80, wood: 40 },
    hp: 280,
    speed: 6.2,
    role: 'Heavy Brawler',
    desc: 'Massive club-swinging barbarian. Boasts heavy health and crushes lightly armored foes in close quarters.',
  },
  archer: {
    name: 'Archer',
    icon: 'archer',
    cost: { food: 45, wood: 35 },
    hp: 65,
    speed: 5.4,
    role: 'Longbow Marksman',
    desc: 'Deadly ranged marksman with 12m attack range. Deals 1.5× lethal counter damage to Swordsmen and Spearmen.',
  },
  hunter: {
    name: 'Hunter',
    icon: 'hunter',
    cost: { food: 50, wood: 30 },
    hp: 105,
    speed: 8.4,
    role: 'Skirmisher',
    desc: 'Nimble javelin thrower. Fast movement speed enables aggressive kiting and flanking strikes.',
  },
  knight: {
    name: 'Knight',
    icon: 'knight',
    cost: { food: 90, wood: 50 },
    hp: 175,
    speed: 7.2,
    role: 'Heavy Shock Cavalry',
    desc: 'Armored charger on horseback. Closes distances rapidly and deals 1.5× lethal counter damage to Archers.',
  },
  tank: {
    name: 'Tank',
    icon: 'tank',
    cost: { food: 100, wood: 80 },
    hp: 300,
    speed: 5.2,
    role: 'Armored Vanguard',
    desc: 'Ironclad war wagon. Absorbs heavy punishment and spearheads offensive pushes into fortified strongholds.',
  },
  healer: {
    name: 'Healer',
    icon: 'healer',
    cost: { food: 70, wood: 20 },
    hp: 60,
    speed: 5.0,
    role: 'Combat Medic',
    desc: 'Devout priest trained at the Temple. Restores vitality to wounded soldiers on the battlefield.',
  },
  catapult: {
    name: 'Catapult',
    icon: 'artillery',
    cost: { wood: 140, food: 50 },
    hp: 125,
    speed: 3.2,
    role: 'Siege Artillery',
    desc: 'Long-range trebuchet mechanism. Hurls massive boulders over 18m range to smash gates and towers with area splash.',
  },
  ram: {
    name: 'Ram',
    icon: 'ram',
    cost: { wood: 110, food: 30 },
    hp: 220,
    speed: 3.6,
    role: 'Gate Breaker',
    desc: 'Armored battering ram. Highly resilient to projectile fire; demolishes enemy walls and gates in seconds.',
  },
  artillery: {
    name: 'Artillery',
    icon: 'artillery',
    cost: { wood: 180, food: 70 },
    hp: 130,
    speed: 4.6,
    role: 'Bombard Cannon',
    desc: 'Devastating heavy ordnance that pulverizes clusters of enemy soldiers and defenses with area splash.',
  },
  spy: {
    name: 'Spy',
    icon: 'scout',
    cost: { food: 90, wood: 20 },
    hp: 35,
    speed: 6.5,
    role: 'Infiltrator',
    desc: 'Infiltrates rival territories unseen, revealing enemy troop movements and sabotaging enemy structures.',
  },
  hero_king: {
    name: 'The Sovereign King',
    icon: 'crown',
    cost: { food: 200, wood: 200 },
    hp: 450,
    speed: 5.5,
    role: 'Royal Commander',
    desc: 'Legendary monarch. Radiates a Rally Cry aura granting +20% speed and damage to all surrounding friendly troops.',
  },
  hero_champion: {
    name: 'The Champion',
    icon: 'shield',
    cost: { food: 200, wood: 200 },
    hp: 550,
    speed: 5.0,
    role: 'Invulnerable Knight',
    desc: 'Unmatched warlord of the arena. Deploys Shield Wall, reducing all incoming damage by 30% for 8 seconds.',
  },
  hero_archmage: {
    name: 'The Archmage',
    icon: 'archer',
    cost: { food: 220, wood: 240 },
    hp: 240,
    speed: 4.8,
    role: 'Grand Sorcerer',
    desc: 'Master of elemental tempest. Conjures a devastating storm across a 14m area, annihilating entire enemy squadrons.',
  },
};

// Counter triangle: spear > knight > archer > swordsman/spearman (x1.5)
export const COUNTERS = {
  spearman: { knight: 1.5 },
  knight: { archer: 1.5 },
  archer: { swordsman: 1.5, spearman: 1.5, brute: 1.3 },
};

export const HEROES = {
  king: { name: 'The Sovereign King', ability: 'Rally Cry: +20% speed & damage in 20m for 10s', cooldown: 60 },
  champion: { name: 'The Champion', ability: 'Shield Wall: -30% damage for 8s', cooldown: 45 },
  archmage: { name: 'The Archmage', ability: 'Tempest Storm: area damage across 14m', cooldown: 90 },
};

export const TERRAIN_SPEED = {
  road: 1.2, meadow: 1.0, forest: 0.7, bank: 0.6, steep: 0, water: 0,
};

export const COLORS = {
  player: PLAYER_COLOR,
  enemy: 0xef4444,
  log: 0x4ade80,
  wood: 0x8b5a2b,
  food: 0xe3b23c,
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
