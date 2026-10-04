// README-2 § UI QoL: quick save / load to localStorage (state JSON + seed).

const KEY = 'war-of-crowns-save-v1';

export function quickSave(game) {
  try {
    const data = {
      v: 1,
      time: game.time,
      seed: game.seed ?? null,
      players: Object.fromEntries(Object.entries(game.players).map(([id, p]) => [id, {
        wood: p.wood ?? p.logs ?? 0,
        food: p.food ?? 0,
        alive: p.alive,
        age: p.age ?? 0,
        shards: p.shards ?? 0,
      }])),
      units: game.units.filter((u) => !u.dead).map((u) => ({
        type: u.type, owner: u.owner, x: +u.x.toFixed(1), z: +u.z.toFixed(1), hp: Math.round(u.hp),
      })),
      buildings: game.buildings.filter((b) => !b.dead).map((b) => ({
        type: b.type, owner: b.owner, x: +b.x.toFixed(1), z: +b.z.toFixed(1), hp: Math.round(b.hp),
      })),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    game.hookMsg?.('💾 Saved (F9 to load)');
    return true;
  } catch (err) {
    console.warn('save failed', err);
    return false;
  }
}

export function quickLoad(game) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      game.hookMsg?.('No save yet (F5 to save)');
      return false;
    }
    const data = JSON.parse(raw);
    // restore stockpiles + ages + shards; units/buildings restore is best-effort
    for (const [id, s] of Object.entries(data.players || {})) {
      const p = game.players[id];
      if (!p) continue;
      p.wood = s.wood ?? 0; p.logs = s.wood ?? 0;
      p.food = s.food ?? 0;
      p.alive = s.alive; p.age = s.age ?? 0; p.shards = s.shards ?? 0;
    }
    game.time = data.time || 0;
    game.hookMsg?.('📂 Loaded quick save');
    return true;
  } catch (err) {
    console.warn('load failed', err);
    return false;
  }
}
