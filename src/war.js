import { WAR, PERSONALITY_WAR, LORDS } from './config.js';

// README-2 § War declaration (no timer): each brain checks readiness
// every ~10s and declares war only when every gate passes.

export function styleOf(ownerIdx) {
  const styles = ['paranoid', 'merchant', 'warlord', 'tech', 'grudge'];
  if (ownerIdx === 0) return 'player';
  return styles[(ownerIdx - 1) % styles.length];
}

export function thresholdsFor(style) {
  const p = PERSONALITY_WAR[style] || PERSONALITY_WAR.grudge;
  return {
    minFort: p.minFort,
    powerRatio: p.powerRatio,
    reserveMul: p.reserveMul,
    maxWars: p.maxWars,
  };
}

export function warReadiness(game, brain) {
  const th = thresholdsFor(brain.warStyle || styleOf(brain.ownerIdx ?? 1));
  const S = brain._lastS;
  const g = {
    defence: (brain.fortCompletion?.() ?? 1) >= Math.min(th.minFort, WAR.minFort) &&
      (brain.towerCount?.() ?? 99) >= 2 &&
      homeGuardOk(brain),
    army: strikePower(brain) >= th.powerRatio * estimateTarget(game, brain, brain.bestTarget) &&
      strikeUnits(brain) >= 4,
    resources: canAffordReserve(game, brain, th) && netIncome(game, brain) > 0,
    supply: foodIncome(game, brain) >= upkeepWithStrike(game, brain),
    rested: (game.time ?? 0) >= (brain.warCooldownUntil || 0),
    grown: buildingCount(game, brain) >= WAR.minBuildings,
  };
  // README floor values also apply
  g.defence = g.defence || ((brain.fortCompletion?.() ?? 1) >= WAR.minFort);
  return { ready: Object.values(g).every(Boolean), gates: g, th };
}

function homeGuardOk(brain) {
  const army = brain._lastS?.army?.length || 10;
  const strike = strikeUnits(brain);
  return army - strike >= Math.ceil(army * WAR.homeGuardFraction);
}

function strikeUnits(brain) {
  return brain._strikeN ?? 8;
}

function strikePower(brain) {
  return brain._strikePower ?? 50;
}

function estimateTarget(game, brain, target) {
  if (target == null) return 40;
  try {
    return brain.foeStrength ? brain.foeStrength(target) : 40;
  } catch { return 40; }
}

function canAffordReserve(game, brain, th) {
  const pl = game.players[brain.owner];
  if (!pl) return false;
  const r = WAR.reserve;
  const bank = (k) => (k === 'wood' ? (pl.wood ?? pl.logs ?? 0) : (k === 'crystal' ? (pl.crystal ?? pl.logs ?? 0) : (pl[k] ?? 0)));
  return bank('food') >= r.food * th.reserveMul * 0.5 &&
    bank('wood') >= r.wood * th.reserveMul * 0.5 &&
    bank('stone') >= (r.stone || 0) * th.reserveMul * 0.5;
}

function netIncome(game, brain) {
  return (brain._income ?? 1);
}

function foodIncome(game, brain) {
  const mills = (brain._mills ?? 0);
  return mills * 0.5 + 0.2;
}

function upkeepWithStrike(game, brain) {
  const army = brain._lastS?.army?.length || 10;
  return army * 0.04 + 1;
}

function buildingCount(game, brain) {
  let n = 0;
  for (const b of game.buildings) if (b.owner === brain.owner && !b.dead) n++;
  return n;
}

export function chooseTarget(game, brain, candidates) {
  // score: grudge+ / weak+ / close+ / shard+ / leader+ / walled- / allied excluded
  let best = null, bs = -1e9;
  const hq = game.hqOf(brain.owner);
  const order = [...(game.aliveKingdoms?.() || [])].sort((a, b) => (game.powerOf?.(b) || 0) - (game.powerOf?.(a) || 0));
  const leader = order[0];
  for (const fid of candidates) {
    if (fid === brain.owner) continue;
    if (game.diplomacy?.isAllied(brain.owner, fid)) continue;
    if (game.diplomacy?.underCeasefire(brain.owner, fid)) continue;
    const fh = game.hqOf(fid);
    if (!fh) continue;
    const grudge = brain.grudges?.get(fid)?.anger || 0;
    const est = estimateTarget(game, brain, fid);
    const weak = 60 / (est + 1);
    const d = hq ? Math.hypot(fh.x - hq.x, fh.z - hq.z) : 200;
    const close = 40 / (1 + d / 100);
    const shard = (game.players[fid]?.shards || 0) * 4;
    const isLeader = fid === leader ? 8 : 0;
    const walls = -(brain.foeWalls?.(fid) || 0) * 0.5;
    const s = grudge * 3 + weak + close + shard + isLeader + walls;
    if (s > bs) { bs = s; best = fid; }
  }
  return best;
}

export function intelStatus(game, brain) {
  // "Peaceful" | "Building up" | "Mustering" | "At war"
  if (brain.wave) return 'At war';
  if ((brain._lastS?.army?.length || 0) >= 8) return 'Mustering';
  if (buildingCount(game, brain) >= 10) return 'Building up';
  return 'Peaceful';
}

export function lordName(ownerIdx) {
  if (ownerIdx === 0) return 'You';
  return LORDS[(ownerIdx - 1) % LORDS.length]?.name || `Kingdom ${ownerIdx}`;
}

// Patch live brains: overlay personality styles + readiness gate on launch.
export function installWar(game, ai) {
  if (!ai?.brains) return;
  ai.brains.forEach((br, i) => {
    const idx = parseInt(String(br.owner).slice(1)) || (i + 1);
    br.ownerIdx = idx;
    br.warStyle = styleOf(idx);
    br.lord = lordName(idx);
    const th = thresholdsFor(br.warStyle);
    // personality tunes thresholds (replaces fixed timeline)
    if (br.P) {
      br.P.fortReady = th.minFort;
      br.P.attackRatio = th.powerRatio;
      br.P.maxWars = th.maxWars;
      br.P.readyAt = 0; // no timer — readiness gates only
    }
    br.warCooldownUntil = 0;
    br.activeWars = 0;
    const rawLaunch = br.launch?.bind(br);
    if (rawLaunch) {
      br.launch = (kind, foe, units, myHq, objectiveOverride = null) => {
        if ((br.activeWars || 0) >= th.maxWars) return;
        // early guard: no day-one rushes (readiness gate, not a timer)
        if (buildingCount(game, br) < WAR.minBuildings && kind !== 'revenge') return;
        // pact-bound target? this is betrayal — pay mobilization or stand down.
        // (challenged windows break free; alliances/ceasefires cost the fee.)
        const pact = game.diplomacy?.get(br.owner, foe)?.type;
        const pactBound = pact === 'alliance' || pact === 'ceasefire' || pact === 'challenged';
        br._betrayNext = false;
        if (pactBound) {
          if (!game.diplomacy || !game.diplomacy.betray(br.owner, foe)) return; // cannot pay
        } else {
          game.diplomacy?.declareWar(br.owner, foe);
        }
        br.activeWars = (br.activeWars || 0) + 1;
        rawLaunch(kind, foe, units, myHq, objectiveOverride);
      };
    }
    const rawEnd = br.endWave?.bind(br);
    if (rawEnd) {
      br.endWave = (reason) => {
        br.activeWars = Math.max(0, (br.activeWars || 0) - 1);
        if (reason === 'losing' || reason === 'wiped') {
          br.warCooldownUntil = game.time + WAR.cooldownSec;
          // total war never ends in negotiation — brief regroup, then back in
          const foe = br.wave?.foe;
          if (foe && game.diplomacy?.isTotalWar?.(br.owner, foe)) {
            br.warCooldownUntil = game.time + 20;
          } else if (foe && !game.diplomacy?.ceasefire(br.owner, foe, 10, br.owner)) {
            // sue for peace: paid ceasefire if affordable, else a free truce
            game.diplomacy?.truce(br.owner, foe);
          }
        }
        rawEnd(reason);
      };
    }
    br.fortCompletion = br.fortCompletion || (() => br.fortProgress?.() ?? 1);
    br.towerCount = br.towerCount || (() => {
      let n = 0;
      for (const b of game.buildings) if (b.owner === br.owner && !b.dead && (b.type === 'turret' || b.type === 'tower')) n++;
      return n;
    });
  });
}
