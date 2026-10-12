import * as THREE from 'three';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { HUD } from './ui.js';
import { installRealms } from './realms.js';
import { installWar } from './war.js';
import { configureMode } from './config.js';
import { listRooms, searchRooms, createRoom, joinRoom } from './rooms.js';
import { loadWorkerModels, loadAdventurerModels } from './workers3d.js';
import { loadBuildingModels } from './buildings3d.js';

// visible error surface: never freeze silently — show what broke
function showError(err) {
  const o = document.getElementById('err-overlay');
  const t = document.getElementById('err-text');
  if (!o || !t) return;
  o.classList.remove('hidden');
  t.textContent = String(err?.stack || err);
}
window.addEventListener('error', (e) => showError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

// ---------- landscape gate (phones + tablets only; desktop untouched) ----------
const rotateGate = document.getElementById('rotate-gate');
const appRoot = document.getElementById('app');

function isTouchDevice() {
  return (window.matchMedia?.('(pointer: coarse)').matches)
    || ('ontouchstart' in window)
    || (navigator.maxTouchPoints > 0);
}
function isPortrait() {
  // visualViewport first: it tracks the real viewport while the URL bar is showing
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const vw = window.visualViewport?.width ?? window.innerWidth;
  return vh > vw;
}
function needsLandscape() {
  // landscape-only on touch devices (phone/tablet); laptops & desktops always play
  return isTouchDevice() && isPortrait();
}

let lockedLandscape = false;
function syncOrientation(attemptLock = false) {
  const show = needsLandscape();
  rotateGate?.classList.toggle('hidden', !show);
  document.documentElement.classList.toggle('lock-landscape', show);
  // keep early pre-paint class in sync: no splash/rotate flicker while loading
  document.documentElement.classList.toggle('want-landscape', show);
  // hard-block canvas input while the gate is up (RTS UI is landscape-only)
  if (appRoot) appRoot.classList.toggle('gated', show);
  if (show && attemptLock && !lockedLandscape) requestLandscapeLock();
}
async function requestLandscapeLock() {
  if (lockedLandscape) return;
  lockedLandscape = true;
  try {
    // Android Chrome only honours orientation.lock while fullscreen, so ask
    // for fullscreen first (must run inside the user gesture).
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      await (root.requestFullscreen({ navigationUI: 'hide' }) ?? root.webkitRequestFullscreen?.()).catch(() => {});
    }
    await screen.orientation?.lock?.('landscape');
  } catch { /* unsupported (iOS Safari) — the gate UI still guides the user */ }
}
document.getElementById('btn-rotate')?.addEventListener('click', () => {
  requestLandscapeLock();
  syncOrientation();
});
syncOrientation();
window.addEventListener('orientationchange', () => setTimeout(() => syncOrientation(true), 60));
window.addEventListener('resize', () => syncOrientation());
window.visualViewport?.addEventListener('resize', () => syncOrientation());

const canvas = document.getElementById('game-canvas');
const bootGate = document.getElementById('boot-gate');
const bootFill = document.getElementById('boot-fill');
const bootPct = document.getElementById('boot-pct');
const btnPlay = document.getElementById('btn-play');
const bgMusic = document.getElementById('bg-music');
const splashImg = document.getElementById('splash-img');

// splash art must ALWAYS show: resolve against vite base, retry once,
// only then fall back to gradient. Game enters ONLY at 100%.
const BASE = import.meta.env?.BASE_URL || '/';
if (splashImg) {
  const want = BASE + 'splash.jpg';
  try {
    if (!String(splashImg.getAttribute('src') || '').endsWith('splash.jpg')) splashImg.src = want;
  } catch { splashImg.src = want; }
  // wait for full decode before advancing past 5% (no half-painted art)
  try { if (splashImg.decode) splashImg.decode().catch(() => {}); } catch {}
  splashImg.addEventListener('error', () => {
    const abs = new URL('splash.jpg', location.href).href;
    if (splashImg.src !== abs) splashImg.src = abs;
    else splashImg.style.display = 'none';
  });
}

function setBoot(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (bootFill) bootFill.style.width = p + '%';
  if (bootPct) bootPct.textContent = p + '%';
}

// ---- background music: fully fetched during splash, loops from splash ----
// Fully download the mp3 (6.4MB) with progress into a blob URL so playback
// never stalls mid-game. Muted autoplay is allowed without gesture, so we
// start muted on the splash and unmute on first gesture at low volume.
let musicURL = null;
let musicReady = false;
async function fetchMusic(onProgress) {
  const url = BASE + 'audio/fantasy-adventure-quest.mp3';
  const res = await fetch(url);
  if (!res.ok) throw new Error('music HTTP ' + res.status);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    musicURL = URL.createObjectURL(blob);
    onProgress?.(1);
    return;
  }
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    if (total) onProgress?.(got / total);
  }
  musicURL = URL.createObjectURL(new Blob(chunks, { type: 'audio/mpeg' }));
  onProgress?.(1);
}
function wireMusic() {
  if (!bgMusic || !musicURL) return;
  if (bgMusic.src !== musicURL) bgMusic.src = musicURL;
  bgMusic.loop = true;
  bgMusic.volume = 0.22;
  bgMusic.muted = true; // allowed to autoplay from the splash itself
  bgMusic.play().catch(() => {});
  musicReady = true;
}
function unmuteMusic() {
  if (!bgMusic || !musicReady) return;
  try {
    bgMusic.muted = false;
    bgMusic.volume = 0.22;
    if (bgMusic.paused) bgMusic.play().catch(() => {});
  } catch {}
  document.documentElement.classList.remove('want-landscape');
}
['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, unmuteMusic, { passive: true })
);

// The world is built lazily, only when the player picks a mode — so mode
// configuration (map size, kingdom count, Doom rules) is applied before the
// continent is generated. The menu backdrop is a CSS gradient.
let hud, ai, game = null;
let loopStarted = false;
const clock = new THREE.Clock();
const assets = { workerModels: null, buildingModels: null, adventurerModels: null };

function hideAllMenus() {
  for (const id of ['mode-select', 'rooms-screen', 'create-room-modal', 'lobby-screen', 'doom-story']) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

// Build the world for the chosen mode. Called exactly once, from the menu.
function startGame(mode) {
  if (game) return game;
  configureMode(mode);
  game = new Game(canvas, {
    onSelect: (sel) => hud?.onSelect(sel),
    onMessage: (t) => hud?.message(t),
    onToast: (t) => hud?.toast(t),
    onGameOver: (win, sub) => hud?.showGameOver(win, sub),
  }, assets);
  ai = new AIManager(game);
  installRealms(game, ai);
  installWar(game, ai);
  hud = new HUD(game, ai);
  hud.onSelect([]);
  const hq = game.hqOf(game.humanId);
  if (hq) game.camTarget.set(hq.x, 0, hq.z);
  game.setSelection([]);
  wireMarchButton();
  wireReleaseButton();
  if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
  return game;
}

function loop() {
  requestAnimationFrame(loop);
  if (!game) return;
  try {
    const dt = Math.min(clock.getDelta(), 0.05);
    game.update(dt);
    ai.update(dt);
    hud.frame(dt);
    game.render();
  } catch (err) {
    showError(err);
    throw err;
  }
}

function enterWorld(mode, msg) {
  try { startGame(mode); } catch (err) { showError(err); return; }
  hideAllMenus();
  document.body.classList.remove('in-menu');
  try { bgMusic?.play?.()?.catch?.(() => {}); } catch {}
  game.hookMsg(msg);
}

// crusade control: only exists in Doom mode
function wireMarchButton() {
  const b = document.getElementById('march-btn');
  const rb = document.getElementById('release-btn');
  if (!b) return;
  if (!game?.doom) { b.classList.add('hidden'); rb?.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  if (b.dataset.wired) return;
  b.dataset.wired = '1';
  b.addEventListener('click', () => {
    if (game?.marchToDoomValley?.()) {
      const t = b.querySelector('.mb-text');
      if (t) t.textContent = 'Gather more kingdoms';
      rb?.classList.remove('hidden');
    }
  });
}

// send every allied crusader home again at any time
function wireReleaseButton() {
  const rb = document.getElementById('release-btn');
  if (!rb) return;
  if (!game?.doom) { rb.classList.add('hidden'); return; }
  if (rb.dataset.wired) return;
  rb.dataset.wired = '1';
  rb.addEventListener('click', () => {
    if (game?.releaseDoomCrusade?.()) {
      rb.classList.add('hidden');
      const t = document.querySelector('#march-btn .mb-text');
      if (t) t.textContent = 'March on Doomsvally';
    }
  });
}

// All assets (models + music) fully fetched on the splash: the game only
// builds at 100% so nothing stalls mid-game for lack of resources.
async function boot() {
  setBoot(2);
  // 1) splash image decode (no half-painted art)
  try { await splashImg?.decode?.(); } catch {}
  setBoot(6);
  // 2) music fully fetched with progress (6% -> 20%), wired muted so it
  // loops from the splash itself even before the first tap
  try {
    await fetchMusic((f) => setBoot(6 + f * 14));
    wireMusic();
  } catch (err) {
    console.warn('bg music unavailable', err);
  }
  setBoot(20);
  try {
    assets.workerModels = await loadWorkerModels();
    setBoot(44);
  } catch (err) {
    console.warn('worker models unavailable — falling back to box workers', err);
    setBoot(44);
  }
  try {
    assets.adventurerModels = await loadAdventurerModels();
    setBoot(64);
  } catch (err) {
    console.warn('adventurer models unavailable — workers fall back to Cave Man rigs', err);
    setBoot(64);
  }
  try {
    assets.buildingModels = await loadBuildingModels();
    setBoot(86);
  } catch (err) {
    console.warn('building models unavailable — falling back to box buildings', err);
    setBoot(86);
  }
  setBoot(100);

  // Mode select at 100% (CSS gradient backdrop). The world is not built yet.
  const showModes = () => {
    unmuteMusic();
    try { bgMusic?.play()?.catch?.(() => {}); } catch {}
    bootGate?.classList.add('done');
    setTimeout(() => bootGate?.remove(), 500);
    document.getElementById('mode-select')?.classList.remove('hidden');
  };
  wireMenu();
  // Autoplay policy: music already loops muted from the splash; if still
  // paused at 100%, one tap unlocks sound + enters (no earlier entry).
  const needTap = !!bgMusic && bgMusic.paused && musicReady;
  if (needTap && btnPlay) {
    btnPlay.classList.remove('hidden');
    setBoot(100);
    btnPlay.addEventListener('click', showModes, { once: true });
    bootGate?.addEventListener('pointerdown', () => btnPlay.click(), { once: true });
  } else {
    // small beat at 100% so players actually see the full bar like CoC
    setTimeout(showModes, 450);
  }
}
// ---------- menu flow: mode select -> single player | rooms -> lobby -----
function wireMenu() {
  const $ = (id) => document.getElementById(id);
  const show = (el) => el?.classList.remove('hidden');
  const hide = (el) => el?.classList.add('hidden');
  const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch {} };

  const modeSel = $('mode-select'), roomsScr = $('rooms-screen');
  const crModal = $('create-room-modal'), lobbyScr = $('lobby-screen'), doomStory = $('doom-story');

  // single player: enter the 12-kingdom saga
  $('mode-single')?.addEventListener('click', () => {
    buzz(15);
    enterWorld('classic', '⚔️ Single player — you vs 11 AI kingdoms. Expand, wall, conquer!');
  });
  // doom mode: story overlay, then the 5-kingdom crusade
  $('mode-doom')?.addEventListener('click', () => {
    hide(modeSel); show(doomStory);
    buzz(12);
  });
  $('doom-story-back')?.addEventListener('click', () => {
    hide(doomStory); show(modeSel);
  });
  $('doom-story-start')?.addEventListener('click', () => {
    buzz(18);
    enterWorld('doom', '🌑 The Doom King rises! Hold the line, then sound the great crusade.');
  });
  // multiplayer: available rooms
  $('mode-multi')?.addEventListener('click', () => {
    hide(modeSel); show(roomsScr);
    renderRooms('');
    $('rooms-search').value = '';
    buzz(10);
  });
  $('btn-rooms-back')?.addEventListener('click', () => {
    hide(roomsScr); show(modeSel);
  });

  // ---- rooms list + search ----
  const renderRooms = (q) => {
    const list = $('rooms-list');
    if (!list) return;
    const rooms = searchRooms(q);
    $('rooms-count').textContent = `${rooms.length} room${rooms.length === 1 ? '' : 's'} open`;
    list.innerHTML = '';
    if (!rooms.length) {
      const d = document.createElement('div');
      d.className = 'rooms-empty';
      d.textContent = q ? `No rooms match “${q}”.` : 'No open rooms — create one!';
      list.appendChild(d);
      return;
    }
    for (const r of rooms) {
      const row = document.createElement('div');
      row.className = 'room-row';
      const info = document.createElement('div');
      info.className = 'rr-info';
      const nm = document.createElement('div');
      nm.className = 'rr-name';
      nm.textContent = `${r.locked ? '🔒 ' : '🌐 '}${r.name}`;
      const sub = document.createElement('div');
      sub.className = 'rr-sub';
      sub.textContent = `${r.players}/${r.max} players`;
      info.append(nm, sub);
      const join = document.createElement('button');
      join.className = 'rr-join';
      join.type = 'button';
      join.textContent = 'Join';
      join.onclick = () => tryJoin(r.id);
      row.append(info, join);
      list.appendChild(row);
    }
  };
  $('rooms-search')?.addEventListener('input', (e) => renderRooms(e.target.value));

  const tryJoin = (id) => {
    const rooms = listRooms();
    const r = rooms.find((x) => x.id === id);
    if (!r) { renderRooms($('rooms-search')?.value || ''); return; }
    let pass = '';
    if (r.locked) {
      pass = window.prompt(`🔒 “${r.name}” needs a password:`, '') ?? '';
      if (pass === null) return;
    }
    const res = joinRoom(id, pass);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    openLobby(res.room);
    buzz(12);
  };

  // ---- create room popup ----
  $('btn-create-room')?.addEventListener('click', () => {
    $('cr-name').value = '';
    $('cr-pass').value = '';
    $('cr-error')?.classList.add('hidden');
    show(crModal);
    setTimeout(() => $('cr-name')?.focus(), 50);
  });
  $('btn-cr-cancel')?.addEventListener('click', () => hide(crModal));
  crModal?.addEventListener('click', (e) => { if (e.target === crModal) hide(crModal); });
  $('btn-cr-create')?.addEventListener('click', () => {
    const res = createRoom($('cr-name')?.value || '', $('cr-pass')?.value || '');
    if (res.error) {
      const er = $('cr-error');
      if (er) { er.textContent = res.error; er.classList.remove('hidden'); }
      return;
    }
    hide(crModal);
    renderRooms($('rooms-search')?.value || '');
    openLobby(res.room);
    buzz(15);
  });

  // ---- lobby ----
  const openLobby = (room) => {
    hide(roomsScr);
    $('lobby-name').textContent = `${room.locked ? '🔒 ' : '🌐 '}${room.name}`;
    $('lobby-sub').textContent = `Room • ${room.players}/${room.max} players`;
    const mem = $('lobby-members');
    if (mem) {
      mem.innerHTML = '';
      const you = document.createElement('div');
      you.className = 'member-row';
      you.innerHTML = `♛ <span>You (host)</span><span class="m-you">YOU</span>`;
      const foe = document.createElement('div');
      foe.className = 'member-row';
      foe.innerHTML = `❔ <span>Open slot</span><span class="m-wait">Waiting for opponent…</span>`;
      mem.append(you, foe);
    }
    show(lobbyScr);
    game?.hookMsg?.(`🌐 Room “${room.name}” reserved — waiting for a rival lord.`);
  };
  $('btn-lobby-leave')?.addEventListener('click', () => {
    hide(lobbyScr); show(roomsScr);
    renderRooms($('rooms-search')?.value || '');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (crModal && !crModal.classList.contains('hidden')) hide(crModal);
    }
  });
}

boot();
