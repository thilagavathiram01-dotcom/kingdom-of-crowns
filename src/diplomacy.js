// README-2 § Diplomacy and AI: ceasefire, alliance, tribute.
// Relations are per-pair, private to the two brains involved.

export class Diplomacy {
  constructor(game) {
    this.game = game;
    // key "a|b" (sorted) -> { type: 'war' | 'peace' | 'ceasefire' | 'alliance', until }
    this.relations = new Map();
  }

  key(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  get(a, b) {
    if (a === b) return { type: 'alliance', until: Infinity };
    return this.relations.get(this.key(a, b)) || { type: 'war', until: 0 };
  }

  isAllied(a, b) {
    return this.get(a, b).type === 'alliance';
  }

  underCeasefire(a, b) {
    const r = this.get(a, b);
    if (r.type !== 'ceasefire') return false;
    if (this.game.time >= r.until) {
      this.relations.delete(this.key(a, b));
      return false;
    }
    return true;
  }

  declareWar(a, b) {
    this.relations.set(this.key(a, b), { type: 'war', until: 0 });
    this.game.hookMsg?.(`⚔️ ${this.game.players[a]?.name} declared war on ${this.game.players[b]?.name}`);
    if (this.game.isHuman?.(b)) this.game.warHorn?.();
  }

  ceasefire(a, b, minutes = 10) {
    this.relations.set(this.key(a, b), { type: 'ceasefire', until: this.game.time + minutes * 60 });
    this.game.hookMsg?.(`🕊️ Ceasefire: ${this.game.players[a]?.name} ↔ ${this.game.players[b]?.name} (${minutes} min)`);
  }

  ally(a, b) {
    this.relations.set(this.key(a, b), { type: 'alliance', until: Infinity });
    this.game.hookMsg?.(`🤝 Alliance: ${this.game.players[a]?.name} ↔ ${this.game.players[b]?.name} (shared vision)`);
  }

  betray(a, b) {
    this.declareWar(a, b);
    this.game.hookMsg?.(`🔪 ${this.game.players[a]?.name} betrayed ${this.game.players[b]?.name}!`);
  }

  // Embassy tribute: pay gold for a ceasefire; AI may break it if you look weak
  demandTribute(from, to, gold) {
    const g = this.game;
    const pl = g.players[to];
    if ((pl.gold || 0) >= gold) {
      pl.gold -= gold;
      g.players[from].gold = (g.players[from].gold || 0) + gold;
      return true;
    }
    return false;
  }
}
