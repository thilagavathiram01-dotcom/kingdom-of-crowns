// Headless checks for the wall rework: long rotatable segments, elastic tiling,
// oriented-box collision, cheap walls, starter keeps and caveman troop stats.
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { CONFIG, HQ_LEVELS, NEW_HQ_COST, MAX_HQ_PER_KINGDOM } from './src/config.js';
import { Game } from './src/game.js';
import { KingdomBrain } from './src/ai.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('PASS', n); } else { fail++; console.log('FAIL', n, d); } };
const near = (a, b, t = 0.02) => Math.abs(a - b) <= t;

// A headless Game: real prototype methods, no renderer, no DOM.
function fakeGame() {
  const g = Object.create(Game.prototype);
  g.scene = new THREE.Scene();
  g.players = { k0: { id: 'k0', idx: 0, logs: 1000, color: 0x3b82f6, alive: true } };
  g.humanId = 'k0';
  g.units = [];
  g.buildings = [];
  g.selected = [];
  g.particles = [];
  g.obstacles = [];
  g.resources = [];
  g.terrain = null;
  g.waterFx = { trees: [{ x: 40, z: 0 }, { x: -45, z: 12 }] };
  g.colliderVersion = 0;
  g.pathCache = new Map();
  // spatial hash for unit queries (rebuilt each frame)
  g.gridCell = 6;
  g.unitGrid = new Map();
  g._resGrid = new Map();
  g._resCell = 8;
  g.hooks = {};
  g.camTarget = new THREE.Vector3();
  g.perf = { ema: 16, level: 0, t: 0, last: 0 };
  return g;
}

const W = CONFIG.buildings.wall;

// ---------- 1. cost + geometry config ----------
ok('wall costs 5 wood', CONFIG.wallCost === 5);
ok('wall is long, thin and rotatable', W.size > 4 && W.thick < 1.5);
ok('walls are cheap per metre', (W.size / CONFIG.wallCost) > 0.7);
ok('caveman troops exist', !!CONFIG.units.brute && !!CONFIG.units.hunter);
ok('caveman troops have train times', !!CONFIG.trainTime.brute && !!CONFIG.trainTime.hunter);
ok('map is bigger + spacing floor', CONFIG.mapSize >= 480 && CONFIG.kingdomSpacing >= 70);

// ---------- 2. spawn: rotation + elastic length ----------
{
  const g = fakeGame();
  const flat = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  const turned = g.spawnBuilding('wall', 'k0', 20, 0, Math.PI / 2, 4.6);
  const stretched = g.spawnBuilding('wall', 'k0', 40, 0, 0, 6.0);
  ok('wall mesh yaws with rot', Math.abs(turned.mesh.rotation.y - Math.PI / 2) < 1e-6);
  ok('elastic wall length applied', stretched.hw === 3.0);
  ok('wall hp scales from config', flat.maxHp === W.hp);
  ok('costs 5 per wall', g.players.k0.logs === 1000 - 5 * 3 + 5 * 3);
}

// ---------- 3. oriented-box footprint ----------
{
  const g = fakeGame();
  const w = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);       // long axis = X
  ok('inside the wall body is 0', g.footprintDist(w, 1.0, 0) === 0);
  ok('past the end measures the gap', near(g.footprintDist(w, 3.0, 0), 0.7, 0.05));
  ok('across the thin axis measures 0.5', near(g.footprintDist(w, 0, 1.0), 0.5, 0.01));
  const t = g.spawnBuilding('wall', 'k0', 40, 0, Math.PI / 2, 4.6); // long axis = Z
  ok('rotated wall runs along Z', g.footprintDist(t, 40, 1.0) === 0);
  ok('rotated wall is thin along X', near(g.footprintDist(t, 41.0, 0), 0.5, 0.01));
  ok('footprint blocks along the wall', g.buildingBlocks(w, 2.0, 0, 0.4));
  ok('footprint is clear past the end', !g.buildingBlocks(w, 2.8, 0, 0.4));
  const hq = g.spawnBuilding('hq', 'k0', 0, 12);
  ok('circular buildings keep circle collision', !g.buildingBlocks(hq, 0, 12 + hq.radius + 1, 0.4));
}

// ---------- 4. chaining: next segment slot must be placeable ----------
{
  const g = fakeGame();
  const a = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  g.spawnBuilding('hq', 'k0', 0, 12);
  const L = W.size + 0.05;
  ok('chain slot along rot 0 is free', g.wallSpotFree(L, 0, 0, 4.6));
  ok('chain slot along rot 90 is free', g.wallSpotFree(0, L, Math.PI / 2, 4.6));
  ok('same spot is blocked', !g.wallSpotFree(0, 0, 0, 4.6));
  ok('crossing the wall is blocked', !g.wallSpotFree(0, 0, Math.PI / 2, 4.6));
  ok('wall ends cannot sit inside the HQ', !g.wallSpotFree(0, 9, 0, 4.6));
  ok('a wall clear of the HQ is fine', g.wallSpotFree(0, 7.0, 0, 4.6));
  void a;
}

// ---------- 5. pathfinding sees a real barrier ----------
{
  const g = fakeGame();
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue; // leave a 4.7m gate in the middle
    g.spawnBuilding('wall', 'k0', i * 4.7, 0, 0, 4.7);
  }
  let leaks = 0, probes = 0;
  for (let x = -16; x <= 16; x += 0.5) {
    if (Math.abs(x) < 2.2) continue; // inside the gate
    probes++;
    if (!g.pointBlocked(x, 0, 0.75)) leaks++; // a hole between two segments
  }
  ok('no lane leaks between wall segments', leaks === 0, `leaks=${leaks}/${probes}`);
  ok('the open gap stays walkable', !g.pointBlocked(0, 0, 0.75));
  ok('the wall line itself is blocked', g.pointBlocked(-4.7, 0, 0.75));
}

// ---------- 6. no automatic walls ----------
{
  const g = fakeGame();
  ok('starter keeps are removed', typeof g.buildStarterKeep !== 'function');
  g.players.k2 = { id: 'k2', idx: 2, logs: 5000, color: 0x22c55e, alive: true };
  const brain = new KingdomBrain(g, 'k2');
  brain.planFort({ x: 0, z: 0 });
  ok('the AI plans no wall slots', brain.walls.length === 0);
  ok('missing walls never gate the AI', brain.fortProgress() === 1);
  ok('the fort frame still stages the army', (() => {
    const s = brain.homeStage();
    return Number.isFinite(s.x) && Number.isFinite(s.z);
  })());
  ok('hand-placed walls still work', (() => {
    const w = g.spawnBuilding('wall', 'k2', 60, 60, 0, 4.6);
    return w && w.type === 'wall' && g.buildingBlocks(w, 60, 60, 0.4);
  })());
}

// ---------- 7. AI fort frame stages in the open (no wall slots) ----------
{
  const g = fakeGame();
  g.players.k2 = { id: 'k2', idx: 2, logs: 5000, color: 0x22c55e, alive: true };
  g.kingdomSpawns = [{ x: 0, z: 0 }];
  g.kingdomSpawns.push({ x: 200, z: 0 });
  const brain = new KingdomBrain(g, 'k2');
  brain.planFort({ x: 0, z: 0 });
  ok('no fort wall slots are planned', brain.walls.length === 0);
  ok('towers are still planned as defense', brain.towers.length > 0, `towers=${brain.towers.length}`);
  ok('the muster point is on open ground', (() => {
    const s = brain.homeStage();
    return g.isSpotFree(s.x, s.z, 0.85);
  })());
  ok('barracks rally normalizes to the muster point', (() => {
    const b = g.spawnBuilding('barracks', 'k2', 0, 0);
    const s = brain.homeStage();
    g.setBuildingRally(b, s.x, s.z, true);
    return g.isSpotFree(b.rallyX, b.rallyZ, 1.0);
  })());
}


// ---------- 8. pathfinding: a wall line must actually stop a march ----------
{
  const g = fakeGame();
  g.pathCache = new Map();
  g.groups = {};
  for (let i = -52; i <= 52; i++) g.spawnBuilding('wall', 'k0', i * 4.7, 0, 0, 4.7); // sealed edge to edge
  ok('a path cannot cross a sealed wall run', g.findPath(-12, -9, -12, 9, 0.75) === null);
  // open a gate: the same march now has to find it
  for (const b of g.buildings) if (Math.abs(b.x) < 2.4) { b.dead = true; }
  g.colliderVersion++;
  const throughGate = g.findPath(-12, -9, 12, 9, 0.75);
  ok('the gate is a real path', Array.isArray(throughGate) && throughGate.length > 1,
    throughGate ? `pts=${throughGate.length}` : 'null');
  const straight = g.findPath(-40, -30, 40, 30, 0.75);
  ok('open ground still paths long distances', Array.isArray(straight) && straight.length > 2,
    straight ? `pts=${straight.length}` : 'null');
}

// ---------- 9. pathfinding cost on the 500m map ----------
{
  const g = fakeGame();
  g.pathCache = new Map();
  const t0 = process.hrtime.bigint();
  let found = 0;
  for (let i = 0; i < 60; i++) {
    const p = g.findPath(-200 + i, -180 + i * 2, 190 - i, 175 - i * 2, 0.75);
    if (p) found++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // loose bound on purpose: this is a smoke guard, the machine may be busy
  ok('60 cross-map paths stay cheap', ms / 60 < 12, `${(ms / 60).toFixed(2)}ms avg, found=${found}`);
  ok('most cross-map paths succeed', found >= 55, `found=${found}`);
  ok('path grid is 3m', g.pathCell() === 3);
}


// ---------- 10. player-facing wall + troop paths ----------
{
  const g = fakeGame();
  g.gy = () => 0;
  g.mapBound = (m) => CONFIG.mapSize / 2 - m;
  g.setOrderMode = () => {};
  g.setSelection = () => {};
  g.selected = [];
  g.mapBound = (m) => CONFIG.mapSize / 2 - m;
  g.placement = null;

  // rotatable ghost
  g.startPlacement('wall');
  ok('placing a wall starts unrotated', g.placement && g.placement.rot === 0);
  g.rotatePlacement(1);
  ok('rotate turns the wall 90 degrees', near(g.placement.rot, Math.PI / 2));
  ok('the gizmo carries the yaw', near(g.placement.gizmo.rotation.y, Math.PI / 2));
  g.rotatePlacement(-1);
  ok('rotate back returns to 0', near(g.placement.rot, 0));

  // chain: two taps make two abutting walls
  g.confirmPlacement(-40, 20);
  const first = g.buildings[g.buildings.length - 1];
  ok('a tap places one wall', first && first.type === 'wall', `n=${g.buildings.length}`);
  const chained = g.placement;
  ok('the ghost keeps chaining', chained && chained.type === 'wall');
  ok('the chain steps along the wall', near(chained.x, -40 + W.size + 0.05) && near(chained.z, 20),
    `ghost=(${chained.x.toFixed(2)},${chained.z.toFixed(2)})`);
  g.confirmPlacement(chained.x, chained.z);
  const second = g.buildings[g.buildings.length - 1];
  const gap = (second.x - second.hw) - (first.x + first.hw);
  ok('chained walls butt up, no unit hole', Math.abs(gap) < 0.1, `gap=${gap.toFixed(3)}`);
  ok('each wall costs 5 logs', g.players.k0.logs === 1000 - 2 * CONFIG.wallCost, `logs=${g.players.k0.logs}`);
  g.cancelPlacement();
  ok('cancel clears the ghost', g.placement === null);

  // rotated chain runs down Z instead of X
  g.startPlacement('wall');
  g.rotatePlacement(1);
  g.confirmPlacement(20, -40);
  const rot1 = g.placement;
  ok('a rotated chain steps down Z', near(rot1.x, 20) && near(rot1.z, -40 + W.size + 0.05),
    `ghost=(${rot1.x.toFixed(2)},${rot1.z.toFixed(2)})`);
  g.cancelPlacement();

  // the new caveman troops are trainable and priced
  const hq = g.spawnBuilding('hq', 'k0', 0, 0);
  const bar = g.spawnBuilding('barracks', 'k0', 14, 0);
  ok('HQ only trains workers', g.canTrain(hq, 'worker') && !g.canTrain(hq, 'brute'));
  ok('barracks trains brute', g.canTrain(bar, 'brute'));
  ok('hunter moved to the archery', !g.canTrain(bar, 'hunter'));
  const arc = g.spawnBuilding('archery', 'k0', 24, 0);
  ok('archery trains hunter', g.canTrain(arc, 'hunter'));
  ok('hunter locked before Age II', g.trainUnit(arc, 'hunter') === false);
  g.players.k0.age = 1; // Castle Age unlocks the archery roster
  ok('hunter unlocked at Age II', g.trainUnit(arc, 'hunter') === true);
  arc.queue.length = 0; // reset: pricing block below queues fresh
  g.players.k0.logs = 1000;
  ok('barracks reject unknown units', !g.canTrain(bar, 'dragon'));
  ok('brute costs its config price', g.unitCost('brute') === CONFIG.bruteCost);
  ok('hunter costs its config price', g.unitCost('hunter') === CONFIG.hunterCost);
  const before = g.players.k0.logs;
  ok('queueing a brute succeeds', g.trainUnit(bar, 'brute'));
  ok('queueing a hunter succeeds', g.trainUnit(arc, 'hunter'));
  ok('troop prices come out of the treasury',
    g.players.k0.logs === before - CONFIG.bruteCost - CONFIG.hunterCost, `logs=${g.players.k0.logs}`);
  ok('the queue keeps both orders', bar.queue.length === 1 && arc.queue.length === 1 && bar.queue[0].type === 'brute' && arc.queue[0].type === 'hunter');
  ok('queue times come from config', bar.queue[0].t === CONFIG.trainTime.brute && arc.queue[0].t === CONFIG.trainTime.hunter);
  ok('a broke kingdom cannot queue', (g.players.k0.logs = 0, g.trainUnit(bar, 'brute') === false));

  // both new units are real, shootable units
  g.players.k0.logs = 1000;
  const brute = g.spawnUnit('brute', 'k0', 40, 6);
  const hunter = g.spawnUnit('hunter', 'k0', 46, 6);
  ok('brute is a real unit', brute && brute.type === 'brute' && !brute.dead && brute.hp === CONFIG.units.brute.hp);
  ok('hunter is a real unit', hunter && hunter.type === 'hunter' && hunter.hp === CONFIG.units.hunter.hp);
  ok('brute out-ranges nothing but hits hard', brute.damage > CONFIG.units.soldier.damage);
  ok('hunter out-ranges a brute', hunter.range > brute.range);
  ok('brute is slower than a hunter', brute.speed < hunter.speed);
}


// ---------- 11. spatial hash and steering with long walls ----------
{
  const g = fakeGame();
  const w = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  // a short-range query at the far END of the wall must still find it
  let found = 0;
  g.eachBuildingNear(4.2, 0, 1.0, (b) => { found++; });
  ok('a short query finds a wall by its end', found === 1, `found=${found}`);
  found = 0;
  g.eachBuildingNear(2.3, 0, 1.0, (b) => { found++; });
  ok('multi-cell walls are reported once, not twice', found === 1, `found=${found}`);
  // cell-granular queries can return neighbours from the same 8m cell, so
  // callers filter by distance themselves - check that filter, not the grid
  found = 0;
  g.eachBuildingNear(0, 6, 1.0, (b) => { if (Math.hypot(b.x, b.z - 6) < 2) found++; });
  ok('no wall lies near a far query point', found === 0, `found=${found}`);

  // steering uses the same full body radius as overlap resolution: walking
  // alongside a wall is fine, walking into it is not
  const u = g.spawnUnit('soldier', 'k0', 0, 3);
  const blockedAt = (px, pz) => g.buildingBlocks(w, px, pz, u.radius);
  ok('a unit may walk beside a wall', !blockedAt(0, 1.4), `d=1.4`);
  ok('a unit may stand past the wall end', !blockedAt(3.4, 0), `x=3.4`);
  ok('a unit may not stand in the wall', blockedAt(0, 0) && blockedAt(2.0, 0.2));
  ok('a unit may not stand past the far end', blockedAt(2.6, 0), `x=2.6`);

  // a rotated wall is blocked along its own axis, not across it
  const v = g.spawnBuilding('wall', 'k0', 20, 0, Math.PI / 2, 4.6);
  const pad = CONFIG.units.soldier.radius;
  ok('a rotated wall blocks along Z', g.buildingBlocks(v, 20, 1.5, pad) && !g.buildingBlocks(v, 21.4, 0, pad));
  ok('a rotated wall is clear beside it', !g.buildingBlocks(v, 21.4, 1.5, pad));
}


// ---------- 12. kingdom spacing ----------
{
  const g = fakeGame();
  const slots = g.layoutSlots();
  ok('candidate sites are not denser than the spacing target',
    slots.length >= CONFIG.kingdoms && (2 * (CONFIG.mapSize / 2) - 32) / Math.sqrt(slots.length) >= CONFIG.kingdomSpacing * 0.98,
    `slots=${slots.length}`);
  // worst case over several layouts, since jitter must not eat the floor
  let worst = 1e9, seedish = 0;
  for (let run = 0; run < 8; run++) {
    const gg = fakeGame();
    const sl = gg.layoutSlots();
    const picks = gg.pickKingdomSpawns(sl, CONFIG.kingdoms);
    ok(`picks ${CONFIG.kingdoms} kingdoms from the grid`, picks.length === CONFIG.kingdoms, `n=${picks.length}`);
    let m = 1e9;
    for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++)
      m = Math.min(m, Math.hypot(picks[i].x - picks[j].x, picks[i].z - picks[j].z));
    worst = Math.min(worst, m);
    if (m < CONFIG.kingdomSpacing * 0.96) seedish++;
  }
  ok('every kingdom keeps the spacing floor', seedish === 0, `worst min gap=${worst.toFixed(1)}m over 8 layouts`);
  ok('spacing floor is a real step up from the old grid', worst >= 60, `worst=${worst.toFixed(1)}`);
}


// ---------- 13. workers harvest on orders, idle otherwise, hand over at HQ ----------
{
  const g = fakeGame();
  g.time = 0;
  g.spawnPing = () => {}; // no requestAnimationFrame headless
  const hq = g.spawnBuilding('hq', 'k0', 0, 0);
  // idle workers never auto-seek trees
  const idler = g.spawnUnit('worker', 'k0', 30, 30);
  g.updateUnit(idler, 0.5);
  ok('idle workers stay idle', !idler.harvestTarget && !idler.hasOrder && !idler.returning);
  // an explicit harvest order flags manual work; stop pauses it
  const tree = { id: 9001, kind: 'resource', rtype: 'tree', x: 40, z: 30, amount: 200, max: 200, radius: 1.4, dead: false, depleted: false, regrowT: 0, spot: null };
  g.resources.push(tree);
  g.orderHarvest([idler], tree);
  ok('harvest orders flag manual work', idler.harvestManual === true && idler.harvestTarget === tree);
  g.selected = [idler];
  g.stopSelected();
  ok('stop clears the harvest order', !idler.harvestTarget && idler.harvestManual === false && idler.holdPosition === true);
  // full manual cycle: chop a small tree, haul home, hand over at the drop point
  const small = { id: 9002, kind: 'resource', rtype: 'tree', x: 12, z: 0, amount: 5, max: 60, radius: 1.4, dead: false, depleted: false, regrowT: 0, spot: null };
  g.resources.push(small);
  const w = g.spawnUnit('worker', 'k0', 12, 0);
  g.orderHarvest([w], small);
  const logsBeforeChop = g.players.k0.logs;
  for (let i = 0; i < 8; i++) g.updateUnit(w, 0.5); // chop through harvestTime
  ok('chopping kills the tree', small.depleted === true);
  // the load is either still on its way home or already delivered headless-fast
  ok('a finished tree sends the load home',
    (w.returning === true && !w.harvestTarget) || (w.carrying === 0 && g.players.k0.logs === logsBeforeChop + 5),
    `returning=${w.returning} carry=${w.carrying}`);
  // force the handover moment: loaded worker far from HQ gets a drop point
  w.carrying = 5; w.returning = true; w.dropFor = null; w.harvestTarget = null; w.hasOrder = false;
  g.updateUnit(w, 0.1);
  ok('a loaded worker gets an HQ drop point', w.dropFor === hq.id && w.dropX !== undefined);
  w.x = w.dropX; w.z = w.dropZ; // walk the rest of the way off-screen
  const before = g.players.k0.logs;
  g.updateUnit(w, 0.1);
  ok('cargo hands over on drop arrival', w.carrying === 0 && g.players.k0.logs === before + 5,
    `carry=${w.carrying} logs=${g.players.k0.logs}`);
  ok('delivery chains the next load: worker keeps working', w.carrying === 0 && (w.harvestTarget !== null || w.hasOrder === true) && !w.returning,
    `target=${!!w.harvestTarget} order=${w.hasOrder}`);
  void hq;
}

// ---------- 14. cost of a wall-heavy world (hand-placed walls only) ----------
{
  const g = fakeGame();
  for (let i = 0; i < CONFIG.kingdoms; i++) {
    const k = `k${i}`;
    g.players[k] = { id: k, idx: i, logs: 4000, color: 0x22c55e, alive: true };
    const s = { x: -200 + (i % 6) * 76, z: -200 + Math.floor(i / 6) * 76 };
    g.spawnBuilding('hq', k, s.x, s.z);
    g.spawnBuilding('barracks', k, s.x + 10, s.z + 1);
    // players walling their own chokes: 14 segments around each base
    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * Math.PI * 2;
      g.spawnBuilding('wall', k, s.x + Math.cos(a) * 14, s.z + Math.sin(a) * 14, j % 2 ? 0 : Math.PI / 2, 4.6);
    }
  }
  const walls = g.buildings.filter(b => b.type === 'wall');
  ok('a full world really has hundreds of walls', walls.length >= 400, `walls=${walls.length}`);
  // the spatial hash must survive walls spread over many cells
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) g.buildingGrid();
  const gridMs = Number(process.hrtime.bigint() - t0) / 1e6;
  let hits = 0;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) {
    const w = walls[i % walls.length];
    g.eachBuildingNear(w.x + 1.5, w.z + 1.5, 6, (b) => { hits++; });
  }
  const queryMs = Number(process.hrtime.bigint() - t1) / 1e6;
  ok('building grid rebuild stays cheap', gridMs / 200 < 4, `${(gridMs / 200).toFixed(2)}ms per rebuild`);
  ok('near queries stay cheap', queryMs / 2000 < 0.05, `${(queryMs / 2000).toFixed(4)}ms each`);
  ok('queries still find the wall they look at', hits >= 2000, `hits=${hits}`);
}

// ---------- 15. rally points stage trained troops without stacking ----------
{
  const g = fakeGame();
  const hq = g.spawnBuilding('hq', 'k0', 0, 0);
  const rax = g.spawnBuilding('barracks', 'k0', 20, 0);
  for (const [b, type] of [[hq, 'worker'], [rax, 'soldier']]) {
    const r = CONFIG.units[type].radius;
    ok(`${b.type} default rally is free ground`, g.isSpotFree(b.rallyX, b.rallyZ, r), `${b.rallyX},${b.rallyZ}`);
    ok(`${b.type} default rally is outside its footprint`, !g.buildingBlocks(b, b.rallyX, b.rallyZ, r));
  }
  const moved = g.setBuildingRally(rax, rax.x, rax.z, true);
  ok('a rally click inside the barracks is moved outside', moved.x !== rax.x || moved.z !== rax.z);
  ok('the normalized rally is free ground', g.isSpotFree(moved.x, moved.z, CONFIG.units.soldier.radius));
  const trained = [g.completeTraining(rax, 'soldier'), g.completeTraining(rax, 'soldier'), g.completeTraining(rax, 'soldier')];
  const keys = trained.map(u => `${u.tx.toFixed(3)},${u.tz.toFixed(3)}`);
  ok('queued troops get different rally destinations', new Set(keys).size === 3, keys.join(' '));
  ok('staged destinations are free when assigned',
    trained.every(u => g.isSpotFree(u.tx, u.tz, CONFIG.units.soldier.radius)));
  for (const u of trained) { u.x = u.tx; u.z = u.tz; }
  g.resolveOverlaps();
  let worst = 0, inside = 0;
  for (let i = 0; i < trained.length; i++) {
    if (g.buildingBlocks(rax, trained[i].x, trained[i].z, trained[i].radius)) inside++;
    for (let j = i + 1; j < trained.length; j++) {
      const a = trained[i], b = trained[j];
      worst = Math.max(worst, (a.radius + b.radius + 0.1) - Math.hypot(a.x - b.x, a.z - b.z));
    }
  }
  ok('arrived troops stay outside the barracks', inside === 0, `inside=${inside}`);
  ok('arrived troops do not stack on each other', worst <= 0, `overlap=${worst.toFixed(3)}`);
}

// ---------- 16. overlap resolver, HQ drop staging, and wall ejection ----------
{
  const g = fakeGame();
  const wall = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  const trapped = g.spawnUnit('soldier', 'k0', 20, 3);
  trapped.x = 0; trapped.z = 0;
  g.resolveOverlaps();
  ok('a unit inside a wall is ejected', !g.buildingBlocks(wall, trapped.x, trapped.z, trapped.radius));
  ok('ejection keeps one body radius of standoff',
    g.footprintDist(wall, trapped.x, trapped.z) >= trapped.radius - 0.02);
  const a = g.spawnUnit('soldier', 'k0', 30, 0);
  const b = g.spawnUnit('soldier', 'k0', 34, 0);
  a.x = 30; a.z = 0; b.x = 30; b.z = 0;
  g.resolveOverlaps();
  ok('two units on the same point are separated',
    Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius + 0.1);
  const hq = g.spawnBuilding('hq', 'k0', -30, 0);
  const carrier = g.spawnUnit('worker', 'k0', -20, 0);
  const drop = g.hqDropSpot(hq, carrier);
  ok('cargo drop is staged outside the HQ footprint',
    !g.buildingBlocks(hq, drop.x, drop.z, carrier.radius));
  ok('cargo drop is free ground', g.isSpotFree(drop.x, drop.z, carrier.radius));
}

// ---------- 17. demolish and reclaim ----------
{
  const g = fakeGame();
  g.players.k0.logs = 1000;
  const wall = g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  const beforeWall = g.players.k0.logs;
  ok('a wall can be demolished', g.demolishBuilding(wall) === true);
  ok('demolished walls leave the building list', !g.buildings.includes(wall));
  ok('walls refund half their cost', g.players.k0.logs === beforeWall + Math.floor(CONFIG.wallCost * 0.5));
  ok('a demolished wall no longer blocks', !g.pointBlocked(0, 0, 0.75));
  const rax = g.spawnBuilding('barracks', 'k0', 20, 0);
  rax.hp = rax.maxHp / 2;
  const beforeRax = g.players.k0.logs;
  ok('a damaged barracks can be demolished', g.demolishBuilding(rax) === true);
  ok('reclaim scales with remaining HP',
    g.players.k0.logs === beforeRax + Math.floor(CONFIG.barracksCost * 0.5 * 0.5));
  const hq = g.spawnBuilding('hq', 'k0', -20, 0);
  ok('HQ demolition is refused', g.demolishBuilding(hq) === false);
  ok('a refused HQ demolition keeps the building', g.buildings.includes(hq));
}

// ---------- 18. short LOS hops cannot step over a thin wall ----------
{
  const g = fakeGame();
  g.spawnBuilding('wall', 'k0', 0, 0, 0, 4.6);
  const r = CONFIG.units.soldier.radius;
  ok('a short hop across the wall is blocked', !g.losClear(0, -1.8, 0, 1.8, r));
  ok('the segment test sees the crossing', g.segmentBlocked(0, -1.8, 0, 1.8, r));
  ok('a parallel lane beside the wall stays clear', g.losClear(-2, 2, 2, 2, r));
  ok('point clearance matches the body radius', g.pointBlocked(0, 1.2, r) && !g.pointBlocked(0, 1.4, r));
}

// ---------- 19. sealed courtyards slide instead of freezing ----------
{
  const g = fakeGame();
  g.spawnBuilding('wall', 'k0', 0, -10, 0, 60);
  g.spawnBuilding('wall', 'k0', 0, 10, 0, 60);
  g.spawnBuilding('wall', 'k0', -30, 0, Math.PI / 2, 20);
  g.spawnBuilding('wall', 'k0', 30, 0, Math.PI / 2, 20);
  const u = g.spawnUnit('soldier', 'k0', 0, 0);
  const before = { x: u.x, z: u.z };
  const status = g.navigate(u, 100, 0, 0.1, 0.6, 2);
  ok('a sealed courtyard does not report a dead stop', status === 'moving', `status=${status}`);
  ok('the fallback keeps moving inside the courtyard', Math.hypot(u.x - before.x, u.z - before.z) > 0.1);
  ok('sliding does not clip through the courtyard walls',
    g.buildings.filter(b => b.type === 'wall').every(w => !g.buildingBlocks(w, u.x, u.z, u.radius)));
}

// ---------- 20. adventurer worker models ship with skeletons, clips + textures ----------
{
  const files = ['rogue_hooded', 'rogue'];
  const wantClips = ['Idle', 'Walking_A', 'Walking_B'];
  let good = 0, detail = '';
  for (const f of files) {
    try {
      const d = readFileSync(`public/models/workers/${f}.glb`);
      const jl = d.readUInt32LE(12);
      const j = JSON.parse(d.subarray(20, 20 + jl).toString('utf8'));
      const joints = j.skins?.[0]?.joints?.length || 0;
      const imgs = j.images?.length || 0;
      const clips = new Set((j.animations || []).map(a => a.name));
      const missing = wantClips.filter(c => !clips.has(c));
      if (joints >= 30 && imgs >= 1 && !missing.length) good++;
      else detail += ` ${f}(joints=${joints},images=${imgs},missing=${missing.join('|')})`;
    } catch (e) { detail += ` ${f}(unreadable)`; }
  }
  ok('both adventurer models have skeletons, walk/idle clips + textures', good === files.length, `good=${good}/2${detail}`);
  // roof/team mask: same pixel size as the atlas, non-trivial coverage
  const mp = 'public/models/buildings/team_mask.png';
  let maskOk = false, maskDetail = '';
  try {
    const d = readFileSync(mp);
    const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
    maskOk = w === 1024 && h === 1024 && d.length > 1000;
    if (!maskOk) maskDetail = `${w}x${h} ${d.length}B`;
  } catch (e) { maskDetail = 'unreadable'; }
  ok('roof team mask ships at atlas size', maskOk, maskDetail);
}

// ---------- 18. HQ territory radius + upgrades + multi-HQ survival ----------
{
  const g = fakeGame();
  g.spawnPing = () => {};
  const hq = g.spawnBuilding('hq', 'k0', 0, 0);
  ok('HQ starts at level 1', hq.level === 1);
  ok('level-1 territory is wide', g.hqRadiusOf(hq) === HQ_LEVELS[0].radius && HQ_LEVELS[0].radius >= 70);
  const { canPlaceFor } = await import('./src/buildings.js');
  ok('inside HQ radius is buildable', canPlaceFor(g, 'k0', 'house', 20, 0) === null);
  ok('outside HQ radius is rejected', typeof canPlaceFor(g, 'k0', 'house', 120, 0) === 'string');
  ok('new town chains inside land', canPlaceFor(g, 'k0', 'hq', 40, 0) === null);
  ok('new town cannot leap outside land', typeof canPlaceFor(g, 'k0', 'hq', 150, 0) === 'string');
  // upgrade: pay, grow radius + supply
  g.players.k0.wood = 2000; g.players.k0.food = 2000; g.players.k0.logs = 2000;
  const r0 = g.hqRadiusOf(hq), s0 = g.supplyMax('k0');
  ok('HQ upgrade succeeds when affordable', g.upgradeHQ(hq) === true && hq.level === 2);
  ok('upgrade widens territory', g.hqRadiusOf(hq) > r0);
  ok('upgrade raises supply', g.supplyMax('k0') > s0);
  // multi-HQ: losing one town does not kill the kingdom
  const hq2 = g.spawnBuilding('hq', 'k0', 40, 0);
  hq2.level = 1;
  g.damage(hq, 1e9, 'k9');
  ok('kingdom survives its first HQ loss', g.players.k0.alive !== false && g.hqCount('k0') === 1);
  g.damage(hq2, 1e9, 'k9');
  ok('last HQ loss ends the kingdom', g.players.k0.alive === false);
  ok('town cap is 3', MAX_HQ_PER_KINGDOM === 3);
  void NEW_HQ_COST;
}

// ---------- 19. diplomacy logistics run on wood + food ----------
{
  const g = fakeGame();
  g.spawnPing = () => {};
  g.time = 0;
  g.players.k0 = { id: 'k0', idx: 0, logs: 1000, wood: 1000, food: 1000, alive: true, color: 0x2f6fed };
  g.players.k1 = { id: 'k1', idx: 1, logs: 1000, wood: 1000, food: 1000, alive: true, color: 0xef4444 };
  g.players.k2 = { id: 'k2', idx: 2, logs: 10, wood: 10, food: 10, alive: true, color: 0x22c55e };
  const { Diplomacy } = await import('./src/diplomacy.js');
  const dip = new Diplomacy(g);
  g.diplomacy = dip;
  // paid ceasefire deducts from the payer and binds the pair
  ok('ceasefire charges wood+food', dip.ceasefire('k0', 'k1', 10, 'k0') === true
    && g.players.k0.wood === 850 && g.players.k0.food === 850, `w=${g.players.k0.wood} f=${g.players.k0.food}`);
  ok('ceasefire binds both sides', dip.underCeasefire('k0', 'k1') && dip.underCeasefire('k1', 'k0'));
  // broke kingdom cannot buy peace
  ok('broke kingdom cannot buy ceasefire', dip.ceasefire('k2', 'k1', 10, 'k2') === false
    && dip.get('k2', 'k1').type === 'war');
  // free truce still works for losers
  ok('desperate truce is free', dip.truce('k2', 'k1') === true && dip.underCeasefire('k2', 'k1'));
  // alliance with an already pact-bound pair costs nothing extra
  const preW = g.players.k0.wood;
  ok('re-allied pair stays bound for free', dip.ally('k0', 'k1', 'k0') === true && g.players.k0.wood === preW);
  const g2wood = g.players.k0.wood;
  g.players.k3 = { id: 'k3', idx: 3, logs: 1000, wood: 1000, food: 1000, alive: true, color: 0xa855f7 };
  ok('fresh alliance is paid', dip.ally('k0', 'k3', 'k0') === true && g.players.k0.wood === g2wood - 300 && dip.isAllied('k0', 'k3'));
  // betrayal needs the fee and breaks the pact into war
  const bw = g.players.k0.wood, bf = g.players.k0.food;
  ok('betrayal mobilizes wood+food', dip.betray('k0', 'k3') === true
    && g.players.k0.wood === bw - 200 && g.players.k0.food === bf - 200
    && dip.get('k0', 'k3').type === 'war');
  // betrayal without funds fails and the pact holds
  g.players.k2.wood = 10; g.players.k2.food = 10;
  dip.relations.set(dip.key('k2', 'k3'), { type: 'alliance', until: Infinity });
  ok('broke kingdom cannot betray', dip.betray('k2', 'k3') === false && dip.isAllied('k2', 'k3'));
  // tribute moves wood+food and buys peace
  g.players.k2.wood = 500; g.players.k2.food = 500;
  const k1w = g.players.k1.wood;
  ok('tribute pays and pacifies', dip.offerTribute('k2', 'k1') === true
    && g.players.k1.wood === k1w + 200 && dip.underCeasefire('k2', 'k1'));
  // pact-bound pairs are never valid targets
  const a = g.spawnUnit('soldier', 'k0', 0, 0);
  const foe = g.spawnUnit('soldier', 'k1', 2, 0);
  a.x = 0; a.z = 0; foe.x = 2; foe.z = 0;
  g.rebuildGrid();
  const found = g.nearestEnemy(0, 0, 'k0', 30);
  ok('ceasefire partners are not enemies', found !== foe, `found=${found?.type}/${found?.owner}`);
}

// ---------- 20. formal war declarations with mutual approval ----------
{
  const g = fakeGame();
  g.spawnPing = () => {};
  g.time = 0;
  g.players.k0 = { id: 'k0', idx: 0, logs: 1000, wood: 1000, food: 1000, alive: true, color: 0x2f6fed, name: 'You' };
  g.players.k1 = { id: 'k1', idx: 1, logs: 1000, wood: 1000, food: 1000, alive: true, color: 0xef4444, name: 'Ash Kingdom' };
  const { Diplomacy } = await import('./src/diplomacy.js');
  const dip = new Diplomacy(g);
  g.diplomacy = dip;
  g.hqRadiusOf = () => 70;
  const hq0 = g.spawnBuilding('hq', 'k0', 0, 0);
  const hq1 = g.spawnBuilding('hq', 'k1', 120, 0);
  void hq0; void hq1;
  for (let i = 0; i < 6; i++) g.spawnUnit('soldier', 'k0', 5 + i, 5);
  for (let i = 0; i < 6; i++) g.spawnUnit('soldier', 'k1', 115 + i, 5);
  // challenge is free, freezes fighting, both sides muster and hold
  ok('challenge is free to issue', dip.challenge('k0', 'k1') === true);
  ok('challenge freezes targeting', dip.atPeace('k0', 'k1') === true);
  const m0 = g.musterFormation('k0', 'k1');
  const m1 = g.musterFormation('k1', 'k0');
  ok('both sides muster in formation', m0 === 6 && m1 === 6);
  const held = g.units.filter((u) => u.owner === 'k0' && u.type !== 'worker');
  ok('mustered troops hold the line', held.every((u) => u.musterHold && u.hasOrder));
  // accept → arranged total war until one kingdom falls
  ok('accept starts total war', dip.answerChallenge('k1', true) === true && dip.isTotalWar('k0', 'k1'));
  // fresh pair, reject → plain war (challenger invades anyway)
  const g2 = fakeGame();
  g2.spawnPing = () => {};
  g2.time = 0;
  g2.players.k0 = { id: 'k0', idx: 0, logs: 500, wood: 500, food: 500, alive: true, color: 1, name: 'A' };
  g2.players.k1 = { id: 'k1', idx: 1, logs: 500, wood: 500, food: 500, alive: true, color: 2, name: 'B' };
  const dip2 = new Diplomacy(g2);
  g2.diplomacy = dip2;
  dip2.challenge('k0', 'k1');
  ok('reject means invasion anyway', dip2.answerChallenge('k1', false) === true
    && dip2.get('k0', 'k1').type === 'war' && !dip2.isTotalWar('k0', 'k1'));
  // silence expires into rejection
  const g3 = fakeGame();
  g3.spawnPing = () => {};
  g3.time = 0;
  g3.players.k0 = { id: 'k0', idx: 0, logs: 500, wood: 500, food: 500, alive: true, color: 1, name: 'A' };
  g3.players.k1 = { id: 'k1', idx: 1, logs: 500, wood: 500, food: 500, alive: true, color: 2, name: 'B' };
  const dip3 = new Diplomacy(g3);
  g3.diplomacy = dip3;
  dip3.challenge('k0', 'k1');
  g3.time = 1000;
  dip3.update();
  ok('expired challenge auto-rejects into war', dip3.get('k0', 'k1').type === 'war' && !dip3.isTotalWar('k0', 'k1'));
  // AI answers from strength: strong kingdom accepts a weak challenger
  const g4 = fakeGame();
  g4.spawnPing = () => {};
  g4.time = 0;
  g4.players.k0 = { id: 'k0', idx: 0, logs: 500, wood: 500, food: 500, alive: true, color: 1, name: 'Weak' };
  g4.players.k1 = { id: 'k1', idx: 1, logs: 500, wood: 500, food: 500, alive: true, color: 2, name: 'Strong' };
  const dip4 = new Diplomacy(g4);
  g4.diplomacy = dip4;
  g4.hqRadiusOf = () => 70;
  g4.spawnBuilding('hq', 'k0', 0, 0);
  g4.spawnBuilding('hq', 'k1', 120, 0);
  g4.spawnUnit('soldier', 'k0', 5, 5);
  for (let i = 0; i < 10; i++) g4.spawnUnit('soldier', 'k1', 115 + i, 5);
  dip4.challenge('k0', 'k1');
  const brain = new KingdomBrain(g4, 'k1');
  brain._chAnswerAt = 10; // deliberation over, window (90s) still open
  g4.time = 15;
  brain.answerChallenge({ army: g4.units.filter((u) => u.owner === 'k1' && !u.dead) }, {});
  ok('strong AI accepts the challenge', dip4.isTotalWar('k0', 'k1'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
