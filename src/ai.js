import { CONFIG } from './config.js';

// War of Crowns: one slow-paced brain per AI kingdom (29 of them).
// Each thinks independently on a staggered 2-4s tick: economy, defense,
// fortification, and — after a long peace — random raids/wars against
// randomly re-rolled rival kingdoms (usually another AI, sometimes you).

export class KingdomBrain {
  constructor(game, owner) {
    this.game = game;
    this.owner = owner;
    const A = CONFIG.ai;
    this.personality = {
      aggression: 0.25 + Math.random() * 0.35,   // deliberately slow
      greed: 0.4 + Math.random() * 0.5,
      targetWorkers: A.maxWorkers[0] + Math.floor(Math.random() * (A.maxWorkers[1] - A.maxWorkers[0] + 1)),
      wantArmy: A.maxArmy[0] + Math.floor(Math.random() * (A.maxArmy[1] - A.maxArmy[0] + 1)),
      harassEvery: A.harassEvery[0] + Math.random() * (A.harassEvery[1] - A.harassEvery[0]),
    };
    this.thinkEvery = A.thinkEvery[0] + Math.random() * (A.thinkEvery[1] - A.thinkEvery[0]);
    this.thinkT = Math.random() * this.thinkEvery; // stagger
    this.harassT = CONFIG.ai.peaceTime + Math.random() * 60;
    this.rivalT = 20 + Math.random() * 40;
    this.impatience = 0;
    this.foe = null;      // current rival kingdom id
    this.status = 'Gathering…';
  }

  ownedUnits(type) {
    return this.game.units.filter(u => u.owner === this.owner && !u.dead && (!type || u.type === type));
  }
  ownedBlds(type) {
    return this.game.buildings.filter(b => b.owner === this.owner && !b.dead && (!type || b.type === type));
  }
  power(list) {
    return list.reduce((s, u) => s + u.damage * (u.hp / u.maxHp) * (u.type === 'tank' ? 1.6 : 1), 0);
  }
  aliveRivals() {
    const g = this.game;
    return g.aliveKingdoms().filter(id => id !== this.owner);
  }

  pickRival(hq) {
    const rivals = this.aliveRivals();
    if (!rivals.length) { this.foe = null; return; }
    // nearest few kingdoms, usually another AI (keeps AI-vs-AI wars burning),
    // occasionally the human so pressure comes from random directions
    const byDist = rivals
      .map(id => ({ id, d: this.game.kingdomSpawns[this.game.players[id].idx]
        ? Math.hypot(this.game.kingdomSpawns[this.game.players[id].idx].x - hq.x,
                     this.game.kingdomSpawns[this.game.players[id].idx].z - hq.z) : 1e9 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    const nonHuman = byDist.filter(r => !this.game.isHuman(r.id));
    const pool = (nonHuman.length && Math.random() < 0.8) ? nonHuman : byDist;
    this.foe = pool[Math.floor(Math.random() * pool.length)].id;
  }

  foeHQ() {
    if (!this.foe || !this.game.players[this.foe]?.alive) return null;
    return this.game.hqOf(this.foe);
  }

  think() {
    const g = this.game;
    if (g.over) return;
    const P = this.personality;
    const workers = this.ownedUnits('worker');
    const army = this.game.units.filter(u => u.owner === this.owner && !u.dead && u.type !== 'worker');
    const hq = this.ownedBlds('hq')[0];
    const raxList = this.ownedBlds('barracks');
    if (!hq) { this.status = 'Fallen'; return; }

    // ---- rival re-roll (random wars) ----
    this.rivalT -= this.thinkEvery;
    if (!this.foe || this.rivalT <= 0 || !g.players[this.foe]?.alive) {
      this.rivalT = CONFIG.ai.rivalReroll[0] + Math.random() * (CONFIG.ai.rivalReroll[1] - CONFIG.ai.rivalReroll[0]);
      this.pickRival(hq);
    }

    // ---- 1. SURVIVAL: threat near base pulls army home ----
    const threat = g.nearestEnemy(hq.x, hq.z, this.owner, CONFIG.ai.defendRadius);
    if (threat && threat.owner !== this.owner) {
      this.status = 'Defending!';
      for (const u of army) {
        const dHome = Math.hypot(u.x - hq.x, u.z - hq.z);
        if (!u.target || u.target.dead || dHome > 34) {
          u.target = g.nearestEnemy(u.x, u.z, this.owner, 34) || threat;
          u.hasOrder = false; u.attackMove = false;
        }
      }
    } else {
      for (const u of army) {
        if (u.hp / u.maxHp < 0.28 && !u.retreating) {
          u.retreating = true;
          u.target = null; u.tx = hq.x + (Math.random() - 0.5) * 6; u.tz = hq.z + (Math.random() - 0.5) * 6;
          u.hasOrder = true; u.attackMove = false;
        } else if (u.retreating && u.hp / u.maxHp > 0.75) {
          u.retreating = false;
        }
      }
    }

    // ---- 2. ECONOMY: workers always harvesting ----
    for (const w of workers) {
      w.retreating = false;
      if ((!w.hasOrder && !w.harvestTarget && w.carrying === 0) || (w.harvestTarget && w.harvestTarget.dead)) {
        w.harvestTarget = g.nearestResource(w.x, w.z);
        w.returning = false;
      }
    }
    if (workers.length < P.targetWorkers && hq.queue.length < 1 && g.players[this.owner].crystals >= CONFIG.workerCost) {
      if (Math.random() < 0.35 + P.greed * 0.4) {
        g.trainUnit(hq, 'worker');
        this.status = 'Gathering…';
      }
    }

    // ---- 3. PRODUCTION: one barracks busy, slow mixed comp ----
    const rax = raxList[0];
    const scouts = this.ownedUnits('scout').length;
    if (rax && army.length + rax.queue.length < P.wantArmy && rax.queue.length < 1) {
      const rich = g.players[this.owner].crystals > 300;
      let type = 'soldier';
      const roll = Math.random();
      if (scouts < 1 && g.time > 120 && roll < 0.2) type = 'scout';
      else if ((rich || g.time > 600) && this.ownedUnits('tank').length < 2 && roll < 0.5) type = 'tank';
      else if (rich && g.time > 720 && this.ownedUnits('artillery').length < 1 && roll < 0.65) type = 'artillery';
      const cost = g.unitCost(type);
      if (g.players[this.owner].crystals >= cost) g.trainUnit(rax, type);
    }
    // turrets when threatened or rich
    const turrets = this.ownedBlds('turret').length;
    if (turrets < CONFIG.ai.maxTurrets && g.players[this.owner].crystals >= CONFIG.turretCost + 160 && (threat || g.players[this.owner].crystals > 450) && Math.random() < 0.25) {
      const spot = g.findFreeSpot(hq.x + (Math.random() - 0.5) * 16, hq.z + (Math.random() - 0.5) * 16, CONFIG.buildings.turret.size * 0.72);
      if (g.isSpotFree(spot.x, spot.z, CONFIG.buildings.turret.size * 0.72)) {
        g.buildTurret(this.owner, spot.x, spot.z);
        this.status = 'Fortifying…';
      }
    }
    // walls, capped
    const walls = this.ownedBlds('wall').length;
    if (walls < CONFIG.ai.maxWalls && g.players[this.owner].crystals >= CONFIG.wallCost * 4 + 160 && (threat || g.players[this.owner].crystals > 400) && Math.random() < 0.3) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 5;
      const wr = CONFIG.buildings.wall.size * 0.55;
      const spot = g.findFreeSpot(hq.x + Math.cos(ang) * dist, hq.z + Math.sin(ang) * dist, wr);
      if (g.isSpotFree(spot.x, spot.z, wr)) {
        g.buildWall(this.owner, spot.x, spot.z);
        this.status = 'Walling…';
      }
    }
    // slow second/third barracks once established (mid-game expansion)
    if (raxList.length < CONFIG.ai.maxBarracks && g.time > 600 && g.players[this.owner].crystals >= CONFIG.barracksCost + 140 && Math.random() < 0.2) {
      const fx = hq.x + (Math.random() - 0.5) * 24, fz = hq.z + (Math.random() - 0.5) * 24;
      const spot = g.findFreeSpot(fx, fz, CONFIG.buildings.barracks.size * 0.72);
      if (g.isSpotFree(spot.x, spot.z, CONFIG.buildings.barracks.size * 0.72)) {
        g.buildBarracks(this.owner, spot.x, spot.z);
        this.status = 'Expanding…';
      }
    } else if (!rax && g.players[this.owner].crystals >= CONFIG.barracksCost) {
      g.buildBarracks(this.owner, hq.x - 9, hq.z - 1);
    }

    // ---- 4. HARASS: tiny raids vs the current rival (only after peace) ----
    this.harassT -= this.thinkEvery;
    if (g.time > CONFIG.ai.peaceTime && this.harassT <= 0 && army.length >= 3 && !threat) {
      this.harassT = P.harassEvery * (0.7 + Math.random() * 0.6);
      if (Math.random() < 0.35 + P.aggression * 0.5) {
        const raiders = army.filter(u => !u.retreating).slice(0, 1 + Math.floor(Math.random() * 2));
        const foeWorkers = g.units.filter(u => u.owner === this.foe && !u.dead && u.type === 'worker');
        const tgt = foeWorkers[Math.floor(Math.random() * foeWorkers.length)] || (this.foe ? g.hqOf(this.foe) : null);
        if (tgt && raiders.length) {
          for (const u of raiders) { u.target = tgt; u.hasOrder = false; u.attackMove = false; u.fireAnchor = null; }
          this.status = `Raiding ${g.players[this.foe]?.name || ''}…`;
          g.aiWarNote(this.owner, this.foe, 'raid');
        }
      }
    }

    // ---- 5. COMMIT: slow all-in, needs a real army + clear superiority ----
    this.impatience += this.thinkEvery / CONFIG.ai.impatienceMax;
    const foeArmy = this.foe ? g.units.filter(u => u.owner === this.foe && !u.dead && u.type !== 'worker') : [];
    const ratio = (this.power(army) + 1) / (this.power(foeArmy) + 1);
    const shouldPush = !threat && this.foe && army.length >= 8 &&
      (ratio > 1.6 || this.impatience > 0.9 + Math.random() * 0.2);
    if (shouldPush) {
      this.impatience = 0;
      const target = this.foeHQ() || foeArmy[0];
      if (target) {
        for (const u of army) {
          if (u.retreating) continue;
          u.target = target; u.hasOrder = false; u.attackMove = false; u.fireAnchor = null;
        }
        this.status = `Invading ${g.players[this.foe]?.name || ''}!`;
        g.aiWarNote(this.owner, this.foe, 'invasion');
      }
    } else if (!threat) {
      if (army.length >= 4) this.status = `Mustering (${army.length})…`;
      else if (workers.length < P.targetWorkers) this.status = 'Gathering…';
      else this.status = 'Scouting…';
    }
  }
}

// One manager for all 29 brains: staggered round-robin so only a few
// kingdoms think each frame (perf), plus throttled war announcements.
export class AIManager {
  constructor(game) {
    this.game = game;
    this.brains = [];
    for (const id of game.aliveKingdoms()) {
      if (!game.isHuman(id)) this.brains.push(new KingdomBrain(game, id));
    }
    this.cursor = 0;
    this.perFrame = 3;
    this.status = 'Gathering…';
    this.warMsgT = 0;
    game.aiWarNote = (a, b, kind) => this.warNote(a, b, kind);
  }

  warNote(a, b, kind) {
    const g = this.game;
    const now = g.time;
    const involvesHuman = g.isHuman(a) || g.isHuman(b);
    if (involvesHuman) {
      if (kind === 'invasion') g.hookMsg(`⚠️ ${g.players[a].name} invades ${g.isHuman(b) ? 'YOU' : g.players[b].name}!`);
      else if (g.isHuman(b)) g.hookMsg(`⚔️ ${g.players[a].name} raids your lands!`);
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
