import * as THREE from 'three';

// War of Crowns — articulated low-poly troopers in the KayKit Adventurers
// idiom (chunky proportions, big head, flat-shaded, web-optimised: each
// trooper is ~25 meshes / <1k tris). Real swinging limbs replace the old
// dummy capsules. Kingdom colour goes on tunic, shield, plume/hood and
// cape trim; skin, leather, wood and iron stay natural.
//
// Style note: KayKit's Adventurers character pack (kaylousberg.itch.io,
// free CC0 tier) is the visual reference — same silhouette language so
// these troops match the KayKit castle/barracks/rogue assets already in
// the game. No third-party files are shipped; see public/models/CREDITS.md.

function M(color, opts = {}) {
  // web optimization: share materials — hundreds of troopers reuse a handful
  // of material instances (12 team dyes + naturals) instead of allocating
  // thousands, which cuts GPU state changes per frame dramatically
  const key = color + '|' + (opts.glow || 0);
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.85, metalness: 0,
      emissive: opts.glow || 0x000000, emissiveIntensity: opts.glow ? 0.8 : 0,
    });
    MAT_CACHE.set(key, m);
  }
  return m;
}

const MAT_CACHE = new Map();

// web optimization: share geometries across all troopers — one BoxGeometry
// per dimension set instead of ~20 fresh allocations per unit
const GEO_CACHE = new Map();
function GEO(kind, ...args) {
  const key = kind + '|' + args.join(',');
  let g = GEO_CACHE.get(key);
  if (!g) {
    const T = THREE;
    switch (kind) {
      case 'box': g = new T.BoxGeometry(args[0], args[1], args[2]); break;
      case 'cyl': g = new T.CylinderGeometry(args[0], args[1], args[2], args[3] || 8); break;
      case 'sph': g = new T.SphereGeometry(args[0], args[1] || 7, args[2] || 6); break;
      case 'cone': g = new T.ConeGeometry(args[0], args[1], args[2] || 7); break;
      case 'ico': g = new T.IcosahedronGeometry(args[0], args[1] ?? 1); break;
      case 'oct': g = new T.OctahedronGeometry(args[0], 0); break;
      case 'tor': g = new T.TorusGeometry(args[0], args[1], 6, 12, args[2] ?? Math.PI * 1.25); break;
      default: g = new T.BoxGeometry(1, 1, 1);
    }
    GEO_CACHE.set(key, g);
  }
  return g;
}

export function troopCacheStats() {
  return { geos: GEO_CACHE.size, mats: MAT_CACHE.size };
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const SKIN = () => M(0xd9a066);
const LEATHER = () => M(0x6b4a2b);
const DARKLEATHER = () => M(0x3f2d1c);
const WOOD = () => M(0x8b5a2b);
const IRON = () => M(0x9aa3b2);
const DARKIRON = () => M(0x3f4756);
const CLOTH = () => M(0x4b5563);
const ROBE = () => M(0xe8e4d8);

function limb(w, len, mat) {
  // pivot at top: rotation.x swings the limb
  const pivot = new THREE.Group();
  const m = mesh(GEO('box',w, len, w), mat, 0, -len / 2, 0);
  pivot.add(m);
  return pivot;
}

function baseTrooper(team, opts = {}) {
  const g = new THREE.Group();
  const parts = {};
  const bulk = opts.bulk || 1;

  // legs (leather boots + cloth pants)
  for (const s of [-1, 1]) {
    const leg = limb(0.20 * bulk, 0.72, CLOTH());
    leg.position.set(s * 0.14 * bulk, 0.78, 0);
    const boot = mesh(GEO('box',0.22 * bulk, 0.16, 0.30 * bulk), DARKLEATHER(), 0, -0.72, 0.04);
    leg.add(boot);
    g.add(leg);
    parts[s < 0 ? 'lLeg' : 'rLeg'] = leg;
  }
  // torso + team tunic (front panel + belt)
  const torso = mesh(GEO('box',0.58 * bulk, 0.66, 0.36 * bulk), LEATHER(), 0, 1.12, 0);
  g.add(torso);
  const tunic = mesh(GEO('box',0.60 * bulk, 0.5, 0.38 * bulk), M(team), 0, 1.10, 0);
  g.add(tunic);
  g.add(mesh(GEO('box',0.60 * bulk, 0.1, 0.38 * bulk), DARKLEATHER(), 0, 0.82, 0)); // belt
  // pauldrons
  for (const s of [-1, 1]) {
    g.add(mesh(GEO('sph',0.13 * bulk, 6, 5), DARKIRON(), s * 0.36 * bulk, 1.42, 0));
  }
  // arms (skin hands)
  for (const s of [-1, 1]) {
    const arm = limb(0.17 * bulk, 0.62, LEATHER());
    arm.position.set(s * 0.38 * bulk, 1.40, 0);
    arm.add(mesh(GEO('box',0.16 * bulk, 0.14, 0.16 * bulk), SKIN(), 0, -0.66, 0));
    g.add(arm);
    parts[s < 0 ? 'lArm' : 'rArm'] = arm;
  }
  // big KayKit-style head
  const head = mesh(GEO('ico',0.27 * bulk, 1), SKIN(), 0, 1.78, 0);
  g.add(head);
  parts.head = head;
  parts.torso = torso;
  parts.phase = Math.random() * Math.PI * 2;
  parts.walkW = 0;
  return { group: g, parts };
}

function helmet(parent, parts, team, kind) {
  const y = 1.98;
  if (kind === 'helm' || kind === 'greathelm') {
    const h = kind === 'greathelm' ? 0.34 : 0.30;
    parent.add(mesh(GEO('cyl',0.26, 0.29, h, 8), DARKIRON(), 0, y, 0));
    parent.add(mesh(GEO('box',0.3, 0.06, 0.05), M(0x111111), 0, y - 0.02, 0.26)); // visor slit
    if (kind === 'greathelm') {
      parent.add(mesh(GEO('box',0.09, 0.42, 0.24), M(team), 0, y + 0.32, -0.04)); // team plume
    }
  } else if (kind === 'hood' || kind === 'darkhood') {
    parent.add(mesh(GEO('cone',0.32, 0.5, 7), kind === 'darkhood' ? M(0x1e293b) : M(team), 0, y + 0.05, -0.03));
  } else if (kind === 'circlet') {
    parent.add(mesh(GEO('cyl',0.28, 0.28, 0.1, 8), M(0xffd34d, { glow: 0x92610a }), 0, y - 0.02, 0));
  } else if (kind === 'crown') {
    parent.add(mesh(GEO('cyl',0.24, 0.28, 0.22, 8), M(0xffd34d, { glow: 0x92610a }), 0, y + 0.02, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parent.add(mesh(GEO('cone',0.05, 0.14, 4), M(0xffd34d), Math.cos(a) * 0.24, y + 0.18, Math.sin(a) * 0.24));
    }
  } else if (kind === 'wizard') {
    parent.add(mesh(GEO('cone',0.3, 0.62, 8), M(team), 0, y + 0.22, 0));
  } else if (kind === 'cap') {
    parent.add(mesh(GEO('cyl',0.27, 0.29, 0.14, 8), M(team), 0, y + 0.02, 0));
  }
}

function shieldOn(parts, team, size = 1) {
  const s = mesh(GEO('cyl',0.34 * size, 0.34 * size, 0.08, 10), M(team), 0, -0.35, 0.12);
  s.rotation.x = Math.PI / 2 - 0.15;
  const boss = mesh(GEO('sph',0.1 * size, 6, 5), DARKIRON(), 0, -0.35, 0.2);
  parts.lArm.add(s, boss);
}

function swordIn(parts, len = 1.0) {
  const g = new THREE.Group();
  g.add(mesh(GEO('box',0.09, len, 0.09), IRON(), 0, -0.7 - len / 2 + 0.3, 0.1));
  g.add(mesh(GEO('cone',0.07, 0.22, 4), IRON(), 0, -0.7 - len + 0.3 - 0.08, 0.1));
  g.add(mesh(GEO('box',0.26, 0.07, 0.1), DARKLEATHER(), 0, -0.62, 0.1)); // guard
  parts.rArm.add(g);
}

function spearIn(parts, len = 2.4) {
  const shaft = mesh(GEO('cyl',0.045, 0.045, len, 5), WOOD(), 0, -0.6 - len / 2 + 0.5, 0.15);
  shaft.rotation.x = 0.1;
  parts.rArm.add(shaft);
  const tip = mesh(GEO('cone',0.09, 0.32, 5), IRON(), 0, -0.6 - len + 0.5 - 0.1, 0.02);
  tip.rotation.x = Math.PI;
  parts.rArm.add(tip);
}

function bowIn(parts) {
  const bow = mesh(GEO('tor',0.5, 0.05, 6, 12, Math.PI * 1.25), WOOD(), 0, -0.5, 0.25);
  bow.rotation.z = Math.PI / 2 - 0.35;
  bow.rotation.y = Math.PI / 2;
  parts.lArm.add(bow);
  // quiver on the back with team fletching
  parts.quiver = mesh(GEO('cyl',0.11, 0.09, 0.62, 6), DARKLEATHER(), -0.2, 1.35, -0.28);
  parts.quiver.rotation.x = 0.25;
}

function staffIn(parts, team, crystal = false) {
  parts.rArm.add(mesh(GEO('cyl',0.045, 0.045, 1.9, 5), WOOD(), 0, -0.7, 0.1));
  if (crystal) {
    parts.rArm.add(mesh(GEO('oct',0.16, 0), M(0x7de8ff, { glow: 0x1e7fa8 }), 0, 0.35, 0.1));
  } else {
    parts.rArm.add(mesh(GEO('sph',0.13, 7, 6), M(0x4dff88, { glow: 0x15803d }), 0, 0.3, 0.1));
  }
}

function capeOn(group, parts, team) {
  const cape = mesh(GEO('box',0.62, 1.05, 0.07), M(team), 0, 0.95, -0.24);
  cape.rotation.x = 0.1;
  group.add(cape);
}

const TROOPERS = {
  soldier: (t) => {
    const { group, parts } = baseTrooper(t);
    helmet(group, parts, t, 'helm');
    swordIn(parts, 1.0);
    shieldOn(parts, t, 1);
    return { group, parts };
  },
  swordsman: (t) => {
    const { group, parts } = baseTrooper(t);
    helmet(group, parts, t, 'helm');
    swordIn(parts, 1.1);
    shieldOn(parts, t, 1);
    return { group, parts };
  },
  spearman: (t) => {
    const { group, parts } = baseTrooper(t);
    helmet(group, parts, t, 'cap');
    spearIn(parts, 2.4);
    shieldOn(parts, t, 0.8);
    return { group, parts };
  },
  archer: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 0.92 });
    helmet(group, parts, t, 'hood');
    bowIn(parts);
    group.add(parts.quiver);
    return { group, parts };
  },
  knight: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 1.18 });
    helmet(group, parts, t, 'greathelm');
    capeOn(group, parts, t);
    spearIn(parts, 2.8); // lance
    shieldOn(parts, t, 1.25);
    return { group, parts };
  },
  scout: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 0.9 });
    helmet(group, parts, t, 'hood');
    capeOn(group, parts, t);
    parts.rArm.add(mesh(GEO('cyl',0.05, 0.06, 0.5, 5), WOOD(), 0, -0.6, 0.15)); // spyglass
    parts.rArm.add(mesh(GEO('sph',0.07, 6, 5), M(0x4ade80, { glow: 0x15803d }), 0, -0.32, 0.15));
    return { group, parts };
  },
  healer: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 0.95 });
    // robe skirt over the legs
    group.add(mesh(GEO('cyl',0.34, 0.44, 0.8, 8), ROBE(), 0, 0.42, 0));
    helmet(group, parts, t, 'circlet');
    staffIn(parts, t, false);
    return { group, parts };
  },
  spy: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 0.9 });
    helmet(group, parts, t, 'darkhood');
    capeOn(group, parts, 0x1e293b);
    parts.rArm.add(mesh(GEO('box',0.06, 0.45, 0.06), IRON(), 0, -0.7, 0.12)); // dagger
    return { group, parts };
  },
  hero_king: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 1.2 });
    helmet(group, parts, t, 'crown');
    capeOn(group, parts, t);
    swordIn(parts, 1.25);
    shieldOn(parts, t, 1.1);
    return { group, parts };
  },
  hero_champion: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 1.3 });
    helmet(group, parts, t, 'greathelm');
    // tower shield wall
    const tw = mesh(GEO('box',0.1, 1.25, 0.72), M(t), 0, -0.4, 0.15);
    parts.lArm.add(tw);
    parts.rArm.add(mesh(GEO('box',0.12, 0.7, 0.12), DARKIRON(), 0, -0.7, 0.1)); // mace haft
    parts.rArm.add(mesh(GEO('sph',0.14, 6, 5), DARKIRON(), 0, -1.05, 0.1));
    return { group, parts };
  },
  hero_archmage: (t) => {
    const { group, parts } = baseTrooper(t, { bulk: 1.0 });
    group.add(mesh(GEO('cyl',0.36, 0.46, 0.85, 8), M(t), 0, 0.44, 0)); // team robe
    helmet(group, parts, t, 'wizard');
    staffIn(parts, t, true);
    return { group, parts };
  },
};

export function trooperTypes() {
  return Object.keys(TROOPERS);
}

export function buildTrooper(type, teamHex) {
  const build = TROOPERS[type];
  if (!build) return null;
  const { group, parts } = build(teamHex);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // face +Z like every other rig (game yaws with atan2(dx, dz))
  return { group, parts, height: 2.1 };
}

// Walk swing + idle sway + attack lunge, driven by real ground speed.
export function updateTrooper(parts, dt, moved, speed = 5, attacking = false) {
  const walking = moved > 0.02;
  parts.walkW = parts.walkW ?? 0;
  parts.walkW += ((walking ? 1 : 0) - parts.walkW) * Math.min(1, dt * 7);
  parts.phase = (parts.phase ?? 0) + dt * (4 + speed * 1.6) * (0.25 + 0.75 * parts.walkW);
  const s = Math.sin(parts.phase);
  const k = parts.walkW;
  if (parts.lLeg) parts.lLeg.rotation.x = s * 0.6 * k;
  if (parts.rLeg) parts.rLeg.rotation.x = -s * 0.6 * k;
  if (parts.lArm) parts.lArm.rotation.x = -s * 0.5 * k + (walking ? 0 : Math.sin(parts.phase * 0.4) * 0.05);
  // right arm swings, or lunges on attack
  if (parts.rArm) {
    if (attacking) parts.rArm.rotation.x = -1.5 + Math.sin(parts.phase * 3) * 0.25;
    else parts.rArm.rotation.x = s * 0.5 * k + (walking ? 0 : Math.sin(parts.phase * 0.4 + 1) * 0.05);
  }
}
