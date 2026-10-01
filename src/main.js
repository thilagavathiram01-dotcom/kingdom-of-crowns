import * as THREE from 'three';
import { Game } from './game.js';
import { AIManager } from './ai.js';
import { HUD } from './ui.js';

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

const canvas = document.getElementById('game-canvas');

let hud, ai;
const game = new Game(canvas, {
  onSelect: (sel) => hud?.onSelect(sel),
  onMessage: (t) => hud?.message(t),
  onGameOver: (win, time) => hud?.showGameOver(win, time),
});

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
loop();
