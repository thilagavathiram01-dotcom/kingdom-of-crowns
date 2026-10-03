import * as THREE from 'three';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { HUD } from './ui.js';
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
const bootLabel = document.getElementById('boot-label');
const bootPct = document.getElementById('boot-pct');
const bootTip = document.getElementById('boot-tip');
const btnPlay = document.getElementById('btn-play');
const bgMusic = document.getElementById('bg-music');
const splashImg = document.getElementById('splash-img');

// splash art must ALWAYS show: resolve against vite base, retry once,
// only then fall back to gradient. Game enters ONLY at 100%.
const BASE = import.meta.env?.BASE_URL || '/';
if (splashImg) {
  const want = BASE + 'splash.jpg';
  if (!String(splashImg.getAttribute('src') || '').endsWith('splash.jpg')) splashImg.src = want;
  else if (new URL(splashImg.src, location.href).pathname !== new URL(want, location.href).pathname) splashImg.src = want;
  splashImg.addEventListener('error', () => {
    // one retry with absolute origin (fixes base-path mismatches on Pages preview)
    const abs = new URL('splash.jpg', location.href).href;
    if (splashImg.src !== abs) splashImg.src = abs;
    else splashImg.style.display = 'none'; // last resort: gradient fallback
  });
}
if (bgMusic) {
  try {
    const wantAudio = BASE + 'audio/fantasy-adventure-quest.mp3';
    if (!bgMusic.getAttribute('src')?.includes('fantasy-adventure')) bgMusic.src = wantAudio;
  } catch {}
}

function setBoot(pct, label) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (bootFill) bootFill.style.width = p + '%';
  if (bootPct) bootPct.textContent = p + '%';
  if (label && bootLabel) bootLabel.textContent = label;
}

// CoC-style rotating tips while assets stream in
const TIPS = [
  'Scout with fast units, wall the bridges, then invade.',
  'Earn logs every day by harvesting with workers.',
  'Walls are cheap — fort your keep before the raids begin.',
  'Barracks raise your supply and train your army.',
  'Turrets guard the gates while your army marches out.',
  'Destroy all 29 rival HQs to take the crown!',
];
let tipIdx = 0;
const tipTimer = setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length;
  if (bootTip && bootGate?.isConnected) bootTip.textContent = TIPS[tipIdx];
}, 4000);

// background music: quiet, loops, starts on first gesture (mobile autoplay policy)
let musicStarted = false;
function startMusic() {
  if (musicStarted || !bgMusic) return;
  musicStarted = true;
  try {
    bgMusic.volume = 0.22;
    bgMusic.loop = true;
    const p = bgMusic.play();
    if (p?.catch) p.catch(() => { musicStarted = false; });
  } catch { musicStarted = false; }
}
['pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, startMusic, { once: false, passive: true })
);
// low-first-listen: try immediately too (desktop usually allows it)
startMusic();

let hud, ai;

// worker models are ~1.6MB of glTF: preload before the first frame so workers
// never pop in as boxes. Any failure just keeps the original box workers.
// Same for the KayKit castle/barracks/tower/wall models (~2MB).
async function boot() {
  setBoot(4, 'Summoning the armies…');
  let workerModels = null, buildingModels = null, adventurerModels = null;
  try {
    workerModels = await loadWorkerModels();
    setBoot(32, 'Arming the cave men…');
  } catch (err) {
    console.warn('worker models unavailable — falling back to box workers', err);
    setBoot(32, 'Arming the cave men…');
  }
  try {
    adventurerModels = await loadAdventurerModels();
    setBoot(58, 'Raising the banners…');
  } catch (err) {
    console.warn('adventurer models unavailable — workers fall back to Cave Man rigs', err);
    setBoot(58, 'Raising the banners…');
  }
  try {
    buildingModels = await loadBuildingModels();
    setBoot(84, 'Building the castles…');
  } catch (err) {
    console.warn('building models unavailable — falling back to box buildings', err);
    setBoot(84, 'Building the castles…');
  }

  setBoot(92, 'Scouting the continent…');

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
  setBoot(100, 'Ready for war!');
  clearInterval(tipTimer);
  startMusic();
  // CoC rule: enter the game ONLY at 100%. Fade the splash, then start loop.
  const finishBoot = () => {
    try { bgMusic?.play()?.catch?.(() => {}); } catch {}
    bootGate?.classList.add('done');
    setTimeout(() => bootGate?.remove(), 500);
    loop();
  };
  // If the browser blocked autoplay, keep the splash with Tap to Play
  // (also unlocks music) instead of dropping straight into the game.
  const needTap = !!bgMusic && bgMusic.paused;
  if (needTap && btnPlay) {
    btnPlay.classList.remove('hidden');
    setBoot(100, 'Ready — tap to play!');
    btnPlay.addEventListener('click', () => {
      startMusic();
      finishBoot();
    }, { once: true });
    // also allow tapping anywhere on the splash (only now that we're at 100%)
    bootGate?.addEventListener('pointerdown', () => btnPlay.click(), { once: true });
  } else {
    // small beat at 100% so players actually see the full bar like CoC
    setTimeout(finishBoot, 450);
  }
}
boot();
