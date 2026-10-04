import * as THREE from 'three';
import { CONFIG, BUILD_DEFS, TERRAIN_SPEED, AGES } from './config.js';
import { tickFarm, tickMill, tickUpkeep, tickStarvationDamage } from './economy.js';
import { WorldEvents } from './events.js';
import { Diplomacy } from './diplomacy.js';
import { quickSave, quickLoad } from './save.js';
import { canPlaceFor, costOf, canAfford, payCost } from './buildings.js';

// README-2 integration layer: registers harvestable rocks/crystals,
// pickups, villages and caravans; runs the food chain, upkeep, ages,
// win conditions, story chapters, terrain-speed movement and bridge
// chokepoints for ALL 30 kingdoms. Installed once from main.js.

export function installRealms(game, ai) {
  const R = {
    events: new WorldEvents(game),
    diplomacy: new Diplomacy(game),
    caravans: [],
    caravanT: 90,
    chapter: 0,
    dayT: 0,
    wonderT: {},
  };
  game.realms = R;
  game.diplomacy = R.diplomacy;
  game.worldEvents = R.events;
  game.realmPlacementValid = (type, x, z) => !canPlaceFor(game, game.humanId, type, x, z);
  game.realmPlacementReason = (type, x, z) => canPlaceFor(game, game.humanId, type, x, z) || null;
  game.worldToScreen = (x, z) => {
    try {
      const v = new THREE.Vector3(x, game.gy(x, z) + 2, z).project(game.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    } catch { return null; }
  };

  // stone / crystal nodes are removed resource types: timber only.
  spawnPickups(game);
  spawnVillages(game);

  // war horn for the human
  game.warHorn = () => {
    try {
      const ctx = game._audioCtx || (game._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(110, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(55, ctx.currentTime + 0.8);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.9);
    } catch { /* silent */ }
  };

  // ---- terrain-speed movement: wrap steer (road x1.2, forest x0.7, bank x0.6) ----
  const rawSteer = game.steer.bind(game);
  game.steer = (u, wx, wz, dt, combat) => {
    rawSteer(u, wx, wz, dt * terrainSpeedMul(game, u.x, u.z), combat);
  };

  // ---- generic construction for every README-2 building ----
  game.constructBuilding = (owner, type, x, z) => {
    const cost = costOf(type);
    const st = game.players[owner];
    if (!canAfford(st, cost)) {
      if (owner === game.humanId) game.hookMsg(`Need ${fmtCost(cost)} for ${BUILD_DEFS[type]?.name || type}`);
      return null;
    }
    const reason = canPlaceFor(game, owner, type, x, z);
    if (reason) {
      if (owner === game.humanId) game.hookMsg(`Cannot build here — ${reason}`);
      return null;
    }
    payCost(st, cost);
    const b = game.spawnBuilding(type, owner, x, z);
    // economy buildings get runtime state
    if (type === 'farm') b.grain = 0;
    if (type === 'mill') { b.workers = []; b.blades = findBlades(b); }
    if (type === 'wonder') { R.wonderT[owner] = null; }
    if (owner === game.humanId) game.hookMsg(`${BUILD_DEFS[type]?.name || type} constructed`);
    return b;
  };

  game.assignToMill = (units, mill) => {
    if (!mill || mill.type !== 'mill') return 0;
    mill.workers = mill.workers || [];
    let n = 0;
    for (const u of units) {
      if (u.type !== 'worker' || u.dead) continue;
      if (mill.workers.length >= 4) break;
      if (mill.workers.includes(u)) continue;
      // leave any previous mill crew first so counts stay honest
      if (u.assignedMill && u.assignedMill !== mill && u.assignedMill.workers) {
        const i = u.assignedMill.workers.indexOf(u);
        if (i >= 0) u.assignedMill.workers.splice(i, 1);
      }
      // hands full of timber? Cash it in on the spot as wood — mill hands
      // never haul, so a delivery detour first would just add a struggling
      // trip across the base before they even start walking to the mill.
      if (u.carrying > 0) {
        const pl = game.players[u.owner];
        if (pl.wood !== undefined) pl.wood += u.carrying;
        pl.logs = (pl.logs ?? 0) + u.carrying;
        if (pl.wood !== undefined) pl.logs = pl.wood;
        game.spawnFloat?.(u.x, u.z, `+${Math.round(u.carrying)}`, '#4ade80');
        u.carrying = 0; u.cargo = null;
      }
      u.harvestTarget = null; u.harvestManual = false; u.target = null; u.objective = null;
      u.returning = false;
      u.hasOrder = false; u.path = null; u.repathT = 0; u.fireAnchor = null;
      u.holdPosition = false; u.wpQueue = null; u.stuckT = 0; u.idleT = 0; u.moveCap = null;
      u.dropX = null; u.dropZ = null; u.dropFor = null;
      u.assignedMill = mill;
      u.millSlot = -1; // (re)assigned below in realmTick
      mill.workers.push(u);
      n++;
    }
    if (n && mill.owner === game.humanId) game.hookMsg(`${n} worker${n > 1 ? 's' : ''} assigned to Mill (${mill.workers.length}/4)`);
    return n;
  };

  game.ageUp = (owner) => {
    const st = game.players[owner];
    const next = (st.age || 0) + 1;
    const cost = AGES[next]?.cost;
    if (!cost) return false;
    if (!canAfford(st, cost)) {
      if (owner === game.humanId) game.hookMsg(`Not enough resources to advance — need ${fmtCost(cost)}`);
      return false;
    }
    payCost(st, cost);
    st.age = next;
    game.hookMsg(`🏰 ${st.name} advanced to Age ${['I', 'II', 'III', 'IV'][next]}! New buildings & troops unlocked`);
    return true;
  };

  // quick save / load keys (F5 / F9)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5') { e.preventDefault(); quickSave(game); }
    if (e.key === 'F9') { e.preventDefault(); quickLoad(game); }
  });

  // ---- per-frame realm tick: wrap game.update ----
  const rawUpdate = game.update.bind(game);
  game.update = (dt) => {
    rawUpdate(dt);
    try { realmTick(game, R, dt); } catch (err) { console.warn('[realms]', err); }
  };

  return R;
}

function realmTick(game, R, dt) {
  if (game.over) return;
  // farms produce grain; mills convert with assigned workers
  for (const b of game.buildings) {
    if (b.dead) continue;
    if (b.type === 'farm') {
      let rate = 1 / 4;
      if (R.events.modifier('harvest')) rate *= 1.5;
      if (R.events.modifier('winter')) rate *= 0.6;
      b.grain = Math.min(40, (b.grain || 0) + dt * rate);
    } else if (b.type === 'mill') {
      // prune dead/reassigned workers
      b.workers = (b.workers || []).filter((w) => !w.dead && w.assignedMill === b);
      // idle mill workers stand at slots OUTSIDE the footprint.
      // Issue the walk order once and let navigate() finish it — never
      // null the path every frame (that forced an A* per worker per frame,
      // the main source of hitching + "perf mode" spam after assigning).
      // Slots are STABLE per worker (not array index): when one hand leaves,
      // the rest keep their spots instead of all crossing paths at once
      // (the old index slots reshuffled everybody on every change).
      b.slotTaken = b.slotTaken || [null, null, null, null];
      // release slots of departed hands
      for (let s = 0; s < 4; s++) {
        const o = b.slotTaken[s];
        if (o && (o.dead || o.assignedMill !== b)) b.slotTaken[s] = null;
      }
      b.workers.forEach((w) => {
        if (w.dead || w.target || w.holdPosition) return;
        if (w.millSlot === undefined || w.millSlot < 0 || b.slotTaken[w.millSlot] !== w) {
          const free = b.slotTaken.findIndex((o) => !o || o.dead || o.assignedMill !== b);
          if (free < 0) return; // mill full: extra hands idle nearby, no slot fight
          if (w.millSlot >= 0 && b.slotTaken[w.millSlot] === w) b.slotTaken[w.millSlot] = null;
          w.millSlot = free; b.slotTaken[free] = w;
          w.millX = undefined; // force anchor recompute below
        }
        const slotR = (b.radius || 2.4) + 1.3;
        const a = (w.millSlot / 4) * Math.PI * 2 + 0.4;
        const px = b.x + Math.cos(a) * slotR, pz = b.z + Math.sin(a) * slotR;
        // sticky anchor: keep walking to the same spot, don't re-target mid-walk
        if (w.millX === undefined) {
          w.millX = px; w.millZ = pz;
          // only (re)order when clearly off-station or idle without orders
          const d = Math.hypot(w.x - px, w.z - pz);
          if (d > 1.2 && !w.hasOrder) { w.tx = px; w.tz = pz; w.hasOrder = true; w.path = null; w.repathT = 0; }
          else if (d > 1.2 && (Math.hypot((w.tx ?? w.x) - px, (w.tz ?? w.z) - pz) > 1.5)) {
            w.tx = px; w.tz = pz; w.hasOrder = true; w.path = null; w.repathT = 0;
          }
        } else {
          const d = Math.hypot(w.x - w.millX, w.z - w.millZ);
          if (d <= 1.2) {
            // on station: plant feet and face the mill
            if (w.hasOrder) { w.hasOrder = false; w.path = null; w.tx = w.x; w.tz = w.z; w.moveCap = null; }
            w.angle = Math.atan2(b.z - w.z, b.x - w.x);
          } else if (!w.hasOrder && d > 1.8) {
            w.tx = w.millX; w.tz = w.millZ; w.hasOrder = true; w.path = null; w.repathT = 0;
          }
        }
      });
      const used = tickMill(game, b, dt);
      // blades spin at 0.4 rad/s when working
      if (b.blades) b.blades.rotation.z += (used > 0 ? 0.4 : 0) * dt;
    } else if (b.type === 'temple') {
      // heal nearby friendlies
      game.eachNear?.(b.x, b.z, 15, (u) => {
        if (u.owner === b.owner && !u.dead && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + dt * 2);
      });
    }
  }
  tickUpkeep(game, dt);
  tickStarvationDamage(game, dt);
  tickAIEconomy(game, R, dt);
  tickCaravans(game, R, dt);  tickVillages(game, dt);
  tickPickups(game);
  tickWonder(game, R, dt);
  tickChapters(game, R);
  R.events.update(dt);
  tickDayNight(game, R, dt);
  checkWins(game, R);
}

// AI resource-awareness for ALL kingdoms: mills, farms, houses, markets —
// placed by rule, staffed, and defended. (Quarries / lumber camps are gone
// with stone: the AI runs the same wood + food economy as the player.)
function tickAIEconomy(game, R, dt) {
  R.aiEcoT = (R.aiEcoT || 0) + dt;
  if (R.aiEcoT < 5) return; // 0.2 Hz per-kingdom planner
  R.aiEcoT = 0;
  for (const id of game.aliveKingdoms()) {
    if (game.isHuman(id)) continue;
    try { aiEconomyFor(game, id); } catch { /* ignore */ }
  }
  // staff mills with idle workers (AI kingdoms only — never steal the
  // human's idle workers; that yanked freshly-tasked hands across the map
  // and looked like "workers struggling after assigning to buildings").
  for (const b of game.buildings) {
    if (b.dead || b.type !== 'mill') continue;
    b.workers = (b.workers || []).filter((w) => !w.dead && w.assignedMill === b);
    if (b.workers.length >= 4) continue;
    if (game.isHuman(b.owner)) continue;
    for (const u of game.units) {
      if (b.workers.length >= 4) break;
      if (u.dead || u.owner !== b.owner || u.type !== 'worker') continue;
      if (u.assignedMill || u.harvestTarget || u.hasOrder || u.returning) continue;
      u.assignedMill = b;
      u.millSlot = -1;
      b.workers.push(u);
    }
  }
}

function aiEconomyFor(game, id) {
  const hq = game.hqOf(id);
  if (!hq) return;
  const count = (t) => game.buildings.filter((b) => !b.dead && b.owner === id && b.type === t).length;
  const st = game.players[id];
  const tryBuild = (type, x, z) => {
    if (!canAfford(st, costOf(type))) return;
    if (canPlaceFor(game, id, type, x, z)) return; // invalid → skip quietly
    payCost(st, costOf(type));
    const b = game.spawnBuilding(type, id, x, z);
    if (type === 'farm') b.grain = 0;
    if (type === 'mill') b.workers = [];
  };
  const free = (x, z, r) => {
    const s = game.findFreeSpot(x, z, r);
    return s;
  };
  // 1. houses behind the keep (away from nearest enemy)
  if (count('house') < 3 && game.time > 60) {
    const foe = nearestFoeHq(game, id);
    const dx = foe ? hq.x - foe.x : 10, dz = foe ? hq.z - foe.z : 10;
    const d = Math.hypot(dx, dz) || 1;
    const s = free(hq.x + (dx / d) * 14, hq.z + (dz / d) * 14, 2);
    if (s) tryBuild('house', s.x, s.z);
  }
  // 2. mill + farm ring (core food chain)
  if (count('mill') < 1 && game.time > 90) {
    const s = free(hq.x + 12, hq.z + 6, 2.5);
    if (s) tryBuild('mill', s.x, s.z);
  }
  const mills = game.buildings.filter((b) => !b.dead && b.owner === id && b.type === 'mill');
  if (mills.length && count('farm') < 4) {
    const m = mills[0];
    for (let i = 0; i < 4; i++) {
      if (count('farm') >= 4) break;
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const s = free(m.x + Math.cos(a) * 12, m.z + Math.sin(a) * 12, 2.5);
      if (s) tryBuild('farm', s.x, s.z);
    }
  }
  // 3. market + embassy in age III towns
  if ((st.age || 0) >= 2 && count('market') < 1 && game.time > 600) {
    const s = free(hq.x - 12, hq.z + 8, 2.5);
    if (s) tryBuild('market', s.x, s.z);
  }
}

function nearestFoeHq(game, id) {
  const hq = game.hqOf(id);
  if (!hq) return null;
  let best = null, bd = 1e9;
  for (const fid of game.aliveKingdoms()) {
    if (fid === id) continue;
    const h = game.hqOf(fid);
    if (!h) continue;
    const d = Math.hypot(h.x - hq.x, h.z - hq.z);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

function tickCaravans(game, R, dt) {  // every Market sends a caravan every 90s → food
  R.caravanT -= dt;
  const fair = R.events.modifier('fair') ? 2 : 1;
  if (R.caravanT > 0) return;
  R.caravanT = 90;
  for (const b of game.buildings) {
    if (b.dead || b.type !== 'market') continue;
    const owner = game.players[b.owner];
    if (!owner?.alive) continue;
    const gain = 40 * fair;
    owner.food = (owner.food || 0) + gain;
    if (b.owner === game.humanId) {
      game.hookMsg(`🐪 Caravan returned +${gain} food`);
      game.spawnFloat?.(b.x, b.z, `+${gain}`, '#e3b23c');
    }
  }
}

function tickVillages(game, dt) {
  game._villageT = (game._villageT || 0) + dt;
  if (game._villageT < 1) return;
  game._villageT = 0;
  for (const v of game.villages || []) {
    if (v.owner && game.players[v.owner]?.alive) {
      game.players[v.owner].food = (game.players[v.owner].food || 0) + 2; // +2 food/s
    }
  }
}

function tickPickups(game) {
  for (const u of game.units) {
    if (u.dead) continue;
    for (const p of game.pickups || []) {
      if (p.taken) continue;
      if (Math.hypot(u.x - p.x, u.z - p.z) > 3) continue;
      p.taken = true;
      const pl = game.players[u.owner];
      if (p.kind === 'chest') {
        pl.wood = (pl.wood || 0) + 100;
        pl.logs = (pl.logs ?? 0) + 100;
        if (pl.wood !== undefined) pl.logs = pl.wood;
        pl.food = (pl.food || 0) + 50;
        if (u.owner === game.humanId) game.hookMsg('📦 Supply cache +100 wood, +50 food');
      } else if (p.kind === 'shard') {
        pl.shards = (pl.shards || 0) + 1;
        game.hookMsg(`👑 ${pl.name} claimed a crown shard (${pl.shards}/15)`);
      } else if (p.kind === 'ruins') {
        if (u.owner === game.humanId) game.hookMsg('🏛️ Ancient ruins: +40m vision revealed');
        u.sight = (u.sight || 15) + 10;
      } else if (p.kind === 'spring') {
        u.hp = Math.min(u.maxHp, u.hp + 50);
      }
      if (p.mesh) game.scene.remove(p.mesh);
    }
  }
  // healing springs heal standing units
  for (const p of game.pickups || []) {
    if (p.taken || p.kind !== 'spring') continue;
    game.eachNear?.(p.x, p.z, 6, (u) => {
      if (!u.dead && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 1.5 * 0.5);
    });
  }
}

function tickWonder(game, R, dt) {
  for (const b of game.buildings) {
    if (b.dead || b.type !== 'wonder') continue;
    const owner = b.owner;
    // must be complete (hp full-ish) and held 5 minutes
    if (b.hp < (b.maxHp || 1) * 0.99) { R.wonderT[owner] = null; continue; }
    if (R.wonderT[owner] == null) {
      R.wonderT[owner] = game.time;
      game.hookMsg(`👑 ${game.players[owner]?.name} completed the Crown Hall — destroy it in 5:00!`);
    }
  }
}

function tickChapters(game, R) {
  const wars = countWars(game);
  const alive = game.aliveKingdoms().length;
  const wonderStarted = game.buildings.some((b) => !b.dead && b.type === 'wonder');
  let ch = 0;
  if (alive <= 8 || wonderStarted) ch = 3;
  else if (wars >= 5 || wars >= alive / 3) ch = 2;
  else if (wars >= 1) ch = 1;
  if (ch !== R.chapter) {
    R.chapter = ch;
    const names = ['I. The Long Peace — boom: workers, farms, mills, forts', 'II. The Whisper — first war declared', 'III. The Shattering War — invasions and alliances', 'IV. The Last Crown — finish the Wonder or conquer all'];
    game.hookMsg(`📖 Chapter ${names[ch]}`);
  }
}

function countWars(game) {
  if (game.diplomacy) {
    let n = 0;
    const ids = game.aliveKingdoms();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (game.diplomacy.get(ids[i], ids[j]).type === 'war' && game._atWar?.(ids[i], ids[j])) n++;
    }
    return n;
  }
  // fallback: count active AI waves
  return 0;
}

function checkWins(game, R) {
  if (game.over) return;
  const alive = game.aliveKingdoms();
  const me = game.players[game.humanId];
  // Conquest: only the human remains
  if (me?.alive && alive.length === 1) return gameOver(game, true, 'Conquest — all 29 rivals destroyed!');
  if (!me?.alive) return gameOver(game, false, 'Your HQ has fallen.');
  // Shard Collector: 15 of 30 shards
  for (const id of alive) {
    if ((game.players[id].shards || 0) >= 15) {
      return gameOver(game, game.isHuman(id), `${game.players[id].name} united 15 crown shards!`);
    }
  }
  // Crown Hall: hold 5 minutes
  for (const [owner, t0] of Object.entries(R.wonderT)) {
    if (t0 == null) continue;
    if (game.time - t0 >= 300) {
      return gameOver(game, game.isHuman(owner), `${game.players[owner]?.name} held the Crown Hall!`);
    }
  }
}

function gameOver(game, win, sub) {
  game.over = true;
  try { game.hooks.onGameOver?.(win, sub); } catch { /* ignore */ }
}

function tickDayNight(game, R, dt) {
  // slow day/night: torches at night, vision dips (visual dimming hook)
  R.dayT += dt;
  const period = 360; // 6 min full cycle
  const night = (R.dayT % period) > period * 0.55;
  if (night !== R._wasNight) {
    R._wasNight = night;
    try {
      game.scene.fog.color.set(night ? 0x05070c : 0x0b0e14);
      game.hookMsg(night ? '🌙 Night falls — torches lit, vision drops' : '☀️ Dawn breaks');
    } catch { /* ignore */ }
  }
}

function terrainSpeedMul(game, x, z) {
  try {
    // bridges = road (chokepoints, x1.2); forest near trees x0.7; river bank x0.6
    if (game.onBridge?.(x, z)) return TERRAIN_SPEED.road;
    if (game.terrain?.blocked?.(x, z)) return 1; // impassable handled elsewhere
    // HOT PATH (runs per moving unit per frame): grid query, never a full
    // linear scan over ~1000 trees — the old nearestResourceLike call here
    // was O(units × resources) every frame and the main lag source.
    let wooded = false;
    game.eachResourceNear?.(x, z, 6, (r) => {
      if (r.rtype === 'tree' && game.resourceReady?.(r)) { wooded = true; return false; }
    });
    if (wooded) return TERRAIN_SPEED.forest;
    const y = game.gy ? game.gy(x, z) : 0;
    const wl = game.terrain?.waterY ?? -1.0;
    if (y <= wl + 1.2) return TERRAIN_SPEED.bank;
  } catch { /* ignore */ }
  return TERRAIN_SPEED.meadow;
}

function findBlades(building) {
  try {
    let out = null;
    building.mesh?.traverse?.((o) => { if (o.name === 'blades') out = o; });
    return out;
  } catch { return null; }
}

function fmtCost(cost) {
  return Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');
}

function registerRockNodes(game) {
  // terrain boulders become harvestable stone nodes (small 150 / large 800)
  try {
    const spots = game.terrain?.rocks || game.waterFx?.rocks || [];
    let n = 0;
    const add = (x, z, large) => {
      if (n >= 220) return;
      // avoid stacking on bases
      for (const s of game.kingdomSpawns || []) {
        if (Math.hypot(x - s.x, z - s.z) < 20) return;
      }
      const amount = large ? 800 : 150;
      game.resources.push({
        id: 1e6 + n, kind: 'resource', rtype: 'rock',
        x, z, radius: 2.0, amount, max: amount, workersMax: large ? 3 : 2,
        baseScale: 1,
      });
      n++;
    };
    if (Array.isArray(spots) && spots.length) {
      for (const s of spots) add(s.x, s.z, (s.s || 1) > 1.4);
    }
    // fallback: scatter rocks procedurally so stone always exists
    if (n < 60) {
      const H = CONFIG.mapSize / 2 - 20;
      let guard = 0;
      while (n < 120 && guard++ < 2000) {
        const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
        try { if (game.gy(x, z) <= (game.terrain?.waterY ?? -1) + 0.3) continue; } catch { /* ignore */ }
        add(x, z, Math.random() < 0.25);
      }
    }
  } catch (err) { console.warn('[realms] rocks', err); }
}

function registerCrystalNodes(game) {
  // glowing crystal nodes: one cluster per kingdom start + wild extras
  try {
    let n = 0;
    for (const s of game.kingdomSpawns || []) {
      const x = s.x + 14, z = s.z + 10;
      game.resources.push({
        id: 2e6 + n++, kind: 'resource', rtype: 'crystal',
        x, z, radius: 2.0, amount: 500, max: 500, workersMax: 4,
      });
      addCrystalMesh(game, x, z);
    }
    const H = CONFIG.mapSize / 2 - 30;
    for (let i = 0; i < 30; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      game.resources.push({
        id: 2e6 + n++, kind: 'resource', rtype: 'crystal',
        x, z, radius: 2.0, amount: 500, max: 500, workersMax: 4,
      });
      addCrystalMesh(game, x, z);
    }
  } catch (err) { console.warn('[realms] crystals', err); }
}

function addCrystalMesh(game, x, z) {
  try {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.2, 0),
      new THREE.MeshStandardMaterial({ color: 0x7de8ff, emissive: 0x2aa8cc, emissiveIntensity: 0.7, flatShading: true })
    );
    m.position.set(x, game.gy(x, z) + 1, z);
    game.scene.add(m);
    const res = game.resources[game.resources.length - 1];
    if (res) res.mesh = m;
  } catch { /* ignore */ }
}

function spawnPickups(game) {
  // treasure chests, crown shards (30 fixed), ruins, healing springs
  game.pickups = game.pickups || [];
  try {
    const H = CONFIG.mapSize / 2 - 25;
    const mk = (kind, x, z, color) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, flatShading: true })
      );
      m.position.set(x, game.gy(x, z) + 1, z);
      game.scene.add(m);
      game.pickups.push({ kind, x, z, mesh: m, taken: false });
    };
    // one shard per kingdom start (Shard Collector win)
    for (const s of game.kingdomSpawns || []) mk('shard', s.x - 12, s.z - 8, 0xffd34d);
    for (let i = 0; i < 12; i++) mk('chest', (Math.random() * 2 - 1) * H, (Math.random() * 2 - 1) * H, 0xffd34d);
    for (let i = 0; i < 8; i++) mk('ruins', (Math.random() * 2 - 1) * H, (Math.random() * 2 - 1) * H, 0xc084fc);
    for (let i = 0; i < 8; i++) mk('spring', (Math.random() * 2 - 1) * H, (Math.random() * 2 - 1) * H, 0x4dff88);
  } catch (err) { console.warn('[realms] pickups', err); }
}

function spawnVillages(game) {
  // neutral villages: capture for +2 gold/s
  game.villages = game.villages || [];
  try {
    const H = CONFIG.mapSize / 2 - 40;
    for (let i = 0; i < 10; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(2.2, 2.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x5b4b3a, flatShading: true })
      );
      m.position.set(x, game.gy(x, z) + 1.2, z);
      game.scene.add(m);
      game.villages.push({ x, z, mesh: m, owner: null });
    }
  } catch (err) { console.warn('[realms] villages', err); }
}
