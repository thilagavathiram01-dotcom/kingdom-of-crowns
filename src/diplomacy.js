// README-2 § Diplomacy and AI: ceasefire, alliance, tribute, betrayal.
// Relations are per-pair, private to the two brains involved.
// All logistics run on WOOD + FOOD (no counts, no gold).

import { DIPLO, WAR_CHALLENGE } from './config.js';

export class Diplomacy {
  constructor(game) {
    this.game = game;
    // key "a|b" (sorted) -> { type: 'war' | 'ceasefire' | 'alliance', until }
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

  atPeace(a, b) {
    const t = this.get(a, b).type;
    return t === 'alliance' || t === 'ceasefire' || t === 'challenged';
  }

  isTotalWar(a, b) {
    const r = this.get(a, b);
    return r.type === 'war' && !!r.totalWar;
  }

  // the foe this kingdom is locked in total war with (or null)
  totalWarWith(owner) {
    for (const [k, r] of this.relations) {
      if (r?.type === 'war' && r.totalWar) {
        const [a, b] = k.split('|');
        if (a === owner) return b;
        if (b === owner) return a;
      }
    }
    return null;
  }

  bankOf(id) {
    const p = this.game.players[id] || {};
    return {
      wood: p.wood ?? p.logs ?? 0,
      food: p.food ?? p.logs ?? 0,
    };
  }

  canPay(id, cost) {
    const b = this.bankOf(id);
    return Object.entries(cost || {}).every(([k, v]) => (b[k] ?? 0) >= v);
  }

  // charge wood+food; mirrors wood<->logs where both banks exist
  pay(id, cost) {
    if (!this.canPay(id, cost)) return false;
    const p = this.game.players[id];
    for (const [k, v] of Object.entries(cost || {})) {
      if (p[k] !== undefined) p[k] -= v;
      else if (p.logs !== undefined) p.logs -= v;
    }
    if (p.wood !== undefined && p.logs !== undefined) p.logs = p.wood;
    return true;
  }

  name(id) {
    return this.game.players[id]?.name || id;
  }

  declareWar(a, b) {
    const keepTotal = this.get(a, b).totalWar; // re-mustering must not end total war
    this.relations.set(this.key(a, b), { type: 'war', until: 0, totalWar: !!keepTotal });
    this.game.hookMsg?.(`⚔️ ${this.name(a)} declared war on ${this.name(b)}`);
    if (this.game.isHuman?.(b)) this.game.warHorn?.();
    return true;
  }

  // Paid ceasefire: payer buys `minutes` of peace for the PAIR.
  ceasefire(a, b, minutes = DIPLO.ceasefire.minutes, payer = a) {
    const cost = { wood: DIPLO.ceasefire.wood, food: DIPLO.ceasefire.food };
    if (!this.pay(payer, cost)) {
      if (this.game.isHuman?.(payer)) {
        this.game.hookMsg?.(`🕊️ Ceasefire needs ${cost.wood}🪵 ${cost.food}🌾 — not enough stockpiled`);
      }
      return false;
    }
    this.relations.set(this.key(a, b), { type: 'ceasefire', until: this.game.time + minutes * 60 });
    this.game.hookMsg?.(`🕊️ Ceasefire: ${this.name(a)} ↔ ${this.name(b)} (${minutes} min, paid ${cost.wood}🪵 ${cost.food}🌾 by ${this.name(payer)})`);
    return true;
  }

  // Free short truce for a broke loser (no logistics, short peace).
  truce(a, b, minutes = DIPLO.truceMinutes) {
    this.relations.set(this.key(a, b), { type: 'ceasefire', until: this.game.time + minutes * 60 });
    this.game.hookMsg?.(`🕊️ Truce: ${this.name(a)} ↔ ${this.name(b)} (${minutes} min)`);
    return true;
  }

  // Paid alliance: permanent, shared vision, no targeting between the pair.
  ally(a, b, payer = a) {
    const cost = { wood: DIPLO.alliance.wood, food: DIPLO.alliance.food };
    if (this.atPeace(a, b)) return true; // already pact-bound
    if (!this.pay(payer, cost)) {
      if (this.game.isHuman?.(payer)) {
        this.game.hookMsg?.(`🤝 Alliance needs ${cost.wood}🪵 ${cost.food}🌾 — not enough stockpiled`);
      }
      return false;
    }
    this.relations.set(this.key(a, b), { type: 'alliance', until: Infinity });
    this.game.hookMsg?.(`🤝 Alliance: ${this.name(a)} ↔ ${this.name(b)} (shared vision, paid ${cost.wood}🪵 ${cost.food}🌾 by ${this.name(payer)})`);
    return true;
  }

  // Betrayal: break a pact for a mobilization fee. The victim holds a grudge.
  betray(a, b) {
    const rel = this.get(a, b).type;
    if (rel !== 'alliance' && rel !== 'ceasefire') {
      return this.declareWar(a, b); // no pact — plain declaration
    }
    const cost = { wood: DIPLO.betray.wood, food: DIPLO.betray.food };
    if (!this.pay(a, cost)) {
      if (this.game.isHuman?.(a)) {
        this.game.hookMsg?.(`🔪 Betrayal needs ${cost.wood}🪵 ${cost.food}🌾 mobilization — stockpile first`);
      }
      return false;
    }
    this.relations.set(this.key(a, b), { type: 'war', until: 0 });
    // victim's brain takes it personally (revenge waves follow)
    try {
      this.game.aiBrains?.get(b)?.noteHit?.(a, { type: 'hq' }, 600);
    } catch { /* ignore */ }
    this.game.hookMsg?.(`🔪 ${this.name(a)} BETRAYED ${this.name(b)}! (mobilized ${cost.wood}🪵 ${cost.food}🌾)`);
    if (this.game.isHuman?.(b)) this.game.warHorn?.();
    return true;
  }

  // Tribute: `to` pays wood+food to `from` (extortion income).
  demandTribute(from, to, cost = DIPLO.tribute) {
    const g = this.game;
    const pl = g.players[to];
    if (!pl) return false;
    const wood = pl.wood ?? pl.logs ?? 0;
    const food = pl.food ?? pl.logs ?? 0;
    if (wood < (cost.wood || 0) || food < (cost.food || 0)) return false;
    if (pl.wood !== undefined) pl.wood -= cost.wood || 0; else pl.logs -= cost.wood || 0;
    if (pl.food !== undefined) pl.food -= cost.food || 0; else pl.logs -= cost.food || 0;
    const recv = g.players[from];
    if (recv) {
      if (recv.wood !== undefined) recv.wood += cost.wood || 0; else recv.logs = (recv.logs || 0) + (cost.wood || 0);
      if (recv.food !== undefined) recv.food += cost.food || 0;
    }
    if (pl.wood !== undefined && pl.logs !== undefined) pl.logs = pl.wood;
    if (recv?.wood !== undefined && recv?.logs !== undefined) recv.logs = recv.wood;
    g.hookMsg?.(`💰 ${this.name(to)} paid tribute to ${this.name(from)} (${cost.wood || 0}🪵 ${cost.food || 0}🌾)`);
    return true;
  }

  // Buy peace: payer sends tribute AND the pair gets a ceasefire.
  offerTribute(from, to) {
    if (!this.demandTribute(to, from)) {
      if (this.game.isHuman?.(from)) {
        this.game.hookMsg?.(`💰 Tribute needs ${DIPLO.tribute.wood}🪵 ${DIPLO.tribute.food}🌾 — not enough stockpiled`);
      }
      return false;
    }
    this.relations.set(this.key(from, to), { type: 'ceasefire', until: this.game.time + DIPLO.ceasefire.minutes * 60 });
    this.game.hookMsg?.(`🕊️ ${this.name(to)} accepts tribute — ceasefire ${DIPLO.ceasefire.minutes} min`);
    return true;
  }

  // ---- formal war declarations (mutual approval) ----
  // Free to issue, at any time. Freezes fighting between the pair while both
  // sides muster in war formation. Answer with answerChallenge().
  challenge(challenger, target) {
    if (challenger === target) return false;
    const cur = this.get(challenger, target);
    // no ceremony twice, no challenging through an active pact — break it
    // (Betray) or wait it out first
    if (cur.type === 'challenged' && !cur.decided) return false;
    if (cur.type === 'alliance') {
      if (this.game.isHuman?.(challenger)) {
        this.game.hookMsg?.(`⚔️ Break the alliance first (Betray) — honor demands it`);
      }
      return false;
    }
    if (cur.type === 'ceasefire' && this.game.time < cur.until) {
      if (this.game.isHuman?.(challenger)) {
        this.game.hookMsg?.(`⚔️ Honor the ceasefire first — or Betray it`);
      }
      return false;
    }
    this.relations.set(this.key(challenger, target), {
      type: 'challenged', challenger, target,
      until: this.game.time + WAR_CHALLENGE.answerSec,
      decided: false,
    });
    this.game.hookMsg?.(`⚔️ ${this.name(challenger)} DECLARES WAR on ${this.name(target)}! Both kingdoms muster — answer within ${WAR_CHALLENGE.answerSec}s!`);
    if (this.game.isHuman?.(challenger) || this.game.isHuman?.(target)) this.game.warHorn?.();
    try { this.game.onChallenge?.(challenger, target); } catch { /* ignore */ }
    return true;
  }

  pendingChallenge(a, b) {
    const r = this.get(a, b);
    if (r.type !== 'challenged' || r.decided) return null;
    if (this.game.time >= r.until) return { ...r, expired: true };
    return r;
  }

  // target answers: accept = arranged total war; reject/expired = the
  // challenger invades anyway (surprise attack on a warned defender).
  answerChallenge(target, accept) {
    const pair = [this._challengerOf(target), target];
    const r = this.get(pair[0], pair[1]);
    if (!r || r.type !== 'challenged' || r.decided) return false;
    r.decided = true;
    const challenger = r.challenger;
    if (accept) {
      this.relations.set(this.key(challenger, target), { type: 'war', until: 0, totalWar: true });
      this.game.hookMsg?.(`⚔️ ${this.name(target)} ACCEPTS! Total war — fight until one kingdom falls!`);
      if (this.game.isHuman?.(challenger) || this.game.isHuman?.(target)) this.game.warHorn?.();
      try { this.game.onWarAccepted?.(challenger, target); } catch { /* ignore */ }
    } else {
      this.relations.set(this.key(challenger, target), { type: 'war', until: 0, totalWar: false });
      this.game.hookMsg?.(`🚨 ${this.name(target)} REJECTS the challenge — ${this.name(challenger)} invades anyway!`);
      if (this.game.isHuman?.(challenger) || this.game.isHuman?.(target)) this.game.warHorn?.();
      try { this.game.onWarRejected?.(challenger, target); } catch { /* ignore */ }
    }
    return true;
  }

  _challengerOf(target) {
    for (const [, r] of this.relations) {
      if (r?.type === 'challenged' && !r.decided && r.target === target) return r.challenger;
    }
    return null;
  }

  challengeFor(target) {
    for (const [, r] of this.relations) {
      if (r?.type === 'challenged' && !r.decided && r.target === target) {
        if (this.game.time < r.until) return r;
      }
    }
    return null;
  }

  // sweep expired challenges (no answer = rejection → challenger invades)
  update() {
    for (const [k, r] of [...this.relations]) {
      if (r?.type === 'challenged' && !r.decided && this.game.time >= r.until) {
        this.answerChallenge(r.target, false);
      }
      void k;
    }
  }
}
