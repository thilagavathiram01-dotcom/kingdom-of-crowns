import { CONFIG } from './config.js';
import { icon } from './icons.js';

const UNIT_META = {
  worker: { name: 'Worker', icon: 'worker', cost: () => CONFIG.workerCost, desc: 'Gather, build, mill (50 food)' },
  soldier: { name: 'Soldier', icon: 'soldier', cost: () => CONFIG.soldierCost, desc: 'Core fighter' },
  swordsman: { name: 'Swordsman', icon: 'soldier', cost: () => 60, desc: 'Frontline · 60 food + 20 crystal' },
  spearman: { name: 'Spearman', icon: 'spear', cost: () => 50, desc: 'Anti-cavalry ×1.5 vs Knight' },
  archer: { name: 'Archer', icon: 'archer', cost: () => 55, desc: 'Ranged ×1.5 vs infantry' },
  knight: { name: 'Knight', icon: 'knight', cost: () => 110, desc: 'Fast heavy ×1.5 vs Archer' },
  scout: { name: 'Scout', icon: 'scout', cost: () => CONFIG.scoutCost, desc: 'Fast, huge sight · intel' },
  healer: { name: 'Healer', icon: 'healer', cost: () => 60, desc: 'Heals nearby (Temple)' },
  catapult: { name: 'Catapult', icon: 'artillery', cost: () => 150, desc: 'Siege vs walls/towers' },
  ram: { name: 'Ram', icon: 'ram', cost: () => 100, desc: 'Gate breaker, 200 HP' },
  spy: { name: 'Spy', icon: 'scout', cost: () => 100, desc: 'Reveals enemy, sabotage' },
  tank: { name: 'Tank', icon: 'tank', cost: () => CONFIG.tankCost, desc: 'Heavy armor' },
  hero_king: { name: 'The King/Queen', icon: 'crown', cost: () => 400, desc: 'Rally Cry: +20% speed & damage (Age II)' },
  hero_champion: { name: 'The Champion', icon: 'shield', cost: () => 400, desc: 'Shield Wall: -30% damage (Age II)' },
  hero_archmage: { name: 'The Archmage', icon: 'archer', cost: () => 450, desc: 'Crystal Storm area damage (Age IV)' },
  artillery: { name: 'Artillery', icon: 'artillery', cost: () => CONFIG.artilleryCost, desc: 'Long-range splash' },
  brute: { name: 'Brute', icon: 'brute', cost: () => CONFIG.bruteCost, desc: 'Caveman club brawler' },
  hunter: { name: 'Hunter', icon: 'hunter', cost: () => CONFIG.hunterCost, desc: 'Caveman spear thrower' },
};
const BLD_META = {
  barracks: { name: 'Barracks', icon: 'barracks', cost: () => CONFIG.barracksCost },
  turret: { name: 'Turret', icon: 'turret', cost: () => CONFIG.turretCost },
  tower: { name: 'Watchtower', icon: 'turret', cost: () => 120 },
  wall: { name: 'Wall', icon: 'wall', cost: () => CONFIG.wallCost },
  house: { name: 'House', icon: 'home', cost: () => 40 },
  farm: { name: 'Farm', icon: 'farm', cost: () => 50 },
  mill: { name: 'Mill', icon: 'mill', cost: () => 100 },
  lumber: { name: 'Lumber Camp', icon: 'harvest', cost: () => 40 },
  quarry: { name: 'Quarry', icon: 'quarry', cost: () => 50 },
  depot: { name: 'Crystal Depot', icon: 'harvest', cost: () => 60 },
  archery: { name: 'Archery Range', icon: 'archer', cost: () => 130 },
  stable: { name: 'Stable', icon: 'knight', cost: () => 200 },
  siege: { name: 'Siege Workshop', icon: 'artillery', cost: () => 320 },
  smith: { name: 'Blacksmith', icon: 'shield', cost: () => 160 },
  temple: { name: 'Temple', icon: 'healer', cost: () => 160 },
  market: { name: 'Market', icon: 'gold', cost: () => 150 },
  embassy: { name: 'Embassy', icon: 'home', cost: () => 150 },
  wonder: { name: 'Crown Hall', icon: 'crown', cost: () => 1000 },
};

function buzz(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ }
}

export class HUD {
  constructor(game, ai) {
    this.game = game;
    this.ai = ai;
    this.activeTab = 'units';
    document.querySelectorAll('[data-ric]').forEach(el => { el.innerHTML = icon(el.dataset.ric); });
    this.elCrystal = document.getElementById('res-crystal');
    this.elSupply = document.getElementById('res-supply');
    this.elTime = document.getElementById('game-time');
    this.elAI = document.getElementById('ai-status');
    this.elSel = document.getElementById('selection-info');
    this.elBuildWrap = document.getElementById('build-menu');
    this.elBuild = document.getElementById('build-buttons');
    this.elFeed = document.getElementById('message-feed');
    this.banner = document.getElementById('order-banner');
    this.bannerText = document.getElementById('order-banner-text');
    this.elRotate = document.getElementById('order-rotate');
    this.elRank = document.getElementById('rank-text');
    this.elSelCount = document.getElementById('sel-count');
    this.lastCrystal = null;
    this.mm = document.getElementById('minimap');
    this.mctx = this.mm.getContext('2d');
    this.mmTimer = 0;

    // hydrate touch dock with icons (UI only)
    const tb = { army: 'army', workers: 'worker', hq: 'home', zin: 'zin', zout: 'zout', stop: 'stop' };
    document.querySelectorAll('#touchbar [data-act]').forEach(b => {
      const ic = tb[b.dataset.act];
      if (ic) b.innerHTML = icon(ic);
    });
    document.querySelectorAll('#touchbar [data-order]').forEach(b => {
      b.innerHTML = icon(b.dataset.order === 'harvest' ? 'harvest' : b.dataset.order);
    });
    const clear = document.querySelector('#touchbar [data-act="clear"]');
    if (clear) clear.innerHTML = icon('x');
    const pan = document.querySelector('#touchbar [data-act="pan"]');
    if (pan) {
      pan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>`;
      pan.classList.toggle('on', !!game.panMode);
    }

    document.getElementById('btn-help').onclick = () =>
      document.getElementById('help-overlay').classList.toggle('hidden');
    document.getElementById('btn-close-help').onclick = () =>
      document.getElementById('help-overlay').classList.add('hidden');
    document.getElementById('help-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'help-overlay') e.target.classList.add('hidden');
    });
    document.getElementById('btn-restart').onclick = () => location.reload();
    document.getElementById('order-cancel').onclick = (e) => {
      e.stopPropagation();
      game.setOrderMode(null);
      game.cancelPlacement?.();
      this.syncBanner();
      buzz(8);
    };
    // rotate the wall ghost: 90° a tap, on-screen for phones, R for desktop
    if (this.elRotate) this.elRotate.onclick = (e) => {
      e.stopPropagation();
      game.rotatePlacement?.(1);
      buzz(8);
    };
    document.getElementById('btn-focus').onclick = () => { game.focusSelection?.(); buzz(8); };

    // panel collapse (mobile)
    const btnPanel = document.getElementById('btn-panel');
    if (btnPanel) btnPanel.onclick = () => {
      document.getElementById('app').classList.toggle('panel-hidden');
    };

    // deck tabs
    document.querySelectorAll('.deck-tab').forEach(t => {
      t.onclick = () => this.setTab(t.dataset.tab);
    });

    // order-mode buttons: single click handler (works for touch + mouse, no double-fire)
    document.querySelectorAll('#touchbar [data-order]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        game.setOrderMode(game.pendingOrder === b.dataset.order ? null : b.dataset.order);
        this.syncBanner();
        buzz(10);
      });
    });
    const act = (sel, fn) => {
      const b = document.querySelector(`#touchbar [data-act="${sel}"]`);
      if (!b) return;
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); buzz(10); });
    };
    act('army', () => { game.selectArmy(); this.setTab('units'); });
    act('workers', () => { game.selectWorkers(); this.setTab('units'); });
    act('stop', () => game.stopSelected());
    act('hq', () => game.focusHQ());
    act('clear', () => game.clearSelection());
    act('zin', () => { game.camDist = Math.max(16, game.camDist - 10); });
    act('zout', () => { game.camDist = Math.min(190, game.camDist + 10); });
    act('rail', () => { document.getElementById('app').classList.add('rail-hidden'); buzz(8); });
    document.getElementById('rail-tab')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('app').classList.remove('rail-hidden'); buzz(8);
    });
    const panBtn = document.querySelector('#touchbar [data-act="pan"]');
    if (panBtn) panBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      game.panMode = !game.panMode;
      panBtn.classList.toggle('on', !!game.panMode);
      game.hookMsg(game.panMode
        ? 'Camera mode: drag pans map (tap still orders)'
        : 'Select mode: drag draws a selection box');
      buzz(10);
    });

    // minimap: tap + drag to jump camera
    const jump = (cx, cy) => {
      const r = this.mm.getBoundingClientRect();
      const H = CONFIG.mapSize / 2;
      const nx = (cx - r.left) / Math.max(1, r.width);
      const ny = (cy - r.top) / Math.max(1, r.height);
      game.camTarget.set(
        Math.max(-H, Math.min(H, (nx * 2 - 1) * H)),
        0,
        Math.max(-H, Math.min(H, (ny * 2 - 1) * H))
      );
    };
    let mmDrag = false;
    const posOf = (e) => (e.touches && e.touches[0])
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };
    this.mm.addEventListener('pointerdown', (e) => { mmDrag = true; const p = posOf(e); jump(p.x, p.y); });
    window.addEventListener('pointermove', (e) => { if (mmDrag) jump(e.clientX, e.clientY); });
    window.addEventListener('pointerup', () => { mmDrag = false; });
    this.mm.addEventListener('touchmove', (e) => {
      const t = e.touches[0]; if (t) { jump(t.clientX, t.clientY); e.preventDefault(); }
    }, { passive: false });
  }

  setTab(name) {
    this.activeTab = name;
    document.querySelectorAll('.deck-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name));
    const units = name === 'units';
    document.getElementById('selection-info').classList.toggle('hidden', !units);
    document.getElementById('build-menu').classList.toggle('hidden', units);
  }

  syncBanner() {
    const m = this.game.pendingOrder;
    const placingWall = this.game.placement?.type === 'wall';
    if (this.elRotate) this.elRotate.classList.toggle('hidden', !placingWall);
    if (!m && !this.game.placement) { this.banner.classList.add('hidden'); return; }
    this.banner.classList.remove('hidden');
    this.bannerText.textContent = this.game.placement
      ? (this.game.placement.type === 'turret' ? 'Placing Turret — tap green ground'
        : this.game.placement.type === 'wall' ? 'Placing Wall — tap to chain, ⟳ / R rotates'
        : 'Placing Barracks — tap green ground')
      : m === 'move' ? 'MOVE — tap anywhere'
      : m === 'attack' ? 'ATTACK — tap a visible enemy'
      : 'HARVEST — tap a tree';
  }

  message(t, kind = '') {
    const d = document.createElement('div');
    d.className = 'msg' + (kind ? ` ${kind}` : '');
    d.textContent = t;
    this.elFeed.prepend(d);
    while (this.elFeed.children.length > 5) this.elFeed.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  fmtTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  }

  frame(dt) {
    const g = this.game;
    const p = g.players[g.humanId];
    const used = g.units.filter(u => u.owner === g.humanId && !u.dead).length;
    const cry = Math.floor(p.crystal ?? p.logs);
    if (this.elCrystal.textContent !== String(cry)) {
      this.elCrystal.textContent = cry;
      if (this.lastCrystal !== null && cry !== this.lastCrystal) {
        const w = document.getElementById('res-crystal-wrap');
        if (w) { w.classList.add('flash'); clearTimeout(w._t); w._t = setTimeout(() => w.classList.remove('flash'), 350); }
      }
      this.lastCrystal = cry;
    }
    // README-2 five-resource HUD + food upkeep warning + age
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== String(v)) el.textContent = v;
    };
    set('res-wood', Math.floor(p.wood ?? p.logs ?? 0));
    set('res-stone', Math.floor(p.stone ?? 0));
    set('res-food', Math.floor(p.food ?? 0));
    set('res-gold', Math.floor(p.gold ?? 0));
    set('res-age', ['I', 'II', 'III', 'IV'][p.age || 0] || 'I');
    const fw = document.getElementById('res-food-wrap');
    if (fw) fw.classList.toggle('danger', !!p.starving);
    const sup = `${used}/${g.supplyMax(g.humanId)}`;
    if (this.elSupply.textContent !== sup) this.elSupply.textContent = sup;
    if (this.elTime) {
      const t = this.fmtTime(g.time);
      if (this.elTime.textContent !== t) this.elTime.textContent = t;
    }
    if (this.elAI) {
      const s = this.ai.status || '…';
      if (this.elAI.textContent !== s) this.elAI.textContent = s;
    }
    if (this.elRank && g.playerRank) {
      try {
        const r = g.playerRank();
        const txt = `#${r.rank}/${r.alive}`;
        if (this.elRank.textContent !== txt) this.elRank.textContent = txt;
      } catch { /* noop */ }
    }
    this.mmTimer += dt;
    if (this.mmTimer > 0.15) {
      this.mmTimer = 0;
      this.drawMinimap();
      this.refreshBuildButtons();
      this.syncBanner();
      document.querySelectorAll('#touchbar [data-order]').forEach(b =>
        b.classList.toggle('active', g.pendingOrder === b.dataset.order));
    }
  }

  typeIcon(t) {
    if (UNIT_META[t]) return UNIT_META[t].icon;
    if (BLD_META[t]) return BLD_META[t].icon;
    return 'shield';
  }

  onSelect(sel) {
    if (this.elSelCount) this.elSelCount.textContent = sel.length ? `(${sel.length})` : '';
    if (!sel.length) {
      this.elSel.innerHTML = `<div class="hint">Tap ground to <b>move</b> • tap enemy to <b>attack</b> • tap tree for <b>harvest</b> • drag to pan • pinch to zoom • dominate all <b>29 rival kingdoms</b></div>`;
    } else {
      let html = '<div id="sel-cards">';
      for (const s of sel.slice(0, 24)) {
        const pct = Math.max(0, Math.round((s.hp / s.maxHp) * 100));
        const iname = this.typeIcon(s.type);
        const col = '#' + (this.game.teamColor(s.owner) ?? 0x888888).toString(16).padStart(6, '0');
        const owner = this.game.players[s.owner]?.name || s.owner;
        const low = pct < 35 ? ' low' : '';
        html += `<div class="unit-card" data-id="${s.id}" style="border-color:${col}"><div class="row1">${icon(iname)}<span class="nm">${s.type}</span><span class="hp">${Math.ceil(s.hp)}</span></div><div class="hpbar${low}"><div style="width:${pct}%"></div></div>${s.carrying ? `<div class="cargo">🪵 ${s.carrying}</div>` : ''}${s.queue?.length ? `<div class="q">+${s.queue.length} (${Math.ceil(s.queue[0].t)}s)</div>` : ''}<div class="own">${owner}</div></div>`;
      }
      html += '</div>';
      if (sel.length > 24) html += `<div class="hint">+${sel.length - 24} more</div>`;
      this.elSel.innerHTML = html;
      // tap a card = ping camera to that unit (UI only)
      this.elSel.querySelectorAll('.unit-card').forEach(card => {
        card.addEventListener('click', () => {
          const u = this.game.units.find(x => x.id === Number(card.dataset.id))
            || this.game.buildings.find(x => x.id === Number(card.dataset.id));
          if (u) { this.game.camTarget.set(u.x, 0, u.z); buzz(8); }
        });
      });
      // auto-show build tab when a production building is selected
      const single = sel.length === 1 ? sel[0] : null;
      if (single && single.kind === 'building' && (single.type === 'hq' || single.type === 'barracks')) this.setTab('build');
    }
    this.refreshBuildButtons();
  }

  // RTS icon tile: big tappable icon + name + cost badge + queue badge.
  // Tiles are built once per selection and only have disabled/badges updated
  // in place, so taps never land on a button that is being rebuilt mid-press.
  trainBtn(building, type) {
    const meta = UNIT_META[type] || { name: type, icon: 'shield', cost: () => 100, desc: type };
    const cost = meta.cost();
    const multi = this.game.unitCostRes ? this.game.unitCostRes(type) : { wood: cost };
    const badge = Object.entries(multi).map(([k, v]) => `${v}${k === 'food' ? '🍖' : k === 'wood' ? '🪵' : k === 'stone' ? '🪨' : k === 'gold' ? '🪙' : '💎'}`).join(' ');
    const g = this.game;
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset.kind = 'train';
    b.dataset.bid = building.id;
    b.dataset.utype = type;
    b.dataset.cost = cost;
    b.title = `${meta.name} — ${meta.desc} (${badge})`;
    b.setAttribute('aria-label', `Train ${meta.name}`);
    b.innerHTML = `${icon(meta.icon)}<span class="tile-name">${meta.name}</span><span class="tile-cost">${badge}</span><span class="tile-q hidden"></span>`;
    b.onclick = (e) => { e.stopPropagation(); g.trainUnit(building, type); buzz(12); this.onSelect(g.selected); };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  actBtn(ico, name, desc, fn, cost = 0) {
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset.kind = 'act';
    b.dataset.cost = cost;
    b.title = cost > 0 ? `${name} — ${desc} (🪵${cost})` : `${name} — ${desc}`;
    b.setAttribute('aria-label', name);
    b.innerHTML = `${icon(ico)}<span class="tile-name">${name}</span>` +
      (cost > 0 ? `<span class="tile-cost">🪵${cost}</span>` : '');
    b.onclick = (e) => { e.stopPropagation(); fn(); buzz(12); };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  refreshBuildButtons() {
    const g = this.game;
    const sel = g.selected;
    if (!this.elBuild) return;
    // structural signature only (selection + order mode). Affordability and
    // queue badges refresh in place below — no rebuilds while tapping.
    const sig = sel.map(s => s.id).join(',') + '|' + (g.pendingOrder || '');
    if (sig !== this._buildSig) {
      this._buildSig = sig;
      this.rebuildButtons();
    }
    this.updateButtons();
  }

  // cheap per-tick sync: disabled state + queue badges, zero DOM rebuilds
  updateButtons() {
    const g = this.game;
    if (!this.elBuild) return;
    const logs = Math.floor(g.players[g.humanId].logs);
    for (const b of this.elBuild.querySelectorAll('button.tile')) {
      const cost = Number(b.dataset.cost || 0);
      let disabled = logs < cost;
      if (b.dataset.kind === 'train') {
        const bd = g.buildings.find(x => x.id === Number(b.dataset.bid));
        const q = bd && !bd.dead ? bd.queue.length : 0;
        if (!bd || bd.dead) disabled = true;
        const qel = b.querySelector('.tile-q');
        if (qel) {
          qel.textContent = q > 0 ? `+${q}` : '';
          qel.classList.toggle('hidden', q === 0);
        }
      }
      if (b.disabled !== disabled) b.disabled = disabled;
    }
  }

  rebuildButtons() {
    const g = this.game;
    const sel = g.selected;
    this.elBuild.innerHTML = '';
    const ap = (el) => this.elBuild.appendChild(el);

    const single = sel.length === 1 ? sel[0] : null;
    if (single && single.kind === 'building' && single.owner === g.humanId && !single.dead) {
      const rallyHint = document.createElement('div');
      rallyHint.className = 'side-hint';
      rallyHint.textContent = 'Tap open ground to set rally — new units gather there';
      const demolish = () => {
        const refund = Math.floor(g.buildingCost(single.type) * (CONFIG.demolishRefund ?? 0.5));
        return this.actBtn('x', 'Demolish', refund > 0 ? `remove and reclaim ${refund} logs` : 'remove this structure', () => {
          if (g.demolishBuilding(single)) this.onSelect(g.selected);
        });
      };
      if (single.type === 'hq') {
        this.elBuild.appendChild(rallyHint);
        ap(this.trainBtn(single, 'worker'));
        ap(this.trainBtn(single, 'scout'));
        const age = g.players[g.humanId].age || 0;
        if (age >= 1) {
          for (const t of ['hero_king', 'hero_champion', 'hero_archmage']) ap(this.trainBtn(single, t));
        }
        const ages = ['I. Village', 'II. Castle (300🍖 200🪵 100🪨)', 'III. Kingdom', 'IV. Empire'];
        ap(this.actBtn('home', `Age Up → ${ages[Math.min(3, age + 1)]}`, 'unlocks new units & buildings', () => { g.ageUp?.(g.humanId); this.onSelect(g.selected); }));
        for (const t of ['house', 'farm', 'mill', 'lumber', 'quarry', 'depot']) {
          const m = BLD_META[t];
          ap(this.actBtn(m.icon, m.name, `place ${m.name}`, () => g.startPlacement(t), m.cost()));
        }
        ap(this.actBtn('barracks', 'Barracks', '+supply, unlocks army', () => g.startPlacement('barracks'), CONFIG.barracksCost));
        ap(this.actBtn('turret', 'Turret', 'auto-defense', () => g.startPlacement('turret'), CONFIG.turretCost));
        ap(this.actBtn('tower', 'Watchtower', 'vision +40m, shoots', () => g.startPlacement('tower'), 120));
        ap(this.actBtn('wall', 'Wall', 'chain-place blocker', () => g.startPlacement('wall'), CONFIG.wallCost));
        for (const t of ['archery', 'stable', 'siege', 'smith', 'temple', 'market', 'embassy']) {
          const m = BLD_META[t];
          ap(this.actBtn(m.icon, m.name, `place ${m.name}`, () => g.startPlacement(t), m.cost()));
        }
        ap(this.actBtn('crown', 'Crown Hall (Wonder)', 'win: hold 5 min', () => g.startPlacement('wonder'), 1000));
      } else if (single.type === 'barracks') {
        this.elBuild.appendChild(rallyHint);
        for (const t of ['soldier', 'swordsman', 'spearman', 'brute', 'hunter', 'scout', 'knight', 'tank', 'catapult', 'ram', 'artillery']) ap(this.trainBtn(single, t));
        ap(demolish());
        ap(this.actBtn('wall', 'Wall', 'wall off chokes', () => g.startPlacement('wall'), CONFIG.wallCost));
      } else if (single.type === 'archery') {
        for (const t of ['archer', 'hunter', 'scout']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'stable') {
        for (const t of ['knight', 'scout', 'tank']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'siege') {
        for (const t of ['catapult', 'ram', 'artillery']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'temple') {
        ap(this.trainBtn(single, 'healer'));
        ap(demolish());
      } else if (single.type === 'mill') {
        const n = (single.workers || []).length;
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = `Mill workers ${n}/4 — right-click mill with workers, or press T. Blades spin while grinding.`;
        this.elBuild.appendChild(hint);
        ap(this.actBtn('worker', 'Assign workers', 'selected workers → this mill', () => {
          const ws = g.selected.filter(s => s.kind === 'unit' && s.type === 'worker' && s.owner === g.humanId);
          const list = ws.length ? ws : g.units.filter(u => u.owner === g.humanId && u.type === 'worker' && !u.dead && !u.assignedMill).slice(0, 4 - n);
          if (list.length) g.assignToMill?.(list, single);
          else g.hookMsg('Select workers first, then Assign');
        }));
        ap(demolish());
      } else if (single.type === 'farm' || single.type === 'market' || single.type === 'embassy' || single.type === 'house' || single.type === 'lumber' || single.type === 'quarry' || single.type === 'depot' || single.type === 'smith' || single.type === 'wonder') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = single.type === 'farm' ? `Grain ${(single.grain || 0).toFixed(0)}/40 — feeds mills within 25m`
          : single.type === 'market' ? 'Sends a caravan every 90s → gold (×2 during Merchant Fair)'
          : single.type === 'embassy' ? 'Ceasefires & alliances live here'
          : single.type === 'wonder' ? 'Hold at full HP for 5:00 to win'
          : `${single.type} — working for the crown`;
        this.elBuild.appendChild(hint);
        ap(demolish());
      } else if (single.type === 'wall') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Wall: cheap, blocks paths. Enemies must chew through. Chain-place more from HQ.';
        this.elBuild.appendChild(hint);
        ap(this.actBtn('wall', 'More Wall', 'keep chaining', () => g.startPlacement('wall'), CONFIG.wallCost));
        ap(demolish());
      } else if (single.type === 'turret') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Auto-defends this area. Select army to push with it.';
        this.elBuild.appendChild(hint);
        ap(demolish());
      }
      return;
    }
    const workers = sel.filter(s => s.kind === 'unit' && s.type === 'worker' && s.owner === g.humanId);
    const army = sel.filter(s => s.kind === 'unit' && s.type !== 'worker' && s.owner === g.humanId);
    if (workers.length) {
      ap(this.actBtn('harvest', 'Harvest', `${workers.length} worker(s) → nearest tree`, () => {
        const n = g.nearestResource(workers[0].x, workers[0].z);
        if (n) g.orderHarvest(workers, n); else g.hookMsg('No trees left — waiting for regrowth');
      }));
      if (workers.some(w => w.carrying > 0)) {
        ap(this.actBtn('home', 'Return cargo', 'drop off at HQ', () => {
          const hq = g.hqOf(g.humanId);
          if (hq) g.orderReturn(workers.filter(w => w.carrying > 0), hq);
        }));
      }
    }
    if (army.length) {
      ap(this.actBtn('attack', 'Attack', 'tap a visible enemy', () => g.setOrderMode('attack')));
      ap(this.actBtn('move', 'Move', 'tap anywhere', () => g.setOrderMode('move')));
      ap(this.actBtn('stop', 'Stop', `${army.length} unit(s) hold`, () => g.stopSelected()));
    }
    if (!single && !workers.length && !army.length) {
      const hq = g.buildings.find(b => b.owner === g.humanId && b.type === 'hq' && !b.dead);
      if (hq) ap(this.trainBtn(hq, 'worker'));
      const rax = g.buildings.find(b => b.owner === g.humanId && b.type === 'barracks' && !b.dead);
      if (rax) ap(this.trainBtn(rax, 'soldier'));
      const place = (t) => { const m = BLD_META[t]; if (m) ap(this.actBtn(m.icon, m.name, `place ${m.name}`, () => g.startPlacement(t), m.cost())); };
      place('barracks');
      for (const t of ['house', 'farm', 'mill', 'lumber', 'quarry', 'depot', 'tower']) place(t);
      place('wall');
    }
  }

  drawMinimap() {
    const g = this.game, c = this.mctx;
    const W = this.mm.width, Hh = this.mm.height;
    const S = CONFIG.mapSize / 2;
    const wx = (x) => ((x + S) / (2 * S)) * W;
    const wz = (z) => ((z + S) / (2 * S)) * Hh;
    if (g.terrainThumb) c.drawImage(g.terrainThumb, 0, 0, W, Hh);
    else { c.fillStyle = '#0a1410'; c.fillRect(0, 0, W, Hh); }
    const hex = (id) => '#' + (g.teamColor(id) ?? 0x888888).toString(16).padStart(6, '0');
    // territory glow around each HQ in kingdom colours
    for (const b of g.buildings) {
      if (b.dead || b.type !== 'hq') continue;
      c.strokeStyle = hex(b.owner);
      c.globalAlpha = 0.35; c.lineWidth = 2;
      c.beginPath(); c.arc(wx(b.x), wz(b.z), 14, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    for (const b of g.buildings) {
      if (b.dead || !b.mesh.visible) continue;
      c.fillStyle = hex(b.owner);
      const s = b.type === 'hq' ? 7 : b.type === 'wall' ? 2 : 4;
      c.fillRect(wx(b.x) - s / 2, wz(b.z) - s / 2, s, s);
      if (b.type === 'hq') {
        c.strokeStyle = '#ffffff'; c.lineWidth = 1;
        c.strokeRect(wx(b.x) - s / 2 - 1, wz(b.z) - s / 2 - 1, s + 2, s + 2);
      }
    }
    for (const r of g.resources) {
      if (r.dead || r.depleted) continue;
      c.fillStyle = r.rtype === 'rock' ? '#9aa0a8' : r.rtype === 'crystal' ? '#7de8ff' : '#4ade80';
      c.fillRect(wx(r.x) - 1, wz(r.z) - 1, 2, 2);
    }
    let dots = 0;
    for (const u of g.units) {
      if (u.dead || !u.mesh.visible || dots > 900) continue;
      dots++;
      c.fillStyle = hex(u.owner);
      c.fillRect(wx(u.x) - 1, wz(u.z) - 1, 2, 2);
    }
    if (g.fogCanvas) c.drawImage(g.fogCanvas, 0, 0, W, Hh);
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    const world = g.camDist * 1.5;
    const vw = Math.max(10, world / (2 * S) * W);
    c.strokeRect(wx(g.camTarget.x) - vw / 2, wz(g.camTarget.z) - vw / 2, vw, vw);
    c.lineWidth = 1;
  }

  showGameOver(win, time) {
    const o = document.getElementById('game-over');
    o.classList.remove('hidden');
    const alive = this.game.aliveKingdoms().length;
    document.getElementById('game-over-title').textContent = win ? '👑 Crowned!' : 'Defeat';
    document.getElementById('game-over-sub').textContent = win
      ? `All 29 rival kingdoms have fallen • ${this.fmtTime(time)}`
      : `Your kingdom has fallen • ${alive} remain • ${this.fmtTime(time)}`;
    buzz(60);
  }
}
