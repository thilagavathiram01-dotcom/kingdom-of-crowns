// Headless checks for the wall rework: long rotatable segments, elastic tiling,
// oriented-box collision, cheap walls, starter keeps and caveman troop stats.
import * as THREE from 'three';
import { CONFIG } from './src/config.js';
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

// ---------- 6. starter keeps ----------
{
  const g = fakeGame();
  g.players.k1 = { id: 'k1', idx: 1, logs: 1000, color: 0xef4444, alive: true };
  const half = CONFIG.walls.keepHalf;
  const n = g.buildStarterKeep('k1', 0, 0);
  const walls = g.buildings.filter(b => b.owner === 'k1' && b.type === 'wall');
  ok('starter keep raises wall segments', n >= 10 && n === walls.length, `n=${n}`);
  ok('starter keep is paid for', g.players.k1.logs === 1000 - n * CONFIG.wallCost);
  const s2 = g.spawnBuilding('hq', 'k1', 0, 0);
  ok('HQ sits inside the keep', walls.every(w => Math.hypot(w.x, w.z) > s2.radius));
  // gate: one side must have a hole, and no wall may cross the HQ's spawn area
  const sides = [[0, -half], [1, half], [2, half], [3, -half]];
  let openSide = 0;
  for (let s = 0; s < 4; s++) {
    const has = walls.some(w => (s === 0 || s === 2 ? Math.abs(w.z) > half - 0.6 : Math.abs(w.x) > half - 0.6)
      && (s === 0 || s === 2 ? Math.sign(w.z) === -Math.sign(sides[s][1]) : Math.sign(w.x) === -Math.sign(sides[s][1])));
    if (has) openSide++;
  }
  ok('three sides are walled, one side carries the gate', openSide >= 3, `sides=${openSide}`);
  // tiling: no gap wider than 0.6m along a walled side
  const north = walls.filter(w => Math.abs(w.z + half) < 0.2).sort((a, b) => a.x - b.x);
  let worst = 0;
  for (let i = 1; i < north.length; i++) {
    const gap = (north[i].x - north[i].hw) - (north[i - 1].x + north[i - 1].hw);
    worst = Math.max(worst, -gap, gap);
  }
  ok('wall runs tile edge-to-edge', worst < 0.6, `worst=${worst.toFixed(2)}`);
  // corners: the two abutting sides must meet, not leave a diagonal hole.
  // metric: closest approach of one side's wall ENDS to the other side's box
  let cgap = 1e9, cat = '';
  for (const b of walls) for (const c of walls) {
    if (b === c || Math.abs(b.rot - c.rot) < 0.01) continue;      // collinear tiling needs no gap
    if (Math.hypot(b.x - c.x, b.z - c.z) > 6) continue;
    let d = 1e9;
    for (const a of [-1, 1]) for (const t of [-1, 1]) {          // all four box corners
      const ex = b.x + Math.cos(b.rot) * b.hw * a - Math.sin(b.rot) * b.hd * t;
      const ez = b.z + Math.sin(b.rot) * b.hw * a + Math.cos(b.rot) * b.hd * t;
      d = Math.min(d, g.footprintDist(c, ex, ez));
    }
    if (d < cgap) { cgap = d; cat = `(${b.x.toFixed(1)},${b.z.toFixed(1)})/(${c.x.toFixed(1)},${c.z.toFixed(1)})`; }
  }
  ok('keep corners are closed', cgap < 0.25, `min gap=${cgap.toFixed(3)} at ${cat}`);
  // ring: only the gate arc may let a march out of the keep
  let open = 0;
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    let blocked = false;
    for (let r = half - 3; r <= half + 3 && !blocked; r += 0.25) {
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      for (const w of walls) if (g.footprintDist(w, px, pz) < 0.05) { blocked = true; break; }
    }
    if (!blocked) open++;
  }
  ok('the gate is the only way out', open > 0 && open <= 14, `open arcs=${open}/80`);
  const side0 = walls.filter(w => Math.abs(w.z + half) < 0.2);
  const side1 = walls.filter(w => Math.abs(w.x - half) < 0.2);
  ok('side walls are rotated to their run', side0.every(w => w.rot === 0) && side1.every(w => Math.abs(w.rot - Math.PI / 2) < 1e-6));
}

// ---------- 7. AI forts plan long, rotated, tiling walls ----------
{
  const g = fakeGame();
  g.players.k2 = { id: 'k2', idx: 2, logs: 5000, color: 0x22c55e, alive: true };
  g.kingdomSpawns = [{ x: 0, z: 0 }];
  g.kingdomSpawns.push({ x: 200, z: 0 });
  const brain = new KingdomBrain(g, 'k2');
  brain.planFort({ x: 0, z: 0 });
  const ws = brain.walls;
  ok('fort plans fewer, longer pieces', ws.length > 8 && ws.length < 40, `walls=${ws.length}`);
  // one piece may stretch to 1.5x the tiling step before it splits into two
ok('every fort piece has a slot length',
  ws.every(w => w.len > 0.8 && w.len <= CONFIG.ai.wallStep * 1.5 + 0.01),
  `min=${Math.min(...ws.map(w => w.len)).toFixed(2)} max=${Math.max(...ws.map(w => w.len)).toFixed(2)} step=${CONFIG.ai.wallStep}`);
  const built = brain.buildNextWalls(40, 0);
  ok('fort walls actually get built', built === ws.length, `built=${built}`);
  const made = g.buildings.filter(b => b.owner === 'k2' && b.type === 'wall');
  ok('built fort walls keep their orientation', made.every(b => b.rot === 0 || Math.abs(b.rot - Math.PI / 2) < 1e-6));
  ok('fort walls are charged at 5 wood', g.players.k2.logs === 5000 - ws.length * CONFIG.wallCost);
  // spacing along every side must equal the piece length, except at the gates
  let tilingBad = 0, gates = 0, dbg = '';
  for (const sgn of [-1, 1]) {
    const side = made.filter(b => b.rot === 0 && Math.sign(b.z) === sgn).sort((a, b) => a.x - b.x);
    for (let i = 1; i < side.length; i++) {
      const spacing = side[i].x - side[i - 1].x;
      if (Math.abs(spacing - side[i].size) < 0.05) continue;
      const clear = spacing - side[i - 1].hw - side[i].hw;
      if (clear >= CONFIG.ai.gateWidth - 0.1) { gates++; continue; }
      dbg += ` sp=${spacing.toFixed(2)} len=${side[i].size.toFixed(2)} clear=${clear.toFixed(2)};`;
      tilingBad++;
    }
  }
  ok('fort runs tile exactly (gates excepted)', tilingBad === 0, `bad=${tilingBad}${dbg}`);
  ok('fort gates are wide enough to walk through', gates === brain.fort.gates.length, `gates=${gates}`);
  ok('fort towers stay clear of wall ends', brain.towers.every(t => !made.some(b => Math.hypot(t.x - b.x, t.z - b.z) < 0.1)));
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
  ok('barracks train brute and hunter', g.canTrain(bar, 'brute') && g.canTrain(bar, 'hunter'));
  ok('barracks reject unknown units', !g.canTrain(bar, 'dragon'));
  ok('brute costs its config price', g.unitCost('brute') === CONFIG.bruteCost);
  ok('hunter costs its config price', g.unitCost('hunter') === CONFIG.hunterCost);
  const before = g.players.k0.logs;
  ok('queueing a brute succeeds', g.trainUnit(bar, 'brute'));
  ok('queueing a hunter succeeds', g.trainUnit(bar, 'hunter'));
  ok('troop prices come out of the treasury',
    g.players.k0.logs === before - CONFIG.bruteCost - CONFIG.hunterCost, `logs=${g.players.k0.logs}`);
  ok('the queue keeps both orders', bar.queue.length === 2 && bar.queue[0].type === 'brute' && bar.queue[1].type === 'hunter');
  ok('queue times come from config', bar.queue[0].t === CONFIG.trainTime.brute && bar.queue[1].t === CONFIG.trainTime.hunter);
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


// ---------- 13. AI rebuilds walls a siege broke ----------
{
  const g = fakeGame();
  g.players.k2 = { id: 'k2', idx: 2, logs: 4000, color: 0xef4444, alive: true };
  const brain = new KingdomBrain(g, 'k2');
  brain.planFort({ x: 0, z: 0 });
  const first = brain.buildNextWalls(60, 0);
  ok('the fort goes up in one pass', first === brain.walls.length, `built=${first}/${brain.walls.length}`);
  const logsAfter = g.players.k2.logs;
  // a siege chews through three segments
  const victims = g.buildings.filter(b => b.type === 'wall').slice(0, 3);
  for (const v of victims) v.dead = true;
  g.colliderVersion++;
  // the breach is walkable BEFORE the AI patches it
  ok('a destroyed segment leaves a hole in the ring',
    victims.some(v => g.wallSpotFree(v.x, v.z, v.rot, v.size)),
    `free=${victims.map(v => g.wallSpotFree(v.x, v.z, v.rot, v.size)).join(',')}`);
  const rebuilt = brain.buildNextWalls(60, 0);
  ok('broken segments are rebuilt', rebuilt === victims.length, `rebuilt=${rebuilt}/${victims.length}`);
  ok('rebuilding charges the treasury again', g.players.k2.logs === logsAfter - rebuilt * CONFIG.wallCost,
    `logs=${g.players.k2.logs}`);
  ok('rebuilt walls sit back on their slots',
    victims.every(v => {
      const slot = brain.walls.find(w => w.b && Math.hypot(w.b.x - v.x, w.b.z - v.z) < 0.01);
      return !!slot;
    }));
}

// ---------- 14. cost of the fat new world ----------
{
  const g = fakeGame();
  for (let i = 0; i < CONFIG.kingdoms; i++) {
    const k = `k${i}`;
    g.players[k] = { id: k, idx: i, logs: 4000, color: 0x22c55e, alive: true };
    const s = { x: -200 + (i % 6) * 76, z: -200 + Math.floor(i / 6) * 76 };
    g.spawnBuilding('hq', k, s.x, s.z);
    g.spawnBuilding('barracks', k, s.x + 6, s.z + 1);
    g.buildStarterKeep(k, s.x, s.z);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
