import { CONFIG } from './config.js';

// War of Crowns AI — one fully independent brain per AI kingdom.
//
// Nothing is shared between brains. Each kingdom rolls its own personality,
// plans its own fort, keeps its own grudges and makes its own war decisions.
// The only thing a brain "hears" is damage dealt to ITS OWN kingdom
// (game.onHit is routed to the victim's brain only).
//
//  1. EMPIRE   — utility-based spending over every building type: workers,
//                barracks (supply + production), turrets, walls, army.
//  2. FORT     — a planned keep: corner towers, gate towers, continuous
//                walls built in walking order (not scattered), open gates so
//                its own army/workers can leave, destroyed walls get rebuilt.
//  3. WAR      — armies muster at a gate, then launch waves:
//                  revenge (hits whoever hurt them, on a RANDOM enemy base) and
//                  opportunistic invasions of kingdoms THIS brain judges weak.
//                Waves stage outside the enemy fort, then assault in priority
//                order (fighters > turrets > objective), retreat when losing.

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const WALL_R = () => CONFIG.buildings.wall.size * 0.5; // half-length of a wall piece
const TURRET_R = () => CONFIG.buildings.turret.size * 0.72;
const RAX_R = () => CONFIG.buildings.barracks.size * 0.72;
const TOWER_CLEAR = () => TURRET_R() + WALL_R() + 0.05; // wall end must clear a tower

// sides: 0 = N (-z), 1 = E (+x), 2 = S (+z), 3 = W (-x)
const INWARD = [{ x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 1, z: 0 }];

export class KingdomBrain {
  constructor(game, owner) {
    this.game = game;
    this.owner = owner;
    const A = CONFIG.ai;

    // ---- personality: every kingdom thinks differently ----
    this.P = {
      militarism: rand(0.35, 0.95),
      fortLove: rand(0.45, 1.0),
      vengeance: rand(0.4, 1.2),
      caution: rand(0, 1),
      targetWorkers: randInt(A.maxWorkers[0], A.maxWorkers[1]),
      wantArmy: randInt(A.maxArmy[0], A.maxArmy[1]),
      maxBarracks: randInt(A.maxBarracks[0], A.maxBarracks[1]),
      raxPace: rand(140, 250),
      buildStyle: pick(['hub', 'ring', 'frontier', 'rear']),
      gatePref: Math.random() < 0.5 ? 'foe' : 'resource',
      twoGates: Math.random() < 0.6,
      fortHx: rand(A.fortHalf[0], A.fortHalf[1]),
      fortHz: rand(A.fortHalf[0], A.fortHalf[1]),
      tankShare: rand(0.1, 0.3),
      artShare: rand(0.05, 0.25),
      readyAt: Math.max(A.peaceMin, rand(A.readyAt[0], A.readyAt[1])),
      fortReady: rand(0.5, 0.85),
      waveMin: randInt(8, 12),
      attackRatio: rand(0.8, 1.4),     // how sure of a win before a 'safe' invasion
      reach: rand(140, 280),
      waveGap: [rand(110, 190), rand(220, 340)],
    };

    this.thinkEvery = A.thinkEvery[0] + Math.random() * (A.thinkEvery[1] - A.thinkEvery[0]);
    this.thinkT = Math.random() * this.thinkEvery;
    this.status = 'Gathering…';

    // own memory (never shared)
    this.grudges = new Map();   // attackerId -> { anger, last, hits }
    this.intrusions = new Map(); // buildingId -> { foe, x, z, t } (demolish list)
    this.bias = new Map();      // foeId -> my private misjudgement of their strength
    this.foeCD = new Map();     // foeId -> earliest time I may campaign against them again
    this.hitT = -1e9;           // last time anything of mine was hit
    this.wave = null;
    this.waveCD = rand(30, 90);
    this.opT = rand(40, 100);
    this.scanT = 0;
    this.scan = null;

    // fort + layout, planned on first think (needs the HQ)
    this.fort = null;
    this.walls = [];
    this.towers = [];
    this.foeDir = null;
  }

  // ---------------------------------------------------------------- helpers
  power(list) {
    let s = 0;
    for (const u of list) {
      if (u.type === 'worker') continue;
      const dps = u.damage / (u.cooldown || 1);
      s += dps * u.hp / 100;
    }
    return s;
  }

  noteHit(attacker, ent, amt) {
    const g = this.game;
    const w = ent.type === 'hq' ? 3 : ent.type === 'barracks' ? 2 : ent.type === 'wall' ? 0.25 : 1;
    let gr = this.grudges.get(attacker);
    if (!gr) { gr = { anger: 0, last: 0, hits: 0 }; this.grudges.set(attacker, gr); }
    gr.anger = Math.min(12, gr.anger + (amt * w) / 120);
    gr.last = g.time;
    gr.hits++;
    this.hitT = g.time;
  }

  // someone built inside MY territory: grudge + remember the structure for
  // a demolition raid. Walls alone only annoy (small anger, still watched).
  noteIntrusion(attacker, building) {
    const g = this.game;
    if (!this.isAlive(attacker) || attacker === this.owner) return;
    const w = building.type === 'wall' ? 0.4 : 1.5;
    let gr = this.grudges.get(attacker);
    if (!gr) { gr = { anger: 0, last: 0, hits: 0 }; this.grudges.set(attacker, gr); }
    gr.anger = Math.min(12, gr.anger + w);
    gr.last = g.time;
    gr.hits++;
    this.hitT = g.time;
    if (building.type !== 'wall') {
      this.intrusions.set(building.id, { foe: attacker, x: building.x, z: building.z, t: g.time, bid: building.id });
    }
    // prune stale / destroyed entries so the map never grows
    for (const [id, rec] of this.intrusions) {
      const b = g.buildings.find((x) => x.id === id);
      if (!b || b.dead || g.time - rec.t > 300) this.intrusions.delete(id);
    }
  }

  isAlive(id) { return !!this.game.players[id]?.alive; }

  foeDirection(hq) {
    const g = this.game;
    let best = null, bd = 1e9;
    for (const id of g.aliveKingdoms()) {
      if (id === this.owner) continue;
      const h = g.hqOf(id);
      if (!h) continue;
      const d = Math.hypot(h.x - hq.x, h.z - hq.z);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return { x: -hq.x, z: -hq.z, n: true };
    return { x: (best.x - hq.x) / bd, z: (best.z - hq.z) / bd };
  }

  // ---- formal challenge answer: weigh our mustered strength vs theirs ----
  answerChallenge(S, hq) {
    const g = this.game, P = this.P;
    const ch = g.diplomacy?.challengeFor?.(this.owner);
    if (!ch) { this._chAnswerAt = 0; return; }
    if (!this._chAnswerAt) {
      const lo = 8, hi = 20; // deliberate like a cautious lord
      this._chAnswerAt = g.time + lo + Math.random() * (hi - lo);
      this.status = `⚔️ Challenged by ${g.players[ch.challenger]?.name || ''}!`;
      return;
    }
    if (g.time < this._chAnswerAt) {
      this.status = `⚔️ Weighing ${g.players[ch.challenger]?.name || ''}'s challenge…`;
      return;
    }
    this._chAnswerAt = 0;
    const mine = this.power(S.army) + 1;
    const theirs = this.foeStrength(ch.challenger);
    const ratio = mine / theirs;
    const grudge = this.grudges.get(ch.challenger)?.anger || 0;
    const accept = ratio >= 1.0
      || (P.militarism > 0.8 && ratio >= 0.8)   // warlords love a fair fight
      || (grudge >= 4 && ratio >= 0.7);         // grudges override caution
    g.diplomacy.answerChallenge(this.owner, accept);
  }

  // ---------------------------------------------------------------- fort plan
  planFort(hq) {
    const g = this.game, A = CONFIG.ai, P = this.P;
    const cx = hq.x, cz = hq.z, hx = P.fortHx, hz = P.fortHz, gw = A.gateWidth;
    let fd = this.foeDirection(hq);
    if (fd.n) { const l = Math.hypot(fd.x, fd.z) || 1; fd = { x: fd.x / l, z: fd.z / l }; }
    this.foeDir = fd;

    // nearest tree grove outside the keep: workers want a gate that way
    let rd = null, bd = 1e9;
    for (const r of g.resources) {
      if (!g.resourceReady(r)) continue;
      if (Math.abs(r.x - cx) < hx + 2 && Math.abs(r.z - cz) < hz + 2) continue;
      const d = Math.hypot(r.x - cx, r.z - cz);
      if (d < bd) { bd = d; rd = { x: (r.x - cx) / d, z: (r.z - cz) / d }; }
    }
    if (!rd) rd = { x: -fd.x, z: -fd.z };

    const sideOf = (v) => Math.abs(v.x) > Math.abs(v.z) ? (v.x > 0 ? 1 : 3) : (v.z > 0 ? 2 : 0);
    const s1 = sideOf(P.gatePref === 'foe' ? fd : rd);
    const gates = [{ side: s1, off: rand(-4, 4) }];
    if (P.twoGates) {
      let s2 = sideOf(P.gatePref === 'foe' ? rd : fd);
      if (s2 === s1) s2 = (s1 + 2) % 4;
      gates.push({ side: s2, off: rand(-4, 4) });
    }

    const pt = (s, t) => s === 0 ? { x: cx + t, z: cz - hz } : s === 1 ? { x: cx + hx, z: cz + t }
      : s === 2 ? { x: cx + t, z: cz + hz } : { x: cx - hx, z: cz + t };

    const g1 = pt(gates[0].side, gates[0].off);

    // ---- walls: disabled. Kingdoms no longer raise automatic fort walls:
    // armies and workers were getting trapped behind their own palisades and
    // could not find the gates. Only hand-placed player walls exist now.
    // The fort frame (gates, staging point) is kept for mustering, and
    // towers are still built as gate/area defense.
    const walls = [];

    // ---- towers: gate flanks first (kill zone), then corners facing the foe ----
    const towers = [];
    gates.forEach((q, gi) => {
      for (const sgn of [-1, 1]) {
        const base = pt(q.side, q.off + sgn * (gw / 2 + 1.3));
        const inw = INWARD[q.side];
        towers.push({ x: base.x + inw.x * 3.6, z: base.z + inw.z * 3.6, prio: gi, b: null, retryAt: 0 });
      }
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + sx * hx, z = cz + sz * hz;
      const facing = (sx * hx * fd.x + sz * hz * fd.z) / Math.hypot(hx, hz); // -1..1
      towers.push({ x, z, prio: 2 + (1 - facing), b: null, retryAt: 0 });
    }
    towers.sort((a, b) => a.prio - b.prio);

    this.fort = { cx, cz, hx, hz, gates, pt, g1, gw };
    this.walls = walls;
    this.towers = towers;
  }

  // lateral/depth test: is (x,z) inside a gate's traffic lane?
  inGateLane(x, z, pad = 4.5) {
    const F = this.fort;
    for (const q of F.gates) {
      let t, depth;
      if (q.side === 0) { t = x - F.cx; depth = z - (F.cz - F.hz); }
      else if (q.side === 2) { t = x - F.cx; depth = (F.cz + F.hz) - z; }
      else if (q.side === 1) { t = z - F.cz; depth = (F.cx + F.hx) - x; }
      else { t = z - F.cz; depth = x - (F.cx - F.hx); }
      if (Math.abs(t - q.off) < F.gw / 2 + pad && depth < 13) return true;
    }
    return false;
  }

  homeStage() {
    const F = this.fort;
    const inw = INWARD[F.gates[0].side];
    return { x: F.g1.x + inw.x * 9, z: F.g1.z + inw.z * 9 };
  }

  fortProgress() {
    // automatic walls are disabled, so there is nothing to wait for
    if (!this.walls.length) return 1;
    let n = 0;
    for (const w of this.walls) if (w.b && !w.b.dead) n++;
    return n / this.walls.length;
  }

  // ---------------------------------------------------------------- building
  pickBarracksSpot(hq, rax) {
    const g = this.game, P = this.P, F = this.fort, fd = this.foeDir;
    const rr = RAX_R() + 1.6;
    let best = null, bs = -1e9;
    for (let i = 0; i < 100; i++) {
      const x = F.cx + rand(-(F.hx - 5.0), F.hx - 5.0);
      const z = F.cz + rand(-(F.hz - 5.0), F.hz - 5.0);
      const dH = Math.hypot(x - hq.x, z - hq.z);
      if (this.inGateLane(x, z)) continue;
      if (!g.isSpotFree(x, z, rr)) continue;
      const proj = (x - hq.x) * fd.x + (z - hq.z) * fd.z;
      let s;
      if (P.buildStyle === 'hub') s = -dH;                           // tight around the HQ
      else if (P.buildStyle === 'ring') {                            // spaced around the keep
        const ringR = Math.min(F.hx, F.hz) * 0.62;
        let minD = 1e9;
        for (const b of rax) minD = Math.min(minD, Math.hypot(x - b.x, z - b.z));
        s = -Math.abs(dH - ringR) + Math.min(minD, 16) * 0.6;
      } else if (P.buildStyle === 'frontier') s = proj;              // toward the likely enemy
      else s = -proj;                                                // sheltered rear
      s += rand(0, 3);
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best;
  }

  // keep is full: raise the barracks just outside it, on the side away from the foe
  pickOutsideSpot(hq) {
    const g = this.game, F = this.fort, fd = this.foeDir;
    const rr = RAX_R() + 1.6;
    let best = null, bs = -1e9;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(F.hx, F.hz) + rand(7, 15);
      const x = F.cx + Math.cos(a) * r, z = F.cz + Math.sin(a) * r;
      let nearGate = false;
      for (const q of F.gates) { const p = F.pt(q.side, q.off); if (Math.hypot(x - p.x, z - p.z) < 13) nearGate = true; }
      if (nearGate || !g.isSpotFree(x, z, rr)) continue;
      const s = -((x - hq.x) * fd.x + (z - hq.z) * fd.z) + rand(0, 4);
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best;
  }

  nearestFighter(x, z, r) {
    let best = null, bd = r;
    this.game.eachNear(x, z, r, (e) => {
      if (e.owner === this.owner || e.dead || e.type === 'worker') return;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  buildNextTower() {
    const g = this.game, id = this.owner, now = g.time, r = TURRET_R();
    for (const t of this.towers) {
      if (t.b && !t.b.dead) continue;
      t.b = null;
      if (t.retryAt > now) continue;
      if (!g.isSpotFree(t.x, t.z, r)) { t.retryAt = now + 15 + Math.random() * 10; continue; }
      const b = g.buildTurret(id, t.x, t.z);
      if (b) { t.b = b; return true; }
      t.retryAt = now + 20;
    }
    return false;
  }

  chooseUnit(S) {
    const g = this.game, P = this.P;
    const queued = (type) => S.rax.reduce((n, b) => n + b.queue.filter(q => q.type === type).length, 0);
    const have = (type) => S.army.filter(u => u.type === type).length + queued(type);
    const roll = Math.random();
    if (g.time > 420 && have('tank') < Math.ceil(P.tankShare * P.wantArmy) && roll < 0.5) return 'tank';
    if (g.time > 540 && have('artillery') < Math.ceil(P.artShare * P.wantArmy) && roll < 0.4) return 'artillery';
    // caveman troops: brutes lead assaults, hunters screen from behind
    if (g.time > 150 && have('brute') < Math.ceil(0.3 * P.wantArmy) && roll < 0.42) return 'brute';
    if (g.time > 210 && have('hunter') < Math.ceil(0.35 * P.wantArmy) && roll < 0.5) return 'hunter';
    return 'soldier';
  }

  // ---------------------------------------------------------------- think
  gather() {
    const g = this.game, id = this.owner;
    const S = {
      workers: [], army: [], hq: null, rax: [], turrets: [], walls: 0,
      logs: g.players[id].logs, supplyUsed: 0, supplyMax: g.supplyMax(id),
    };
    for (const u of g.units) {
      if (u.owner !== id || u.dead) continue;
      S.supplyUsed++;
      if (u.type === 'worker') S.workers.push(u); else S.army.push(u);
    }
    for (const b of g.buildings) {
      if (b.owner !== id || b.dead) continue;
      if (b.type === 'hq') S.hq = b;
      else if (b.type === 'barracks') S.rax.push(b);
      else if (b.type === 'turret') S.turrets.push(b);
      else S.walls++;
    }
    return S;
  }

  think() {
    const g = this.game;
    if (g.over) return;
    const A = CONFIG.ai, P = this.P, id = this.owner, dt = this.thinkEvery;
    const S = this.gather();
    if (!S.hq) { this.status = 'Fallen'; return; }
    const hq = S.hq;
    if (!this.fort) this.planFort(hq);

    // ---- answer formal war challenges (deliberate, then accept or refuse) ----
    this.answerChallenge(S, hq);

    // decay grudges
    for (const [k, gr] of this.grudges) {
      gr.anger = Math.max(0, gr.anger - dt * 0.012);
      if (gr.anger <= 0 && g.time - gr.last > 300) this.grudges.delete(k);
    }
    this.waveCD -= dt;

    // ---- 1. SURVIVAL: threat at home pulls the home army in ----
    const threat = this.nearestFighter(hq.x, hq.z, A.defendRadius);
    const inWave = (u) => this.wave && this.wave.units.has(u);
    const home = S.army.filter(u => !inWave(u));
    const stage = this.homeStage();
    if (threat && threat.owner !== id) {
      this.status = 'Defending!';
      for (const u of home) {
        const dHome = Math.hypot(u.x - hq.x, u.z - hq.z);
        if (!u.target || u.target.dead || dHome > 50) {
          u.target = this.nearestFighter(u.x, u.z, 40) || threat;
          u.hasOrder = false; u.attackMove = false; u.fireAnchor = null;
        }
        u.retreating = false;
      }
      // a campaign in progress is recalled if home is clearly outgunned
      if (this.wave) {
        let enemy = 0;
        g.eachNear(hq.x, hq.z, A.defendRadius + 4, (e) => { if (e.owner !== id && !e.dead) enemy += this.power([e]); });
        if (enemy > this.power(home) * 1.3) this.endWave('recalled');
      }
    } else {
      for (const u of home) {
        if (u.hp / u.maxHp < 0.28 && !u.retreating) {
          u.retreating = true; u.target = null;
          const drop = g.hqDropSpot(hq, u);
          u.tx = drop.x; u.tz = drop.z;
          u.hasOrder = true; u.attackMove = false;
        } else if (u.retreating && u.hp / u.maxHp > 0.75) u.retreating = false;
        // idle army musters at the gate instead of wandering
        else if (!u.retreating && !u.target && !u.hasOrder && Math.hypot(u.x - stage.x, u.z - stage.z) > 16) {
          const spot = g.rallySpotFor({ rallyX: stage.x, rallyZ: stage.z }, u.type, u.id % 8);
          u.tx = spot.x; u.tz = spot.z;
          u.hasOrder = true; u.attackMove = true; u.path = null; u.fireAnchor = null;
        }
      }
    }

    // ---- 2. ECONOMY: workers always harvesting logs (continuous) ----
    // mill hands are exempt — they stay at their mill, not chopped to trees
    for (const w of S.workers) {
      w.retreating = false;
      if (w.assignedMill) continue;
      if ((!w.hasOrder && !g.resourceReady(w.harvestTarget) && w.carrying === 0) || (w.harvestTarget && !g.resourceReady(w.harvestTarget))) {
        w.harvestTarget = g.nearestResource(w.x, w.z);
        w.returning = false;
        // idle full-loop: if carrying logs but no order, send home, else chop
        if (w.carrying > 0 && !w.returning) {
          const hq2 = g.hqOf(this.owner);
          if (hq2) { const drop = g.hqDropSpot(hq2, w); w.returning = true; w.dropX = drop.x; w.dropZ = drop.z; w.dropFor = hq2.id; w.tx = drop.x; w.tz = drop.z; w.hasOrder = true; w.path = null; }
        }
      }
    }

    // ---- 3. EMPIRE: utility-based spending over every building/unit type ----
    this.spend(S, threat);

    // barracks rally = the gate muster point, normalized to free ground
    for (const b of S.rax) g.setBuildingRally(b, stage.x, stage.z, true);

    // ---- 4. WAR ----
    if (this.wave) this.runWave(S);
    else if (!threat) this.considerWar(S, hq);
    // ---- 4b. DEMOLISH: intruders building in our land get raided ----
    if (!this.wave && !threat) this.raidIntrusion(S, hq);

    if (!threat) {
      if (this.wave) this.status = `${this.wave.kind === 'revenge' ? 'Revenge on' : 'Invading'} ${g.players[this.wave.foe]?.name || ''}`;
      else if (S.army.length >= 4) this.status = `Mustering (${S.army.length})…`;
      else this.status = 'Growing…';
    }
  }

  spend(S, threat) {
    const g = this.game, P = this.P, id = this.owner, t = g.time;
    const pl = g.players[id];
    const recentHit = (t - this.hitT) < 90;
    const hq = S.hq;
    const armyQ = S.rax.reduce((n, b) => n + b.queue.length, 0);
    const surplus = Math.max(0, pl.logs - 500);
    const wantNow = Math.min(P.wantArmy, 6 + Math.floor(t / 45)) + Math.min(10, Math.floor(surplus / 250));

    for (let guard = 0; guard < 10; guard++) {
      S.logs = pl.logs;
      const supplyFree = S.supplyUsed + hq.queue.length + armyQ < S.supplyMax + 2;
      const opts = [];

      // workers
      const nW = S.workers.length + hq.queue.length;
      if (nW < P.targetWorkers && hq.queue.length < 2 && S.supplyUsed < S.supplyMax) {
        opts.push({ k: 'worker', u: 0.9 * (P.targetWorkers - nW) / P.targetWorkers + (nW < 5 ? 0.5 : 0), cost: CONFIG.workerCost,
          go: () => g.trainUnit(hq, 'worker') });
      }

      // barracks: the only source of supply + army production
      const goalRax = Math.min(P.maxBarracks, 1 + Math.floor(t / P.raxPace));
      const blocked = S.supplyUsed >= S.supplyMax - 2;
      if (S.rax.length < P.maxBarracks && (blocked || S.rax.length < goalRax) && S.workers.length >= 4) {
        opts.push({ k: 'barracks', u: blocked ? 1.1 : 0.55 + 0.1 * (goalRax - S.rax.length), cost: CONFIG.barracksCost,
          go: () => {
            const spot = this.pickBarracksSpot(hq, S.rax) || this.pickOutsideSpot(hq);
            if (!spot) return false;
            const b = g.buildBarracks(id, spot.x, spot.z);
            if (b) { S.rax.push(b); return true; }
            return false;
          } });
      }

      // army from every idle barracks
      if (S.army.length + armyQ < wantNow && supplyFree) {
        const idle = S.rax.find(b => b.queue.length < (S.logs > 380 ? 2 : 1));
        if (idle) {
          const type = this.chooseUnit(S);
          opts.push({ k: 'army', u: 0.6 + 0.5 * P.militarism * (1 - S.army.length / Math.max(1, wantNow)), cost: g.unitCost(type),
            go: () => g.trainUnit(idle, type) });
        }
      }

      // towers (gate kill-zones first), unlocked gradually unless we are being hit
      const builtT = S.turrets.length;
      const allowedT = recentHit || threat ? this.towers.length : Math.min(this.towers.length, Math.floor((t - 150) / 80) + 1);
      if (t > 120 && builtT < allowedT && S.rax.length >= 1 && S.workers.length >= 5) {
        opts.push({ k: 'turret', u: P.fortLove * 0.55 * (1 - builtT / Math.max(1, this.towers.length)) + (recentHit ? 0.4 : 0.05),
          cost: CONFIG.turretCost, go: () => { const ok = this.buildNextTower(); if (ok) S.turrets.push({}); return ok; } });
      }

      // (automatic walls removed: the AI musters in the open and never
      // traps its own army behind a palisade)

      if (!opts.length) break;
      for (const o of opts) o.u *= 0.85 + Math.random() * 0.3;
      opts.sort((a, b) => b.u - a.u);

      let acted = false;
      for (const o of opts) {
        if (pl.logs >= o.cost) {
          if (o.go()) { acted = true; break; }
        } else if (o.u >= 0.7) {
          // important and unaffordable: save up instead of wasting logs on small stuff
          return;
        }
      }
      if (!acted) break;
    }
  }

  // ---- demolition raid: destroy intruder structures in our territory ----
  // Small fast force (not a full invasion): marches straight at the recorded
  // building and knocks it down. One raid at a time; the wave slot is shared.
  raidIntrusion(S, hq) {
    if (!this.intrusions.size) return;
    // drop dead/stale records first
    for (const [id, rec] of this.intrusions) {
      const b = this.game.buildings.find((x) => x.id === id);
      if (!b || b.dead) { this.intrusions.delete(id); continue; }
      if (!this.isAlive(rec.foe)) { this.intrusions.delete(id); continue; }
    }
    if (!this.intrusions.size) return;
    const avail = this.available(S);
    const guardN = Math.max(2, Math.ceil(0.2 * S.army.length));
    const sendable = avail.slice(0, Math.max(0, avail.length - guardN));
    if (sendable.length < 3) return; // too thin — hold the fort instead
    // nearest intruder building first
    let rec = null, bd = 1e9;
    for (const r of this.intrusions.values()) {
      const d = Math.hypot(r.x - hq.x, r.z - hq.z);
      if (d < bd) { bd = d; rec = r; }
    }
    if (!rec) return;
    const target = this.game.buildings.find((x) => x.id === rec.bid);
    if (!target || target.dead) { this.intrusions.delete(rec.bid); return; }
    const raiders = sendable.slice(0, Math.min(6, sendable.length));
    this.status = `Demolishing intruder (${raiders.length})…`;
    this.launch('demolish', rec.foe, raiders, hq, target);
  }

  // ---------------------------------------------------------------- war
  scanWorld() {
    const g = this.game;
    if (this.scan && g.time - this.scanT < 8) return this.scan;
    const m = new Map();
    const get = (id) => { let e = m.get(id); if (!e) { e = { power: 0, turrets: 0, walls: 0 }; m.set(id, e); } return e; };
    for (const u of g.units) if (!u.dead && u.type !== 'worker') get(u.owner).power += this.power([u]);
    for (const b of g.buildings) {
      if (b.dead) continue;
      if (b.type === 'turret') get(b.owner).turrets++;
      else if (b.type === 'wall') get(b.owner).walls++;
    }
    this.scan = m; this.scanT = g.time;
    return m;
  }

  foeStrength(id) {
    const e = this.scanWorld().get(id) || { power: 0, turrets: 0, walls: 0 };
    let b = this.bias.get(id);
    if (!b) { b = rand(0.75, 1.3); this.bias.set(id, b); }       // private misjudgement
    return (e.power + e.turrets * 30 + e.walls * 0.25) * b + 1;
  }

  available(S) {
    return S.army.filter(u => u.type !== 'scout' && !u.retreating && u.hp / u.maxHp > 0.5 && !(this.wave && this.wave.units.has(u)));
  }

  considerWar(S, hq) {
    const g = this.game, P = this.P, now = g.time;
    const avail = this.available(S);
    if (!avail.length) return;
    const guardN = Math.max(3, Math.ceil((0.1 + 0.2 * P.caution) * S.army.length));
    const sendable = Math.max(0, avail.length - guardN);

    // ---- revenge: hit back at whoever hurt us, on a RANDOM enemy base ----
    const thr = 2.0 / (0.4 + P.vengeance);
    let best = null;
    for (const [fid, gr] of this.grudges) {
      if (!this.isAlive(fid) || gr.anger < thr || now - gr.last > 420) continue;
      if (!best || gr.anger > best.gr.anger) best = { fid, gr };
    }
    if (best && sendable >= 4) {
      const ratio = (this.power(avail.slice(0, sendable)) + 1) / this.foeStrength(best.fid);
      if (ratio >= 0.5 || best.gr.anger >= 5) {
        const pact = g.diplomacy ? g.diplomacy.get(this.owner, best.fid).type : 'war';
        this._betrayNext = pact === 'alliance' || pact === 'ceasefire' || pact === 'challenged';
        this.launch('revenge', best.fid, avail.slice(0, sendable), hq);
        return;
      }
    }

    // ---- total war: no other target matters until the foe falls ----
    const tw = g.diplomacy?.totalWarWith?.(this.owner);
    if (tw && this.isAlive(tw) && !this.wave && sendable >= 4) {
      this._betrayNext = false;
      this.launch('invade', tw, avail.slice(0, sendable), hq);
      return;
    }

    // ---- opportunism: this kingdom's own read on who looks weak ----
    this.opT -= this.thinkEvery;
    if (this.opT > 0) return;
    this.opT = rand(18, 40);
    if (now < P.readyAt || this.waveCD > 0) return;
    if (this.fortProgress() < P.fortReady) return;
    if (S.rax.length < Math.min(2, P.maxBarracks)) return;
    if (sendable < P.waveMin) return;

    const myPower = this.power(avail.slice(0, sendable)) + 1;
    // patience runs out the longer a kingdom has been "ready" without a good target
    const need = P.attackRatio * Math.max(0.55, 1 - (now - P.readyAt) / 1200);
    const cands = [];
    const diplo = g.diplomacy;
    // treacherous streak: warlords & grudge-holders may break a pact for a
    // crushing win — if they can pay the mobilization fee
    const treacherous = (P.militarism > 0.75 || P.vengeance > 0.9) && diplo && diplo.canPay(this.owner, { wood: 200, food: 200 });
    for (const fid of g.aliveKingdoms()) {
      if (fid === this.owner) continue;
      if ((this.foeCD.get(fid) || 0) > now) continue;
      const h = g.hqOf(fid);
      if (!h) continue;
      const d = Math.hypot(h.x - hq.x, h.z - hq.z);
      if (d > P.reach) continue;
      const ratio = myPower / this.foeStrength(fid);
      const pact = diplo ? diplo.get(this.owner, fid).type : 'war';
      const bound = pact === 'alliance' || pact === 'ceasefire' || pact === 'challenged';
      if (bound && !(treacherous && ratio >= 2.0 && Math.random() < 0.15)) continue;
      cands.push({ fid, ratio, d, w: (ratio * ratio) / (1 + d / 150), betray: bound });
    }
    if (!cands.length) return;
    let pool = cands.filter(c => c.ratio >= need);
    if (!pool.length) {
      // personal gamble: aggressive kingdoms sometimes strike the weakest neighbour anyway
      if (Math.random() > 0.12 + 0.35 * P.militarism) return;
      pool = cands.filter(c => c.ratio >= 0.5).sort((a, b) => b.ratio - a.ratio).slice(0, 2);
      if (!pool.length) return;
    }
    const tot = pool.reduce((s, c) => s + c.w, 0);
    let roll = Math.random() * tot, chosen = pool[0];
    for (const c of pool) { roll -= c.w; if (roll <= 0) { chosen = c; break; } }
    this._betrayNext = !!chosen.betray;
    // formal declaration: sometimes issue a challenge and muster instead of
    // striking by surprise — the answer decides arranged war vs invasion
    try {
      const formalChance = 0.4;
      if (!chosen.betray && g.diplomacy && Math.random() < formalChance
        && g.diplomacy.challenge(this.owner, chosen.fid)) {
        return;
      }
    } catch { /* fall through to surprise */ }
    this.launch('invade', chosen.fid, avail.slice(0, sendable), hq);
  }

  pickBase(foe, kind) {
    const g = this.game;
    const bl = g.buildings.filter(b => b.owner === foe && !b.dead && b.type !== 'wall');
    if (!bl.length) return null;
    const hq = bl.find(b => b.type === 'hq');
    if (kind !== 'revenge' && hq && Math.random() < 0.6) return hq;
    return pick(bl);
  }

  launch(kind, foe, units, myHq, objectiveOverride = null) {
    const g = this.game;
    const fh = g.hqOf(foe);
    if (!fh || !units.length) return;
    const objective = objectiveOverride && !objectiveOverride.dead ? objectiveOverride : this.pickBase(foe, kind);
    if (!objective) return;
    const dx = myHq.x - fh.x, dz = myHq.z - fh.z, d = Math.hypot(dx, dz) || 1;
    const stage = g.findFreeSpot(fh.x + (dx / d) * 36, fh.z + (dz / d) * 36, 1.0);
    this.wave = {
      kind, foe, objective, stage, units: new Set(units), n0: units.length,
      p0: this.power(units) + 1, t0: g.time, phase: 'march',
      marchLimit: 50 + d / 4.2,
    };
    for (const u of units) this.orderTo(u, stage.x, stage.z, true);
    g.aiWarNote?.(this.owner, foe, 'invasion');
  }

  orderTo(u, x, z, attackMove) {
    const g = this.game;
    const st = CONFIG.units[u.type] || { radius: 0.75 };
    const spot = g.findFreeSpot(x + (Math.random() - 0.5) * 10, z + (Math.random() - 0.5) * 10, st.radius + 0.25, u);
    u.target = null; u.objective = null; u.harvestTarget = null; u.fireAnchor = null;
    u.tx = spot.x; u.tz = spot.z;
    u.hasOrder = true; u.attackMove = attackMove; u.holdPosition = false;
    u.path = null; u.repathT = 0; u.retreating = false;
  }

  endWave(reason) {
    const g = this.game, w = this.wave;
    if (!w) return;
    const stage = this.homeStage();
    for (const u of w.units) { if (!u.dead) this.orderTo(u, stage.x, stage.z, false); }
    this.waveCD = rand(this.P.waveGap[0], this.P.waveGap[1]);
    if (w.kind !== 'revenge') this.foeCD.set(w.foe, g.time + rand(150, 320));
    this.wave = null;
  }

  runWave(S) {
    const g = this.game, w = this.wave;
    for (const u of w.units) if (u.dead) w.units.delete(u);
    const alive = [...w.units];
    if (!this.isAlive(w.foe)) return this.endWave('foe fell');
    if (!alive.length) return this.endWave('wiped');
    if (this.power(alive) < w.p0 * 0.3) return this.endWave('losing');
    if (g.time - w.t0 > 480) return this.endWave('timeout');

    if (w.phase === 'march') {
      const near = alive.filter(u => Math.hypot(u.x - w.stage.x, u.z - w.stage.z) < 20).length;
      if (near >= alive.length * 0.65 || g.time - w.t0 > w.marchLimit) { w.phase = 'assault'; }
      else {
        for (const u of alive) if (!u.hasOrder && !u.target) this.orderTo(u, w.stage.x, w.stage.z, true);
        return;
      }
    }

    // ---- assault ----
    if (!w.objective || w.objective.dead) {
      // demolish raids end when the intruder structure falls — raiders go
      // home instead of escalating into a full invasion on their own
      if (w.kind === 'demolish') return this.endWave('cleared');
      w.objective = this.pickBase(w.foe, w.kind);
      if (!w.objective) return this.endWave('cleared');
    }
    for (const u of alive) {
      if (u.retreating) continue;
      if (u.objective && u.target && !u.target.dead) continue;           // engine is chewing through a wall
      const cur = u.target;
      if (cur && !cur.dead && cur.kind === 'unit') continue;              // already fighting a unit
      // building target: switch if enemy fighters are close
      const t = this.pickTarget(u, w);
      if (t && t !== cur) {
        u.target = t; u.hasOrder = false; u.attackMove = false; u.fireAnchor = null; u.path = null; u.holdPosition = false;
      }
    }
  }

  pickTarget(u, w) {
    const g = this.game, foe = w.foe;
    const nearTurret = () => {
      let best = null, bd = 24;
      g.eachBuildingNear(u.x, u.z, 24, (b) => {
        if (b.owner !== foe || b.type !== 'turret') return;
        const d = Math.hypot(b.x - u.x, b.z - u.z);
        if (d < bd) { bd = d; best = b; }
      });
      return best;
    };
    const nearFighter = () => {
      let best = null, bd = u.aggro + 4;
      g.eachNear(u.x, u.z, bd, (e) => {
        if (e.owner !== foe || e.dead || e.type === 'worker') return;
        const d = Math.hypot(e.x - u.x, e.z - u.z);
        if (d < bd) { bd = d; best = e; }
      });
      return best;
    };
    if (u.type === 'artillery') return nearTurret() || nearFighter() || w.objective;   // outranges turrets
    return nearFighter() || nearTurret() || w.objective;
  }
}

// One manager for all brains: staggered round-robin so only a few kingdoms
// think each frame (perf). Routes "you got hit" events to the VICTIM's brain
// only — brains never see each other's plans.
export class AIManager {
  constructor(game) {
    this.game = game;
    this.brains = [];
    this.byOwner = new Map();
    for (const id of game.aliveKingdoms()) {
      if (game.isHuman(id)) continue;
      const b = new KingdomBrain(game, id);
      this.brains.push(b);
      this.byOwner.set(id, b);
    }
    this.cursor = 0;
    this.perFrame = 3;
    this.status = 'Gathering…';
    this.warMsgT = 0;
    game.aiWarNote = (a, b, kind) => this.warNote(a, b, kind);
    game.onHit = (ent, attacker, amt) => this.byOwner.get(ent.owner)?.noteHit(attacker, ent, amt);
    // territory intrusion: only the VICTIM's brain hears (privacy kept).
    // Human side gets a throttled alert so the feed never floods.
    this._intrAlert = new Map();
    game.onIntrusion = (intruder, victim, building) => {
      this.byOwner.get(victim)?.noteIntrusion(intruder, building);
      const g = this.game;
      const key = `${intruder}>${victim}`;
      const last = this._intrAlert.get(key) ?? -1e9;
      if (g.time - last < 60) return; // one alert per pair per minute max
      this._intrAlert.set(key, g.time);
      if (g.isHuman(victim)) {
        g.hookMsg(`⚠️ ${g.players[intruder]?.name} is building ${building.type} in YOUR territory — destroy it!`);
      } else if (g.isHuman(intruder)) {
        g.hookMsg(`⚠️ You are building in ${g.players[victim]?.name}'s territory — expect retaliation!`);
      }
    };
  }

  warNote(a, b, kind) {
    const g = this.game;
    const now = g.time;
    const involvesHuman = g.isHuman(a) || g.isHuman(b);
    if (involvesHuman) {
      if (kind === 'invasion') g.hookMsg(`⚠️ ${g.players[a].name} invades ${g.isHuman(b) ? 'YOU' : g.players[b].name}!`);
      return;
    }
    // distant AI-vs-AI wars: rare flavor only
    if (now - this.warMsgT > 40 && kind === 'invasion') {
      this.warMsgT = now;
      g.hookMsg(`⚔️ ${g.players[a].name} marches on ${g.players[b].name}`);
    }
  }

  update(dt) {
    const g = this.game;
    if (g.over) return;
    let ran = 0;
    const n = this.brains.length;
    for (let i = 0; i < n && ran < this.perFrame; i++) {
      this.cursor = (this.cursor + 1) % n;
      const br = this.brains[this.cursor];
      if (!g.players[br.owner]?.alive) continue;
      br.thinkT -= dt;
      if (br.thinkT <= 0) {
        br.thinkT = br.thinkEvery;
        br.think();
        ran++;
      }
    }
    const alive = g.aliveKingdoms().length;
    const { rank } = g.playerRank();
    this.status = `🏰 ${alive}/${CONFIG.kingdoms} • rank #${rank}`;
  }
}

// Back-compat: old single-enemy import path (unused by new main).
export class EnemyAI {
  constructor(game) {
    this.mgr = new AIManager(game);
    this.status = 'Gathering…';
  }
  update(dt) { this.mgr.update(dt); this.status = this.mgr.status; }
}
