import { WORLD_EVENTS } from './config.js';

// README-2 § World events. Random spacing, never targets only the player.

export const EVENTS = [
  { id: 'winter', name: 'Harsh Winter', desc: 'Food production -40% for 3 min', dur: 180 },
  { id: 'plague', name: 'Plague', desc: 'Random kingdom loses 20% workers', dur: 0 },
  { id: 'harvest', name: 'Good Harvest', desc: 'Farms produce +50% for 3 min', dur: 180 },
  { id: 'dragon', name: 'Dragon Sighting', desc: 'A neutral dragon attacks a random base', dur: 0 },
  { id: 'rebellion', name: 'Rebellion', desc: 'A big kingdom spawns rebels inside its base', dur: 0 },
  { id: 'fair', name: 'Merchant Fair', desc: 'Market caravans earn x2 for 2 min', dur: 120 },
  { id: 'quake', name: 'Earthquake', desc: 'Walls in one region lose 30% HP, new rocks appear', dur: 0 },
];

export class WorldEvents {
  constructor(game) {
    this.game = game;
    this.nextAt = game.time + rand(WORLD_EVENTS.minGapSec, WORLD_EVENTS.maxGapSec);
    this.active = []; // { event, until }
  }

  update(dt) {
    const g = this.game;
    if (g.over) return;
    // expire timed modifiers
    this.active = this.active.filter((a) => g.time < a.until);
    if (g.time >= this.nextAt) {
      this.fire();
      this.nextAt = g.time + rand(WORLD_EVENTS.minGapSec, WORLD_EVENTS.maxGapSec);
    }
  }

  modifier(id) {
    return this.active.find((a) => a.event.id === id);
  }

  fire() {
    const g = this.game;
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    const alive = g.aliveKingdoms();
    if (!alive.length) return;
    // never single out the human: pick uniformly at random
    const victim = alive[Math.floor(Math.random() * alive.length)];
    applyEvent(g, ev, victim);
    g.hookMsg?.(`🌍 ${ev.name} — ${ev.desc}`);
    if (ev.dur) this.active.push({ event: ev, until: g.time + ev.dur });
  }
}

function applyEvent(g, ev, victim) {
  switch (ev.id) {
    case 'plague': {
      let killed = 0;
      for (const u of g.units) {
        if (u.owner === victim && u.type === 'worker' && !u.dead && Math.random() < 0.2) {
          u.dead = true; killed++;
          g.removeUnitMesh?.(u);
        }
      }
      break;
    }
    case 'quake': {
      const hq = g.hqOf(victim);
      if (!hq) break;
      for (const b of g.buildings) {
        if (b.dead || b.type !== 'wall') continue;
        if (Math.hypot(b.x - hq.x, b.z - hq.z) < 80) b.hp *= 0.7;
      }
      break;
    }
    case 'rebellion': {
      const hq = g.hqOf(victim);
      if (!hq || !g.spawnUnit) break;
      for (let i = 0; i < 6; i++) {
        g.spawnUnit('soldier', 'rebels', hq.x + (Math.random() - 0.5) * 20, hq.z + (Math.random() - 0.5) * 20);
      }
      break;
    }
    default:
      break; // winter/harvest/fair/dragon are modifiers / flavour
  }
}

const rand = (a, b) => a + Math.random() * (b - a);
