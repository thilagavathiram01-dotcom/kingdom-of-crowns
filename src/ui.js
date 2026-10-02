import { CONFIG } from './config.js';
import { icon } from './icons.js';

const UNIT_META = {
  worker: { name: 'Worker', icon: 'worker', cost: () => CONFIG.workerCost, desc: 'Chops trees for logs' },
  soldier: { name: 'Soldier', icon: 'soldier', cost: () => CONFIG.soldierCost, desc: 'Core fighter' },
  tank: { name: 'Tank', icon: 'tank', cost: () => CONFIG.tankCost, desc: 'Heavy armor' },
  scout: { name: 'Scout', icon: 'scout', cost: () => CONFIG.scoutCost, desc: 'Fast, huge sight' },
  artillery: { name: 'Artillery', icon: 'artillery', cost: () => CONFIG.artilleryCost, desc: 'Long-range splash' },
};
const BLD_META = {
  barracks: { name: 'Barracks', icon: 'barracks', cost: () => CONFIG.barracksCost },
  turret: { name: 'Turret', icon: 'turret', cost: () => CONFIG.turretCost },
  wall: { name: 'Wall', icon: 'wall', cost: () => CONFIG.wallCost },
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
    if (!m && !this.game.placement) { this.banner.classList.add('hidden'); return; }
    this.banner.classList.remove('hidden');
    this.bannerText.textContent = this.game.placement
      ? (this.game.placement.type === 'turret' ? 'Placing Turret — tap green ground'
        : this.game.placement.type === 'wall' ? 'Placing Wall — tap to chain, ✕ when done'
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
    const cry = Math.floor(p.logs);
    if (this.elCrystal.textContent !== String(cry)) {
      this.elCrystal.textContent = cry;
      if (this.lastCrystal !== null && cry !== this.lastCrystal) {
        const w = document.getElementById('res-crystal-wrap');
        if (w) { w.classList.add('flash'); clearTimeout(w._t); w._t = setTimeout(() => w.classList.remove('flash'), 350); }
      }
      this.lastCrystal = cry;
    }
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

  trainBtn(building, type) {
    const meta = UNIT_META[type];
    const cost = meta.cost();
    const g = this.game;
    const b = document.createElement('button');
    b.className = 'build-btn icon-btn';
    b.innerHTML = `${icon(meta.icon)}<span class="t"><span class="n">${meta.name}</span><span class="d">${meta.desc} • ${cost} 🪵</span></span>`;
    b.disabled = g.players[g.humanId].logs < cost;
    b.onclick = (e) => { e.stopPropagation(); g.trainUnit(building, type); buzz(12); this.onSelect(g.selected); };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  actBtn(ico, name, desc, fn, disabled = false) {
    const b = document.createElement('button');
    b.className = 'build-btn icon-btn';
    b.innerHTML = `${icon(ico)}<span class="t"><span class="n">${name}</span><span class="d">${desc}</span></span>`;
    b.disabled = disabled;
    b.onclick = (e) => { e.stopPropagation(); fn(); buzz(12); };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  refreshBuildButtons() {
    const g = this.game;
    const sel = g.selected;
    if (!this.elBuild) return;
    const sig = sel.map(s => s.id).join(',') + '|' + Math.floor(g.players[g.humanId].logs) + '|' + (g.pendingOrder || '');
    if (sig === this._buildSig) return;
    this._buildSig = sig;
    this.elBuild.innerHTML = '';
    const p = g.players[g.humanId];
    const ap = (el) => this.elBuild.appendChild(el);

    const single = sel.length === 1 ? sel[0] : null;
    if (single && single.kind === 'building' && single.owner === g.humanId && !single.dead) {
      if (single.type === 'hq') {
        ap(this.trainBtn(single, 'worker'));
        ap(this.actBtn('barracks', 'Barracks', `${CONFIG.barracksCost} 🪵 • +supply, unlocks army`, () => g.startPlacement('barracks'), p.logs < CONFIG.barracksCost));
        ap(this.actBtn('turret', 'Turret', `${CONFIG.turretCost} 🪵 • auto-defense`, () => g.startPlacement('turret'), p.logs < CONFIG.turretCost));
        ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 🪵 • chain-place blocker`, () => g.startPlacement('wall'), p.logs < CONFIG.wallCost));
      } else if (single.type === 'barracks') {
        for (const t of ['soldier', 'scout', 'tank', 'artillery']) ap(this.trainBtn(single, t));
        ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 🪵 • wall off chokes`, () => g.startPlacement('wall'), p.logs < CONFIG.wallCost));
      } else if (single.type === 'wall') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Wall: cheap, blocks paths. Enemies must chew through. Chain-place more from HQ.';
        this.elBuild.appendChild(hint);
        ap(this.actBtn('wall', 'More Wall', `${CONFIG.wallCost} 🪵 • keep chaining`, () => g.startPlacement('wall'), p.logs < CONFIG.wallCost));
      } else if (single.type === 'turret') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Auto-defends this area. Select army to push with it.';
        this.elBuild.appendChild(hint);
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
      if (hq) ap(this.actBtn('barracks', 'Expand', 'place Barracks / Turret / Wall', () => g.startPlacement('barracks'), p.logs < CONFIG.barracksCost));
      if (hq && p.logs >= CONFIG.wallCost) ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 🪵 • quick blocker`, () => g.startPlacement('wall')));
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
    c.fillStyle = '#4ade80';
    for (const r of g.resources) {
      if (r.dead || r.depleted) continue;
      if (r.dead || !r.mesh.visible) continue;
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
