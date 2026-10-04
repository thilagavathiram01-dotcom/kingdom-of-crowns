import * as THREE from 'three';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { HUD } from './ui.js';
import { installRealms } from './realms.js';
import { installWar } from './war.js';
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

let hud, ai;

// All assets (models + music) fully fetched on the splash: the game only
// starts at 100% so nothing stalls mid-game for lack of resources.
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
  let workerModels = null, buildingModels = null, adventurerModels = null;
  try {
    workerModels = await loadWorkerModels();
    setBoot(44);
  } catch (err) {
    console.warn('worker models unavailable — falling back to box workers', err);
    setBoot(44);
  }
  try {
    adventurerModels = await loadAdventurerModels();
    setBoot(64);
  } catch (err) {
    console.warn('adventurer models unavailable — workers fall back to Cave Man rigs', err);
    setBoot(64);
  }
  try {
    buildingModels = await loadBuildingModels();
    setBoot(86);
  } catch (err) {
    console.warn('building models unavailable — falling back to box buildings', err);
    setBoot(86);
  }

  setBoot(93);

  // never leave the player on a frozen splash: surface boot crashes visibly
  let game;
  try {
    game = new Game(canvas, {
      onSelect: (sel) => hud?.onSelect(sel),
      onMessage: (t) => hud?.message(t),
      onGameOver: (win, time) => hud?.showGameOver(win, time),
    }, { workerModels, buildingModels, adventurerModels });
  } catch (err) {
    bootGate?.remove();
    showError(err);
    throw err;
  }

  ai = new AIManager(game);
  installRealms(game, ai);
  installWar(game, ai);
  hud = new HUD(game, ai);
  hud.onSelect([]);

  // starting camera on the human kingdom
  {
    const hq = game.hqOf(game.humanId);
    if (hq) game.camTarget.set(hq.x, 0, hq.z);
  }
  game.setSelection([]);

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
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
  setBoot(100);
  // CoC rule: enter the game ONLY at 100%. Fade the splash, then start loop.
  const finishBoot = () => {
    unmuteMusic();
    try { bgMusic?.play()?.catch?.(() => {}); } catch {}
    bootGate?.classList.add('done');
    setTimeout(() => bootGate?.remove(), 500);
    loop();
  };
  // Autoplay policy: music already loops muted from the splash; if still
  // paused at 100%, one tap unlocks sound + enters (no earlier entry).
  const needTap = !!bgMusic && bgMusic.paused && musicReady;
  if (needTap && btnPlay) {
    btnPlay.classList.remove('hidden');
    setBoot(100);
    btnPlay.addEventListener('click', () => {
      finishBoot();
    }, { once: true });
    bootGate?.addEventListener('pointerdown', () => btnPlay.click(), { once: true });
  } else {
    // small beat at 100% so players actually see the full bar like CoC
    setTimeout(finishBoot, 450);
  }
}
boot();
