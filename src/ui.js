import { CONFIG } from './config.js';
import { icon } from './icons.js';

const UNIT_META = {
  worker: { name: 'Worker', icon: 'worker', cost: () => CONFIG.workerCost, desc: 'Harvests crystals' },
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

export class HUD {
  constructor(game, ai) {
    this.game = game;
    this.ai = ai;
    // hydrate topbar icons
    document.querySelectorAll('[data-ric]').forEach(el => { el.innerHTML = icon(el.dataset.ric); });
    this.elCrystal = document.getElementById('res-crystal');
    this.elSupply = document.getElementById('res-supply');
    this.elTime = document.getElementById('game-time');
    this.elAI = document.getElementById('ai-status');
    this.elSel = document.getElementById('selection-info');
    this.elBuild = document.getElementById('build-buttons');
    this.elFeed = document.getElementById('message-feed');
    this.banner = document.getElementById('order-banner');
    this.mm = document.getElementById('minimap');
    this.mctx = this.mm.getContext('2d');
    this.mmTimer = 0;

    // hydrate touchbar with icons
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

    document.getElementById('btn-help').onclick = () =>
      document.getElementById('help-overlay').classList.toggle('hidden');
    document.getElementById('btn-close-help').onclick = () =>
      document.getElementById('help-overlay').classList.add('hidden');
    document.getElementById('btn-restart').onclick = () => location.reload();

    document.querySelectorAll('#touchbar [data-order]').forEach(b => {
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); game.setOrderMode(game.pendingOrder === b.dataset.order ? null : b.dataset.order); this.syncBanner(); };
      b.addEventListener('click', fire);
      b.addEventListener('touchend', fire, { passive: false });
    });
    const act = (sel, fn) => {
      const b = document.querySelector(`#touchbar [data-act="${sel}"]`);
      if (!b) return;
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
      b.addEventListener('click', fire);
      b.addEventListener('touchend', fire, { passive: false });
    };
    act('army', () => game.selectArmy());
    act('workers', () => game.selectWorkers());
    act('stop', () => game.stopSelected());
    act('hq', () => game.focusHQ());
    act('clear', () => game.clearSelection());
    act('zin', () => { game.camDist = Math.max(16, game.camDist - 10); });
    act('zout', () => { game.camDist = Math.min(190, game.camDist + 10); });

    const jump = (e) => {
      const r = this.mm.getBoundingClientRect();
      const H = CONFIG.mapSize / 2;
      const cx = (e.clientX - r.left) / r.width, cy = (e.clientY - r.top) / r.height;
      game.camTarget.set((cx * 2 - 1) * H, 0, (cy * 2 - 1) * H);
    };
    this.mm.addEventListener('click', jump);
    this.mm.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (t) jump(t); }, { passive: true });
  }

  syncBanner() {
    const m = this.game.pendingOrder;
    if (!m && !this.game.placement) { this.banner.classList.add('hidden'); return; }
    this.banner.classList.remove('hidden');
    this.banner.textContent = this.game.placement
      ? (this.game.placement.type === 'turret' ? 'Placing Turret — tap green ground (Esc cancels)'
        : this.game.placement.type === 'wall' ? 'Placing Wall — click each segment, Esc when done'
        : 'Placing Barracks — tap green ground (Esc cancels)')
      : m === 'move' ? 'MOVE — tap anywhere (Esc cancels)'
      : m === 'attack' ? 'ATTACK — tap a visible enemy (Esc cancels)'
      : 'HARVEST — tap a crystal (Esc cancels)';
  }

  message(t) {
    const d = document.createElement('div');
    d.className = 'msg';
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
    this.elCrystal.textContent = Math.floor(p.crystals);
    this.elSupply.textContent = `${used}/${g.supplyMax(g.humanId)}`;
    if (this.elTime) this.elTime.textContent = this.fmtTime(g.time);
    this.elAI.textContent = this.ai.status || '…';
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
    if (!sel.length) {
      this.elSel.innerHTML = `<div class="hint">Tap open ground to <b>move</b> • tap enemy to <b>attack</b> • tap crystal for <b>harvest</b> • drag for box-select • double-click selects same type • Shift+1-4 saves groups • dominate all <b>29 rival kingdoms</b> to win the crown</div>`;
    } else {
      let html = '';
      for (const s of sel.slice(0, 12)) {
        const pct = Math.round((s.hp / s.maxHp) * 100);
        const iname = this.typeIcon(s.type);
        const col = '#' + (this.game.teamColor(s.owner) ?? 0x888888).toString(16).padStart(6, '0');
        const owner = this.game.players[s.owner]?.name || s.owner;
        html += `<div class="unit-card" style="border-color:${col}">${icon(iname)}<span class="nm">${s.type}</span> <b>${Math.ceil(s.hp)}</b><div class="hpbar"><div style="width:${pct}%"></div></div>${s.carrying ? `<div class="cargo">${icon('harvest')} ${s.carrying}</div>` : ''}${s.queue?.length ? `<div class="q">+${s.queue.length} (${Math.ceil(s.queue[0].t)}s)</div>` : ''}<div class="cargo">${owner}</div></div>`;
      }
      if (sel.length > 12) html += `<div class="unit-card">+${sel.length - 12}</div>`;
      this.elSel.innerHTML = html;
    }
    this.refreshBuildButtons();
  }

  trainBtn(building, type) {
    const meta = UNIT_META[type];
    const cost = meta.cost();
    const g = this.game;
    const b = document.createElement('button');
    b.className = 'build-btn icon-btn';
    b.innerHTML = `${icon(meta.icon)}<span class="t"><span class="n">${meta.name}</span><span class="d">${meta.desc} • ${cost} 💎</span></span>`;
    b.disabled = g.players[g.humanId].crystals < cost;
    const fire = (e) => { e.stopPropagation(); g.trainUnit(building, type); this.onSelect(g.selected); };
    b.onclick = fire;
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    b.ontouchend = (e) => e.stopPropagation();
    return b;
  }

  actBtn(ico, name, desc, fn, disabled = false) {
    const b = document.createElement('button');
    b.className = 'build-btn icon-btn';
    b.innerHTML = `${icon(ico)}<span class="t"><span class="n">${name}</span><span class="d">${desc}</span></span>`;
    b.disabled = disabled;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    b.ontouchend = (e) => e.stopPropagation();
    return b;
  }

  refreshBuildButtons() {
    const g = this.game;
    const sel = g.selected;
    if (!this.elBuild) return;
    this.elBuild.innerHTML = '';
    const p = g.players[g.humanId];
    const ap = (el) => this.elBuild.appendChild(el);

    const single = sel.length === 1 ? sel[0] : null;
    if (single && single.kind === 'building' && single.owner === g.humanId && !single.dead) {
      if (single.type === 'hq') {
        ap(this.trainBtn(single, 'worker'));
        ap(this.actBtn('barracks', 'Barracks', `${CONFIG.barracksCost} 💎 • +supply, unlocks army`, () => g.startPlacement('barracks'), p.crystals < CONFIG.barracksCost));
        ap(this.actBtn('turret', 'Turret', `${CONFIG.turretCost} 💎 • auto-defense`, () => g.startPlacement('turret'), p.crystals < CONFIG.turretCost));
        ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 💎 • cheap blocker, chain-place`, () => g.startPlacement('wall'), p.crystals < CONFIG.wallCost));
      } else if (single.type === 'barracks') {
        for (const t of ['soldier', 'scout', 'tank', 'artillery']) ap(this.trainBtn(single, t));
        ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 💎 • wall off chokes`, () => g.startPlacement('wall'), p.crystals < CONFIG.wallCost));
      } else if (single.type === 'wall') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Wall: cheap, blocks paths. Enemies must chew through. Chain-place more from HQ.';
        this.elBuild.appendChild(hint);
        ap(this.actBtn('wall', 'More Wall', `${CONFIG.wallCost} 💎 • keep chaining`, () => g.startPlacement('wall'), p.crystals < CONFIG.wallCost));
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
      ap(this.actBtn('harvest', 'Harvest', `${workers.length} worker(s) → nearest crystal`, () => {
        const n = g.nearestResource(workers[0].x, workers[0].z);
        if (n) g.orderHarvest(workers, n); else g.hookMsg('No crystals left on the map');
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
      if (hq) ap(this.actBtn('barracks', 'Expand', 'place Barracks / Turret / Wall', () => g.startPlacement('barracks'), p.crystals < CONFIG.barracksCost));
      if (hq && p.crystals >= CONFIG.wallCost) ap(this.actBtn('wall', 'Wall', `${CONFIG.wallCost} 💎 • quick blocker`, () => g.startPlacement('wall')));
    }
  }

  drawMinimap() {
    const g = this.game, c = this.mctx;
    const W = this.mm.width, Hh = this.mm.height;
    const S = CONFIG.mapSize / 2;
    const wx = (x) => ((x + S) / (2 * S)) * W;
    const wz = (z) => ((z + S) / (2 * S)) * Hh;
    // painted terrain (river, mountains, grass) as the base layer
    if (g.terrainThumb) c.drawImage(g.terrainThumb, 0, 0, W, Hh);
    else { c.fillStyle = '#0a1410'; c.fillRect(0, 0, W, Hh); }
    const hex = (id) => '#' + (g.teamColor(id) ?? 0x888888).toString(16).padStart(6, '0');
    // HQs + buildings (remembered ones included)
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
    // resources only where explored
    c.fillStyle = '#22d3ee';
    for (const r of g.resources) {
      if (r.dead || !r.mesh.visible) continue;
      c.fillRect(wx(r.x) - 1, wz(r.z) - 1, 2, 2);
    }
    // units: all own, only visible enemies (cap dots for perf)
    let dots = 0;
    for (const u of g.units) {
      if (u.dead || !u.mesh.visible || dots > 900) continue;
      dots++;
      c.fillStyle = hex(u.owner);
      c.fillRect(wx(u.x) - 1, wz(u.z) - 1, 2, 2);
    }
    // fog shroud on top
    if (g.fogCanvas) c.drawImage(g.fogCanvas, 0, 0, W, Hh);
    // camera viewport
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
  }
}
