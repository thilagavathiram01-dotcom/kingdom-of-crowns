import { CONFIG, BUILD_DEFS, UNIT_DEFS, AGES, AGE_NAMES, HQ_LEVELS, NEW_HQ_COST, MAX_HQ_PER_KINGDOM } from './config.js';
import { icon } from './icons.js';

const UNIT_META = {
  worker: { name: 'Worker', icon: 'worker', cost: () => 50, desc: 'Gather, build, mill' },
  soldier: { name: 'Soldier', icon: 'soldier', cost: () => 60, desc: 'Core fighter' },
  swordsman: { name: 'Swordsman', icon: 'soldier', cost: () => 60, desc: 'Frontline melee' },
  spearman: { name: 'Spearman', icon: 'spear', cost: () => 50, desc: 'Anti-cavalry ×1.5 vs Knight' },
  archer: { name: 'Archer', icon: 'archer', cost: () => 55, desc: 'Ranged marksman' },
  knight: { name: 'Knight', icon: 'knight', cost: () => 110, desc: 'Fast heavy cavalry' },
  scout: { name: 'Scout', icon: 'scout', cost: () => 40, desc: 'Fast, huge sight' },
  healer: { name: 'Healer', icon: 'healer', cost: () => 60, desc: 'Heals nearby allies' },
  catapult: { name: 'Catapult', icon: 'artillery', cost: () => 150, desc: 'Siege vs walls/towers' },
  ram: { name: 'Ram', icon: 'ram', cost: () => 100, desc: 'Gate breaker' },
  spy: { name: 'Spy', icon: 'scout', cost: () => 100, desc: 'Reveals enemy, sabotage' },
  tank: { name: 'Tank', icon: 'tank', cost: () => 130, desc: 'Heavy armor' },
  hero_king: { name: 'The Sovereign', icon: 'crown', cost: () => 400, desc: 'Rally Cry: +20% speed & damage' },
  hero_champion: { name: 'The Champion', icon: 'shield', cost: () => 400, desc: 'Shield Wall: -30% damage' },
  hero_archmage: { name: 'The Archmage', icon: 'archer', cost: () => 450, desc: 'Tempest Storm area damage' },
  artillery: { name: 'Artillery', icon: 'artillery', cost: () => 180, desc: 'Long-range splash' },
  brute: { name: 'Brute', icon: 'brute', cost: () => 90, desc: 'Close-quarters brawler' },
  hunter: { name: 'Hunter', icon: 'hunter', cost: () => 70, desc: 'Spear skirmisher' },
};
const BLD_META = {
  barracks: { name: 'Barracks', icon: 'barracks', cost: () => CONFIG.barracksCost },
  turret: { name: 'Defense Turret', icon: 'turret', cost: () => CONFIG.turretCost },
  tower: { name: 'Watchtower', icon: 'tower', cost: () => 120 },
  wall: { name: 'Wall', icon: 'wall', cost: () => CONFIG.wallCost },
  house: { name: 'House', icon: 'home', cost: () => 40 },
  farm: { name: 'Farm', icon: 'farm', cost: () => 50 },
  mill: { name: 'Windmill', icon: 'mill', cost: () => 100 },
  lumber: { name: 'Lumber Camp', icon: 'lumber', cost: () => 40 },
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
    this.mm = document.getElementById('minimap');
    this.mctx = this.mm?.getContext('2d');
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

    // ---- formal war challenges: alert modal with live countdown ----
    this.chModal = document.getElementById('challenge-modal');
    window.addEventListener('war-challenge', (e) => this.onChallengeEvent(e.detail || {}));
    window.addEventListener('war-accepted', () => this.hideChallenge());
    window.addEventListener('war-rejected', () => this.hideChallenge());
    document.getElementById('btn-ch-accept')?.addEventListener('click', (e) => {
      e.stopPropagation();
      game.diplomacy?.answerChallenge(game.humanId, true);
      this.hideChallenge(); buzz(20);
    });
    document.getElementById('btn-ch-reject')?.addEventListener('click', (e) => {
      e.stopPropagation();
      game.diplomacy?.answerChallenge(game.humanId, false);
      this.hideChallenge(); buzz(20);
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

  onChallengeEvent({ challenger, target }) {
    const g = this.game;
    if (target !== g.humanId) return; // our own challenges need no modal
    const nm = g.players[challenger]?.name || challenger;
    document.getElementById('ch-title').textContent = `⚔️ ${nm} declares WAR!`;
    document.getElementById('ch-sub').textContent =
      'Both armies are mustering in formation. Accept for arranged total war until one kingdom falls — reject and they invade anyway. Your troops hold position until you answer.';
    this.chModal?.classList.remove('hidden');
    buzz(60);
  }

  hideChallenge() {
    this.chModal?.classList.add('hidden');
  }

  syncChallenge() {
    if (!this.chModal || this.chModal.classList.contains('hidden')) return;
    const g = this.game;
    const r = g.diplomacy?.challengeFor?.(g.humanId);
    if (!r) { this.hideChallenge(); return; }
    const left = Math.max(0, Math.ceil(r.until - g.time));
    const t = document.getElementById('ch-timer');
    if (t) t.textContent = `${left}s to answer — silence means rejection`;
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
    if (!this.elFeed) return;
    const d = document.createElement('div');
    d.className = 'msg' + (kind ? ` ${kind}` : '');
    d.textContent = t;
    this.elFeed.prepend(d);
    while (this.elFeed.children.length > 4) this.elFeed.lastChild?.remove();
    setTimeout(() => {
      d.classList.add('fade-out');
      setTimeout(() => d.remove(), 250);
    }, 4500);
  }

  toast(t, kind = '') {
    this.message(t, kind);
    buzz(kind === 'lock' ? 25 : 10);
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

    // Streamlined 2-resource HUD: Wood & Food (+ Supply & Age)
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== String(v)) el.textContent = v;
    };
    set('res-wood', Math.floor(p.wood ?? p.logs ?? 0));
    set('res-food', Math.floor(p.food ?? 0));
    set('res-age', ['I', 'II', 'III', 'IV'][p.age || 0] || 'I');
    const fw = document.getElementById('res-food-wrap');
    if (fw) fw.classList.toggle('danger', !!p.starving);
    const sup = `${used}/${g.supplyMax(g.humanId)}`;
    if (this.elSupply && this.elSupply.textContent !== sup) this.elSupply.textContent = sup;
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
      this.syncChallenge();
      document.querySelectorAll('#touchbar [data-order]').forEach(b =>
        b.classList.toggle('active', g.pendingOrder === b.dataset.order));
    }
  }

  typeIcon(t) {
    if (UNIT_DEFS[t]) return UNIT_DEFS[t].icon;
    if (BUILD_DEFS[t]) return BUILD_DEFS[t].icon;
    if (UNIT_META[t]) return UNIT_META[t].icon;
    if (BLD_META[t]) return BLD_META[t].icon;
    return 'shield';
  }

  onSelect(sel) {
    if (this.elSelCount) this.elSelCount.textContent = sel.length ? `(${sel.length})` : '';
    if (!sel.length) {
      this.elSel.innerHTML = `<div class="hint">Tap ground to <b>move</b> • tap enemy to <b>attack</b> • tap tree for <b>harvest</b> • pinch to zoom • command your empire to conquer <b>29 rival kingdoms</b></div>`;
      this.refreshBuildButtons();
      return;
    }

    const single = sel.length === 1 ? sel[0] : null;

    if (single && single.kind === 'building') {
      // Professional RTS Building Showcase Card
      const b = single;
      const bdef = BUILD_DEFS[b.type] || BLD_META[b.type] || { name: b.type, icon: 'home', role: 'Structure', feature: '' };
      const pct = Math.max(0, Math.round((b.hp / b.maxHp) * 100));
      const col = '#' + (this.game.teamColor(b.owner) ?? 0x888888).toString(16).padStart(6, '0');
      const owner = this.game.players[b.owner]?.name || b.owner;
      const iname = bdef.icon || this.typeIcon(b.type);

      let extraHtml = '';
      if (b.type === 'mill') {
        const wCount = (b.workers || []).filter(w => !w.dead).length;
        const grinding = wCount > 0;
        extraHtml = `<div class="bld-stat-row">
          <span class="bld-pill ${grinding ? 'active' : ''}">🌾 Mill Hands: <b>${wCount}/4</b></span>
          <span class="bld-pill ${grinding ? 'active' : ''}">${grinding ? 'Grinding Active (+Food/s)' : 'Station workers to grind food'}</span>
        </div>`;
      } else if (b.type === 'farm') {
        extraHtml = `<div class="bld-stat-row">
          <span class="bld-pill active">🌾 Grain: <b>${Math.floor(b.grain || 0)} / 40</b></span>
          <span class="bld-pill">Boosts Mill grinding within 25m</span>
        </div>`;
      } else if (b.queue?.length) {
        extraHtml = `<div class="bld-stat-row">
          <span class="bld-pill active">⏱ Training: <b>${b.queue.length} unit${b.queue.length > 1 ? 's' : ''}</b></span>
          <span class="bld-pill">${Math.ceil(b.queue[0].t)}s remaining</span>
        </div>`;
      } else if (b.type === 'wonder') {
        extraHtml = `<div class="bld-stat-row">
          <span class="bld-pill active">👑 Crown Hall: Defend 5:00 at full HP to win!</span>
        </div>`;
      }

      this.elSel.innerHTML = `
        <div class="building-showcase" style="border-left-color: ${col}">
          <div class="bld-header">
            <div class="bld-portrait" style="background: ${col}22; border-color: ${col}66">
              ${icon(iname)}
            </div>
            <div class="bld-header-info">
              <div class="bld-title-row">
                <span class="bld-name">${bdef.name}</span>
                <span class="bld-owner" style="color: ${col}">${owner}</span>
              </div>
              <div class="bld-role">${bdef.role || 'Kingdom Structure'}</div>
              <div class="bld-hp-wrap">
                <div class="hpbar ${pct < 35 ? 'low' : ''}"><div style="width: ${pct}%"></div></div>
                <span class="bld-hp-val">${Math.ceil(b.hp)} / ${b.maxHp} HP</span>
              </div>
            </div>
          </div>
          <div class="bld-feature">${bdef.feature || bdef.purpose || 'Standard kingdom facility.'}</div>
          ${extraHtml}
        </div>
      `;

      if (b.type === 'hq' || b.type === 'barracks' || b.type === 'archery' || b.type === 'stable' || b.type === 'siege' || b.type === 'temple') {
        this.setTab('build');
      }
    } else if (single && single.kind === 'unit') {
      // Sleek Unit Showcase Card
      const u = single;
      const udef = UNIT_DEFS[u.type] || UNIT_META[u.type] || { name: u.type, icon: 'soldier', role: 'Troop', desc: '' };
      const pct = Math.max(0, Math.round((u.hp / u.maxHp) * 100));
      const col = '#' + (this.game.teamColor(u.owner) ?? 0x888888).toString(16).padStart(6, '0');
      const owner = this.game.players[u.owner]?.name || u.owner;
      const iname = udef.icon || this.typeIcon(u.type);

      let extraHtml = '';
      if (u.type === 'worker') {
        extraHtml = `<div class="bld-stat-row">
          <span class="bld-pill">${u.carrying ? `🪵 Cargo: ${Math.round(u.carrying)} wood` : 'Hands empty'}</span>
          <span class="bld-pill active">${u.assignedMill ? '🌾 Stationed at Mill' : (u.harvestTarget ? '🪓 Chopping Timber' : 'Ready')}</span>
        </div>`;
      }

      this.elSel.innerHTML = `
        <div class="building-showcase" style="border-left-color: ${col}">
          <div class="bld-header">
            <div class="bld-portrait" style="background: ${col}22; border-color: ${col}66">
              ${icon(iname)}
            </div>
            <div class="bld-header-info">
              <div class="bld-title-row">
                <span class="bld-name">${udef.name}</span>
                <span class="bld-owner" style="color: ${col}">${owner}</span>
              </div>
              <div class="bld-role">${udef.role || 'Troop'}</div>
              <div class="bld-hp-wrap">
                <div class="hpbar ${pct < 35 ? 'low' : ''}"><div style="width: ${pct}%"></div></div>
                <span class="bld-hp-val">${Math.ceil(u.hp)} / ${u.maxHp} HP</span>
              </div>
            </div>
          </div>
          <div class="bld-feature">${udef.desc || 'Kingdom combat unit ready for orders.'}</div>
          ${extraHtml}
        </div>
      `;
    } else {
      // Multiple Selection: unit cards grid
      let html = '<div id="sel-cards">';
      for (const s of sel.slice(0, 24)) {
        const pct = Math.max(0, Math.round((s.hp / s.maxHp) * 100));
        const iname = this.typeIcon(s.type);
        const col = '#' + (this.game.teamColor(s.owner) ?? 0x888888).toString(16).padStart(6, '0');
        const owner = this.game.players[s.owner]?.name || s.owner;
        const low = pct < 35 ? ' low' : '';
        html += `<div class="unit-card" data-id="${s.id}" style="border-color:${col}"><div class="row1">${icon(iname)}<span class="nm">${s.type}</span><span class="hp">${Math.ceil(s.hp)}</span></div><div class="hpbar${low}"><div style="width:${pct}%"></div></div>${s.carrying ? `<div class="cargo">🪵 ${Math.round(s.carrying)}</div>` : ''}${s.queue?.length ? `<div class="q">+${s.queue.length} (${Math.ceil(s.queue[0].t)}s)</div>` : ''}<div class="own">${owner}</div></div>`;
      }
      html += '</div>';
      if (sel.length > 24) html += `<div class="hint">+${sel.length - 24} more units</div>`;
      this.elSel.innerHTML = html;
      this.elSel.querySelectorAll('.unit-card').forEach(card => {
        card.addEventListener('click', () => {
          const u = this.game.units.find(x => x.id === Number(card.dataset.id))
            || this.game.buildings.find(x => x.id === Number(card.dataset.id));
          if (u) { this.game.camTarget.set(u.x, 0, u.z); buzz(8); }
        });
      });
    }
    this.refreshBuildButtons();
  }

  // RTS icon tile: big tappable icon + name + cost badge + queue badge + lock support.
  trainBtn(building, type) {
    const meta = UNIT_DEFS[type] || UNIT_META[type] || { name: type, icon: 'shield', cost: () => 100, desc: type };
    const multi = this.game.unitCostRes ? this.game.unitCostRes(type) : { food: 50 };
    const badge = Object.entries(multi)
      .map(([k, v]) => `${v}${k === 'food' ? '🌾' : '🪵'}`)
      .join(' ');
    const g = this.game;
    const lockReason = g.unitLock ? g.unitLock(g.humanId, type, building) : null;
    const b = document.createElement('button');
    b.className = 'tile' + (lockReason ? ' locked' : '');
    b.dataset.kind = 'train';
    b.dataset.bid = building.id;
    b.dataset.utype = type;
    b.dataset.locked = lockReason ? '1' : '0';
    b.title = lockReason ? `🔒 ${lockReason}` : `${meta.name} — ${meta.desc || meta.name} (${badge})`;
    b.setAttribute('aria-label', `Train ${meta.name}`);

    let lockBadge = '';
    let reqText = '';
    if (lockReason) {
      lockBadge = `<span class="tile-lock">${icon('lock')}</span>`;
      const short = lockReason.includes('Requires Archery') ? 'Req: Archery'
        : lockReason.includes('Requires Stable') ? 'Req: Stable'
        : lockReason.includes('Requires Siege') ? 'Req: Siege'
        : lockReason.includes('Requires Temple') ? 'Req: Temple'
        : lockReason.includes('Castle') ? 'Req: Age II'
        : lockReason.includes('Kingdom') ? 'Req: Age III'
        : lockReason.includes('Empire') ? 'Req: Age IV'
        : 'Locked';
      reqText = `<span class="tile-req">${short}</span>`;
    }

    b.innerHTML = `${lockBadge}${icon(meta.icon)}<span class="tile-name">${meta.name}</span><span class="tile-cost">${badge}</span>${reqText}<span class="tile-q hidden"></span>`;

    b.onclick = (e) => {
      e.stopPropagation();
      if (lockReason) {
        this.toast(`🔒 ${lockReason}`, 'lock');
        buzz(25);
        return;
      }
      g.trainUnit(building, type);
      buzz(12);
      this.onSelect(g.selected);
    };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  actBtn(ico, name, desc, fn, cost = 0, bldType = null) {
    const g = this.game;
    const lockReason = bldType && g.buildingLock ? g.buildingLock(g.humanId, bldType) : null;
    const b = document.createElement('button');
    b.className = 'tile' + (lockReason ? ' locked' : '');
    b.dataset.kind = 'act';
    b.dataset.cost = typeof cost === 'number' ? cost : 0;
    b.dataset.locked = lockReason ? '1' : '0';
    if (bldType) b.dataset.bldType = bldType;
    b.title = lockReason ? `🔒 ${lockReason}` : (cost > 0 ? `${name} — ${desc} (🪵${cost})` : `${name} — ${desc}`);
    b.setAttribute('aria-label', name);

    let costStr = '';
    if (bldType && g.buildingCostRes) {
      const cr = g.buildingCostRes(bldType);
      costStr = Object.entries(cr).map(([k, v]) => `${v}${k === 'food' ? '🌾' : '🪵'}`).join(' ');
    } else if (cost > 0) {
      costStr = `🪵${cost}`;
    }

    let lockBadge = '';
    let reqText = '';
    if (lockReason) {
      lockBadge = `<span class="tile-lock">${icon('lock')}</span>`;
      const short = lockReason.includes('Requires Barracks') ? 'Req: Barracks'
        : lockReason.includes('Requires Archery') ? 'Req: Archery'
        : lockReason.includes('Requires Stable') ? 'Req: Stable'
        : lockReason.includes('Requires Blacksmith') ? 'Req: Smith'
        : lockReason.includes('Requires Embassy') ? 'Req: Embassy'
        : lockReason.includes('Castle') ? 'Req: Age II'
        : lockReason.includes('Kingdom') ? 'Req: Age III'
        : lockReason.includes('Empire') ? 'Req: Age IV'
        : 'Locked';
      reqText = `<span class="tile-req">${short}</span>`;
    }

    b.innerHTML = `${lockBadge}${icon(ico)}<span class="tile-name">${name}</span>` +
      (costStr ? `<span class="tile-cost">${costStr}</span>` : '') +
      reqText;

    b.onclick = (e) => {
      e.stopPropagation();
      if (lockReason) {
        this.toast(`🔒 ${lockReason}`, 'lock');
        buzz(25);
        return;
      }
      fn();
      buzz(12);
    };
    b.onmousedown = (e) => e.stopPropagation();
    b.onmouseup = (e) => e.stopPropagation();
    return b;
  }

  refreshBuildButtons() {
    const g = this.game;
    const sel = g.selected;
    if (!this.elBuild) return;
    const sig = sel.map(s => s.id).join(',') + '|' + (g.pendingOrder || '') + '|' + (g.players[g.humanId]?.age || 0);
    if (sig !== this._buildSig) {
      this._buildSig = sig;
      this.rebuildButtons();
    }
    this.updateButtons();
  }

  // Cheap per-tick sync: disabled state + queue badges, zero DOM rebuilds
  updateButtons() {
    const g = this.game;
    if (!this.elBuild) return;
    const pl = g.players[g.humanId];
    for (const b of this.elBuild.querySelectorAll('button.tile')) {
      if (b.dataset.locked === '1') {
        // Keep locked tiles active so clicks fire the explanatory toast!
        b.disabled = false;
        continue;
      }
      let canAfford = true;
      if (b.dataset.kind === 'train') {
        const bd = g.buildings.find(x => x.id === Number(b.dataset.bid));
        if (!bd || bd.dead) {
          b.disabled = true;
          continue;
        }
        const utype = b.dataset.utype;
        if (utype && g.unitCostRes) {
          const cost = g.unitCostRes(utype);
          canAfford = g.canAffordRes(g.humanId, cost);
        } else {
          canAfford = (pl.wood ?? pl.logs ?? 0) >= Number(b.dataset.cost || 0);
        }
        const q = bd.queue ? bd.queue.length : 0;
        const qel = b.querySelector('.tile-q');
        if (qel) {
          qel.textContent = q > 0 ? `+${q}` : '';
          qel.classList.toggle('hidden', q === 0);
        }
      } else if (b.dataset.bldType && g.buildingCostRes) {
        const cost = g.buildingCostRes(b.dataset.bldType);
        canAfford = g.canAffordRes(g.humanId, cost);
      } else {
        const cost = Number(b.dataset.cost || 0);
        canAfford = (pl.wood ?? pl.logs ?? 0) >= cost;
      }
      b.disabled = !canAfford;
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
      rallyHint.textContent = 'Tap open ground to set rally point for newly trained units';
      const demolish = () => {
        const refund = Math.floor(g.buildingCost(single.type) * (CONFIG.demolishRefund ?? 0.5));
        return this.actBtn('x', 'Demolish', refund > 0 ? `remove and reclaim ${refund} wood` : 'remove this structure', () => {
          if (g.demolishBuilding(single)) this.onSelect(g.selected);
        });
      };

      if (single.type === 'hq') {
        this.elBuild.appendChild(rallyHint);
        // territory + town level
        const lv = single.level || 1;
        const terrHint = document.createElement('div');
        terrHint.className = 'side-hint';
        terrHint.textContent = `Town Lv ${lv} · Territory ${g.hqRadiusOf ? g.hqRadiusOf(single) : 70}m — all buildings must stand inside your HQ circles`;
        this.elBuild.appendChild(terrHint);
        ap(this.trainBtn(single, 'worker'));
        ap(this.trainBtn(single, 'scout'));
        // HQ upgrade → bigger territory + supply
        {
          const next = (typeof HQ_LEVELS !== 'undefined' ? HQ_LEVELS : [])[lv];
          if (next && next.cost) {
            ap(this.actBtn('home', `Upgrade HQ → Lv ${next.level}`, `Territory ${next.radius}m, +supply (${next.cost.wood}🪵 ${next.cost.food}🌾)`, () => {
              g.upgradeHQ?.(single);
              this.onSelect(g.selected);
            }));
          }
        }
        // Found a new town inside current territory (max 3 towns)
        ap(this.actBtn('flag', 'Found New Town', 'New HQ inside your territory (800🪵 500🌾) — expands your borders', () => g.startPlacement('hq')));
        // Heroes
        for (const t of ['hero_king', 'hero_champion', 'hero_archmage']) {
          ap(this.trainBtn(single, t));
        }
        // Age advancement
        const age = g.players[g.humanId].age || 0;
        const nextAge = AGES[age + 1];
        if (nextAge) {
          const costStr = nextAge.cost ? ` (${nextAge.cost.food}🌾 ${nextAge.cost.wood}🪵)` : '';
          ap(this.actBtn('home', `Advance to ${nextAge.name}`, `Unlocks advanced buildings and military units${costStr}`, () => {
            g.ageUp?.(g.humanId);
            this.onSelect(g.selected);
          }));
        }

        // Basic & Economic buildings
        for (const t of ['house', 'farm', 'mill', 'lumber']) {
          const m = BUILD_DEFS[t] || BLD_META[t];
          ap(this.actBtn(m.icon, m.name, m.purpose || `Construct ${m.name}`, () => g.startPlacement(t), 0, t));
        }

        // Fortifications & Military
        ap(this.actBtn('barracks', 'Barracks', 'Unlocks army training', () => g.startPlacement('barracks'), CONFIG.barracksCost, 'barracks'));
        ap(this.actBtn('turret', 'Defense Turret', 'Automated perimeter defense', () => g.startPlacement('turret'), CONFIG.turretCost, 'turret'));
        ap(this.actBtn('tower', 'Watchtower', '+40m vision and archer fire', () => g.startPlacement('tower'), 120, 'tower'));
        ap(this.actBtn('wall', 'Stone Wall', 'Chain-placed obstacle', () => g.startPlacement('wall'), CONFIG.wallCost, 'wall'));

        // Advanced Tech Buildings
        for (const t of ['archery', 'stable', 'siege', 'smith', 'temple', 'market', 'embassy']) {
          const m = BUILD_DEFS[t] || BLD_META[t];
          ap(this.actBtn(m.icon, m.name, m.purpose || `Construct ${m.name}`, () => g.startPlacement(t), 0, t));
        }

        // Imperial Wonder
        ap(this.actBtn('wonder', 'Crown Hall (Wonder)', 'Victory condition: hold for 5 min', () => g.startPlacement('wonder'), 1000, 'wonder'));

      } else if (single.type === 'barracks') {
        this.elBuild.appendChild(rallyHint);
        for (const t of ['soldier', 'swordsman', 'spearman', 'brute']) ap(this.trainBtn(single, t));
        ap(demolish());
        ap(this.actBtn('wall', 'Wall', 'Fortify perimeter', () => g.startPlacement('wall'), CONFIG.wallCost, 'wall'));
      } else if (single.type === 'archery') {
        this.elBuild.appendChild(rallyHint);
        for (const t of ['archer', 'hunter', 'scout']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'stable') {
        this.elBuild.appendChild(rallyHint);
        for (const t of ['knight', 'scout', 'tank']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'siege') {
        this.elBuild.appendChild(rallyHint);
        for (const t of ['catapult', 'ram', 'artillery']) ap(this.trainBtn(single, t));
        ap(demolish());
      } else if (single.type === 'temple') {
        this.elBuild.appendChild(rallyHint);
        ap(this.trainBtn(single, 'healer'));
        ap(demolish());
      } else if (single.type === 'mill') {
        const n = (single.workers || []).filter(w => !w.dead).length;
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = `Mill workers: ${n}/4. Workers stationed here automatically grind food. Proximity to wheat farms gives huge output bonuses.`;
        this.elBuild.appendChild(hint);
        ap(this.actBtn('worker', 'Assign Workers', 'Station selected workers at this Mill', () => {
          const ws = g.selected.filter(s => s.kind === 'unit' && s.type === 'worker' && s.owner === g.humanId && !s.dead);
          const list = ws.length ? ws : g.units.filter(u => u.owner === g.humanId && u.type === 'worker' && !u.dead && !u.assignedMill).slice(0, 4 - n);
          if (list.length) {
            g.assignToMill?.(list, single);
            this.onSelect(g.selected);
          } else {
            this.toast('Select workers first, then tap Assign', 'warn');
          }
        }));
        ap(demolish());
      } else if (single.type === 'embassy') {
        const dip = g.diplomacy;
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Embassy: buy pacts with wood + food. Pacts stop all fighting between the pair — even auto-defenses hold fire.';
        this.elBuild.appendChild(hint);
        if (dip) {
          // rivals: those fighting us first, then strongest — max 6 rows
          const rivals = g.aliveKingdoms().filter((id) => !g.isHuman(id));
          rivals.sort((a, b) => {
            const aw = dip.get(g.humanId, a).type === 'war' ? 0 : 1;
            const bw = dip.get(g.humanId, b).type === 'war' ? 0 : 1;
            if (aw !== bw) return aw - bw;
            return (g.powerOf?.(b) || 0) - (g.powerOf?.(a) || 0);
          });
          for (const rid of rivals.slice(0, 6)) {
            const rel = dip.get(g.humanId, rid).type;
            const nm = g.players[rid]?.name || rid;
            const badge = rel === 'alliance' ? '🤝 allied' : rel === 'ceasefire' ? '🕊️ ceasefire' : rel === 'challenged' ? '📯 challenged — awaiting answer' : '⚔️ war';
            const row = document.createElement('div');
            row.className = 'side-hint';
            row.textContent = `${nm} — ${badge}`;
            this.elBuild.appendChild(row);
            const btn = (label, title, fn) => ap(this.actBtn('flag', label, title, () => { fn(); this.onSelect(g.selected); }));
            if (rel === 'war') {
              btn('Declare War ⚔️', `Formal challenge to ${nm} — both sides muster, then fight on mutual approval (free)`, () => dip.challenge(g.humanId, rid));
              btn('Ceasefire 150🪵150🌾', `Buy 10 min peace with ${nm}`, () => dip.ceasefire(g.humanId, rid, 10, g.humanId));
              btn('Ally 300🪵300🌾', `Permanent alliance + shared vision with ${nm}`, () => dip.ally(g.humanId, rid, g.humanId));
              btn('Tribute 200🪵200🌾', `Pay tribute for 10 min peace with ${nm}`, () => dip.offerTribute(g.humanId, rid));
            } else {
              btn('Betray 200🪵200🌾', `Break the pact and attack ${nm} (they will hold a grudge)`, () => dip.betray(g.humanId, rid));
            }
          }
        }
        ap(demolish());
      } else if (['farm', 'market', 'house', 'lumber', 'smith', 'wonder'].includes(single.type)) {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        const bdef = BUILD_DEFS[single.type];
        hint.textContent = bdef ? `${bdef.name}: ${bdef.feature || bdef.purpose}` : `${single.type} working for the crown.`;
        this.elBuild.appendChild(hint);
        ap(demolish());
      } else if (single.type === 'wall') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Wall: cheap, blocks paths. Enemies must chew through. Chain-place more from HQ.';
        this.elBuild.appendChild(hint);
        ap(this.actBtn('wall', 'More Wall', 'Keep chaining walls', () => g.startPlacement('wall'), CONFIG.wallCost, 'wall'));
        ap(demolish());
      } else if (single.type === 'turret' || single.type === 'tower') {
        const hint = document.createElement('div');
        hint.className = 'side-hint';
        hint.textContent = 'Defensive structure. Automatically fires upon approaching hostile forces.';
        this.elBuild.appendChild(hint);
        ap(demolish());
      }
      return;
    }

    const workers = sel.filter(s => s.kind === 'unit' && s.type === 'worker' && s.owner === g.humanId && !s.dead);
    const army = sel.filter(s => s.kind === 'unit' && s.type !== 'worker' && s.owner === g.humanId && !s.dead);

    if (workers.length) {
      ap(this.actBtn('harvest', 'Harvest', `${workers.length} worker(s) → chop nearest tree`, () => {
        const n = g.nearestResource(workers[0].x, workers[0].z);
        if (n) g.orderHarvest(workers, n); else this.toast('No harvestable trees nearby', 'warn');
      }));
      if (workers.some(w => w.carrying > 0)) {
        ap(this.actBtn('home', 'Return Cargo', 'Deliver timber to Town Center', () => {
          const hq = g.hqOf(g.humanId);
          if (hq) g.orderReturn(workers.filter(w => w.carrying > 0), hq);
        }));
      }
    }
    if (army.length) {
      ap(this.actBtn('attack', 'Attack', 'Target visible enemy', () => g.setOrderMode('attack')));
      ap(this.actBtn('move', 'Move', 'Command move order', () => g.setOrderMode('move')));
      ap(this.actBtn('stop', 'Stop', `${army.length} unit(s) hold position`, () => g.stopSelected()));
    }
    if (!single && !workers.length && !army.length) {
      // Default Quick Command Deck when nothing is selected
      const hq = g.buildings.find(b => b.owner === g.humanId && b.type === 'hq' && !b.dead);
      if (hq) ap(this.trainBtn(hq, 'worker'));
      const rax = g.buildings.find(b => b.owner === g.humanId && b.type === 'barracks' && !b.dead);
      if (rax) ap(this.trainBtn(rax, 'soldier'));
      const place = (t) => {
        const m = BUILD_DEFS[t] || BLD_META[t];
        if (m) ap(this.actBtn(m.icon, m.name, `Place ${m.name}`, () => g.startPlacement(t), 0, t));
      };
      place('barracks');
      for (const t of ['house', 'farm', 'mill', 'lumber', 'tower']) place(t);
      place('wall');
    }
  }

  drawMinimap() {
    const g = this.game, c = this.mctx;
    if (!c || !this.mm) return;
    const W = this.mm.width, Hh = this.mm.height;
    const S = CONFIG.mapSize / 2;
    const wx = (x) => ((x + S) / (2 * S)) * W;
    const wz = (z) => ((z + S) / (2 * S)) * Hh;
    if (g.terrainThumb) c.drawImage(g.terrainThumb, 0, 0, W, Hh);
    else { c.fillStyle = '#0a1410'; c.fillRect(0, 0, W, Hh); }
    const hex = (id) => '#' + (g.teamColor(id) ?? 0x888888).toString(16).padStart(6, '0');
    // shared vision: allies are always drawn, even inside our fog
    const seesThroughFog = (id) => {
      if (g.isHuman(id)) return true;
      try { return g.diplomacy ? g.diplomacy.isAllied(g.humanId, id) : false; }
      catch { return false; }
    };

    // Territory glow around each HQ in kingdom colours
    for (const b of g.buildings) {
      if (b.dead || b.type !== 'hq') continue;
      c.strokeStyle = hex(b.owner);
      c.globalAlpha = 0.35; c.lineWidth = 2;
      c.beginPath(); c.arc(wx(b.x), wz(b.z), 14, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    // Buildings
    for (const b of g.buildings) {
      if (b.dead || (!b.mesh?.visible && !seesThroughFog(b.owner))) continue;
      c.fillStyle = hex(b.owner);
      const s = b.type === 'hq' ? 7 : b.type === 'wall' ? 2 : 4;
      c.fillRect(wx(b.x) - s / 2, wz(b.z) - s / 2, s, s);
      if (b.type === 'hq') {
        c.strokeStyle = '#ffffff'; c.lineWidth = 1;
        c.strokeRect(wx(b.x) - s / 2 - 1, wz(b.z) - s / 2 - 1, s + 2, s + 2);
      }
    }
    // Forest / timber resource nodes
    for (const r of g.resources) {
      if (r.dead || r.depleted) continue;
      c.fillStyle = '#4ade80';
      c.fillRect(wx(r.x) - 1, wz(r.z) - 1, 2, 2);
    }
    // Units
    let dots = 0;
    for (const u of g.units) {
      if (u.dead || (!u.mesh?.visible && !seesThroughFog(u.owner)) || dots > 900) continue;
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
    if (!o) return;
    o.classList.remove('hidden');
    const alive = this.game.aliveKingdoms().length;
    document.getElementById('game-over-title').textContent = win ? '👑 Crowned!' : 'Defeat';
    document.getElementById('game-over-sub').textContent = win
      ? `All 29 rival kingdoms have fallen • ${this.fmtTime(time)}`
      : `Your kingdom has fallen • ${alive} remain • ${this.fmtTime(time)}`;
    buzz(60);
  }
}
