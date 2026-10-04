import * as THREE from 'three';

// War of Crowns — hand-crafted low-poly model kit (CC0-safe, zero downloads).
// Every building and unit gets a DISTINCT silhouette in the same flat-shaded
// procedural style. Team colour goes on roofs / cloaks / shields / banners /
// blades only; stone, wood and skin stay natural so the kingdom colour pops.
//
// Convention: models return { group, height, blades } — `blades` is the mill
// blade group (named 'blades') so the economy tick can spin it at 0.4 rad/s.

function M(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: 0.9, metalness: 0,
    emissive: opts.glow || 0x000000, emissiveIntensity: opts.glow ? 0.7 : 0,
  });
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const STONE = () => M(0x9aa0a8);
const DARKSTONE = () => M(0x6b7280);
const WOOD = () => M(0x8b5a2b);
const DARKWOOD = () => M(0x5b3a1e);
const PLASTER = () => M(0xd9c9a3);
const LEAF = () => M(0x3d6b35);
const CROP = () => M(0x6aa84f);
const SKIN = () => M(0xd9a066);
const CLOTH = () => M(0x475569);
const IRON = () => M(0x3f4756);

// ---------------------------------------------------------------- buildings

function baseSlab(s) {
  return mesh(new THREE.BoxGeometry(s, 0.3, s), DARKSTONE(), 0, 0.15, 0);
}

const BUILDERS = {
  house(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    g.add(mesh(new THREE.BoxGeometry(s * 0.7, 1.6, s * 0.7), PLASTER(), 0, 1.1, 0));
    const roof = mesh(new THREE.ConeGeometry(s * 0.55, 1.4, 4), M(team), 0, 2.6, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.1), DARKWOOD(), 0, 0.75, s * 0.36)); // door
    g.add(mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), STONE(), s * 0.2, 2.6, 0)); // chimney
    return { group: g, height: 3.4 };
  },

  farm(s, team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(s, 0.3, s), M(0x6b4a2b), 0, 0.15, 0)); // soil
    for (let i = 0; i < 3; i++) {
      g.add(mesh(new THREE.BoxGeometry(s * 0.85, 0.45, 0.5), CROP(), 0, 0.5, -s * 0.28 + i * s * 0.28));
    }
    // fence posts
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.BoxGeometry(0.18, 1.0, 0.18), WOOD(), fx * s * 0.48, 0.5, fz * s * 0.48));
    }
    g.add(mesh(new THREE.BoxGeometry(0.15, 2.0, 0.15), WOOD(), s * 0.4, 1.0, s * 0.4));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.55, 0.06), M(team), s * 0.05, 1.7, s * 0.4)); // team flag
    return { group: g, height: 2.0 };
  },

  mill(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    g.add(mesh(new THREE.CylinderGeometry(s * 0.28, s * 0.36, 4.4, 8), PLASTER(), 0, 2.5, 0));
    g.add(mesh(new THREE.ConeGeometry(s * 0.36, 1.6, 8), M(team), 0, 5.5, 0)); // team cap
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const b = mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), WOOD(), 0, 1.7, 0);
      pivot.add(b);
      pivot.rotation.z = (i * Math.PI) / 2;
      blades.add(pivot);
    }
    blades.position.set(0, 3.6, s * 0.34);
    blades.name = 'blades';
    g.add(blades);
    g.add(mesh(new THREE.BoxGeometry(0.7, 1.1, 0.12), DARKWOOD(), 0, 0.85, s * 0.3)); // door
    return { group: g, height: 6.4, blades };
  },

  lumber(s, team) {
    const g = new THREE.Group();
    // open shed: 4 posts + team roof
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), WOOD(), fx * s * 0.35, 1.1, fz * s * 0.35));
    }
    const roof = mesh(new THREE.ConeGeometry(s * 0.55, 1.0, 4), M(team), 0, 2.7, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // stacked log pile
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 3 - row; k++) {
        const log = mesh(new THREE.CylinderGeometry(0.22, 0.22, s * 0.6, 7), WOOD(), (k - (2 - row) / 2) * 0.5, 0.35 + row * 0.42, 0);
        log.rotation.z = Math.PI / 2;
        g.add(log);
      }
    }
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), DARKWOOD(), 0, 0.25, s * 0.3)); // chopping block
    return { group: g, height: 3.2 };
  },

  quarry(s, team) {
    const g = new THREE.Group();
    // rock pile
    g.add(mesh(new THREE.DodecahedronGeometry(s * 0.3, 0), STONE(), -0.4, 0.5, 0.2));
    g.add(mesh(new THREE.DodecahedronGeometry(s * 0.22, 0), DARKSTONE(), 0.5, 0.4, -0.2));
    g.add(mesh(new THREE.DodecahedronGeometry(s * 0.16, 0), STONE(), 0.1, 0.3, 0.6));
    // wooden derrick + team pennant
    g.add(mesh(new THREE.BoxGeometry(0.2, 3.0, 0.2), WOOD(), 0.9, 1.5, 0.9));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.16, 0.16), WOOD(), 0.3, 2.9, 0.9));
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), M(team), -0.25, 2.7, 0.9));
    // cut stone blocks
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), STONE(), -0.9, 0.25, -0.7));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), STONE(), -0.9, 0.75, -0.7));
    return { group: g, height: 3.2 };
  },

  depot(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    g.add(mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.36, 0.8, 8), DARKSTONE(), 0, 0.7, 0)); // pedestal
    // crystal cluster (cyan glow)
    const cry = M(0x7de8ff, { glow: 0x2aa8cc });
    g.add(mesh(new THREE.OctahedronGeometry(0.65, 0), cry, 0, 1.7, 0));
    g.add(mesh(new THREE.OctahedronGeometry(0.4, 0), cry, 0.5, 1.3, 0.2));
    g.add(mesh(new THREE.OctahedronGeometry(0.32, 0), cry, -0.45, 1.25, -0.15));
    // team banner posts
    for (const fx of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), WOOD(), fx * s * 0.42, 0.9, s * 0.4));
    }
    g.add(mesh(new THREE.BoxGeometry(s * 0.84, 0.5, 0.05), M(team), 0, 1.5, s * 0.4));
    return { group: g, height: 2.6 };
  },

  barracks(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    g.add(mesh(new THREE.BoxGeometry(s * 0.85, 2.0, s * 0.6), PLASTER(), 0, 1.3, 0)); // long hall
    const roof = mesh(new THREE.ConeGeometry(s * 0.6, 1.3, 4), M(team), 0, 3.1, 0);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.75;
    g.add(roof);
    // weapon rack: spears + team shield
    for (let i = -1; i <= 1; i++) {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5), WOOD(), i * 0.7 + s * 0.3, 1.0, s * 0.32));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10), M(team), s * 0.3, 1.2, s * 0.42));
    return { group: g, height: 3.8 };
  },

  archery(s, team) {
    const g = new THREE.Group();
    // open range: posts + team canopy
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), WOOD(), fx * s * 0.4, 1.2, fz * s * 0.3));
    }
    g.add(mesh(new THREE.BoxGeometry(s * 0.95, 0.15, s * 0.75), M(team), 0, 2.5, 0)); // canopy
    // two targets: concentric rings
    for (const tx of [-0.8, 0.8]) {
      g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12), M(0xd9c9a3), tx, 1.0, -s * 0.3));
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 12), M(0xef4444), tx, 1.0, -s * 0.3));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 10), M(team), tx, 1.0, -s * 0.3));
      g.add(mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), WOOD(), tx, 0.4, -s * 0.3));
    }
    return { group: g, height: 2.7 };
  },

  stable(s, team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(s * 0.6, 1.8, s * 0.5), PLASTER(), -s * 0.12, 1.2, -s * 0.15));
    const roof = mesh(new THREE.ConeGeometry(s * 0.45, 1.1, 4), M(team), -s * 0.12, 2.7, -s * 0.15);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // paddock fence
    for (let i = 0; i < 4; i++) {
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), WOOD(), -s * 0.1 + i * s * 0.22, 0.45, s * 0.38));
    }
    g.add(mesh(new THREE.BoxGeometry(s * 0.7, 0.12, 0.12), WOOD(), s * 0.12, 0.8, s * 0.38));
    // hay bale
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.7, 9), M(0xe3b23c), s * 0.3, 0.45, 0));
    return { group: g, height: 3.3 };
  },

  siege(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    // workshop: posts + team roof
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), WOOD(), fx * s * 0.35, 1.2, fz * s * 0.3));
    }
    const roof = mesh(new THREE.ConeGeometry(s * 0.55, 1.0, 4), M(team), 0, 2.9, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // mini catapult: frame + wheels + arm + bucket
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.25, 0.5), DARKWOOD(), 0, 0.7, 0.3));
    for (const wx of [-0.7, 0.7]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.15, 10), WOOD(), wx, 0.42, 0.3);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
    const arm = mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), WOOD(), 0, 1.6, 0.3);
    arm.rotation.x = -0.6;
    g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), DARKSTONE(), 0, 2.4, -0.35)); // loaded stone
    return { group: g, height: 3.5 };
  },

  smith(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    g.add(mesh(new THREE.BoxGeometry(s * 0.7, 1.7, s * 0.6), DARKSTONE(), 0, 1.15, 0)); // forge
    const roof = mesh(new THREE.ConeGeometry(s * 0.5, 1.0, 4), M(team), 0, 2.5, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), STONE(), s * 0.25, 3.0, 0)); // chimney
    // glowing forge mouth + anvil
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.1), M(0xfb923c, { glow: 0xea580c }), 0, 0.8, s * 0.31));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 0.4), IRON(), -s * 0.2, 0.5, s * 0.25)); // anvil
    return { group: g, height: 3.9 };
  },

  temple(s, team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(s * 0.45, s * 0.5, 0.5, 8), STONE(), 0, 0.25, 0)); // dais
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 7), PLASTER(), Math.cos(a) * s * 0.3, 1.7, Math.sin(a) * s * 0.3));
    }
    g.add(mesh(new THREE.SphereGeometry(s * 0.28, 10, 8), M(team), 0, 3.3, 0)); // team dome
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), IRON(), 0, 3.75, 0));
    // twin braziers
    for (const bx of [-0.9, 0.9]) {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.7, 6), IRON(), bx, 0.6, s * 0.35));
      g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), M(0xfde047, { glow: 0xf59e0b }), bx, 1.0, s * 0.35));
    }
    return { group: g, height: 4.1 };
  },

  tower(s, team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(s * 0.32, s * 0.42, 4.6, 7), STONE(), 0, 2.3, 0)); // shaft
    g.add(mesh(new THREE.CylinderGeometry(s * 0.5, s * 0.5, 0.7, 7), DARKSTONE(), 0, 4.8, 0)); // deck
    g.add(mesh(new THREE.ConeGeometry(s * 0.5, 1.1, 7), M(team), 0, 5.7, 0)); // team cap
    g.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), M(0xfde047, { glow: 0xf59e0b }), 0, 4.5, s * 0.4)); // torch
    return { group: g, height: 6.3 };
  },

  market(s, team) {
    const g = new THREE.Group();
    // two stalls with striped team/white canopy
    for (const sx of [-0.9, 0.9]) {
      g.add(mesh(new THREE.BoxGeometry(1.3, 0.15, 0.9), WOOD(), sx, 0.9, 0)); // counter
      for (const px of [-0.55, 0.55]) {
        g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), WOOD(), sx + px, 0.8, 0.35));
        g.add(mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), WOOD(), sx + px, 0.8, -0.35));
      }
      for (let stripe = 0; stripe < 4; stripe++) {
        g.add(mesh(
          new THREE.BoxGeometry(0.36, 0.08, 1.0),
          stripe % 2 ? M(0xffffff) : M(team),
          sx - 0.54 + stripe * 0.36, 1.65, 0
        ));
      }
      // goods: fruit + crates
      g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), M(0xef4444), sx - 0.3, 1.05, 0));
      g.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), M(0xe3b23c), sx + 0.25, 1.05, 0.1));
    }
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), WOOD(), 0, 0.35, 1.1)); // crate
    return { group: g, height: 2.0 };
  },

  embassy(s, team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(s * 0.45, s * 0.5, 0.4, 8), STONE(), 0, 0.2, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 7), PLASTER(), Math.cos(a) * s * 0.3, 1.5, Math.sin(a) * s * 0.3));
    }
    g.add(mesh(new THREE.SphereGeometry(s * 0.26, 10, 8), M(0xffffff), 0, 2.9, 0)); // white dome = peace
    // twin banners: white + team
    for (const [bx, col] of [[-0.9, 0xffffff], [0.9, team]]) {
      g.add(mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), WOOD(), bx, 1.1, s * 0.35));
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.8, 0.05), M(col), bx + 0.3, 1.8, s * 0.35));
    }
    return { group: g, height: 3.4 };
  },

  wonder(s, team) {
    const g = new THREE.Group();
    // stepped pyramid base
    g.add(mesh(new THREE.BoxGeometry(s, 0.8, s), DARKSTONE(), 0, 0.4, 0));
    g.add(mesh(new THREE.BoxGeometry(s * 0.75, 0.8, s * 0.75), STONE(), 0, 1.2, 0));
    g.add(mesh(new THREE.BoxGeometry(s * 0.5, 0.8, s * 0.5), PLASTER(), 0, 2.0, 0));
    // column ring
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.6, 7), PLASTER(), Math.cos(a) * s * 0.22, 3.7, Math.sin(a) * s * 0.22));
    }
    g.add(mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.34, 0.6, 8), M(team), 0, 5.2, 0)); // team crown ring
    // giant floating crown crystal
    const cry = mesh(new THREE.OctahedronGeometry(1.1, 0), M(0xffd34d, { glow: 0xd97706 }), 0, 6.6, 0);
    cry.name = 'crownCrystal';
    g.add(cry);
    // corner braziers
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.9, 6), IRON(), fx * s * 0.42, 1.2, fz * s * 0.42));
      g.add(mesh(new THREE.SphereGeometry(0.2, 6, 5), M(0xfde047, { glow: 0xf59e0b }), fx * s * 0.42, 1.75, fz * s * 0.42));
    }
    return { group: g, height: 7.8, crownCrystal: cry };
  },

  hq(s, team) {
    const g = new THREE.Group();
    g.add(baseSlab(s));
    // keep: stone body + team roof + gate arch + glowing windows
    g.add(mesh(new THREE.BoxGeometry(s * 0.72, 2.6, s * 0.72), STONE(), 0, 1.6, 0));
    const roof = mesh(new THREE.ConeGeometry(s * 0.55, 1.5, 4), M(team), 0, 3.65, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    // corner turrets with team caps
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, 3.0, 6), DARKSTONE(), fx * s * 0.36, 1.8, fz * s * 0.36));
      g.add(mesh(new THREE.ConeGeometry(0.42, 0.7, 6), M(team), fx * s * 0.36, 3.6, fz * s * 0.36));
    }
    g.add(mesh(new THREE.BoxGeometry(1.1, 1.4, 0.15), DARKWOOD(), 0, 0.9, s * 0.37)); // gate
    g.add(mesh(new THREE.BoxGeometry(s * 0.74, 0.3, 0.06), M(0xfde68a, { glow: 0xf59e0b }), 0, 2.2, s * 0.37)); // windows
    return { group: g, height: 4.5 };
  },
};

export function kitBuilding(type, teamHex, size) {
  const build = BUILDERS[type] || BUILDERS.barracks;
  const { group, height, blades, crownCrystal } = build(size, teamHex);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, height: height || 3.5, blades: blades || null, crownCrystal: crownCrystal || null };
}

// ---------------------------------------------------------------- units

function soldierBody(team, bulk = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CapsuleGeometry(0.42 * bulk, 0.65, 4, 8), CLOTH(), 0, 0.9, 0)); // tunic
  g.add(mesh(new THREE.SphereGeometry(0.3, 8, 7), SKIN(), 0, 1.65, 0)); // head
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.22, 8), M(team), 0, 1.88, 0)); // team helm cap
  return g;
}

const UNIT_BUILDERS = {
  swordsman(team) {
    const g = soldierBody(team);
    const sword = mesh(new THREE.BoxGeometry(0.09, 1.1, 0.09), IRON(), 0.55, 1.1, 0.2);
    g.add(sword);
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), WOOD(), 0.55, 0.6, 0.2)); // guard
    const shield = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 10), M(team), -0.55, 1.0, 0.15);
    shield.rotation.z = Math.PI / 2;
    g.add(shield);
    return { group: g, height: 2.0 };
  },

  spearman(team) {
    const g = soldierBody(team);
    const shaft = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), WOOD(), 0.5, 1.3, 0.3);
    shaft.rotation.x = 0.15;
    g.add(shaft);
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.35, 5), IRON(), 0.5, 2.55, 0.12));
    const shield = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), M(team), -0.5, 0.95, 0.15);
    shield.rotation.z = Math.PI / 2;
    g.add(shield);
    return { group: g, height: 2.6 };
  },

  archer(team) {
    const g = soldierBody(team, 0.9);
    // bow: torus arc + string
    const bow = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 12, Math.PI * 1.2), WOOD(), 0.5, 1.1, 0.2);
    bow.rotation.z = Math.PI / 2 - 0.3;
    g.add(bow);
    // quiver with team fletching
    const quiver = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.7, 6), DARKWOOD(), -0.3, 1.3, -0.3);
    quiver.rotation.x = 0.3;
    g.add(quiver);
    g.add(mesh(new THREE.ConeGeometry(0.09, 0.2, 5), M(team), -0.3, 1.7, -0.4));
    // hood in team colour
    g.add(mesh(new THREE.ConeGeometry(0.34, 0.5, 7), M(team), 0, 1.95, -0.05));
    return { group: g, height: 2.1 };
  },

  knight(team) {
    const g = soldierBody(team, 1.2);
    // plate helm + team plume
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.35, 8), IRON(), 0, 1.95, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.3), M(team), 0, 2.3, -0.05)); // plume
    // lance + heater shield
    const lance = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), WOOD(), 0.6, 1.4, 0.4);
    lance.rotation.x = Math.PI / 2 - 0.1;
    g.add(lance);
    g.add(mesh(new THREE.ConeGeometry(0.09, 0.3, 5), IRON(), 0.6, 1.55, 1.75));
    const shield = mesh(new THREE.BoxGeometry(0.08, 0.7, 0.5), M(team), -0.6, 1.0, 0.2);
    g.add(shield);
    return { group: g, height: 2.5 };
  },

  scout(team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.5, 1.1, 6), M(team), 0, 0.7, 0)); // team cloak
    g.add(mesh(new THREE.SphereGeometry(0.2, 8, 8), SKIN(), 0, 1.3, 0.1)); // head
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), WOOD(), 0.3, 1.5, 0)); // spyglass pole
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 6), M(0x4ade80, { glow: 0x16a34a }), 0.3, 1.95, 0));
    return { group: g, height: 2.0 };
  },

  healer(team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.55, 1.6, 8), M(0xf1f5f9), 0, 0.8, 0)); // white robe
    g.add(mesh(new THREE.BoxGeometry(0.18, 1.1, 0.06), M(team), 0, 1.0, 0.5)); // team stole
    g.add(mesh(new THREE.SphereGeometry(0.24, 8, 7), SKIN(), 0, 1.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), WOOD(), 0.55, 0.9, 0.1)); // staff
    g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), M(0x4dff88, { glow: 0x16a34a }), 0.55, 1.85, 0.1)); // orb
    return { group: g, height: 2.0 };
  },

  catapult(team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.3, 0.7), DARKWOOD(), 0, 0.75, 0)); // frame
    for (const [wx, wz] of [[-0.65, 0.35], [0.65, 0.35], [-0.65, -0.35], [0.65, -0.35]]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 10), WOOD(), wx, 0.4, wz);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
    const arm = mesh(new THREE.BoxGeometry(0.16, 2.0, 0.16), WOOD(), 0, 1.7, -0.2);
    arm.rotation.x = -0.7;
    g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), DARKSTONE(), 0, 2.5, -0.85)); // payload
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.06), M(team), 0, 1.0, 0.4)); // team plate
    return { group: g, height: 2.7 };
  },

  ram(team) {
    const g = new THREE.Group();
    // swinging log
    const log = mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8), WOOD(), 0, 0.9, 0);
    log.rotation.x = Math.PI / 2;
    g.add(log);
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8), IRON(), 0, 0.9, 1.3)); // iron head
    // team canopy + wheels
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.15, 3.0), M(team), 0, 1.9, 0));
    for (const [fx, fz] of [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.2], [0.6, 1.2]]) {
      g.add(mesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), DARKWOOD(), fx, 1.2, fz));
      const wheel = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 9), DARKWOOD(), fx, 0.35, fz);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
    return { group: g, height: 2.1 };
  },

  spy(team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.48, 1.5, 7), M(0x1e293b), 0, 0.75, 0)); // dark cloak
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 7), SKIN(), 0, 1.55, 0.05));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.45, 7), M(team), 0, 1.8, -0.02)); // team hood
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), IRON(), 0.4, 0.9, 0.25)); // dagger
    return { group: g, height: 2.0 };
  },

  hero_king(team) {
    const g = soldierBody(team, 1.25);
    // crown + cape
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.22, 8), M(0xffd34d, { glow: 0xd97706 }), 0, 2.1, 0));
    const cape = mesh(new THREE.BoxGeometry(0.7, 1.2, 0.08), M(team), 0, 1.0, -0.45);
    cape.rotation.x = 0.12;
    g.add(cape);
    const sword = mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), IRON(), 0.6, 1.2, 0.2);
    g.add(sword);
    return { group: g, height: 2.4 };
  },

  hero_champion(team) {
    const g = soldierBody(team, 1.35);
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.3, 8), IRON(), 0, 2.0, 0));
    // tower shield wall
    g.add(mesh(new THREE.BoxGeometry(0.1, 1.3, 0.8), M(team), -0.65, 1.0, 0));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), M(team), 0.1, 1.1, -0.55)); // back plate
    return { group: g, height: 2.4 };
  },

  hero_archmage(team) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(0.55, 1.7, 8), M(team), 0, 0.85, 0)); // team robe
    g.add(mesh(new THREE.SphereGeometry(0.24, 8, 7), SKIN(), 0, 1.8, 0));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.6, 8), M(team), 0, 2.15, 0)); // wizard hat
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), DARKWOOD(), 0.55, 0.95, 0.1));
    g.add(mesh(new THREE.OctahedronGeometry(0.2, 0), M(0x7de8ff, { glow: 0x2aa8cc }), 0.55, 1.95, 0.1)); // crystal focus
    return { group: g, height: 2.4 };
  },
};

export function kitUnit(type, teamHex) {
  const build = UNIT_BUILDERS[type];
  if (!build) return null;
  const { group, height } = build(teamHex);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group, height: height || 2.0 };
}
