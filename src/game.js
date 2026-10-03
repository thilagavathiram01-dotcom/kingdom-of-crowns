import * as THREE from 'three';
import { CONFIG, COLORS, kingdomColor, kingdomName } from './config.js';
import { generateTerrain, buildTerrainVisuals, riverX, applyFlatten, scoreSite } from './terrain.js';
import { createWorkerRig, updateWorkerRig as animateWorkerRig, WORKER_SCALE, createAdventurerRig, ADVENTURER_SCALE } from './workers3d.js';
import { buildingModel } from './buildings3d.js';

let UID = 1;
// scratch matrices for harvest scaling (no per-chop allocation)
const _sv = new THREE.Matrix4();
const _tm = new THREE.Matrix4();

export class Game {
  constructor(canvas, hooks, assets = {}) {
    this.canvas = canvas;
    this.hooks = hooks; // { onSelect, onResources, onMessage, onGameOver }
    // skinned Cave Man worker models, or null -> plain box workers
    this.workerModels = !!assets.workerModels;
    // medieval adventurer models for workers, or null -> Cave Man / box fallback
    this.adventurerModels = !!assets.adventurerModels;
    // KayKit castle/barracks/tower/wall models, or null -> procedural boxes
    this.buildingModels = !!assets.buildingModels;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 60, 160);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camYaw = 0; this.camDist = 42; this.camPitch = 0.95;

    this.ray = new THREE.Raycaster();
    this.mouseNDC = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.units = [];
    this.buildings = [];
    this.resources = [];
    this.projectiles = [];
    this.particles = [];
    this.selected = [];
    this.groups = { '1': null, '2': null, '3': null, '4': null };
    // pathfinding cache (invalidated whenever buildings change)
    this.colliderVersion = 0;
    this.pathCache = new Map();
    // fog of war state
    this.fogN = 128;
    this.explored = new Uint8Array(this.fogN * this.fogN);
    this.visibleF = new Uint8Array(this.fogN * this.fogN);
    this.fogT = 0;
    // spatial hash for unit queries (rebuilt each frame)
    this.gridCell = 6;
    this.unitGrid = new Map();
    // static tree-position grid (built once in buildForestResources, but
    // spawn code queries it during initMap before that — init empty)
    this._resGrid = new Map(); this._resCell = 8;

    // ---- kingdoms: k0 = human, k1..k29 = AI ----
    this.humanId = 'k0';
    this.players = {};
    const startLogs = CONFIG.startLogs ?? CONFIG.startCrystals;
    for (let i = 0; i < CONFIG.kingdoms; i++) {
      const id = `k${i}`;
      this.players[id] = {
        id, idx: i, name: kingdomName(i), color: kingdomColor(i),
        logs: startLogs * (i === 0 ? 1 : 0.9 + Math.random() * 0.3),
        get crystals() { return this.logs; },
        set crystals(v) { this.logs = v; },
        alive: true,
      };
    }

    // candidate HQ sites on a jittered grid; peaks are repelled from all of
    // them, then the 30 flattest well-spread sites become villages with pads.
    // Fresh seed every game: a new continent each saga.
    this.obstacles = [];
    this.slots = this.layoutSlots();
    this.terrain = generateTerrain(CONFIG.mapSize, [], Math.floor(Math.random() * 1e9), this.slots);
    this.kingdomSpawns = this.pickKingdomSpawns(this.slots, CONFIG.kingdoms);
    for (const s of this.kingdomSpawns) applyFlatten(this.terrain, s.x, s.z, 24, 0.5, 2.0);

    this.time = 0;
    this.over = false;
    this.keys = {};
    this.attackMove = false;
    // perf auto-scale: weak GPUs step down resolution/shadows instead of freezing
    this.perf = { ema: 16, level: 0, t: 0, last: performance.now() };

    this.initScene();
    this.initMap();
    this.initInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  isHuman(id) { return id === this.humanId; }

  kingdomIds() { return Object.keys(this.players); }

  aliveKingdoms() {
    return this.kingdomIds().filter(id => this.players[id].alive);
  }

  // power score for rank display
  powerOf(id) {
    let s = 0;
    for (const u of this.units) if (u.owner === id && !u.dead) s += u.hp + u.damage * 4;
    for (const b of this.buildings) if (b.owner === id && !b.dead) s += b.hp;
    return s;
  }

  playerRank() {
    // 30 powerOf scans x ~2000 entities ran twice a frame (AI + HUD):
    // cache for a second, ranks don't need frame accuracy
    if (this._rankCache && this.time - this._rankCache.t < 1.0) return this._rankCache.v;
    const order = this.kingdomIds().filter(id => this.players[id].alive).sort((a, b) => this.powerOf(b) - this.powerOf(a));
    const v = { rank: order.indexOf(this.humanId) + 1, alive: order.length };
    this._rankCache = { t: this.time, v };
    return v;
  }

  layoutSlots() {
    // Jittered grid, sized BY the spacing we want: if the candidate cells are
    // tighter than kingdomSpacing then no amount of sampling can keep two
    // villages apart, because the neighbours are already that close.
    const H = CONFIG.mapSize / 2, span = 2 * H - 32, out = [];
    let G = Math.max(2, Math.round(span / CONFIG.kingdomSpacing));
    if (G * G < CONFIG.kingdoms) G = Math.ceil(Math.sqrt(CONFIG.kingdoms));
    const cell = span / G;
    const jit = cell * 0.07; // small: jitter must not eat the spacing floor
    for (let gx = 0; gx < G; gx++) {
      for (let gz = 0; gz < G; gz++) {
        out.push({
          x: THREE.MathUtils.clamp(-H + 16 + cell * (gx + 0.5) + (Math.random() - 0.5) * jit, -H + 16, H - 16),
          z: THREE.MathUtils.clamp(-H + 16 + cell * (gz + 0.5) + (Math.random() - 0.5) * jit, -H + 16, H - 16),
        });
      }
    }
    return out;
  }

  pickKingdomSpawns(slots, k) {
    // drop rough sites (water/hill), then pure farthest-point sampling:
    // each new village goes where it is farthest from all settled ones,
    // so kingdoms end up BOTH on flat land AND far apart
    const scored = slots.map(s => ({ ...s, score: scoreSite(this.terrain, s.x, s.z) }));
    let pool = scored.filter(s => s.score <= 45).sort((a, b) => a.score - b.score);
    if (pool.length < k + 4) pool = scored.sort((a, b) => a.score - b.score).slice(0, k + 14);
    const picked = [pool[0]];
    const rest = pool.slice(1);
    while (picked.length < k && rest.length) {
      let bi = 0, bd = -1;
      for (let i = 0; i < rest.length; i++) {
        let md = 1e9;
        for (const p of picked) md = Math.min(md, Math.hypot(rest[i].x - p.x, rest[i].z - p.z));
        if (md > bd) { bd = md; bi = i; }
      }
      picked.push(rest.splice(bi, 1)[0]);
    }
    // improvement pass: trade the closest pair's village for a farther flat
    // site when one exists (protects unlucky seeds)
    const gapInfo = (pts) => {
      let m = 1e9, ai = 0, aj = 1;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        if (d < m) { m = d; ai = i; aj = j; }
      }
      return { m, ai, aj };
    };
    for (let it = 0; it < 60; it++) {
      const { m, ai, aj } = gapInfo(picked);
      if (m >= CONFIG.kingdomSpacing || !rest.length) break;
      // cheap first: slide the two closest villages apart inside their own
      // jitter margin - keeps the spacing without giving up good terrain
      {
        const cell = (2 * (CONFIG.mapSize / 2) - 32) / Math.max(2, Math.round((CONFIG.mapSize - 32) / CONFIG.kingdomSpacing));
        const step = cell * 0.14;
        const minTo = (p, idx, skip) => {
          let md = 1e9;
          for (let i = 0; i < picked.length; i++) {
            if (i === idx || i === skip) continue;
            md = Math.min(md, Math.hypot(p.x - picked[i].x, p.z - picked[i].z));
          }
          return md;
        };
        for (const idx of [ai, aj]) {
          const other = idx === ai ? aj : ai;
          const start = minTo(picked[idx], idx, other);
          if (start > m) continue; // this one is not the problem
          const away = { x: picked[idx].x - picked[other].x, z: picked[idx].z - picked[other].z };
          const al = Math.hypot(away.x, away.z) || 1;
          const ux = away.x / al, uz = away.z / al;
          const lim = CONFIG.mapSize / 2 - 16;
          let bx = picked[idx].x, bz = picked[idx].z, bd = start;
          // walk outward along the away direction, fanning out a little
          for (const [fx, fz] of [[1, 0], [0.94, 0.34], [0.34, 0.94], [0, 1], [-0.34, 0.94], [-0.94, 0.34], [-1, 0], [-0.94, -0.34]]) {
            for (let k = 1; k <= 5; k++) {
              const nx = THREE.MathUtils.clamp(picked[idx].x + (ux * fx - uz * fz) * step * k, -lim, lim);
              const nz = THREE.MathUtils.clamp(picked[idx].z + (uz * fx + ux * fz) * step * k, -lim, lim);
              const md = minTo({ x: nx, z: nz }, idx, other);
              if (md > bd) { bd = md; bx = nx; bz = nz; }
            }
          }
          if (bd > start + 0.01) { picked[idx].x = bx; picked[idx].z = bz; }
        }
        if (gapInfo(picked).m > m) continue;
      }
      let swapped = false;
      for (const idx of [ai, aj]) {
        let bs = null, bv = m;
        for (const s of rest) {
          if (s.score > 60) continue;
          let md = 1e9;
          for (let i = 0; i < picked.length; i++) {
            if (i === idx) continue;
            md = Math.min(md, Math.hypot(s.x - picked[i].x, s.z - picked[i].z));
          }
          if (md > bv) { bv = md; bs = s; }
        }
        if (bs) {
          rest.splice(rest.indexOf(bs), 1);
          rest.push(picked[idx]);
          picked[idx] = bs;
          swapped = true;
          break;
        }
      }
      if (!swapped) break;
    }
    return picked.slice(0, k);
  }

  gy(x, z) { return this.terrain ? this.terrain.sample(x, z) : 0; }

  mapBound(margin = 4) { return CONFIG.mapSize / 2 - margin; }

  // ---------- setup ----------
  initScene() {
    const size = CONFIG.mapSize;
    // sky dome gradient (scaled to the continent)
    const skyGeo = new THREE.SphereGeometry(700, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x1a2a5e) },
        mid: { value: new THREE.Color(0x274b73) },
        bottom: { value: new THREE.Color(0x0b0e14) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h=normalize(vP).y; vec3 c = h>0.12 ? mix(mid,top,smoothstep(0.12,0.75,h)) : mix(bottom,mid,smoothstep(-0.08,0.12,h)); gl_FragColor=vec4(c,1.0); }',
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    // stars
    {
      const n = 600, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 640;
        pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
        pos[i * 3 + 1] = Math.sin(e) * r;
        pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x93c5fd, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false })));
    }

    // low moon + warm sun; shadow frustum follows the camera (updated per frame)
    {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xe8f1ff, fog: false }));
      moon.position.set(-320, 300, -420);
      this.scene.add(moon);
    }
    this.scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x1a241d, 0.95));
    const sun = new THREE.DirectionalLight(0xffd9b0, 1.7);
    sun.position.set(60, 95, 40);
    sun.castShadow = true;
    // touch GPUs get a smaller shadow map at boot (shadows stay ON, just cheaper);
    // desktop keeps full 2048. The auto-perf governor adjusts from here.
    const isTouchGPU = (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) || ('ontouchstart' in window);
    sun.shadow.mapSize.set(isTouchGPU ? 1024 : 2048, isTouchGPU ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 320 });
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.5);
    rim.position.set(-35, 20, -30);
    this.scene.add(rim);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camera.far = 1600;
    this.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(0x0b0e14, 110, 640);
    this.camDist = 58;

    // ---- continent: heightfield ground, river + bridges, forests, grass ----
    const avoid = this.kingdomSpawns.map(s => ({ x: s.x, z: s.z, r: 26 }));
    for (const zb of CONFIG.terrain.bridges) avoid.push({ x: riverX(zb), z: zb, r: 20 });
    const fx = buildTerrainVisuals(this.scene, this.terrain, { obstacles: this.obstacles, avoid });
    this.waterFx = fx;
    this.terrainThumb = fx.thumb;

    // ---- fog of war shroud: canvas texture over the map ----
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = this.fogN;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(this.fogN, this.fogN);
    // start fully unexplored
    for (let i = 0; i < this.fogImg.data.length; i += 4) {
      this.fogImg.data[i] = 3; this.fogImg.data[i + 1] = 5;
      this.fogImg.data[i + 2] = 10; this.fogImg.data[i + 3] = 255;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    const fogMat = new THREE.MeshBasicMaterial({ map: this.fogTex, transparent: true, depthWrite: false });
    this.fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fogMat);
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.position.y = 9;
    this.fogMesh.renderOrder = 2;
    this.scene.add(this.fogMesh);

    // glowing continent-rim marker (rim cliffs rise at the map edge)
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size + 0.4, 0.5, size + 0.4)),
      new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.35 })
    );
    edge.position.y = 0.25;
    this.scene.add(edge);
  }

  makeHealthBar(w = 1.6) {
    const grp = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.18), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.18), new THREE.MeshBasicMaterial({ color: 0x4ade80, depthTest: false, transparent: true }));
    fg.position.z = 0.001;
    grp.add(bg, fg);
    // hidden until damaged/selected: ~2000 entities x 2 transparent planes
    // was always drawn + sorted every frame (a major mobile GPU cost)
    grp.visible = false;
    grp.userData.set = (pct, friendly) => {
      fg.scale.x = Math.max(0.001, pct);
      fg.position.x = -w * (1 - pct) / 2;
      fg.material.color.set(friendly ? 0x4ade80 : 0xef4444);
    };
    return grp;
  }

  addSelectionRing(obj, radius, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.12, radius, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    obj.add(ring);
    return ring;
  }

  // walls are long thin boxes, so a circle would lie about their footprint:
  // draw the real oriented rectangle instead
  addWallRing(obj, L, T, color) {
    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(L + 0.35, 0.02, T + 0.35)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    ring.position.y = 0.08;
    ring.visible = false;
    obj.add(ring);
    return ring;
  }

  initMap() {
    const H = CONFIG.mapSize / 2;
    // one HQ + barracks + small starters per kingdom (rise, don't rush).
    // No automatic walls: every kingdom starts in the open so armies, workers
    // and AI expansion never get trapped behind their own palisade. Players
    // who want walls place them by hand with the Wall command.
    this.kingdomIds().forEach((id, i) => {
      const s = this.kingdomSpawns[i];
      const hq = this.spawnBuilding('hq', id, s.x, s.z);
      const raxR = CONFIG.buildings.barracks.size * 0.72;
      const off = hq.radius + raxR + 2.5; // breathing room: never overlap the HQ
      const bx = THREE.MathUtils.clamp(s.x + off, -H + 6, H - 6);
      const bz = THREE.MathUtils.clamp(s.z + 1, -H + 6, H - 6);
      const fx = THREE.MathUtils.clamp(s.x - off, -H + 6, H - 6);
      this.spawnBuilding('barracks', id,
        this.isSpotFree(bx, bz, raxR + 0.5) ? bx : fx,
        this.isSpotFree(bx, bz, raxR + 0.5) ? bz : s.z + 1);
      for (let k = 0; k < 3; k++) this.spawnUnit('worker', id, s.x + 3 + k * 1.5, s.z + 5);
      this.spawnUnit('soldier', id, s.x + 3, s.z + 8);
      this.spawnUnit('scout', id, s.x + 5, s.z + 8);
      this.spawnUnit('brute', id, s.x - 2, s.z + 7.5);
    });

    // timber economy: EVERY terrain tree is harvestable. Workers only chop
    // when ordered (tap a tree with workers selected); otherwise they stand
    // idle. Chopped trees shrink to stumps and grow back, so logs never run out.
    this.buildForestResources(this.waterFx?.trees || []);

    this.hookMsg(`War of Crowns — ${CONFIG.kingdoms} kingdoms, a ~1 hour saga. Rise in peace, then dominate them all!`);
    this.updateFog();
  }

  // ---------- entities ----------
  teamColor(id) { return this.players[id].color; }

  spawnUnit(type, owner, x, z) {
    const st = CONFIG.units[type];
    const free = this.findFreeSpot(x, z, st.radius);
    x = free.x; z = free.z;
    const g = new THREE.Group();
    let body;
    let rig = null;
    // Cave Man rig drives the club/spear troops; workers wear the adventurer
    // models first and fall back to the Cave Man rig, then plain boxes.
    const CAVEMAN = { worker: 1, brute: 1.16, hunter: 0.94 };
    const cav = CAVEMAN[type];
    if (type === 'worker' && this.adventurerModels) rig = createAdventurerRig(this.teamColor(owner), ADVENTURER_SCALE);
    if (!rig && cav && this.workerModels) rig = createWorkerRig(this.teamColor(owner), WORKER_SCALE * cav);
    const mat = new THREE.MeshStandardMaterial({ color: this.teamColor(owner), roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    if (type === 'worker') {
      // box stays as the far-LOD stand-in once the Cave Man rig takes over
      body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
      body.position.y = 0.55;
      if (rig) body.visible = false;
      else {
        const helm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), dark);
        helm.position.y = 1.15; g.add(helm);
      }
    } else if (type === 'brute') {
      // club brawler: heavy shoulders, stone maul
      body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.6, 4, 10), mat);
      body.position.y = 0.9;
      if (rig) body.visible = false;
      const maul = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 6), dark);
      maul.position.set(0.42, 1.15, 0.5); maul.rotation.x = 0.9; g.add(maul);
      const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 }));
      knot.position.set(0.62, 1.72, 0.95); g.add(knot);
    } else if (type === 'hunter') {
      // spear thrower: light frame, long reach
      body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.8, 4, 10), mat);
      body.position.y = 0.85;
      if (rig) body.visible = false;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
      shaft.position.set(0.36, 1.15, 0.55); shaft.rotation.x = Math.PI / 2 - 0.12; g.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 5),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5, metalness: 0.3 }));
      tip.position.set(0.36, 1.24, 1.7); tip.rotation.x = Math.PI / 2; g.add(tip);
    } else if (type === 'soldier') {
      body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.7, 4, 10), mat);
      body.position.y = 0.85;
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), dark);
      gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.9, 0.8); g.add(gun);
    } else if (type === 'scout') {
      body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 6), mat);
      body.position.y = 0.7;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(0, 0.85, 0.35); g.add(eye);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark);
      dish.position.y = 1.3; g.add(dish);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      tip.position.y = 1.75; g.add(tip);
    } else if (type === 'artillery') {
      body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.4), mat);
      body.position.y = 0.55;
      const tur = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.2), dark);
      tur.position.y = 1.1; g.add(tur);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.2, 8), dark);
      barrel.rotation.x = Math.PI / 2 - 0.25; barrel.position.set(0, 1.5, 1.4); g.add(barrel);
    } else {
      body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 2.1), mat);
      body.position.y = 0.55;
      const tur = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), dark);
      tur.position.y = 1.05; g.add(tur);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), dark);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.05, 1.2); g.add(barrel);
    }
    body.castShadow = true;
    g.add(body);
    if (rig) g.add(rig.root);
    // team underglow disc + worker log bundle (carried timber)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(st.radius + 0.15, 24),
      new THREE.MeshBasicMaterial({ color: this.teamColor(owner), transparent: true, opacity: 0.35 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04;
    g.add(glow);
    let gem = null;
    if (type === 'worker') {
      gem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, emissive: 0x5b3a1e, emissiveIntensity: 0.5, roughness: 0.9 }));
      gem.rotation.z = Math.PI / 2;
      gem.position.y = 1.5; gem.visible = false;
      g.add(gem);
    }
    g.position.set(x, this.gy(x, z), z);
    const bar = this.makeHealthBar(type === 'tank' || type === 'brute' ? 2 : 1.5);
    bar.position.y = type === 'tank' || type === 'brute' ? 2.2 : 2.0;
    g.add(bar);
    const ring = this.addSelectionRing(g, st.radius + 0.35, COLORS.select);
    this.scene.add(g);
    const u = {
      id: UID++, kind: 'unit', type, owner, mesh: g, gem, ring, bar, body, rig,
      x, z, hp: st.hp, maxHp: st.hp, speed: st.speed,
      damage: st.damage, range: st.range, cooldown: st.cooldown, aggro: st.aggro,
      radius: st.radius, cd: Math.random() * 0.3, tx: x, tz: z, hasOrder: false,
      target: null, attackMove: false, harvestTarget: null, carrying: 0, gathering: 0,
      dead: false, idleT: 0, lastX: x, lastZ: z, stuckT: 0,
      holdPosition: false,
    };
    this.units.push(u);
    return u;
  }

  // KayKit visual for a building, or null -> caller builds the box fallback.
  // The 4 baked team colors cycle by kingdom index, then the whole model is
  // tinted toward the exact kingdom colour; flags/trim/minimap agree.
  buildingModelFor(type, owner, targetW) {
    if (!this.buildingModels) return null;
    return buildingModel(type, (this.players[owner]?.idx ?? 0) % 4, targetW, this.teamColor(owner));
  }

  spawnBuilding(type, owner, x, z, rot = 0, len) {
    const st = CONFIG.buildings[type];
    const s = st.size;
    const g = new THREE.Group();
    if (type === 'wall') {
      // long, thin, rotatable palisade. len lets fort runs stretch a piece so
      // walls tile edge-to-edge instead of leaving unit-sized gaps.
      const L = len ?? s, T = st.thick;
      const km = this.buildingModelFor('wall', owner, 2);
      if (km) {
        // KayKit stone wall stretched to the slot; the team cap on top keeps
        // ownership readable at RTS zoom.
        km.model.scale.set(L / km.size.x, 2.0 / km.size.y, T / km.size.z);
        g.add(km.model);
      } else {
        const block = new THREE.Mesh(new THREE.BoxGeometry(L, 2.0, T),
          new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 }));
        block.position.y = 1.0; block.castShadow = block.receiveShadow = true;
        g.add(block);
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.16, T * 0.5),
        new THREE.MeshStandardMaterial({ color: this.teamColor(owner), emissive: this.teamColor(owner), emissiveIntensity: 0.45 }));
      cap.position.y = 2.02; // thin team trim on the stone top, not a full cap
      g.add(cap);
      g.rotation.y = rot; // long axis starts along +X, 90deg turns it down +Z
      g.position.set(x, this.gy(x, z), z);
      const bar = this.makeHealthBar(Math.min(L, 3.2)); // bar tracks a long wall's width
      bar.position.y = 2.9;
      g.add(bar);
      const ring = this.addWallRing(g, L, T, COLORS.select);
      this.scene.add(g);
      const b = {
        id: UID++, kind: 'building', type, owner, mesh: g, ring, bar,
        x, z, hp: st.hp, maxHp: st.hp, size: L, rot,
        // oriented-box footprint: hw along the wall, hd across it. Collision
        // and pathing use the box, so long walls block like real fortifications.
        hw: L * 0.5, hd: T * 0.5, rotC: Math.cos(rot), rotS: Math.sin(rot),
        radius: Math.hypot(L * 0.5, T * 0.5), // bounding radius for broad phase
        queue: [], dead: false,
      };
      this.resetRally(b);
      this.buildings.push(b);
      this.colliderVersion++;
      return b;
    }
    if (type === 'turret') {
      const km = this.buildingModelFor('turret', owner, 2.4);
      let head, barY;
      if (km) {
        // KayKit watchtower; a small team cannon on top keeps aim feedback
        g.add(km.model);
        head = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
          new THREE.MeshStandardMaterial({ color: this.teamColor(owner), emissive: this.teamColor(owner), emissiveIntensity: 0.5 }));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.7, 6),
          new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.7);
        barrel.castShadow = true;
        head.add(hub, barrel);
        head.position.y = km.height * 0.82;
        g.add(head);
        barY = km.height + 0.8;
      } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.42, s * 0.5, 1.4, 8),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
        base.position.y = 0.7; base.castShadow = true;
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.46, s * 0.46, 0.3, 8),
          new THREE.MeshStandardMaterial({ color: this.teamColor(owner), emissive: this.teamColor(owner), emissiveIntensity: 0.5 }));
        collar.position.y = 1.5;
        head = new THREE.Group();
        const dome = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }));
        dome.position.y = 1.9; dome.castShadow = true;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.8, 6),
          new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.9, 1.0);
        head.add(dome, barrel);
        g.add(base, collar, head);
        barY = 3.4;
      }
      g.position.set(x, this.gy(x, z), z);
      const bar = this.makeHealthBar(s * 0.9);
      bar.position.y = barY;
      g.add(bar);
      const ring = this.addSelectionRing(g, s * 0.75 + 0.4, COLORS.select);
      this.scene.add(g);
    const b = {
      id: UID++, kind: 'building', type, owner, mesh: g, ring, bar, head,
      x, z, hp: st.hp, maxHp: st.hp, size: s, radius: s * 0.72,
      queue: [], progress: 0, dead: false, cd: 0,
    };
    this.resetRally(b);
    this.buildings.push(b);
    this.colliderVersion++;
    return b;
  }
    const km = this.buildingModelFor(type, owner, type === 'hq' ? 5.2 : 3.6);
    let barY;
    if (km) {
      // KayKit castle / barracks; the rally flag keeps exact kingdom identity
      g.add(km.model);
      barY = km.height + 0.8;
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(s, type === 'hq' ? 3.2 : 2.4, s),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }));
      base.position.y = type === 'hq' ? 1.6 : 1.2;
      base.castShadow = base.receiveShadow = true;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(s + 0.4, 0.4, s + 0.4),
        new THREE.MeshStandardMaterial({ color: this.teamColor(owner), emissive: this.teamColor(owner), emissiveIntensity: 0.35 }));
      trim.position.y = type === 'hq' ? 3.3 : 2.5;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(s * 0.42, 1.6, 4),
        new THREE.MeshStandardMaterial({ color: 0x475569 }));
      roof.position.y = type === 'hq' ? 4.2 : 3.3;
      roof.rotation.y = Math.PI / 4;
      g.add(base, trim, roof);
      // windows glow strip for HQ
      if (type === 'hq') {
        const win = new THREE.Mesh(new THREE.BoxGeometry(s + 0.1, 0.35, s + 0.1),
          new THREE.MeshBasicMaterial({ color: 0xfde68a }));
        win.position.y = 2.2; g.add(win);
      }
      barY = type === 'hq' ? 5.6 : 4.6;
    }
    // rally flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    pole.position.set(s / 2 - 0.3, 1.5, s / 2 - 0.3); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ color: this.teamColor(owner), side: THREE.DoubleSide }));
    flag.position.set(s / 2 + 0.25, 2.6, s / 2 - 0.3); g.add(flag);
    g.position.set(x, this.gy(x, z), z);
    const bar = this.makeHealthBar(s * 0.9);
    bar.position.y = barY;
    g.add(bar);
    const ring = this.addSelectionRing(g, s * 0.75 + 0.4, COLORS.select);
    this.scene.add(g);
    const b = {
      id: UID++, kind: 'building', type, owner, mesh: g, ring, bar, flag,
      x, z, hp: st.hp, maxHp: st.hp, size: s, radius: s * 0.72,
      queue: [], progress: 0, buildTime: 0, dead: false,
    };
    this.resetRally(b);
    this.buildings.push(b);
    this.colliderVersion++;
    return b;
  }

  // shared tree geometry/materials (hundreds of harvestable trees)
  // ---- harvestable terrain forest -------------------------------------
  // Workers chop the REAL terrain trees (no planted groves, no crystals).
  // Each resource is a logical entry bound to a terrain instance: chopping
  // shrinks that instance, at 0 it hides + leaves a stump, and it regrows
  // after CONFIG.resource.regrowTime so timber never runs out.
  buildForestResources(spots) {
    const [lo, hi] = CONFIG.resource?.treeAmount ?? [260, 460];
    // one shared stump field: a stump instance appears only while its tree is down
    const stumpGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.7, 7);
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0x4e3319, roughness: 1 });
    const stumps = new THREE.InstancedMesh(stumpGeo, stumpMat, Math.max(1, spots.length));
    {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < spots.length; i++) stumps.setMatrixAt(i, zero);
      stumps.instanceMatrix.needsUpdate = true;
    }
    stumps.castShadow = true;
    this.scene.add(stumps);
    this.stumpMesh = stumps;
    // instanceId -> resource, per tree mesh, for tap-to-chop picking
    this.treePick = [];
    const byMesh = new Map();
    spots.forEach((sp, i) => {
      const amt = lo + Math.random() * (hi - lo);
      const r = { id: UID++, kind: 'resource', rtype: 'tree',
        x: sp.x, z: sp.z, amount: amt, max: amt, radius: 1.4,
        dead: false, depleted: false, regrowT: 0, stumpIdx: i, spot: sp };
      this.resources.push(r);
      for (const mesh of [sp.trunkMesh, sp.topMesh]) {
        let m = byMesh.get(mesh);
        if (!m) { m = new Map(); byMesh.set(mesh, m); }
        m.set(sp.idx, r);
      }
    });
    for (const [mesh, map] of byMesh) {
      mesh.userData.treeRes = map;
      this.treePick.push(mesh);
    }
    // static position grid: tree spots never move (built once, queried often)
    this._resGrid = new Map(); this._resCell = 8;
    const H = CONFIG.mapSize / 2;
    this.resources.forEach((r, i) => {
      const k = Math.floor((r.x + H) / 8) * 1000 + Math.floor((r.z + H) / 8);
      let a = this._resGrid.get(k);
      if (!a) { a = []; this._resGrid.set(k, a); }
      a.push(i);
    });
  }

  eachResourceNear(x, z, r, cb) {
    if (!this._resGrid) return;
    const H = CONFIG.mapSize / 2, c = this._resCell || 8;
    const ix0 = Math.floor((x - r + H) / c), ix1 = Math.floor((x + r + H) / c);
    const iz0 = Math.floor((z - r + H) / c), iz1 = Math.floor((z + r + H) / c);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const a = this._resGrid.get(ix * 1000 + iz);
        if (!a) continue;
        for (const i of a) {
          const res = this.resources[i];
          if (res && cb(res) === false) return;
        }
      }
    }
  }

  // rescale the bound terrain instances to match remaining logs
  syncTree(r) {
    const sp = r.spot;
    if (!sp) return;
    const frac = Math.max(0, r.amount / r.max);
    const f = frac <= 0 ? 0 : 0.3 + 0.7 * frac;
    _sv.makeScale(f, f, f);
    _tm.copy(sp.trunkMat).multiply(_sv);
    sp.trunkMesh.setMatrixAt(sp.idx, _tm);
    _tm.copy(sp.topMat).multiply(_sv);
    sp.topMesh.setMatrixAt(sp.idx, _tm);
    if (this.stumpMesh) {
      if (frac <= 0) {
        _tm.makeTranslation(r.x, this.gy(r.x, r.z) + 0.35, r.z);
        this.stumpMesh.setMatrixAt(r.stumpIdx, _tm);
      } else {
        _tm.makeScale(0, 0, 0);
        this.stumpMesh.setMatrixAt(r.stumpIdx, _tm);
      }
    }
    this._treeDirty = true;
  }

  flushTreeMatrices() {
    if (!this._treeDirty) return;
    this._treeDirty = false;
    const seen = new Set();
    for (const r of this.resources) {
      if (!r.spot) continue;
      if (!seen.has(r.spot.trunkMesh)) { seen.add(r.spot.trunkMesh); r.spot.trunkMesh.instanceMatrix.needsUpdate = true; }
      if (!seen.has(r.spot.topMesh)) { seen.add(r.spot.topMesh); r.spot.topMesh.instanceMatrix.needsUpdate = true; }
    }
    if (this.stumpMesh) this.stumpMesh.instanceMatrix.needsUpdate = true;
  }

  resourceReady(r) {
    return r && !r.dead && !r.depleted && r.amount > 0;
  }

  regrowTrees(dt) {
    const [rlo, rhi] = CONFIG.resource?.regrowTime ?? [55, 115];
    for (const r of this.resources) {
      if (r.dead || !r.depleted) continue;
      r.regrowT -= dt;
      if (r.regrowT <= 0) {
        r.amount = r.max;
        r.depleted = false;
        this.syncTree(r);
        this.burst(r.x, this.gy(r.x, r.z) + 2, r.z, 0x4ade80, 8, 3);
      }
    }
    // timber is endless through regrowth: nothing is ever spawned or removed
  }

  spawnProjectile(from, to, color, damage, target, splash = 0, owner = 'k0') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color }));
    m.position.copy(from);
    this.scene.add(m);
    this.projectiles.push({ mesh: m, from: from.clone(), to: to.clone(), t: 0, dur: 0.22, damage, target, splash, owner });
  }

  // ---------- input (mouse + touch, no hotkey conflicts) ----------
  initInput() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', e => e.preventDefault());
    this.dragging = false; this.dragStart = null; this.dragCur = null;
    this.pendingOrder = null;   // 'move' | 'attack' | 'harvest' | null (mobile + M key)
    this.placement = null;      // { type:'barracks', x, z, valid } ghost preview
    this.touchState = null;
    // MOBILE INPUT ONLY: camera-pan vs box-select for single-finger drag.
    // Real mobile RTS = drag pans the map; box-select is opt-in via dock toggle.
    // Game simulation / orders / AI untouched.
    this.panMode = (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) || ('ontouchstart' in window);
    this._isTouch = this.panMode;
    const box = document.getElementById('selection-box');

    const panByPixels = (dxPx, dyPx) => {
      const s = this.camDist / 700;
      const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
      const r = new THREE.Vector3(f.z, 0, -f.x);
      this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x - dxPx * s * r.x, -this.mapBound(4), this.mapBound(4));
      this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z - dxPx * s * r.z - dyPx * s, -this.mapBound(4), this.mapBound(4));
    };
    const buzz = (ms = 12) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ } };

    const setBox = (a, b) => {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      box.classList.remove('hidden');
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(b.x - a.x) + 'px', height: Math.abs(b.y - a.y) + 'px' });
    };

    el.addEventListener('mousedown', e => {
      if (this.over) return;
      // placement confirm / cancel
      if (this.placement) {
        if (e.button === 2) { this.cancelPlacement(); return; }
        if (e.button === 0) {
          const p = this.screenToGround(e.clientX, e.clientY);
          if (p) this.confirmPlacement(p.x, p.z);
          return;
        }
      }
      if (e.button === 0) { this.dragging = true; this.dragStart = { x: e.clientX, y: e.clientY }; this.dragCur = { ...this.dragStart }; }
      if (e.button === 1) { this.rotating = true; this.lastMX = e.clientX; e.preventDefault(); }
    });
    window.addEventListener('mousemove', e => {
      this.mouseNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.placement) {
        const p = this.screenToGround(e.clientX, e.clientY);
        if (p) this.updateGhost(p.x, p.z);
      }
      if (this.dragging && this.dragStart) {
        this.dragCur = { x: e.clientX, y: e.clientY };
        setBox(this.dragStart, this.dragCur);
      }
      if (this.rotating) { this.camYaw += (e.clientX - this.lastMX) * 0.005; this.lastMX = e.clientX; }
    });
    window.addEventListener('mouseup', e => {
      box.classList.add('hidden');
      if (e.button === 1) { this.rotating = false; return; }
      if (this.placement) return; // handled on mousedown
      if (e.button === 0 && this.dragging) {
        this.dragging = false;
        const dx = Math.abs(e.clientX - this.dragStart.x), dy = Math.abs(e.clientY - this.dragStart.y);
        if (dx < 8 && dy < 8) this.tapSelect(e.clientX, e.clientY);
        else this.boxSelect(this.dragStart, { x: e.clientX, y: e.clientY });
        this.dragStart = null;
      }
      if (e.button === 2) {
        if (this.pendingOrder) { this.orderAtPoint(e.clientX, e.clientY, this.pendingOrder); this.setOrderMode(null); }
        else this.orderAt(e);
      }
    });
    el.addEventListener('wheel', e => { this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.05, 16, 180); }, { passive: true });

    // double-click: select all same-type units (classic RTS)
    el.addEventListener('dblclick', e => {
      const hit = this.pickEntities(e.clientX, e.clientY, false);
      if (hit && hit.kind === 'unit' && hit.owner === this.humanId) this.selectSameType(hit);
    });

    // ----- touch (mobile-first: tap orders, 1-finger drag pans, pinch zooms) -----
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      this._isTouch = true;
      const t = e.touches;
      if (t.length === 1) {
        this.touchState = {
          x0: t[0].clientX, y0: t[0].clientY, x: t[0].clientX, y: t[0].clientY,
          t0: performance.now(), moved: false, box: false, panning: false,
          camX: this.camTarget.x, camZ: this.camTarget.z,
          longFired: false,
        };
        // long-press (550ms, held still) = select same type (mobile double-click)
        const st = this.touchState;
        st.longT = setTimeout(() => {
          if (!st.moved && !this.placement && this.touchState === st) {
            st.longFired = true;
            const hit = this.pickEntities(st.x, st.y, false);
            if (hit && hit.kind === 'unit' && hit.owner === this.humanId) {
              this.selectSameType(hit);
              buzz(20);
            }
          }
        }, 550);
      } else if (t.length === 2) {
        const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
        if (this.touchState?.longT) clearTimeout(this.touchState.longT);
        this.touchState = { pinch: Math.hypot(dx, dy), midX: (t[0].clientX + t[1].clientX) / 2, midY: (t[0].clientY + t[1].clientY) / 2, two: true, camX: this.camTarget.x, camZ: this.camTarget.z, camD: this.camDist };
        this.dragging = false; box.classList.add('hidden');
      }
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches;
      const st = this.touchState;
      if (!st) return;
      if (t.length === 2 && st.two) {
        const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
        const pinch = Math.hypot(dx, dy);
        this.camDist = THREE.MathUtils.clamp(st.camD * (st.pinch / Math.max(40, pinch)), 16, 190);
        const midX = (t[0].clientX + t[1].clientX) / 2, midY = (t[0].clientY + t[1].clientY) / 2;
        // two-finger drag pans camera (screen-space, yaw aware)
        const s = this.camDist / 700;
        const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
        const r = new THREE.Vector3(f.z, 0, -f.x);
        this.camTarget.x = THREE.MathUtils.clamp(st.camX - (midX - st.midX) * s * r.x + 0, -this.mapBound(4), this.mapBound(4));
        this.camTarget.z = THREE.MathUtils.clamp(st.camZ - (midX - st.midX) * s * r.z - (midY - st.midY) * s, -this.mapBound(4), this.mapBound(4));
        return;
      }
      if (t.length === 1) {
        const px = t[0].clientX, py = t[0].clientY;
        const dx = px - st.x, dy = py - st.y;
        st.x = px; st.y = py;
        if (Math.hypot(st.x - st.x0, st.y - st.y0) > 14) {
          st.moved = true;
          if (st.longT) { clearTimeout(st.longT); st.longT = null; }
        }
        if (this.placement) {
          const p = this.screenToGround(st.x, st.y);
          if (p) this.updateGhost(p.x, p.z);
          return;
        }
        if (!st.moved) return;
        if (this.panMode && !this.pendingOrder) {
          // real-RTS mobile: single-finger drag pans the camera
          st.panning = true;
          panByPixels(dx, dy);
        } else if (!this.pendingOrder) {
          st.box = true;
          setBox({ x: st.x0, y: st.y0 }, { x: st.x, y: st.y });
        }
      }
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.preventDefault();
      box.classList.add('hidden');
      const st = this.touchState;
      this.touchState = null;
      if (!st || st.two) return;
      if (st.longT) { clearTimeout(st.longT); st.longT = null; }
      if (st.longFired) return; // long-press already handled
      if (this.placement) {
        if (!st.moved) { const p = this.screenToGround(st.x, st.y); if (p) this.confirmPlacement(p.x, p.z); }
        return;
      }
      if (!st.moved) {
        // tap
        if (this.pendingOrder) { this.orderAtPoint(st.x, st.y, this.pendingOrder); this.setOrderMode(null); }
        else this.tapSelect(st.x, st.y);
      } else if (st.box && !st.panning) {
        this.boxSelect({ x: st.x0, y: st.y0 }, { x: st.x, y: st.y });
      }
      // panning drags need no order — camera already moved
    }, { passive: false });
    el.addEventListener('touchcancel', () => {
      if (this.touchState?.longT) clearTimeout(this.touchState.longT);
      this.touchState = null;
      box.classList.add('hidden');
    });

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') { e.preventDefault(); this.focusSelection(); }
      if (k === 'f') this.selectArmy();
      if (k === 'h') this.focusHQ();
      if (k === 'g') this.selectWorkers();
      if (k === 'x') this.stopSelected();
      if (k === 'm') this.setOrderMode(this.pendingOrder === 'move' ? null : 'move');
      if (k === 'r' && this.placement) this.rotatePlacement(e.shiftKey ? -1 : 1);
      if (k === 'escape') { this.setOrderMode(null); this.cancelPlacement(); this.clearSelection(); }
      // control groups: Shift+1..4 save, 1..4 recall
      if (['1', '2', '3', '4'].includes(k)) {
        if (e.shiftKey) {
          e.preventDefault();
          this.groups[k] = this.selected.filter(s => s.kind === 'unit' && s.owner === this.humanId && !s.dead).map(s => s.id);
          this.hookMsg(`Group ${k} saved (${this.groups[k].length} units) — press ${k} to recall`);
        } else {
          const ids = this.groups[k];
          if (ids && ids.length) {
            e.preventDefault();
            const us = ids.map(id => this.units.find(u => u.id === id && !u.dead)).filter(Boolean);
            if (us.length) this.setSelection(us);
            else this.hookMsg(`Group ${k} is empty`);
          } else if (k === '1') {
            this.selectWorkers();
          }
        }
      }
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    // MOBILE INPUT ONLY: keep canvas sized on rotate / URL-bar show-hide
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
  }

  setOrderMode(mode) {
    this.pendingOrder = mode;
    document.querySelectorAll('[data-order]').forEach(b => b.classList.toggle('active', b.dataset.order === mode));
    if (mode) this.hookMsg(`Tap a target: ${mode.toUpperCase()} (tap again / Esc to cancel)`);
  }

  screenToGround(clientX, clientY) {
    this.mouseNDC.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    const out = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.groundPlane, out)) return null;
    // refine for terrain height (mountains/hills): re-intersect at sampled height
    for (let i = 0; i < 2; i++) {
      const h = this.gy(out.x, out.z);
      if (Math.abs(h) < 0.3) break;
      this.groundPlane.constant = -h;
      if (!this.ray.ray.intersectPlane(this.groundPlane, out)) break;
    }
    this.groundPlane.constant = 0;
    return out;
  }

  pickEntities(sx, sy, multi) {
    this.mouseNDC.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    const meshes = [];
    // hidden (fogged) enemies can't be clicked
    for (const u of this.units) if (!u.dead && u.mesh.visible) { u.mesh.updateMatrixWorld(); meshes.push(u.mesh); }
    for (const b of this.buildings) if (!b.dead && b.mesh.visible) { b.mesh.updateMatrixWorld(); meshes.push(b.mesh); }
    // terrain trees are instanced: raycast the canopies/trunks, map instanceId -> tree
    for (const tm of this.treePick || []) { tm.updateMatrixWorld(); meshes.push(tm); }
    const hits = this.ray.intersectObjects(meshes, true);
    for (const h of hits) {
      // chopped-tree tap: instanced hit carries its resource directly
      const tmap = h.object.userData?.treeRes;
      if (tmap && h.instanceId !== undefined) {
        const res = tmap.get(h.instanceId);
        if (this.resourceReady(res)) return res;
        continue;
      }
      let o = h.object;
      while (o && !o.userData.ref) o = o.parent;
      // fallback: find by traversal
      const found = this.findByMesh(h.object);
      if (found) {
        if (!multi) return found;
        return found;
      }
    }
    return null;
  }

  findByMesh(obj) {
    let o = obj;
    while (o) {
      for (const u of this.units) if (u.mesh === o) return u;
      for (const b of this.buildings) if (b.mesh === o) return b;
      for (const r of this.resources) if (r.mesh && r.mesh === o) return r;
      o = o.parent;
    }
    return null;
  }

  // smart tap: select own, direct-order with selection, or move onto open ground.
  // Selection is STICKY: tapping open terrain with an army selected MOVES it there
  // (deselect via Esc / the X button / selecting something else).
  tapSelect(sx, sy) {
    const hit = this.pickEntities(sx, sy, false);
    const units = this.selected.filter(s => s.kind === 'unit' && !s.dead);
    // enemy tapped while we have an army -> attack (works with LEFT click too)
    if (hit && (hit.kind === 'unit' || hit.kind === 'building') && hit.owner !== this.humanId && hit.owner && units.length) {
      this.orderAttack(units, hit);
      return;
    }
    // tree tapped while workers selected -> harvest
    if (hit && hit.kind === 'resource' && this.resourceReady(hit)) {
      const workers = units.filter(u => u.type === 'worker');
      if (workers.length) { this.orderHarvest(workers, hit); return; }
      if (units.length) { const p = this.screenToGround(sx, sy); if (p) this.orderMove(units, p.x, p.z); return; }
      return;
    }
    // own HQ tapped while workers carry cargo -> return goods
    if (hit && hit.kind === 'building' && hit.owner === this.humanId && units.some(u => u.type === 'worker' && u.carrying > 0)) {
      this.orderReturn(units.filter(u => u.type === 'worker' && u.carrying > 0), hit);
      return;
    }
    if (hit && hit.kind !== 'resource' && hit.owner === this.humanId) {
      this.setSelection([hit]);
      return;
    }
    // open ground (or fogged area) with units selected -> MOVE there, keep selection
    if (units.length) {
      const p = this.screenToGround(sx, sy);
      if (p) this.orderMove(units, p.x, p.z);
      return;
    }
    this.setSelection([]);
  }
  clickSelect(e) { this.tapSelect(e.clientX, e.clientY); }

  clearSelection() { this.setSelection([]); this.setOrderMode(null); }

  selectSameType(ref) {
    if (!ref || ref.kind !== 'unit') return;
    this.setSelection(this.units.filter(u => u.owner === this.humanId && !u.dead && u.type === ref.type).slice(0, 30));
  }

  boxSelect(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const sel = [];
    const v = new THREE.Vector3();
    for (const u of this.units) {
      if (u.owner !== this.humanId || u.dead) continue;
      v.set(u.x, 0, u.z).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && v.z < 1) sel.push(u);
    }
    // if no units, allow building select via click only (skip)
    this.setSelection(sel.slice(0, 24));
  }

  setSelection(list) {
    for (const s of this.selected) {
      s.ring.visible = false;
      // hide full-HP building bars again once deselected (units are per-frame)
      if (s.kind === 'building' && s.bar && s.hp >= s.maxHp) s.bar.visible = false;
    }
    this.selected = list.filter(e => !e.dead);
    for (const s of this.selected) {
      s.ring.visible = true;
      if (s.bar && !s.dead) {
        s.bar.visible = true;
        s.bar.userData.set(s.hp / s.maxHp, s.owner === this.humanId);
        s.bar.lookAt(this.camera.position);
      }
    }
    this.hooks.onSelect?.(this.selected);
  }

  orderAt(e) { this.orderAtPoint(e.clientX, e.clientY, null); }

  // unified order entry: point + optional forced mode (mobile buttons / M key)
  orderAtPoint(sx, sy, forced) {
    if (!this.selected.length) return;
    const p = this.screenToGround(sx, sy);
    if (!p) return;
    const hit = this.pickEntities(sx, sy, false);
    const units = this.selected.filter(s => s.kind === 'unit' && !s.dead);
    const blds = this.selected.filter(s => s.kind === 'building' && !s.dead);
    if (blds.length && !units.length) {
      for (const b of blds) this.setBuildingRally(b, p.x, p.z);
      this.hooks.onSelect?.(this.selected);
      return;
    }
    if (!units.length) return;
    const pX = THREE.MathUtils.clamp(p.x, -this.mapBound(4), this.mapBound(4)), pZ = THREE.MathUtils.clamp(p.z, -this.mapBound(4), this.mapBound(4));

    // forced modes from mobile buttons
    if (forced === 'attack') {
      if (hit && (hit.kind === 'unit' || hit.kind === 'building') && hit.owner !== units[0].owner) this.orderAttack(units, hit);
      else this.orderAttackMove(units, pX, pZ);
      return;
    }
    if (forced === 'harvest') {
      const workers = units.filter(u => u.type === 'worker');
      const node = (hit && hit.kind === 'resource') ? hit : this.nearestResource(pX, pZ);
      if (workers.length && node) this.orderHarvest(workers, node);
      else this.hookMsg('No tree nearby — select a Worker first');
      return;
    }
    if (forced === 'move' || forced === 'return') {
      const hq = this.hqOf(units[0].owner);
      const carriers = units.filter(u => u.type === 'worker' && u.carrying > 0);
      if (forced === 'return' && carriers.length && hq) { this.orderReturn(carriers, hq); return; }
      this.orderMove(units, pX, pZ);
      return;
    }

    // --- smart contextual orders (right click / tap) ---
    if (hit && hit.kind === 'resource' && this.resourceReady(hit)) {
      const workers = units.filter(u => u.type === 'worker');
      if (workers.length) { this.orderHarvest(workers, hit); return; }
      // soldiers tapped tree -> just move there
      this.orderMove(units, pX, pZ);
    } else if (hit && (hit.kind === 'unit' || hit.kind === 'building') && hit.owner !== units[0].owner) {
      this.orderAttack(units, hit);
    } else if (hit && hit.kind === 'building' && hit.owner === units[0].owner && hit.type === 'hq') {
      const carriers = units.filter(u => u.type === 'worker' && u.carrying > 0);
      if (carriers.length) this.orderReturn(carriers, hit);
      else this.orderMove(units, pX, pZ);
    } else {
      this.orderMove(units, pX, pZ);
    }
  }

  orderMove(units, x, z) {
    // free placement: spread in formation around the clicked point
    units.forEach((u, i) => {
      const a = (i / Math.max(1, units.length)) * Math.PI * 2;
      const r = Math.sqrt(units.length) * 0.9;
      const spot = this.findFreeSpot(
        THREE.MathUtils.clamp(x + Math.cos(a) * r, -this.mapBound(4), this.mapBound(4)),
        THREE.MathUtils.clamp(z + Math.sin(a) * r, -this.mapBound(4), this.mapBound(4)),
        u.radius, u);
      u.tx = spot.x; u.tz = spot.z;
      u.target = null; u.objective = null; u.harvestTarget = null; u.returning = false;
      u.hasOrder = true; u.holdPosition = false; u.idleT = 0; u.path = null; u.attackMove = false;
      u.fireAnchor = null; u.repathT = 0;
    });
    this.spawnPing(x, z, 0x4ade80);
  }

  orderAttackMove(units, x, z) {
    const fighters = units.filter(u => u.type !== 'worker');
    fighters.forEach((u, i) => {
      const a = (i / Math.max(1, fighters.length)) * Math.PI * 2;
      const r = Math.sqrt(fighters.length) * 0.9;
      const spot = this.findFreeSpot(
        THREE.MathUtils.clamp(x + Math.cos(a) * r, -this.mapBound(4), this.mapBound(4)),
        THREE.MathUtils.clamp(z + Math.sin(a) * r, -this.mapBound(4), this.mapBound(4)),
        u.radius, u);
      u.tx = spot.x; u.tz = spot.z; u.harvestTarget = null; u.objective = null;
      u.hasOrder = true; u.attackMove = true; u.path = null; u.holdPosition = false;
      u.fireAnchor = null;
      const e = this.nearestEnemy(spot.x, spot.z, u.owner, u.aggro);
      if (e) u.target = e;
    });
    // workers hold position on attack-move
    for (const u of units) if (u.type === 'worker') { u.holdPosition = true; u.hasOrder = false; u.path = null; }
    this.spawnPing(x, z, 0xfbbf24);
    this.hookMsg('Attack-move: engaging anything in the way');
  }

  orderHarvest(workers, node) {
    for (const u of workers) {
      u.harvestTarget = node; u.target = null; u.objective = null; u.returning = false;
      u.hasOrder = true; u.harvestManual = true; u.gathering = 0; u.idleT = 0; u.path = null; u.fireAnchor = null; u.holdPosition = false;
      // if already full, go drop off first
      if (u.carrying >= (CONFIG.resource?.carryMax ?? 10)) { const hq = this.hqOf(u.owner); if (hq) { u.returning = true; u.tx = hq.x; u.tz = hq.z; } }
    }
    this.spawnPing(node.x, node.z, 0x4ade80);
    this.hookMsg(`Chopping trees for logs (${workers.length} worker${workers.length > 1 ? 's' : ''})`);
  }

  orderReturn(workers, hq) {
    for (const u of workers) {
      const drop = this.hqDropSpot(hq, u);
      u.dropX = drop.x; u.dropZ = drop.z; u.dropFor = hq.id;
      u.tx = drop.x; u.tz = drop.z; u.target = null; u.objective = null; u.harvestTarget = null;
      u.gathering = 0; u.hasOrder = true; u.returning = true; u.idleT = 0; u.path = null; u.fireAnchor = null;
    }
    this.spawnPing(hq.x, hq.z, 0x4ade80);
    this.hookMsg('Returning cargo to HQ');
  }

  orderAttack(units, target) {
    // fan out around the target at weapon range so stacked soldiers
    // don't pile onto one point and jitter while firing
    const fighters = units.filter(u => u.type !== 'worker');
    fighters.forEach((u, i) => {
      u.target = target; u.harvestTarget = null; u.hasOrder = true;
      u.attackMove = false; u.idleT = 0; u.path = null; u.objective = null;
      u.holdPosition = false; u.fireAnchor = null;
      const standOff = Math.max(1.2, (u.range || 9) * 0.75);
      const a = (i / Math.max(1, fighters.length)) * Math.PI * 2 + Math.random() * 0.4;
      const px = THREE.MathUtils.clamp(target.x + Math.cos(a) * standOff, -this.mapBound(4), this.mapBound(4));
      const pz = THREE.MathUtils.clamp(target.z + Math.sin(a) * standOff, -this.mapBound(4), this.mapBound(4));
      const spot = this.findFreeSpot(px, pz, u.radius, u);
      u.tx = spot.x; u.tz = spot.z;
    });
    this.spawnPing(target.x, target.z, 0xef4444);
  }

  showRally(b) {
    if (b.rallyLine) this.scene.remove(b.rallyLine);
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.x, 0.3, b.z), new THREE.Vector3(b.rallyX, 0.3, b.rallyZ)]);
    b.rallyLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x4ade80, dashSize: 0.8, gapSize: 0.5 }));
    b.rallyLine.computeLineDistances();
    this.scene.add(b.rallyLine);
    clearTimeout(b._rallyT);
    b._rallyT = setTimeout(() => { if (b.rallyLine) { this.scene.remove(b.rallyLine); b.rallyLine = null; } }, 2500);
  }

  // ---------- rally + staging ----------
  // Rally points must be real destinations. Defaults and clicks are normalized
  // to free ground, and trained units spread around the rally in a ring so a
  // queue does not spawn five soldiers inside each other.
  defaultRallyPoint(x, z, extent = 4) {
    const H = this.mapBound(4);
    const clear = CONFIG.rallyClearance ?? 1.0;
    const start = Math.max(2.2, extent + clear + 0.6);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dz] of dirs) {
      for (let ring = 0; ring < 6; ring++) {
        const nx = THREE.MathUtils.clamp(x + dx * (start + ring * 1.4), -H, H);
        const nz = THREE.MathUtils.clamp(z + dz * (start + ring * 1.4), -H, H);
        if (this.isSpotFree(nx, nz, clear)) return { x: nx, z: nz };
      }
    }
    return this.findFreeSpot(x, z, clear);
  }

  resetRally(b) {
    const extent = b.hw === undefined ? b.radius : Math.max(b.hw, b.hd);
    const spot = this.defaultRallyPoint(b.x, b.z, extent);
    b.rallyX = spot.x; b.rallyZ = spot.z;
    return spot;
  }

  setBuildingRally(b, x, z, quiet = false) {
    const H = this.mapBound(4);
    const clear = CONFIG.rallyClearance ?? 1.0;
    const want = {
      x: THREE.MathUtils.clamp(x, -H, H),
      z: THREE.MathUtils.clamp(z, -H, H),
    };
    const spot = this.isSpotFree(want.x, want.z, clear)
      ? want
      : this.findFreeSpot(want.x, want.z, clear);
    b.rallyX = spot.x; b.rallyZ = spot.z;
    this.showRally(b);
    if (!quiet && b.owner === this.humanId) this.hookMsg('Rally point set — new units will gather there');
    return spot;
  }

  completeTraining(b, type) {
    const a = b.type === 'hq' ? Math.PI : 0;
    const u = this.spawnUnit(type, b.owner, b.x + Math.cos(a) * (b.size), b.z + Math.sin(a) * (b.size));
    const slot = (b._rallySeq = (b._rallySeq || 0) + 1);
    const dest = this.rallySpotFor(b, type, slot);
    u.tx = dest.x; u.tz = dest.z; u.hasOrder = true; u.path = null;
    return u;
  }

  rallySpotFor(b, type, slot = 0) {
    const st = CONFIG.units[type] || { radius: 0.75 };
    const clear = st.radius + 0.25;
    const step = CONFIG.stagingStep ?? 1.7;
    const bx = b.rallyX ?? b.x, bz = b.rallyZ ?? b.z;
    if (slot <= 0 && this.isSpotFree(bx, bz, clear)) return { x: bx, z: bz };
    // Queued troops need different staging points. Spiral outward from the rally
    // so the fifth soldier does not aim at the same square metre as the first.
    for (let attempt = 0; attempt < 32; attempt++) {
      const a = slot * 2.399963 + attempt * 0.55;
      const r = step * (1 + attempt * 0.18);
      const nx = THREE.MathUtils.clamp(bx + Math.cos(a) * r, -this.mapBound(4), this.mapBound(4));
      const nz = THREE.MathUtils.clamp(bz + Math.sin(a) * r, -this.mapBound(4), this.mapBound(4));
      if (this.isSpotFree(nx, nz, clear)) return { x: nx, z: nz };
    }
    for (let ring = 1; ring <= 8; ring++) {
      const steps = 6 + ring * 4;
      for (let i = 0; i < steps; i++) {
        const a = slot * 2.399963 + (i / steps) * Math.PI * 2;
        const nx = THREE.MathUtils.clamp(bx + Math.cos(a) * ring * step, -this.mapBound(4), this.mapBound(4));
        const nz = THREE.MathUtils.clamp(bz + Math.sin(a) * ring * step, -this.mapBound(4), this.mapBound(4));
        if (this.isSpotFree(nx, nz, clear)) return { x: nx, z: nz };
      }
    }
    return this.findFreeSpot(bx, bz, clear);
  }

  hqDropSpot(hq, u) {
    const slot = (hq._dropSeq = (hq._dropSeq || 0) + 1);
    return this.rallySpotFor({ rallyX: hq.x + hq.radius + 1.4, rallyZ: hq.z }, u?.type || 'worker', slot);
  }

  // ---------- colliders / free space ----------
  solids(includeResources = false, except) {
    const out = [];
    for (const b of this.buildings) { if (b.dead || b === except) continue; out.push({ x: b.x, z: b.z, r: b.radius }); }
    for (const o of this.obstacles) out.push(o);
    if (includeResources) for (const r of this.resources) { if (this.resourceReady(r)) out.push({ x: r.x, z: r.z, r: r.radius + 0.2 }); }
    return out;
  }

  // ---------- collision footprints ----------
  // Walls are long thin boxes, everything else is a circle. These two helpers
  // keep placement, steering and pathfinding honest about a 4.6m-long wall
  // (a circle collider big enough to matter would seal lanes shut).
  footprintDist(b, x, z) {
    if (b.hw === undefined) return Math.hypot(x - b.x, z - b.z) - b.radius;
    const dx = x - b.x, dz = z - b.z;
    const lx = dx * b.rotC + dz * b.rotS;      // along the wall
    const lz = -dx * b.rotS + dz * b.rotC;     // across it
    const cx = Math.max(-b.hw, Math.min(b.hw, lx));
    const cz = Math.max(-b.hd, Math.min(b.hd, lz));
    return Math.hypot(lx - cx, lz - cz);
  }

  buildingBlocks(b, x, z, pad) {
    if (b.hw === undefined) {
      const dx = x - b.x, dz = z - b.z, rr = b.radius + pad;
      return dx * dx + dz * dz < rr * rr;
    }
    return this.footprintDist(b, x, z) < pad;
  }

  // Do two wall boxes share real area? Wall runs are built to butt up against
  // each other (fort tiling, keep corners), and a distance test cannot tell
  // "touching end to end" from "crossing at right angles" - both sit at 0. This
  // separating-axis test can: touching faces are free, a true overlap is not.
  wallBoxesOverlap(a, b) {
    const tol = 0.02;
    const c = Math.abs(Math.cos((a.rot || 0) - (b.rot || 0)));
    const s = Math.abs(Math.sin((a.rot || 0) - (b.rot || 0)));
    const dx = b.x - a.x, dz = b.z - a.z;
    const ax = dx * a.rotC + dz * a.rotS, az = -dx * a.rotS + dz * a.rotC;
    if (Math.abs(ax) >= a.hw + b.hw * c + b.hd * s - tol) return false;
    if (Math.abs(az) >= a.hd + b.hw * s + b.hd * c - tol) return false;
    const bx = ax * a.rotC - az * a.rotS, bz = ax * a.rotS + az * a.rotC;
    if (Math.abs(bx) >= b.hw + a.hw * c + a.hd * s - tol) return false;
    if (Math.abs(bz) >= b.hd + a.hw * s + a.hd * c - tol) return false;
    return true;
  }

  // a long wall also has to clear the space its ENDS sweep into
  wallSpotFree(x, z, rot, len) {
    const st = CONFIG.buildings.wall;
    const L = len ?? st.size, h = L * 0.5 * 0.78;
    const ax = Math.cos(rot) * h, az = Math.sin(rot) * h;
    const cand = { x, z, rot, hw: L * 0.5, hd: st.thick * 0.5, rotC: Math.cos(rot), rotS: Math.sin(rot) };
    for (const [px, pz] of [[x, z], [x + ax, z + az], [x - ax, z - az]]) {
      if (!this.spotClearOfWorld(px, pz, 0.4)) return false;
      let blocked = false;
      this.eachBuildingNear(px, pz, 7, (b) => {
        if (b.hw === undefined && this.buildingBlocks(b, px, pz, 0.4)) { blocked = true; return false; }
      });
      if (blocked) return false;
    }
    // only walls get the overlap test, so runs can share a face
    let hit = false;
    this.eachBuildingNear(x, z, 9, (b) => {
      if (b.hw !== undefined && this.wallBoxesOverlap(cand, b)) { hit = true; return false; }
    });
    return !hit;
  }

  isSpotFree(x, z, radius, ignoreUnit) {
    const H = CONFIG.mapSize / 2 - 1.5;
    if (Math.abs(x) > H || Math.abs(z) > H) return false;
    let blocked = false;
    this.eachBuildingNear(x, z, radius + 7, (b) => {
      if (this.buildingBlocks(b, x, z, radius)) { blocked = true; return false; }
    });
    if (blocked) return false;
    return this.spotClearOfWorld(x, z, radius, ignoreUnit);
  }

  // map bounds, river/mountain, boulders, standing trees, units - everything
  // that is not a building
  spotClearOfWorld(x, z, radius, ignoreUnit) {
    const H = CONFIG.mapSize / 2 - 1.5;
    if (Math.abs(x) > H || Math.abs(z) > H) return false;
    if (this.terrain && this.terrain.blocked(x, z)) return false; // river / mountain
    for (const o of this.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r + radius) return false;
    }
    // standing harvestable trees block placement (grid query: ~1000 trees)
    let blocked = false;
    this.eachResourceNear(x, z, radius + 2.5, (r) => {
      if (!this.resourceReady(r)) return;
      if (Math.hypot(x - r.x, z - r.z) < r.radius + 0.2 + radius) { blocked = true; return false; }
    });
    if (blocked) return false;
    for (const u of this.units) {
      if (u.dead || u === ignoreUnit) continue;
      if (Math.hypot(x - u.x, z - u.z) < u.radius + radius + 0.15) return false;
    }
    return true;
  }

  findFreeSpot(x, z, radius, ignoreUnit) {
    if (this.isSpotFree(x, z, radius, ignoreUnit)) return { x, z };
    for (let ring = 1; ring <= 12; ring++) {
      const steps = 8 + ring * 2;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring * 0.35;
        const nx = THREE.MathUtils.clamp(x + Math.cos(a) * ring * 0.9, -this.mapBound(4), this.mapBound(4));
        const nz = THREE.MathUtils.clamp(z + Math.sin(a) * ring * 0.9, -this.mapBound(4), this.mapBound(4));
        if (this.isSpotFree(nx, nz, radius, ignoreUnit)) return { x: nx, z: nz };
      }
    }
    return { x, z };
  }

  // building placement with live ghost preview (barracks + turret + wall)
  startPlacement(type = 'barracks') {
    this.cancelPlacement();
    const cost = type === 'turret' ? CONFIG.turretCost : type === 'wall' ? CONFIG.wallCost : CONFIG.barracksCost;
    const name = type === 'turret' ? 'Defense Turret' : type === 'wall' ? 'Wall' : 'Barracks';
    if (this.players[this.humanId].logs < cost) { this.hookMsg(`Need ${cost} logs for ${name}`); return; }
    const st = CONFIG.buildings[type];
    const size = st.size;
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.4, depthWrite: false });
    // gizmo group carries the yaw so ghost + footprint ring rotate together
    const gizmo = new THREE.Group();
    let ghost, ringR;
    if (type === 'turret') {
      ghost = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.45, size * 0.5, 1.6, 8), ghostMat);
      ringR = size * 0.6;
    } else if (type === 'wall') {
      ghost = new THREE.Mesh(new THREE.BoxGeometry(size, 2, st.thick), ghostMat);
      ringR = size * 0.5;
    } else {
      ghost = new THREE.Mesh(new THREE.BoxGeometry(size, 2, size), ghostMat);
      ringR = size * 0.6;
    }
    ghost.position.y = 1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(ringR, ringR + 0.3, 40),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    if (type === 'wall') ring.scale.set(1, st.thick / size, 1); // squash depth: long thin footprint
    gizmo.add(ghost, ring);
    this.scene.add(gizmo);
    this.placement = { type, gizmo, ghost, ring, rot: 0, x: this.camTarget.x, z: this.camTarget.z, valid: false };
    this.setOrderMode(null);
    this.hookMsg(type === 'turret'
      ? 'Placing Turret — tap green ground (right-click / Esc cancels). Turrets auto-defend an area.'
      : type === 'wall'
      ? 'Placing Wall — tap to chain segments, R or ⟳ rotates 90°, ✕ when done.'
      : 'Placing Barracks — tap green ground (right-click / Esc cancels). Extra Barracks = +supply & faster training.');
  }

  // walls snap to 90° so runs stay straight; anything else ignores rotation
  rotatePlacement(dir = 1) {
    const pl = this.placement;
    if (!pl || pl.type !== 'wall') return false;
    pl.rot += Math.PI / 2 * (dir > 0 ? 1 : -1);
    pl.rot = ((pl.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    pl.gizmo.rotation.y = pl.rot; // flip the preview now, not on the next move
    this.hookMsg(`Wall rotated ${Math.round((pl.rot * 180) / Math.PI)}°`);
    return true;
  }

  updateGhost(x, z) {
    const pl = this.placement;
    if (!pl) return;
    const cx = THREE.MathUtils.clamp(x, -this.mapBound(6), this.mapBound(6));
    const cz = THREE.MathUtils.clamp(z, -this.mapBound(6), this.mapBound(6));
    const ok = pl.type === 'wall'
      ? this.wallSpotFree(cx, cz, pl.rot)
      : this.isSpotFree(cx, cz, CONFIG.buildings[pl.type].size * 0.72);
    pl.x = cx; pl.z = cz; pl.valid = ok;
    pl.gizmo.position.set(cx, this.gy(cx, cz), cz);
    pl.gizmo.rotation.y = pl.rot;
    pl.ghost.material.color.set(ok ? 0x4ade80 : 0xef4444);
    pl.ring.material.color.set(ok ? 0x4ade80 : 0xef4444);
  }

  confirmPlacement(x, z) {
    const pl = this.placement;
    if (!pl) return;
    this.updateGhost(x, z);
    if (!pl.valid) { this.hookMsg('Cannot build here — find open ground'); return; }
    let b = null;
    if (pl.type === 'turret') b = this.buildTurret(this.humanId, pl.x, pl.z);
    else if (pl.type === 'wall') b = this.buildWall(this.humanId, pl.x, pl.z, pl.rot);
    else b = this.buildBarracks(this.humanId, pl.x, pl.z);
    if (b) this.resetRally(b);
    // walls chain: keep ghost alive so players can drag a wall line quickly
    if (pl.type === 'wall') {
      if (this.players[this.humanId].logs < CONFIG.wallCost) { this.cancelPlacement(); return; }
      const L = CONFIG.buildings.wall.size + 0.05;
      this.updateGhost(pl.x + Math.cos(pl.rot) * L, pl.z + Math.sin(pl.rot) * L);
      return;
    }
    this.cancelPlacement();
  }

  cancelPlacement() {
    if (!this.placement) return;
    this.scene.remove(this.placement.gizmo);
    this.placement = null;
  }

  spawnPing(x, z, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, this.gy(x, z) + 0.25, z);
    this.scene.add(m);
    let t = 0;
    const tick = () => { t += 0.03; m.scale.multiplyScalar(1.06); m.material.opacity = 1 - t * 1.6; if (t > 0.6) this.scene.remove(m); else requestAnimationFrame(tick); };
    tick();
  }

  burst(x, y, z, color, n = 14, speed = 6) {
    // particle flood-guard: big sieges used to spawn hundreds of live meshes
    if (this.particles.length > 420) return;
    if (this.particles.length > 260) n = Math.max(3, Math.ceil(n / 3));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13 + Math.random() * 0.12, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(x, y, z);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh: m, life: 0.5 + Math.random() * 0.5, max: 1,
        vel: new THREE.Vector3(Math.cos(a) * speed * Math.random(), 3 + Math.random() * 4, Math.sin(a) * speed * Math.random()),
      });
    }
  }

  selectArmy() { this.setSelection(this.units.filter(u => u.owner === this.humanId && !u.dead && u.type !== 'worker')); }
  selectWorkers() { this.setSelection(this.units.filter(u => u.owner === this.humanId && !u.dead && u.type === 'worker')); }
  focusHQ() {
    const hq = this.buildings.find(b => b.owner === this.humanId && b.type === 'hq' && !b.dead);
    if (hq) { this.camTarget.set(hq.x, 0, hq.z); this.setSelection([hq]); }
  }
  focusSelection() {
    if (!this.selected.length) return;
    const s = this.selected[0];
    this.camTarget.set(s.x, 0, s.z);
  }
  stopSelected() {
    for (const u of this.selected) if (u.kind === 'unit' && !u.dead) { u.hasOrder = false; u.attackMove = false; u.target = null; u.objective = null; u.harvestTarget = null; u.harvestManual = false; u.returning = false; u.dropX = null; u.dropZ = null; u.dropFor = null; u.idleT = 0; u.path = null; u.tx = u.x; u.tz = u.z; u.holdPosition = true; u.fireAnchor = null; }
    this.hookMsg('Holding position');
  }

  // ---------- orders from UI ----------
  unitCost(type) {
    return { worker: CONFIG.workerCost, soldier: CONFIG.soldierCost, brute: CONFIG.bruteCost, hunter: CONFIG.hunterCost, tank: CONFIG.tankCost, scout: CONFIG.scoutCost, artillery: CONFIG.artilleryCost }[type] ?? 100;
  }
  canTrain(building, type) {
    if (building.type === 'hq') return type === 'worker';
    if (building.type === 'barracks') return ['soldier', 'brute', 'hunter', 'tank', 'scout', 'artillery'].includes(type);
    return false;
  }
  trainUnit(building, type) {
    if (!this.canTrain(building, type)) return false;
    const cost = this.unitCost(type);
    const st = this.players[building.owner];
    const supplyUsed = this.units.filter(u => u.owner === building.owner && !u.dead).length;
    const supplyMax = this.supplyMax(building.owner);
    if (st.logs < cost) { if (building.owner === this.humanId) this.hookMsg('Not enough logs'); return false; }
    if (supplyUsed >= supplyMax) { if (building.owner === this.humanId) this.hookMsg('Supply blocked — build more Barracks'); return false; }
    if (building.queue.length >= 5) return false;
    st.logs -= cost;
    building.queue.push({ type, t: CONFIG.trainTime[type] ?? 6 });
    return true;
  }

  buildBarracks(owner, x, z) {
    const st = this.players[owner];
    if (st.logs < CONFIG.barracksCost) { if (owner === this.humanId) this.hookMsg('Need 150 logs for Barracks'); return null; }
    x = THREE.MathUtils.clamp(x ?? this.camTarget.x + 6, -this.mapBound(6), this.mapBound(6));
    z = THREE.MathUtils.clamp(z ?? this.camTarget.z + 6, -this.mapBound(6), this.mapBound(6));
    st.logs -= CONFIG.barracksCost;
    const b = this.spawnBuilding('barracks', owner, x, z);
    if (owner === this.humanId) { this.hookMsg('Barracks constructed'); this.setSelection([b]); }
    return b;
  }

  buildTurret(owner, x, z) {
    const st = this.players[owner];
    if (st.logs < CONFIG.turretCost) { if (owner === this.humanId) this.hookMsg('Need 120 logs for Turret'); return null; }
    x = THREE.MathUtils.clamp(x ?? this.camTarget.x + 6, -this.mapBound(6), this.mapBound(6));
    z = THREE.MathUtils.clamp(z ?? this.camTarget.z + 6, -this.mapBound(6), this.mapBound(6));
    st.logs -= CONFIG.turretCost;
    const b = this.spawnBuilding('turret', owner, x, z);
    if (owner === this.humanId) { this.hookMsg('Defense Turret online'); this.setSelection([b]); }
    return b;
  }

  // no messages, no selection: used by the AI and the starter keeps
  placeWallRaw(owner, x, z, rot = 0, len) {
    const p = this.players[owner];
    if (p.logs < CONFIG.wallCost) return null;
    if (!this.wallSpotFree(x, z, rot, len)) return null;
    p.logs -= CONFIG.wallCost;
    return this.spawnBuilding('wall', owner, x, z, rot, len);
  }

  buildWall(owner, x, z, rot = 0, len) {
    const st = this.players[owner];
    if (st.logs < CONFIG.wallCost) { if (owner === this.humanId) this.hookMsg(`Need ${CONFIG.wallCost} logs for Wall`); return null; }
    x = THREE.MathUtils.clamp(x ?? this.camTarget.x + 6, -this.mapBound(6), this.mapBound(6));
    z = THREE.MathUtils.clamp(z ?? this.camTarget.z + 6, -this.mapBound(6), this.mapBound(6));
    const b = this.placeWallRaw(owner, x, z, rot, len);
    if (!b) { if (owner === this.humanId) this.hookMsg('Cannot build wall here — blocked'); return null; }
    // don't steal selection when chaining walls
    if (owner === this.humanId && this.placement?.type !== 'wall') this.setSelection([b]);
    else if (owner === this.humanId) this.hooks.onSelect?.(this.selected);
    return b;
  }

  supplyMax(owner) {
    let m = 0;
    for (const b of this.buildings) {
      if (b.owner !== owner || b.dead) continue;
      m += b.type === 'hq' ? CONFIG.supplyPerHQ : b.type === 'barracks' ? CONFIG.supplyPerBarracks : 0;
    }
    return m;
  }

  buildingCost(type) {
    return {
      barracks: CONFIG.barracksCost,
      turret: CONFIG.turretCost,
      wall: CONFIG.wallCost,
      hq: 0,
    }[type] ?? 0;
  }

  demolishBuilding(b, { refund = true } = {}) {
    if (!b || b.dead || b.kind !== 'building') return false;
    // HQ demolition would end the saga by accident; it stays off the button.
    if (b.type === 'hq') {
      if (b.owner === this.humanId) this.hookMsg('HQ cannot be demolished');
      return false;
    }
    const rate = CONFIG.demolishRefund ?? 0.5;
    const refundLogs = refund
      ? Math.floor(this.buildingCost(b.type) * rate * Math.max(0, b.hp / b.maxHp))
      : 0;
    b.queue = []; b.progress = 0; b.dead = true;
    if (b.rallyLine) { this.scene.remove(b.rallyLine); b.rallyLine = null; }
    if (b._rallyT) { clearTimeout(b._rallyT); b._rallyT = null; }
    if (b.mesh) this.scene.remove(b.mesh);
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.colliderVersion++;
    this.pathCache?.clear();
    this.selected = this.selected.filter(s => s !== b);
    if (refundLogs > 0) this.players[b.owner].logs += refundLogs;
    if (b.owner === this.humanId) {
      this.hookMsg(refundLogs > 0
        ? `${cap(b.type)} demolished — reclaimed ${refundLogs} logs`
        : `${cap(b.type)} demolished`);
      this.hooks.onSelect?.(this.selected);
    }
    return true;
  }

  hookMsg(t) { this.hooks.onMessage?.(t); }

  // ---------- update ----------
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // frame-time watchdog: step resolution/shadows down (or back up) so the
  // game stays fluid on weak hardware instead of freezing
  autoPerf() {
    const p = this.perf;
    const now = performance.now();
    const raw = now - p.last;
    p.last = now;
    p.ema = p.ema * 0.95 + Math.min(raw, 500) * 0.05;
    p.t += raw / 1000;
    if (p.t < 3) return;
    if (p.ema > 48 && p.level < 2) {
      p.level++; p.t = 0;
      this.applyPerfLevel();
    } else if (p.ema < 19 && p.level > 0) {
      p.level--; p.t = -4; // slower to step back up than down
      this.applyPerfLevel();
    } else if (p.t > 10) {
      p.t = 5;
    }
  }

  applyPerfLevel() {
    const L = this.perf.level;
    if (L === 0) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      if (this.sun) this.sun.castShadow = true;
    } else if (L === 1) {
      this.renderer.setPixelRatio(1);
      if (this.sun) {
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
      this.hookMsg('Perf mode: tuned for smoothness');
    } else {
      // deepest perf level keeps shadows ON (never fully off): smaller shadow
      // map + sub-1.0 resolution + no grass tufts instead
      this.renderer.setPixelRatio(0.8);
      if (this.sun) {
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(512, 512);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
      if (this.waterFx?.tufts) this.waterFx.tufts.visible = false;
      this.hookMsg('Perf mode: minimal detail, shadows kept');
    }
  }

  updateCamera(dt) {
    const sp = (30 + this.camDist * 0.55) * dt; // pan faster when zoomed out
    const f = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const r = new THREE.Vector3(f.z, 0, -f.x);
    if (this.keys['w'] || this.keys['arrowup']) this.camTarget.addScaledVector(f, -sp);
    if (this.keys['s'] || this.keys['arrowdown']) this.camTarget.addScaledVector(f, sp);
    if (this.keys['a'] || this.keys['arrowleft']) this.camTarget.addScaledVector(r, -sp);
    if (this.keys['d'] || this.keys['arrowright']) this.camTarget.addScaledVector(r, sp);
    if (this.keys['q']) this.camYaw -= 1.6 * dt;
    if (this.keys['e']) this.camYaw += 1.6 * dt;
    // edge pan
    if (this.mouseNDC.x > 0.96) this.camTarget.addScaledVector(r, sp * 0.7);
    if (this.mouseNDC.x < -0.96) this.camTarget.addScaledVector(r, -sp * 0.7);
    if (this.mouseNDC.y > 0.92) this.camTarget.addScaledVector(f, -sp * 0.7);
    if (this.mouseNDC.y < -0.92) this.camTarget.addScaledVector(f, sp * 0.7);
    const H = CONFIG.mapSize / 2 - 10;
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -H, H);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -H, H);
    const gy = this.gy(this.camTarget.x, this.camTarget.z);
    const cx = this.camTarget.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = this.camTarget.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = gy + Math.sin(this.camPitch) * this.camDist;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.camTarget.x, gy, this.camTarget.z);
    // sun shadow frustum follows the view
    if (this.sun) {
      this.sun.position.set(this.camTarget.x + 60, 95, this.camTarget.z + 40);
      this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
      this.sun.target.updateMatrixWorld();
    }
  }

  // ---------- spatial hash (unit proximity queries at 30-kingdom scale) ----------
  gridKey(ix, iz) { return ix * 10000 + iz; }

  rebuildGrid() {
    this.unitGrid.clear();
    const c = this.gridCell, H = CONFIG.mapSize / 2;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead) continue;
      const k = this.gridKey(Math.floor((u.x + H) / c), Math.floor((u.z + H) / c));
      let a = this.unitGrid.get(k);
      if (!a) { a = []; this.unitGrid.set(k, a); }
      a.push(i);
    }
  }

  eachNear(x, z, r, cb) {
    const c = this.gridCell, H = CONFIG.mapSize / 2;
    const ix0 = Math.floor((x - r + H) / c), ix1 = Math.floor((x + r + H) / c);
    const iz0 = Math.floor((z - r + H) / c), iz1 = Math.floor((z + r + H) / c);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const a = this.unitGrid.get(this.gridKey(ix, iz));
        if (!a) continue;
        for (const i of a) {
          const u = this.units[i];
          if (!u || u.dead) continue;
          if (cb(u) === false) return;
        }
      }
    }
  }

  enemiesOf(owner) {
    return [...this.units.filter(u => u.owner !== owner && !u.dead), ...this.buildings.filter(b => b.owner !== owner && !b.dead)];
  }

  nearestEnemy(x, z, owner, maxDist) {
    let best = null, bd = maxDist;
    const seesAll = owner !== this.humanId;
    // fast path: nearby units via spatial grid
    this.eachNear(x, z, maxDist, (u) => {
      if (u.owner === owner || u.dead) return;
      if (!seesAll && !u.mesh.visible) return; // can't target what you can't see
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bd) { bd = d; best = u; }
    });
    // buildings via spatial hash (forts have hundreds of wall pieces)
    this.eachBuildingNear(x, z, maxDist, (b) => {
      if (b.owner === owner) return;
      if (!seesAll && !b.mesh.visible) return;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) { bd = d; best = b; }
    });
    return best;
  }

  nearestResource(x, z) {
    let best = null, bd = 1e9;
    for (const r of this.resources) {
      if (!this.resourceReady(r)) continue;
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  hqOf(owner) { return this.buildings.find(b => b.owner === owner && b.type === 'hq' && !b.dead); }

  // ---------- building spatial hash (forts = hundreds of wall pieces) ----------
  // Rebuilt lazily whenever colliders change; keeps pathfinding, placement and
  // turret target scans cheap even with ~1500 wall segments on the map.
  buildingGrid() {
    if (this._bg && this._bgVer === this.colliderVersion) return this._bg;
    const c = 8, H = CONFIG.mapSize / 2, map = new Map();
    for (const b of this.buildings) {
      if (b.dead) continue;
      // long walls span more than one cell: register every cell the box covers,
      // so short-range queries can never miss a wall end
      const ex = b.hw === undefined ? b.radius : Math.abs(b.hw * b.rotC) + Math.abs(b.hd * b.rotS);
      const ez = b.hw === undefined ? b.radius : Math.abs(b.hw * b.rotS) + Math.abs(b.hd * b.rotC);
      const ix0 = Math.floor((b.x - ex + H) / c), ix1 = Math.floor((b.x + ex + H) / c);
      const iz0 = Math.floor((b.z - ez + H) / c), iz1 = Math.floor((b.z + ez + H) / c);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = ix * 1000 + iz;
          let a = map.get(k);
          if (!a) { a = []; map.set(k, a); }
          a.push(b);
        }
      }
    }
    this._bg = map; this._bgVer = this.colliderVersion; this._bgCell = c;
    return map;
  }

  eachBuildingNear(x, z, r, cb) {
    const map = this.buildingGrid(), c = this._bgCell, H = CONFIG.mapSize / 2;
    const ix0 = Math.floor((x - r + H) / c), ix1 = Math.floor((x + r + H) / c);
    const iz0 = Math.floor((z - r + H) / c), iz1 = Math.floor((z + r + H) / c);
    // a wall sits in several cells now, so stamp each visit to visit it once
    const stamp = (this._bgStamp = (this._bgStamp || 0) + 1);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const a = map.get(ix * 1000 + iz);
        if (!a) continue;
        for (const b of a) {
          if (b.dead || b._bgSeen === stamp) continue;
          b._bgSeen = stamp;
          if (cb(b) === false) return;
        }
      }
    }
  }

  // ---------- fog of war ----------
  fogCell(x, z) {
    const N = this.fogN, H = CONFIG.mapSize / 2;
    const cx = Math.floor(((x + H) / (2 * H)) * N);
    const cz = Math.floor(((z + H) / (2 * H)) * N);
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return -1;
    return cz * N + cx;
  }
  isVisibleAt(x, z) { const i = this.fogCell(x, z); return i >= 0 && this.visibleF[i] === 1; }
  isExploredAt(x, z) { const i = this.fogCell(x, z); return i >= 0 && this.explored[i] === 1; }
  visibleTo(owner, x, z) {
    if (owner !== this.humanId) return true; // AI plays with full vision
    return this.isVisibleAt(x, z);
  }
  sightOf(e) {
    if (e.kind === 'unit') return CONFIG.units[e.type]?.sight || 14;
    return CONFIG.buildings[e.type]?.sight || 14;
  }

  updateFog() {
    const N = this.fogN, H = CONFIG.mapSize / 2, cell = (2 * H) / N;
    this.visibleF.fill(0);
    const stamp = (x, z, sight) => {
      const r = Math.ceil(sight / cell);
      const ccx = Math.floor(((x + H) / (2 * H)) * N), ccz = Math.floor(((z + H) / (2 * H)) * N);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const ix = ccx + dx, iz = ccz + dz;
          if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
          const i = iz * N + ix;
          this.visibleF[i] = 1;
          this.explored[i] = 1;
        }
      }
    };
    for (const u of this.units) if (u.owner === this.humanId && !u.dead) stamp(u.x, u.z, this.sightOf(u));
    for (const b of this.buildings) if (b.owner === this.humanId && !b.dead) stamp(b.x, b.z, this.sightOf(b));

    // paint shroud
    const d = this.fogImg.data;
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      if (this.visibleF[i]) { d[o + 3] = 0; }
      else if (this.explored[i]) { d[o] = 3; d[o + 1] = 6; d[o + 2] = 12; d[o + 3] = 150; }
      else { d[o] = 2; d[o + 1] = 4; d[o + 2] = 9; d[o + 3] = 255; }
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    this.fogTex.needsUpdate = true;

    // hide what the player cannot see
    for (const u of this.units) {
      if (u.owner === this.humanId || u.dead) { if (!u.dead) u.mesh.visible = true; continue; }
      u.mesh.visible = this.isVisibleAt(u.x, u.z);
    }
    for (const b of this.buildings) {
      if (b.owner === this.humanId || b.dead) continue;
      b.mesh.visible = this.isExploredAt(b.x, b.z); // remembered, gets darkened by shroud
    }
    // terrain trees are part of the landscape: always visible, no per-tree fog meshes
  }

  // worker rig LOD: skinning dozens of Cave Men is wasted work off-camera, so
  // only rigs inside the fog ring animate and the rest fall back to a plain box.
  updateWorkerRig(u, dt, moved) {
    const r = u.rig;
    const near = Math.hypot(u.x - this.camTarget.x, u.z - this.camTarget.z) < 95;
    if (near !== r.root.visible) {
      r.root.visible = near;
      if (u.body) u.body.visible = !near;
    }
    if (near) {
      // walk only when really covering ground: steering jitter and shoves in
      // a crowd must not play the stride (moonwalk), and the stride rate
      // follows ground speed so feet plant instead of glide.
      const covering = moved > u.speed * dt * 0.3;
      animateWorkerRig(r, dt, covering, dt > 0 ? moved / dt : 0);
    }
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    this.autoPerf();
    this.updateCamera(dt);

    // chopped stumps regrow on a timer (endless timber); flush any
    // harvest-rescaled terrain instances once per frame (batched upload)
    this.regrowTrees(dt);
    this.flushTreeMatrices();
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      pt.vel.y -= 9 * dt;
      pt.mesh.material.opacity = Math.max(0, pt.life / pt.max);
      if (pt.life <= 0) { this.scene.remove(pt.mesh); this.particles.splice(i, 1); }
    }

    // training queues
    for (const b of this.buildings) {
      if (b.dead || !b.queue.length) continue;
      const cur = b.queue[0];
      cur.t -= dt;
      b.progress = cur.t;
      if (cur.t <= 0) {
        b.queue.shift();
        this.completeTraining(b, cur.type);
        if (b.owner === this.humanId && this.selected.includes(b)) this.hooks.onSelect?.(this.selected);
      }
    }

    // water shimmer + river foam drift
    if (this.waterFx) {
      this.waterFx.waterMat.opacity = 0.74 + Math.sin(this.time * 1.3) * 0.05;
      for (const s of this.waterFx.streaks) {
        s.m.position.z += s.speed * dt;
        if (s.m.position.z > CONFIG.mapSize / 2) {
          s.m.position.z = -CONFIG.mapSize / 2;
          s.m.position.x = riverX(s.m.position.z) + (Math.random() - 0.5) * 8;
        }
      }
    }

    // units (fresh grid so queries see pre-move positions; rebuilt again in resolveOverlaps)
    this.rebuildGrid();
    for (const u of this.units) {
      if (u.dead) continue;
      u.cd -= dt;
      u.lastShotT = (u.lastShotT ?? 99) + dt;
      this.updateUnit(u, dt);
      // sampled before lastX/lastZ roll over: the rig needs real frame movement
      const moved = Math.hypot(u.x - u.lastX, u.z - u.lastZ);
      // unstick: barely moved while path-following -> drop cache, repath, tiny sidestep.
      // Anchored (firing) units are exempt — they are SUPPOSED to stand still.
      const followingPath = (u.hasOrder || u.target) && u.path && u.path.length && !u.fireAnchor;
      if (followingPath) {
        if (Math.hypot(u.x - u.lastX, u.z - u.lastZ) < u.speed * dt * 0.2) {
          u.stuckT += dt;
          if (u.stuckT > 0.7) {
            const goalX = u.pathTx ?? u.tx ?? u.x, goalZ = u.pathTz ?? u.tz ?? u.z;
            u.stuckT = 0; u.path = null; u.repathT = 0;
            // sidestep perpendicular to travel dir; never into a wall. Nearby
            // units are ignored here because resolveOverlaps separates them
            // after the teleport.
            const a = Math.atan2(u.z - goalZ, u.x - goalX) + Math.PI / 2;
            const tryStep = (ang, dist) => {
              const nx = THREE.MathUtils.clamp(u.x + Math.cos(ang) * dist, -this.mapBound(4), this.mapBound(4));
              const nz = THREE.MathUtils.clamp(u.z + Math.sin(ang) * dist, -this.mapBound(4), this.mapBound(4));
              if (!this.pointBlocked(nx, nz, u.radius) && this.spotClearOfWorld(nx, nz, u.radius, u)) { u.x = nx; u.z = nz; return true; }
              return false;
            };
            if (!tryStep(a, 0.8)) tryStep(a + Math.PI, 0.8);
          }
        } else u.stuckT = 0;
      } else {
        u.stuckT = 0;
      }
      u.lastX = u.x; u.lastZ = u.z;
      // mesh sync (ride the terrain) + health bar (shown only when hurt/selected)
      u.mesh.position.set(u.x, this.gy(u.x, u.z), u.z);
      const showBar = u.hp < u.maxHp || u.ring.visible;
      u.bar.visible = showBar;
      if (showBar) {
        u.bar.userData.set(u.hp / u.maxHp, u.owner === this.humanId);
        u.bar.lookAt(this.camera.position);
      }
      // face movement/target — smooth turn, no snap-spin when overlapping
      const look = u.target && !u.target.dead ? u.target : (u.hasOrder ? { x: u.tx, z: u.tz } : null);
      if (look) {
        const dx = look.x - u.x, dz = look.z - u.z;
        if (Math.hypot(dx, dz) > 0.4) {
          const want = Math.atan2(dx, dz);
          let diff = want - u.mesh.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          u.mesh.rotation.y += diff * Math.min(1, dt * 10);
        }
      }
      // selection ring pulse + worker cargo gem
      if (u.rig) this.updateWorkerRig(u, dt, moved);
      if (u.gem) {
        u.gem.visible = u.carrying > 0;
        if (u.gem.visible) u.gem.rotation.x += dt * 3;
      }
      if (u.ring.visible) {
        const s = 1 + Math.sin(this.time * 5) * 0.06;
        u.ring.scale.setScalar(s);
      }
    }
    this.resolveOverlaps();

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      if (k >= 1) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        if (p.target && !p.target.dead) {
          this.burst(p.to.x, p.to.y, p.to.z, 0xfbbf24, 4, 3);
          this.damage(p.target, p.damage, p.owner);
          // artillery splash (grid query, not full scan)
          if (p.splash) {
            this.burst(p.to.x, p.to.y, p.to.z, 0xfb923c, 12, 7);
            const hitSplash = (e) => {
              if (e === p.target || e.dead || e.owner === p.owner) return;
              if (Math.hypot(e.x - p.to.x, e.z - p.to.z) <= p.splash) this.damage(e, p.damage * 0.6, p.owner);
            };
            this.eachNear(p.to.x, p.to.z, p.splash + 1, hitSplash);
            this.eachBuildingNear(p.to.x, p.to.z, p.splash + 1, hitSplash);
          }
        }
      }
    }

    // turret defense (every kingdom; humans need vision, AI sees all)
    for (const b of this.buildings) {
      if (b.dead || b.type !== 'turret') continue;
      b.cd = (b.cd || 0) - dt;
      if (b.cd > 0) continue;
      const st = CONFIG.buildings.turret;
      const e = this.nearestEnemy(b.x, b.z, b.owner, st.range + 1.5);
      if (e) {
        b.cd = st.cooldown;
        // aim head
        if (b.head) b.head.lookAt(e.x, this.gy(e.x, e.z) + 2, e.z);
        const from = new THREE.Vector3(b.x, this.gy(b.x, b.z) + 2.4, b.z);
        const to = new THREE.Vector3(e.x, this.gy(e.x, e.z) + 1.2, e.z);
        this.spawnProjectile(from, to, b.owner === this.humanId ? 0x93c5fd : 0xfca5a5, st.damage, e, 0, b.owner);
      } else {
        b.cd = 0.2 + Math.random() * 0.1; // idle: scan ~4x/s, not every frame
      }
    }

    // billboard the few revealed building bars (damaged/selected only)
    for (const b of this.buildings) {
      if (b.dead || !b.bar || !b.bar.visible) continue;
      b.bar.lookAt(this.camera.position);
    }

    // fog of war at ~6Hz
    this.fogT += dt;
    if (this.fogT > 0.18) { this.fogT = 0; this.updateFog(); }

    // cleanup dead
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.dead && u.deathT !== undefined) {
        u.deathT -= dt;
        u.mesh.scale.multiplyScalar(1 - dt * 2);
        u.mesh.position.y -= dt;
        if (u.deathT <= 0) { this.scene.remove(u.mesh); this.units.splice(i, 1); }
      }
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.dead && !b.removed) {
        b.removed = true;
        // explosion: sink
        this.scene.remove(b.mesh);
        this.buildings.splice(i, 1);
        this.colliderVersion++;
        this.selected = this.selected.filter(s => s !== b);
        this.hooks.onSelect?.(this.selected);
        this.checkGameOver();
      }
    }
    this.selected = this.selected.filter(s => !s.dead);
  }

  updateUnit(u, dt) {
    // validate target
    if (u.target && (u.target.dead || (u.target.kind === 'resource') || (u.target.amount !== undefined && u.target.amount <= 0))) u.target = null;
    if (u.objective && (u.objective.dead || u.objective.owner === u.owner)) u.objective = null;
    // resume original objective after breaching a wall
    if (!u.target && u.objective && u.type !== 'worker') {
      u.target = u.objective; u.objective = null;
      u.path = null; u.repathT = 0;
    }

    // WORKER harvesting — manual log runs: chop the assigned tree, haul to HQ,
    // then stand idle. Workers never auto-seek trees on their own.
    // Trees shrink as they are chopped and regrow from a stump, so logging never ends.
    const CARRY = CONFIG.resource?.carryMax ?? 10;
    if (u.type === 'worker' && u.harvestTarget && this.resourceReady(u.harvestTarget) && u.carrying < CARRY) {
      const n = u.harvestTarget;
      if (Math.hypot(n.x - u.x, n.z - u.z) > n.radius + 0.9) { this.navigate(u, n.x, n.z, dt, n.radius + 0.9, 3.0); return; }
      u.path = null;
      u.gathering += dt;
      if (u.gathering >= CONFIG.units.worker.harvestTime) {
        u.gathering = 0;
        const take = Math.min(CONFIG.units.worker.harvestRate, CARRY - u.carrying, n.amount);
        u.carrying += take; n.amount -= take;
        this.syncTree(n);
        this.burst(n.x, this.gy(n.x, n.z) + 1.5, n.z, 0x8b5a2b, 5, 2.5);
        this.burst(n.x, this.gy(n.x, n.z) + 2.4, n.z, 0x4ade80, 4, 2);
        if (n.amount <= 0) {
          // chopped down -> stump, regrows after a while (never permanently gone).
          // Manual order complete: haul home what is carried, then idle.
          n.amount = 0;
          n.depleted = true;
          const [rlo, rhi] = CONFIG.resource?.regrowTime ?? [55, 115];
          n.regrowT = rlo + Math.random() * (rhi - rlo);
          this.syncTree(n);
          u.harvestTarget = null; u.harvestManual = false;
          u.hasOrder = u.carrying > 0; u.returning = u.carrying > 0;
        }
        if (u.carrying >= CARRY) { const hq = this.hqOf(u.owner); if (hq) { const drop = this.hqDropSpot(hq, u); u.returning = true; u.dropX = drop.x; u.dropZ = drop.z; u.dropFor = hq.id; u.tx = drop.x; u.tz = drop.z; u.path = null; } }
      }
      return;
    }
    // return cargo: explicit delivery runs only (returning flag). Stopped
    // (holding) workers and re-tasked workers keep their logs until ordered.
    if (u.type === 'worker' && u.carrying > 0 && !u.holdPosition && u.returning) {
      const hq = this.hqOf(u.owner);
      if (!hq) return;
      if (u.dropFor !== hq.id) {
        const drop = this.hqDropSpot(hq, u);
        u.dropX = drop.x; u.dropZ = drop.z; u.dropFor = hq.id; u.path = null;
      }
      // The staged drop sits just outside the HQ footprint, past the old
      // center-distance deposit ring — so hand over on drop arrival too.
      const atDrop = u.dropX !== undefined && Math.hypot(u.dropX - u.x, u.dropZ - u.z) <= 0.85;
      if (Math.hypot(hq.x - u.x, hq.z - u.z) > hq.radius + 0.9 && !atDrop) { this.navigate(u, u.dropX, u.dropZ, dt, 0.8, 3.0); return; }
      u.path = null;
      this.players[u.owner].logs += u.carrying;
      u.carrying = 0; u.returning = false;
      // delivery complete: stand idle, never auto-seek the next tree
      u.harvestTarget = null; u.harvestManual = false; u.hasOrder = false;
      u.dropX = null; u.dropZ = null; u.dropFor = null;
      u.idleT = 0;
      return;
    }

    // COMBAT: if has attack target — plant feet with hysteresis, no steering dance
    if (u.target && !u.target.dead) {
      const t = u.target;
      // fog: living enemy units that slipped back into shroud can't be chased (buildings stay)
      if (this.isHuman(u.owner) && !this.isHuman(t.owner) && t.kind === 'unit' && !this.isVisibleAt(t.x, t.z)) {
        u.target = null; u.fireAnchor = null;
      } else {
        const d = Math.hypot(t.x - u.x, t.z - u.z);
        const attackR = u.range + (t.radius || 0.5);
        // hysteresis: start firing inside range, keep firing until target pulls +1.5m out.
        // This kills the in/out range flicker that caused the "dance".
        const firing = u.fireAnchor || d <= attackR;
        if (!firing) {
          const nav = this.navigate(u, t.x, t.z, dt, Math.max(1.0, u.range * 0.7), 1.2);
          if (nav === 'blocked') {
            // walled in: chew through the nearest enemy structure, then resume
            const wall = this.breachTarget(u);
            if (wall) { if (!u.objective) u.objective = t; u.target = wall; u.path = null; u.fireAnchor = null; }
          }
          return;
        }
        // IN RANGE: anchor feet and shoot. No steering / no path here = no dance.
        if (!u.fireAnchor) u.fireAnchor = { x: u.x, z: u.z };
        else { u.x = u.fireAnchor.x; u.z = u.fireAnchor.z; }
        u.path = null; u.pathTx = t.x; u.pathTz = t.z; u.repathT = 0.5;
        // target kited out of hysteresis band -> release anchor and chase
        if (d > attackR + 1.5) { u.fireAnchor = null; return; }
        u.hasOrder = u.attackMove; // attack-move keeps marching after the kill
        u.lastShotT = (u.lastShotT ?? 0);
        if (u.cd <= 0) {
          u.cd = u.cooldown;
          u.lastShotT = 0;
          const from = new THREE.Vector3(u.x, this.gy(u.x, u.z) + 1.2, u.z);
          const to = new THREE.Vector3(t.x, this.gy(t.x, t.z) + (t.kind === 'building' ? 1.5 : 1.0), t.z);
          const col = u.type === 'tank' ? 0xfb923c : u.type === 'artillery' ? 0xfde047 : u.owner === this.humanId ? 0x93c5fd : 0xfca5a5;
          const splash = u.type === 'artillery' ? (CONFIG.units.artillery.splash || 0) : 0;
          this.spawnProjectile(from, to, col, u.damage, t, splash, u.owner);
        }
        return;
      }
    } else {
      u.fireAnchor = null;
    }

    // idle: soldiers guard (unless holding), workers auto-harvest.
    // Scans are staggered per-unit so 400+ units don't all query each frame.
    // idle: soldiers guard (unless holding), workers stand idle.
    // Workers only harvest on an explicit order — no auto-seeking trees.
    if (u.type !== 'worker' && !u.hasOrder && !u.target && !u.holdPosition) {
      if ((u.nextScan ?? 0) <= this.time) {
        u.nextScan = this.time + 0.5 + Math.random() * 0.5;
        const e = this.nearestEnemy(u.x, u.z, u.owner, u.aggro);
        if (e) { u.target = e; u.fireAnchor = null; return; }
      }
    }
    if (u.type === 'worker' && !u.hasOrder && !u.target) {
      u.idleT = (u.idleT || 0) + dt;
      return;
    }

    // MOVE order
    if (u.hasOrder) {
      if (this.navigate(u, u.tx, u.tz, dt, 0.6, 2.5) === 'arrived') {
        u.hasOrder = false; u.attackMove = false; u.path = null;
        // soldiers on attack-move engage nearby
        if (u.type !== 'worker') {
          const e = this.nearestEnemy(u.x, u.z, u.owner, u.aggro);
          if (e) u.target = e;
        } else {
          u.idleT = 0;
        }
        return;
      }
      // attack-move: engage while marching
      if (u.attackMove && u.type !== 'worker') {
        const e = this.nearestEnemy(u.x, u.z, u.owner, u.aggro * 0.8);
        if (e) { u.target = e; return; }
      }
    } else {
      u.idleT = (u.idleT || 0) + dt;
    }
  }

  resolveOverlaps() {
    // grid-based: only neighbors interact (O(n) at 30-kingdom scale).
    // Units currently FIRING are anchored — the mover takes the full push.
    const H = CONFIG.mapSize / 2 - 1;
    const pushPair = (a, b) => {
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius + 0.12;
      if (d < min && d > 0.0001) {
        const push = (min - d);
        const nx = dx / d, nz = dz / d;
        const aAnch = !!a.fireAnchor || (a.lastShotT ?? 99) < 0.4;
        const bAnch = !!b.fireAnchor || (b.lastShotT ?? 99) < 0.4;
        if (aAnch && !bAnch) { b.x += nx * push; b.z += nz * push; }
        else if (bAnch && !aAnch) { a.x -= nx * push; a.z -= nz * push; }
        else {
          const half = push / 2;
          a.x -= nx * half; a.z -= nz * half;
          b.x += nx * half; b.z += nz * half;
        }
      } else if (d <= 0.0001) {
        b.x += 0.15; b.z += 0.1;
      }
    };
    // Eject units from building footprints first, then relax unit pairs. The
    // final pair pass matters: a wall ejection can otherwise shove a unit
    // directly onto its neighbor and leave the overlap in place.
    for (const u of this.units) {
      if (u.dead) continue;
      // anchored firing units stay planted; skip building-push for them too
      if (!u.fireAnchor) {
        // spatial-hash query: forts hold hundreds of wall pieces, a full scan
        // here used to cost units x buildings every frame
        this.eachBuildingNear(u.x, u.z, 7, (b) => {
          if (!this.buildingBlocks(b, u.x, u.z, u.radius)) return;
          const dx = u.x - b.x, dz = u.z - b.z;
          if (b.hw !== undefined) {
            // long wall: move to the closest face plus one body radius. The
            // old code used only the push direction, which could park a unit
            // back inside the wall or beside another unit.
            const lx = dx * b.rotC + dz * b.rotS, lz = -dx * b.rotS + dz * b.rotC;
            const ex = b.hw + u.radius, ez = b.hd + u.radius;
            const ox = Math.max(-ex, Math.min(ex, lx));
            const oz = Math.max(-ez, Math.min(ez, lz));
            const px = lx - ox, pz = lz - oz;
            const d = Math.hypot(px, pz);
            let qx, qz;
            if (d > 0.0001) {
              qx = ox + (px / d) * u.radius;
              qz = oz + (pz / d) * u.radius;
            } else if ((ex - Math.abs(lx)) < (ez - Math.abs(lz))) {
              qx = lx >= 0 ? ex : -ex;
              qz = Math.max(-ez, Math.min(ez, lz));
            } else {
              qx = Math.max(-ex, Math.min(ex, lx));
              qz = lz >= 0 ? ez : -ez;
            }
            u.x = b.x + (qx * b.rotC - qz * b.rotS);
            u.z = b.z + (qx * b.rotS + qz * b.rotC);
            return;
          }
          const rr = b.radius + u.radius;
          // cheap reject before sqrt
          if (Math.abs(dx) > rr || Math.abs(dz) > rr) return;
          const d = Math.hypot(dx, dz);
          if (d < rr && d > 0.0001) { u.x = b.x + (dx / d) * rr; u.z = b.z + (dz / d) * rr; }
          else if (d <= 0.0001) { u.x = b.x + rr; }
        });
      }
      u.x = THREE.MathUtils.clamp(u.x, -H, H);
      u.z = THREE.MathUtils.clamp(u.z, -H, H);
    }
    // rebuild grid from current positions, then relax (single rebuild:
    // positions only move a few cm per frame, so one pass is enough)
    this.rebuildGrid();
    for (let pass = 0; pass < 2; pass++) {
      const seen = new Set();
      for (const [, arr] of this.unitGrid) {
        for (const i of arr) {
          const a = this.units[i];
          if (!a || a.dead) continue;
          this.eachNear(a.x, a.z, 2.5, (b) => {
            if (b === a) return;
            const k = a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id;
            if (seen.has(k)) return;
            seen.add(k);
            pushPair(a, b);
          });
        }
      }
    }
  }

  // ================= PATHFINDING (A* on a 3m grid + LOS smoothing) =================
  pathCell() { return 3; }
  pathN() { return Math.ceil(CONFIG.mapSize / this.pathCell()); }

  segPointDist(ax, az, bx, bz, px, pz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  segsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
    const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  segSegDist(ax, az, bx, bz, cx, cz, dx, dz) {
    if (this.segsIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
    return Math.min(
      this.segPointDist(ax, az, bx, bz, cx, cz),
      this.segPointDist(ax, az, bx, bz, dx, dz),
      this.segPointDist(cx, cz, dx, dz, ax, az),
      this.segPointDist(cx, cz, dx, dz, bx, bz),
    );
  }

  segRectDist(ax, az, bx, bz, hw, hd) {
    const inside = (x, z) => Math.abs(x) <= hw && Math.abs(z) <= hd;
    if (inside(ax, az) || inside(bx, bz)) return 0;
    const edges = [
      [-hw, -hd, hw, -hd], [hw, -hd, hw, hd],
      [hw, hd, -hw, hd], [-hw, hd, -hw, -hd],
    ];
    let best = Infinity;
    for (const [cx, cz, dx, dz] of edges) {
      best = Math.min(best, this.segSegDist(ax, az, bx, bz, cx, cz, dx, dz));
    }
    return best;
  }

  // Exact segment test for smoothing and long-range moves. Sampling every 3m
  // could step over a one-metre wall on a short hop; this checks the whole
  // segment against nearby footprints instead.
  segmentBlocked(ax, az, bx, bz, r) {
    const d = Math.hypot(bx - ax, bz - az);
    const seen = new Set();
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      this.eachBuildingNear(ax + (bx - ax) * t, az + (bz - az) * t, 8, (b) => { seen.add(b); });
    }
    for (const b of seen) {
      if (b.dead) continue;
      if (b.hw === undefined) {
        if (this.segPointDist(ax, az, bx, bz, b.x, b.z) < b.radius + r) return true;
      } else {
        const lax = (ax - b.x) * b.rotC + (az - b.z) * b.rotS;
        const laz = -(ax - b.x) * b.rotS + (az - b.z) * b.rotC;
        const lbx = (bx - b.x) * b.rotC + (bz - b.z) * b.rotS;
        const lbz = -(bx - b.x) * b.rotS + (bz - b.z) * b.rotC;
        if (this.segRectDist(lax, laz, lbx, lbz, b.hw, b.hd) < r) return true;
      }
    }
    for (const o of this.obstacles) {
      const minX = Math.min(ax, bx) - o.r - r, maxX = Math.max(ax, bx) + o.r + r;
      const minZ = Math.min(az, bz) - o.r - r, maxZ = Math.max(az, bz) + o.r + r;
      if (o.x < minX || o.x > maxX || o.z < minZ || o.z > maxZ) continue;
      if (this.segPointDist(ax, az, bx, bz, o.x, o.z) < o.r + r) return true;
    }
    return false;
  }

  pointBlocked(x, z, r) {
    const H = CONFIG.mapSize / 2 - 1.2;
    if (Math.abs(x) > H || Math.abs(z) > H) return true;
    if (this.terrain && this.terrain.blocked(x, z)) return true; // river / mountain
    // One clearance everywhere: pathing, steering and overlap resolution all
    // use the unit's full body radius. Smaller steering pads used to aim units
    // at gaps the resolver then rejected, causing wall jitter.
    let hit = false;
    this.eachBuildingNear(x, z, 7, (b) => {
      if (this.buildingBlocks(b, x, z, r)) { hit = true; return false; }
    });
    if (hit) return true;
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z, rr = o.r + r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  losClear(ax, az, bx, bz, r) {
    const d = Math.hypot(bx - ax, bz - az);
    if (this.terrain) {
      const steps = Math.max(1, Math.ceil(d / 2));
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        if (this.terrain.blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
      }
    }
    return !this.segmentBlocked(ax, az, bx, bz, r);
  }

  findPath(sx, sz, tx, tz, radius) {
    const cell = this.pathCell(), H = CONFIG.mapSize / 2, N = this.pathN();
    const rq = Math.round(radius * 2) / 2;
    const q = (v) => Math.round(v / 2) * 2; // coarse keys: shared cache hits
    const key = `${this.colliderVersion}|${q(sx)},${q(sz)},${q(tx)},${q(tz)},${rq}`;
    if (this.pathCache.has(key)) {
      const c = this.pathCache.get(key);
      return c === 'X' ? null : c.map(p => ({ x: p.x, z: p.z }));
    }
    const remember = (v) => {
      if (this.pathCache.size > 600) this.pathCache.clear();
      this.pathCache.set(key, v);
      return v === 'X' ? null : v.map(p => ({ x: p.x, z: p.z }));
    };
    const toCell = (x, z) => [
      THREE.MathUtils.clamp(Math.floor((x + H) / cell), 0, N - 1),
      THREE.MathUtils.clamp(Math.floor((z + H) / cell), 0, N - 1),
    ];
    const cellCenter = (ix, iz) => ({ x: -H + (ix + 0.5) * cell, z: -H + (iz + 0.5) * cell });
    const blockedAt = (ix, iz) => {
      const c = cellCenter(ix, iz);
      return this.pointBlocked(c.x, c.z, rq);
    };
    const nearestFree = (ix, iz) => {
      if (!blockedAt(ix, iz)) return [ix, iz];
      for (let ring = 1; ring <= 4; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const nx = ix + dx, nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
            if (!blockedAt(nx, nz)) return [nx, nz];
          }
        }
      }
      return null;
    };
    let s = nearestFree(...toCell(sx, sz));
    let gcell = nearestFree(...toCell(tx, tz));
    if (!s || !gcell) return remember('X');
    const [six, siz] = s, [tix, tiz] = gcell;
    if (six === tix && siz === tiz) return remember([]);
    const idx = (x, z) => z * N + x;
    const oct = (ax, az, bx, bz) => {
      const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    // binary-heap open set: the finer 3m grid (needed so a 1m-thin wall can
    // never be slipped through) pops far more nodes than the old 4m grid, and
    // the previous linear "scan for the min" was the real bottleneck
    const hF = [], hI = [];
    const hPush = (f, i) => {
      hF.push(f); hI.push(i);
      let c = hF.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hF[p] <= hF[c]) break;
        const tf = hF[p]; hF[p] = hF[c]; hF[c] = tf;
        const ti = hI[p]; hI[p] = hI[c]; hI[c] = ti;
        c = p;
      }
    };
    const hPop = () => {
      const top = hI[0], lf = hF.pop(), li = hI.pop();
      if (hF.length) {
        hF[0] = lf; hI[0] = li;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let s = c;
          if (l < hF.length && hF[l] < hF[s]) s = l;
          if (r < hF.length && hF[r] < hF[s]) s = r;
          if (s === c) break;
          const tf = hF[s]; hF[s] = hF[c]; hF[c] = tf;
          const ti = hI[s]; hI[s] = hI[c]; hI[c] = ti;
          c = s;
        }
      }
      return top;
    };
    hPush(oct(six, siz, tix, tiz), idx(six, siz));
    const came = new Map();
    const gs = new Map([[idx(six, siz), 0]]);
    const closed = new Set();
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false, iter = 0;
    while (hF.length && iter++ < 2600) {
      const cur = hPop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % N, cz = Math.floor(cur / N);
      if (cx === tix && cz === tiz) { found = true; break; }
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        if (blockedAt(nx, nz)) continue;
        if (dx && dz && (blockedAt(cx + dx, cz) || blockedAt(cx, cz + dz))) continue; // no corner cutting
        const ni = idx(nx, nz);
        if (closed.has(ni)) continue;
        const ng = gs.get(cur) + cost;
        if (ng < (gs.get(ni) ?? Infinity)) {
          gs.set(ni, ng);
          came.set(ni, cur);
          hPush(ng + oct(nx, nz, tix, tiz), ni);
        }
      }
    }
    if (!found) return remember('X');
    // reconstruct
    const cells = [];
    let cur = idx(tix, tiz);
    while (cur !== undefined) {
      cells.push(cur);
      if (cur === idx(six, siz)) break;
      cur = came.get(cur);
    }
    cells.reverse();
    let pts = cells.map(c => cellCenter(c % N, Math.floor(c / N)));
    pts[pts.length - 1] = { x: tx, z: tz }; // exact destination
    // greedy LOS smoothing
    const sm = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        if (this.losClear(pts[i].x, pts[i].z, pts[j].x, pts[j].z, rq)) break;
      }
      sm.push(pts[j]);
      i = j;
    }
    // drop first waypoint if we're already on top of it
    if (sm.length && Math.hypot(sm[0].x - sx, sm[0].z - sz) < 1.0) sm.shift();
    return remember(sm);
  }

  // steer one step toward a waypoint (low level, no path logic)
  steer(u, wx, wz, dt, combat) {
    let dx = wx - u.x, dz = wz - u.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    // separation via spatial grid: movers flow around standers
    let sx = 0, sz = 0;
    this.eachNear(u.x, u.z, 2.5, (o) => {
      if (o === u || o.dead) return;
      const ox = u.x - o.x, oz = u.z - o.z;
      if (Math.abs(ox) > 2.5 || Math.abs(oz) > 2.5) return;
      const od = Math.hypot(ox, oz);
      const min = u.radius + o.radius + 0.9;
      if (od < min && od > 0.001) {
        // anchored/firing units are "heavy": movers steer harder around them
        const heavy = (o.fireAnchor || (o.lastShotT ?? 99) < 0.4) ? 1.8 : 1.0;
        const f = ((min - od) / min) * heavy;
        sx += (ox / od) * f; sz += (oz / od) * f;
      }
    });
    // in combat only damp separation at very close range; never fully off
    // (full-off was letting units stack inside each other while chasing)
    let vx = dx + sx * (combat && d <= 3 ? 0.9 : 1.4);
    let vz = dz + sz * (combat && d <= 3 ? 0.9 : 1.4);
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const step = Math.min(u.speed * dt, d);
    let nx = u.x + vx * step, nz = u.z + vz * step;
    // slide around terrain/buildings: try full step, then left/right deflects
    const blocked = (px, pz) => {
      if (this.terrain && this.terrain.blocked(px, pz)) return true;
      const ur = u.radius;
      // spatial-hash query: a full building scan here cost units x buildings per frame
      let hit = false;
      this.eachBuildingNear(px, pz, 6, (b) => {
        // footprint-aware: a long wall must not behave like a fat circle
        if (this.buildingBlocks(b, px, pz, ur)) { hit = true; return false; }
      });
      if (hit) return true;
      for (const o of this.obstacles) {
        const ddx = px - o.x, ddz = pz - o.z, rr = o.r + ur;
        if (Math.abs(ddx) > rr || Math.abs(ddz) > rr) continue;
        if (ddx * ddx + ddz * ddz < rr * rr) return true;
      }
      return false;
    };
    if (blocked(nx, nz)) {
      // deflect perpendicular (both sides) + slowed forward — first clear wins
      const cands = [
        [vx * 0.35 - vz * 0.9, vz * 0.35 + vx * 0.9],
        [vx * 0.35 + vz * 0.9, vz * 0.35 - vx * 0.9],
        [vx * 0.2, vz * 0.2],
      ];
      let moved = false;
      for (const [cx, cz] of cands) {
        const px = u.x + cx * step, pz = u.z + cz * step;
        if (!blocked(px, pz)) { nx = px; nz = pz; moved = true; break; }
      }
      if (!moved) { nx = u.x; nz = u.z; } // hold rather than clip inside a wall
    }
    const H = CONFIG.mapSize / 2 - 1;
    u.x = THREE.MathUtils.clamp(nx, -H, H);
    u.z = THREE.MathUtils.clamp(nz, -H, H);
  }

  // A* can fail inside a sealed courtyard or against a fresh wall line. Instead
  // of standing still until the next repath, slide persistently to one side of
  // the blockage. The side follows the unit id so two stuck units do not both
  // flip sides every retry and dance in place.
  blockedDetour(u, tx, tz, dt) {
    const base = Math.atan2(tz - u.z, tx - u.x);
    const first = (u.id % 2 === 0 ? 1 : -1) * 0.65;
    const probe = Math.max(3, u.speed * 0.6);
    const H = this.mapBound(4);
    for (const off of [first, first * 2, -first, -first * 2, Math.PI / 2, -Math.PI / 2]) {
      const px = THREE.MathUtils.clamp(u.x + Math.cos(base + off) * probe, -H, H);
      const pz = THREE.MathUtils.clamp(u.z + Math.sin(base + off) * probe, -H, H);
      if (this.pointBlocked(px, pz, u.radius)) continue;
      this.steer(u, px, pz, dt, !!u.target);
      u.path = null; u.repathT = 0.6;
      return true;
    }
    return false;
  }

  // high level: follow cached path, repathing as needed.
  // returns 'arrived' | 'moving' | 'blocked'
  navigate(u, tx, tz, dt, arriveR = 0.6, repathEvery = 2.0) {
    const dd = Math.hypot(tx - u.x, tz - u.z);
    if (dd <= arriveR) { u.path = null; return 'arrived'; }
    // long-range fast path: open ground skips A* entirely (the common case
    // on a 320m map — full A* across the continent is the freeze risk)
    if (dd > 100 && this.losClear(u.x, u.z, tx, tz, u.radius)) {
      u.path = null;
      this.steer(u, tx, tz, dt, !!u.target);
      return 'moving';
    }
    u.repathT = (u.repathT ?? 0) - dt;
    const moved = Math.hypot(tx - (u.pathTx ?? 1e9), tz - (u.pathTz ?? 1e9));
    if (!u.path || moved > 3 || u.repathT <= 0) {
      const res = this.findPath(u.x, u.z, tx, tz, u.radius);
      u.pathTx = tx; u.pathTz = tz; u.repathT = repathEvery;
      if (res === null) return this.blockedDetour(u, tx, tz, dt) ? 'moving' : 'blocked';
      u.path = res.length ? res : null; // [] is truthy — normalize to null
      if (!u.path) {
        // same cell: drive direct if LOS allows, otherwise slide around rubble
        if (this.losClear(u.x, u.z, tx, tz, u.radius)) { this.steer(u, tx, tz, dt, !!u.target); return dd <= arriveR ? 'arrived' : 'moving'; }
        this.blockedDetour(u, tx, tz, dt);
        return 'moving';
      }
    }
    if (!u.path || !u.path.length) {
      // defensive: never index an empty path (stale [] from cache/smoothing)
      u.path = null;
      if (this.losClear(u.x, u.z, tx, tz, u.radius)) { this.steer(u, tx, tz, dt, !!u.target); return dd <= arriveR ? 'arrived' : 'moving'; }
      this.blockedDetour(u, tx, tz, dt);
      return 'moving';
    }
    let head = u.path[0];
    if (Math.hypot(head.x - u.x, head.z - u.z) < 2.2) {
      u.path.shift();
      head = u.path[0];
      if (!head) { u.path = null; return dd <= arriveR + 1.2 ? 'arrived' : 'moving'; }
    }
    // final approach straight in when visible and close
    if (dd <= Math.max(arriveR, 4) && this.losClear(u.x, u.z, tx, tz, u.radius)) {
      this.steer(u, tx, tz, dt, !!u.target);
      return dd <= arriveR ? 'arrived' : 'moving';
    }
    this.steer(u, head.x, head.z, dt, !!u.target);
    return 'moving';
  }

  // nearest enemy BUILDING to breach through (walls first, spatial-hash query)
  breachTarget(u, maxD = 16) {
    let best = null, bd = maxD;
    const seesAll = u.owner !== this.humanId;
    this.eachBuildingNear(u.x, u.z, maxD + 4, (b) => {
      if (b.owner === u.owner) return;
      if (!seesAll && !b.mesh.visible) return;
      const d = Math.hypot(b.x - u.x, b.z - u.z);
      const score = d + (b.type === 'wall' ? -4 : 0); // prefer chewing walls
      if (score < bd) { bd = score; best = b; }
    });
    return best;
  }

  damage(ent, amt, attacker) {
    if (ent.dead || this.over) return;
    ent.hp -= amt;
    // reveal + refresh the health bar on first damage (bars stay hidden at full HP)
    if (ent.bar && ent.kind === 'building' && ent.hp > 0) {
      ent.bar.visible = true;
      ent.bar.userData.set(Math.max(0, ent.hp / ent.maxHp), this.isHuman(ent.owner));
      ent.bar.lookAt(this.camera.position);
    }
    // each victim kingdom's own brain hears about the hit (no shared intel)
    if (attacker && attacker !== ent.owner) this.onHit?.(ent, attacker, amt);
    if (ent.hp <= 0) {
      ent.hp = 0; ent.dead = true;
      const humanInvolved = this.isHuman(ent.owner);
      if (ent.kind === 'unit') {
        ent.deathT = 0.8;
        this.burst(ent.x, this.gy(ent.x, ent.z) + 1, ent.z, humanInvolved ? 0x60a5fa : 0xf87171, 16, 6);
        if (humanInvolved) this.hookMsg(`${cap(ent.type)} lost`);
      } else {
        const gy = this.gy(ent.x, ent.z);
        this.burst(ent.x, gy + 2, ent.z, 0xfb923c, 30, 9);
        this.burst(ent.x, gy + 1, ent.z, 0xef4444, 20, 7);
        // announce HQ falls + player losses; other AI skirmishes stay quiet
        if (ent.type === 'hq' || humanInvolved) {
          const nm = this.players[ent.owner]?.name || ent.owner;
          this.hookMsg(`${humanInvolved ? 'Your' : nm + "'s"} ${cap(ent.type)} destroyed!`);
        }
        if (ent.type === 'hq') this.onKingdomFallen(ent.owner);
      }
    }
  }

  onKingdomFallen(owner) {
    const p = this.players[owner];
    if (p) p.alive = false;
    if (!this.isHuman(owner)) {
      const left = this.aliveKingdoms().length - (this.players[this.humanId].alive ? 1 : 0);
      if (this.players[this.humanId].alive) this.hookMsg(`🏰 ${p?.name || owner} has fallen — ${left} rival${left === 1 ? '' : 's'} remain`);
    }
    this.checkGameOver();
  }

  checkGameOver() {
    const pHQ = this.buildings.find(b => b.owner === this.humanId && b.type === 'hq' && !b.dead);
    if (!pHQ) return this.endGame(false);
    const rivals = this.buildings.some(b => !this.isHuman(b.owner) && b.type === 'hq' && !b.dead);
    if (!rivals) return this.endGame(true);
  }

  endGame(win) {
    if (this.over) return;
    this.over = true;
    this.hooks.onGameOver?.(win, this.time);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }
