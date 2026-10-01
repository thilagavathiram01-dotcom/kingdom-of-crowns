import * as THREE from 'three';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { HUD } from './ui.js';
import { loadWorkerModels } from './workers3d.js';

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

let hud, ai;

// worker models are ~1.6MB of glTF: preload before the first frame so workers
// never pop in as boxes. Any failure just keeps the original box workers.
async function boot() {
  let workerModels = null;
  try {
    workerModels = await loadWorkerModels();
  } catch (err) {
    console.warn('worker models unavailable — falling back to box workers', err);
  }

  const game = new Game(canvas, {
    onSelect: (sel) => hud?.onSelect(sel),
    onMessage: (t) => hud?.message(t),
    onGameOver: (win, time) => hud?.showGameOver(win, time),
  }, { workerModels });

  ai = new AIManager(game);
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
  bootGate?.remove();
  loop();
}
boot();
