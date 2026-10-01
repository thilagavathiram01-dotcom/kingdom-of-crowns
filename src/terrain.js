import * as THREE from 'three';
import { CONFIG } from './config.js';

// Procedural continent: heightfield with mountains, serpentine river + bridges,
// forests, grass. No external models — everything is generated low-poly so
// 30 kingdoms stay at 60fps.

// ---------- seeded rng + value noise ----------
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise2D(rng) {
  const P = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; default: return -x - y;
    }
  };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = P[X] + Y, b = P[X + 1] + Y;
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(grad(P[a], x, y), grad(P[b], x - 1, y), u),
      THREE.MathUtils.lerp(grad(P[a + 1], x, y - 1), grad(P[b + 1], x - 1, y - 1), u), v) * 0.7071;
  };
}

// Level a disc to a clamped height (village pads, bridge fords).
// Target = the site's own height clamped into [yMin, yMax], so pads sit
// naturally in the landscape but are perfectly flat inside.
export function applyFlatten(T, cx, cz, r, yMin = 0.5, yMax = 2.0) {
  const { H, STEP, N, h } = T;
  const idx = (ix, iz) => iz * N + ix;
  const ccx = Math.round((cx + H) / STEP), ccz = Math.round((cz + H) / STEP);
  const base = h[idx(THREE.MathUtils.clamp(ccx, 0, N - 1), THREE.MathUtils.clamp(ccz, 0, N - 1))];
  const target = THREE.MathUtils.clamp(base, yMin, yMax);
  const rr = Math.ceil(r / STEP);
  const inner = r * 0.6; // fully flat core (HQ, barracks, starters all fit)
  for (let dz = -rr; dz <= rr; dz++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const d = Math.hypot(dx * STEP, dz * STEP);
      if (d > r) continue;
      const ix = ccx + dx, iz = ccz + dz;
      if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
      const k = d <= inner ? 1 : THREE.MathUtils.smoothstep(1 - (d - inner) / (r - inner), 0, 1);
      h[idx(ix, iz)] = THREE.MathUtils.lerp(h[idx(ix, iz)], target, k);
    }
  }
  return target;
}

// Score a candidate village site: lower = flatter, drier, further from river.
// Used to pick the calmest 30 of 50 slots.
export function scoreSite(T, x, z) {
  const WL = CONFIG.terrain.waterLevel;
  let worst = -1e9, water = 0;
  const R = 18;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R;
    const y = T.sample ? T.sample(sx, sz) : 0;
    worst = Math.max(worst, y);
    if (y < WL + 0.5) water++;
  }
  const c = T.sample ? T.sample(x, z) : 0;
  worst = Math.max(worst, c);
  const riverD = Math.abs(x - riverX(z));
  const riverPenalty = riverD < 16 ? (16 - riverD) * 2 : 0;
  return Math.max(0, worst - 2.5) * 4 + water * 30 + riverPenalty;
}
export function riverX(z) {
  return 44 * Math.sin(z * 0.016 + 0.5) + 16 * Math.sin(z * 0.043 + 1.7);
}

export function onBridge(x, z) {
  for (const zb of CONFIG.terrain.bridges) {
    if (Math.abs(z - zb) < CONFIG.terrain.bridgeHalf + 2.5 &&
        Math.abs(x - riverX(zb)) < 17) return true;
  }
  return false;
}

// ---------- heightfield generation ----------
// flattenSpots: [{x,z,r}] leveled for kingdom bases.
// repelSpots: [{x,z}] where mountain peaks are suppressed (villages never on cliffs).
export function generateTerrain(size, flattenSpots = [], seed = 1337, repelSpots = []) {
  const rng = makeRng(seed);
  const noise = makeNoise2D(rng);
  const STEP = 2, N = Math.floor(size / STEP) + 1; // 161 for 320m
  const H = size / 2;
  const h = new Float32Array(N * N);
  const fbm = (x, z) =>
    noise(x * 0.008, z * 0.008) * 3.0 +
    noise(x * 0.025 + 7.3, z * 0.025 + 2.1) * 1.1 +
    noise(x * 0.07 + 3.7, z * 0.07 + 9.2) * 0.35;

  // mountain massifs (normalized positions, height, sigma) — tall but narrow,
  // leaving broad plains between them for 30 villages to rise apart
  const peaks = [
    [0.62, 0.55, 15, 22], [-0.66, 0.42, 13, 19], [0.15, -0.68, 16, 22],
    [-0.35, -0.25, 11, 16], [0.72, -0.3, 12, 18], [-0.15, 0.72, 10, 15],
    [0.05, 0.1, 7, 13],
  ].map(([nx, nz, ph, sig]) => ({ x: nx * H, z: nz * H, h: ph, s: sig }));

  const idx = (ix, iz) => iz * N + ix;
  const distToRepel = (x, z) => {
    let m = 1e9;
    for (const s of repelSpots) m = Math.min(m, Math.hypot(x - s.x, z - s.z));
    return m;
  };
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const x = -H + ix * STEP, z = -H + iz * STEP;
      let y = fbm(x, z);
      // suppress peaks near villages: 0 within 20m, full beyond 55m
      let peakGain = 1;
      if (repelSpots.length) {
        const md = distToRepel(x, z);
        peakGain = THREE.MathUtils.smoothstep(md, 20, 55);
      }
      for (const p of peaks) {
        const dx = x - p.x, dz = z - p.z;
        y += p.h * peakGain * Math.exp(-(dx * dx + dz * dz) / (2 * p.s * p.s));
      }
      // river carve
      const rd = Math.abs(x - riverX(z));
      if (rd < CONFIG.terrain.riverWidth + 6) {
        const t = 1 - Math.min(1, rd / (CONFIG.terrain.riverWidth + 6));
        y -= Math.pow(t, 1.4) * 6.5;
      }
      // map rim rises into border cliffs
      const rim = Math.max(Math.abs(x), Math.abs(z)) / H;
      if (rim > 0.93) y += (rim - 0.93) * 120;
      h[idx(ix, iz)] = y;
    }
  }
  // flatten base sites + bridge corridors
  const T0 = { size, H, STEP, N, h };
  for (const s of flattenSpots) applyFlatten(T0, s.x, s.z, s.r || 14, 0.5, 2.5);
  for (const zb of CONFIG.terrain.bridges) {
    applyFlatten(T0, riverX(zb), zb, 20, 0.5, 1.0);
  }

  const sample = (x, z) => {
    const fx = THREE.MathUtils.clamp((x + H) / STEP, 0, N - 1.001);
    const fz = THREE.MathUtils.clamp((z + H) / STEP, 0, N - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = h[idx(ix, iz)], b = h[idx(ix + 1, iz)];
    const c = h[idx(ix, iz + 1)], d = h[idx(ix + 1, iz + 1)];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
  };

  const WL = CONFIG.terrain.waterLevel;
  const blocked = (x, z) => {
    if (Math.abs(x) > H - 2 || Math.abs(z) > H - 2) return true;
    if (onBridge(x, z)) return false;
    const y = sample(x, z);
    if (y > CONFIG.terrain.blockHeight) return true;      // mountain
    if (y < WL + 0.25) return true;                        // water
    return false;
  };

  return { size, H, STEP, N, h, sample, blocked, seed };
}

// ---------- visuals ----------
export function buildTerrainVisuals(scene, T, opts = {}) {
  const rng = makeRng(T.seed + 99);
  const noise = makeNoise2D(rng);
  const { size, H } = T;
  const WL = CONFIG.terrain.waterLevel;

  // --- ground with biome vertex colors ---
  const SEG = Math.min(200, Math.round(size / 2)); // mesh detail scales with map
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass1 = new THREE.Color(0x2e6b34), cGrass2 = new THREE.Color(0x55a047);
  const cMeadow = new THREE.Color(0x77b255), cSand = new THREE.Color(0x9c8a5e);
  const cRock = new THREE.Color(0x5d6673), cSnow = new THREE.Color(0xdfe9f5);
  const cBed = new THREE.Color(0x274035);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = T.sample(x, z);
    pos.setY(i, y);
    // slope estimate
    const sl = Math.abs(T.sample(x + 2, z) - y) + Math.abs(T.sample(x, z + 2) - y);
    const n = noise(x * 0.05, z * 0.05) * 0.5 + 0.5;
    if (y < WL + 0.5) tmp.copy(cBed).lerp(cSand, THREE.MathUtils.clamp((y - WL + 1.5) / 2, 0, 1));
    else if (y < WL + 1.4) tmp.copy(cSand);
    else if (y > 11.5) tmp.copy(cSnow);
    else if (y > CONFIG.terrain.blockHeight || sl > 2.2) tmp.copy(cRock).lerp(cSnow, THREE.MathUtils.clamp((y - 8) / 6, 0, 1));
    else {
      tmp.copy(cGrass1).lerp(cGrass2, n);
      if (noise(x * 0.015 + 40, z * 0.015) > 0.25) tmp.lerp(cMeadow, 0.45); // sunny meadows
    }
    // subtle variation
    const v = 0.94 + rng() * 0.12;
    colors[i * 3] = tmp.r * v; colors[i * 3 + 1] = tmp.g * v; colors[i * 3 + 2] = tmp.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }));
  ground.receiveShadow = true;
  ground.name = 'terrain-ground';
  scene.add(ground);

  // --- water ---
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1e6f8e, transparent: true, opacity: 0.78, roughness: 0.2, metalness: 0.35,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WL;
  water.receiveShadow = true;
  scene.add(water);

  // drifting foam streaks on the river
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.35, depthWrite: false });
  const streaks = [];
  const streakGeo = new THREE.PlaneGeometry(1.6, 5);
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(streakGeo, streakMat);
    m.rotation.x = -Math.PI / 2;
    const z = (rng() - 0.5) * size;
    m.position.set(riverX(z) + (rng() - 0.5) * 8, WL + 0.06, z);
    scene.add(m);
    streaks.push({ m, speed: 1.5 + rng() * 2 });
  }

  // --- bridges (deck across the river, spanning X) ---
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4e3319, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb84d, emissiveIntensity: 1.6 });
  for (const zb of CONFIG.terrain.bridges) {
    const xb = riverX(zb);
    const grp = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 7), woodMat);
    deck.position.y = 1.0; deck.castShadow = deck.receiveShadow = true;
    grp.add(deck);
    for (const s of [-3.2, 3.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 0.3), woodDark);
      rail.position.set(0, 1.9, s); grp.add(rail);
      for (let k = -3; k <= 3; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.35), woodDark);
        post.position.set(k * 5, 1.4, s); grp.add(post);
      }
    }
    for (const s of [-14, 14]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), woodDark);
      pole.position.set(s, 2.4, -3.2); grp.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lampMat);
      lamp.position.set(s, 4.2, -3.2); grp.add(lamp);
    }
    grp.position.set(xb, 0, zb);
    scene.add(grp);
  }

  // --- forests: instanced pines + broadleaf ---
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.2, 6);
  const pineGeo = new THREE.ConeGeometry(1.7, 3.6, 7);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 1 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9142, roughness: 1 });
  const PINE_N = Math.round(size * 1.6), LEAF_N = Math.round(size * 0.65);
  const pines = new THREE.InstancedMesh(trunkGeo, trunkMat, PINE_N);
  const pineTops = new THREE.InstancedMesh(pineGeo, pineMat, PINE_N);
  const leaves = new THREE.InstancedMesh(trunkGeo, trunkMat, LEAF_N);
  const leafTops = new THREE.InstancedMesh(leafGeo, leafMat, LEAF_N);
  const dummy = new THREE.Object3D();
  const obstacles = opts.obstacles; // shared array to fill with colliders
  const avoid = opts.avoid || [];   // [{x,z,r}] keep-outs (bases, bridges)
  const clearOf = (x, z, pad) => {
    if (Math.abs(x - riverX(z)) < CONFIG.terrain.riverWidth + pad) return false;
    if (T.sample(x, z) < WL + 0.8 || T.sample(x, z) > 4.6) return false;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r + pad) return false;
    if (T.blocked(x, z)) return false;
    return true;
  };
  let pi = 0, li = 0, guard = 0;
  const maxOb = CONFIG.terrain.treeColliders;
  while ((pi < PINE_N || li < LEAF_N) && guard++ < 20000) {
    const x = (rng() - 0.5) * (size - 20), z = (rng() - 0.5) * (size - 20);
    // cluster into woods via noise gate
    if (noise(x * 0.02 + 11, z * 0.02 + 5) < 0.12) continue;
    const isPine = rng() < 0.7;
    if (isPine && pi >= PINE_N) continue;
    if (!isPine && li >= LEAF_N) continue;
    if (!clearOf(x, z, 2)) continue;
    const y = T.sample(x, z);
    const s = 0.8 + rng() * 0.9;
    dummy.position.set(x, y + 1.1 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.updateMatrix();
    if (isPine) {
      pines.setMatrixAt(pi, dummy.matrix);
      dummy.position.y = y + (2.2 + 1.8) * s * 0.5 + 0.8 * s;
      dummy.updateMatrix();
      pineTops.setMatrixAt(pi, dummy.matrix);
      if (obstacles && obstacles.length < maxOb && rng() < 0.45) obstacles.push({ x, z, r: 1.3 });
      pi++;
    } else {
      leaves.setMatrixAt(li, dummy.matrix);
      dummy.position.y = y + 2.6 * s;
      dummy.updateMatrix();
      leafTops.setMatrixAt(li, dummy.matrix);
      if (obstacles && obstacles.length < maxOb && rng() < 0.4) obstacles.push({ x, z, r: 1.4 });
      li++;
    }
  }
  pines.count = Math.max(pi, 0); pineTops.count = Math.max(pi, 0);
  leaves.count = Math.max(li, 0); leafTops.count = Math.max(li, 0);
  for (const m of [pines, pineTops, leaves, leafTops]) {
    m.castShadow = true; m.instanceMatrix.needsUpdate = true;
    scene.add(m);
  }

  // --- grass tufts (instanced, no collision/shadow) ---
  const tuftGeo = new THREE.ConeGeometry(0.22, 0.9, 4);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x5da24a, roughness: 1 });
  const TUFTS = Math.round(size * 12);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
  let ti = 0; guard = 0;
  while (ti < TUFTS && guard++ < TUFTS * 6) {
    const x = (rng() - 0.5) * (size - 8), z = (rng() - 0.5) * (size - 8);
    const y = T.sample(x, z);
    if (y < WL + 0.6 || y > 5.5) continue;
    if (Math.abs(x - riverX(z)) < CONFIG.terrain.riverWidth) continue;
    dummy.position.set(x, y + 0.35, z);
    dummy.scale.set(0.7 + rng(), 0.7 + rng() * 1.2, 0.7 + rng());
    dummy.rotation.y = rng() * Math.PI;
    dummy.updateMatrix();
    tufts.setMatrixAt(ti++, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  scene.add(tufts);

  // --- scattered boulders (some collide) ---
  const rockGeo = new THREE.DodecahedronGeometry(1.1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1 });
  const ROCKS = Math.round(size * 0.38);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  let ri = 0; guard = 0;
  while (ri < ROCKS && guard++ < 6000) {
    const x = (rng() - 0.5) * (size - 16), z = (rng() - 0.5) * (size - 16);
    const y = T.sample(x, z);
    if (y < WL + 0.4) continue;
    let bad = false;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r) { bad = true; break; }
    if (bad) continue;
    const s = 0.5 + rng() * 1.3;
    dummy.position.set(x, y + 0.3 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(ri, dummy.matrix);
    if (obstacles && s > 0.9 && obstacles.length < maxOb + 60 && !onBridge(x, z)) obstacles.push({ x, z, r: 1.1 * s });
    ri++;
  }
  rocks.count = Math.max(ri, 1);
  rocks.castShadow = true; rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  // minimap terrain thumbnail (painted once)
  const thumb = document.createElement('canvas');
  thumb.width = thumb.height = 180;
  const tc = thumb.getContext('2d');
  const img = tc.createImageData(180, 180);
  for (let py = 0; py < 180; py++) {
    for (let px = 0; px < 180; px++) {
      const x = (px / 180 - 0.5) * size, z = (py / 180 - 0.5) * size;
      const y = T.sample(x, z);
      let r, g, b;
      if (y < WL) { r = 30; g = 110; b = 140; }
      else if (y < WL + 1.4) { r = 150; g = 135; b = 95; }
      else if (y > 11.5) { r = 225; g = 235; b = 245; }
      else if (y > CONFIG.terrain.blockHeight) { r = 95; g = 102; b = 115; }
      else { r = 38; g = 92; b = 48; }
      const o = (py * 180 + px) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  tc.putImageData(img, 0, 0);

  return { waterMat, waterY: WL, streaks, thumb, tufts };
}
