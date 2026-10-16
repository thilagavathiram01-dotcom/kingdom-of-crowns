import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// KayKit Character Pack: Adventurers (CC0) — the real troop models.
//
// Every character ships the same 41-bone rig and the same clip names, so one
// character (Knight) carries the shared clip library and the rest ship
// geometry + weapons only. Bones are lowercase (hips, spine, chest, upperlegl,
// handr …) and the models face +Z, matching the game's atan2(dx, dz) yaw.
//
// Converted offline from the 76-clip source to the handful of clips we use:
// Idle, Walking_A, Running_A, one melee / ranged / cast attack and Death_A.
const CHARACTERS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded'];
const HOST = 'knight'; // ships the shared clips

export const TROOP_SCALE = 0.9;   // ~2.0 m tall, matching the old troopers
export const TROOP_HEIGHT = 2.0;

// Torso bones whose vertices take the kingdom dye so ownership reads at zoom.
const DYE_JOINTS = new Set(['hips', 'spine', 'chest']);

// unit type -> character + which held/back props to show + which attack clip
export const TROOP_SPEC = {
  swordsman:     { char: 'knight',       show: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet'], atk: '1H_Melee_Attack_Chop' },
  spearman:      { char: 'knight',       show: ['Knight_Helmet'], spear: true, atk: '2H_Melee_Attack_Chop' },
  knight:        { char: 'knight',       show: ['2H_Sword', 'Knight_Cape', 'Knight_Helmet'], atk: '2H_Melee_Attack_Chop', run: true },
  archer:        { char: 'rogue_hooded', show: ['1H_Crossbow'], atk: '1H_Ranged_Shoot', ranged: true },
  scout:         { char: 'rogue_hooded', show: ['Knife', 'Rogue_Cape'], atk: '1H_Melee_Attack_Chop', run: true },
  spy:           { char: 'rogue',        show: ['Knife', 'Rogue_Cape'], atk: '1H_Melee_Attack_Chop', run: true },
  healer:        { char: 'mage',         show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'], atk: 'Spellcast_Shoot', ranged: true },
  hunter:        { char: 'rogue',        show: ['Throwable', 'Rogue_Cape'], atk: '1H_Ranged_Shoot', ranged: true, run: true },
  hero_king:     { char: 'knight',       show: ['1H_Sword', 'Round_Shield', 'Knight_Cape', 'Knight_Helmet'], atk: '1H_Melee_Attack_Chop' },
  hero_champion: { char: 'barbarian',    show: ['2H_Axe', 'Barbarian_Round_Shield'], atk: '2H_Melee_Attack_Chop' },
  hero_archmage: { char: 'mage',         show: ['2H_Staff', 'Mage_Cape', 'Mage_Hat'], atk: 'Spellcast_Shoot', ranged: true },
};

const basePath = () => (import.meta.env?.BASE_URL) || '/';

let LIB = null;

function component(attr, i, c) {
  if (attr.isInterleavedBufferAttribute) return attr.data.array[i * attr.data.stride + attr.offset + c];
  return attr.getComponent ? attr.getComponent(i, c) : attr.array[i * attr.itemSize + c];
}

// Bake a per-vertex dye mask from skin weights so only torso pixels get team
// colour. Geometry is shared across clones, so this runs once per character.
function markDye(mesh) {
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  if (!si || !sw || geo.attributes.aDye) return;
  const joints = new Set();
  mesh.skeleton.bones.forEach((b, i) => {
    if (DYE_JOINTS.has(String(b.name).toLowerCase())) joints.add(i);
  });
  if (!joints.size) return;
  const count = geo.attributes.position.count;
  const mask = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    let m = 0;
    for (let k = 0; k < 4; k++) {
      if (!joints.has(component(si, v, k))) continue;
      const w = component(sw, v, k);
      if (w > m) m = w;
    }
    mask[v] = m;
  }
  geo.setAttribute('aDye', new THREE.BufferAttribute(mask, 1));
}

function dyedMaterial(variant, colorHex) {
  let m = variant.dyeMats.get(colorHex);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: variant.atlas, roughness: 0.85, metalness: 0.0 });
  const dye = { value: new THREE.Color(colorHex) };
  m.userData.dye = dye;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDye = dye;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDye;\nvarying float vDye;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDye = aDye;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDye;\nvarying float vDye;')
      .replace('#include <color_fragment>', `#include <color_fragment>
\tif ( vDye > 0.01 ) {
\t\tfloat l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, uDye * ( 0.34 + l * 1.5 ), clamp( vDye, 0.0, 1.0 ) );
\t}`);
  };
  m.customProgramCacheKey = () => 'troop-dye-v1';
  variant.dyeMats.set(colorHex, m);
  return m;
}

export async function loadTroopModels() {
  const base = basePath();
  const loader = new GLTFLoader();
  const chars = {};
  let clipList = null;
  for (const name of CHARACTERS) {
    const gltf = await loader.loadAsync(base + 'models/troops/' + name + '.glb');
    const scene = gltf.scene;
    let atlas = null;
    scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        markDye(o);
        if (!atlas && o.material?.map) atlas = o.material.map;
      } else if (o.isMesh) {
        o.castShadow = true;
      }
    });
    scene.updateMatrixWorld(true);
    chars[name] = { scene, atlas, dyeMats: new Map() };
    if (name === HOST) clipList = gltf.animations;
  }
  const clips = new Map((clipList || []).map((c) => [c.name, c]));
  LIB = { chars, clips };
  return LIB;
}

// A pike/spear has no counterpart in the pack, so build one and hang it off the
// right hand slot using the same local transform the swords use. Materials and
// geometry are built once and shared across every spearman rig.
let _spearWood = null, _spearIron = null, _spearShaftGeo = null, _spearTipGeo = null;
function makeSpear(handslot) {
  if (!_spearWood) {
    _spearWood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    _spearIron = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.4 });
    _spearShaftGeo = new THREE.CylinderGeometry(0.028, 0.028, 3.1, 6);
    _spearTipGeo = new THREE.ConeGeometry(0.075, 0.4, 6);
  }
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(_spearShaftGeo, _spearWood);
  shaft.position.y = 0.55;
  const tip = new THREE.Mesh(_spearTipGeo, _spearIron);
  tip.position.y = 2.28;
  g.add(shaft, tip);
  g.position.set(0, 0.033, 0);
  g.quaternion.set(0, -1, 0, 0);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  handslot.add(g);
}

export function createTroopRig(type, colorHex) {
  const spec = TROOP_SPEC[type];
  if (!LIB || !spec) return null;
  const variant = LIB.chars[spec.char];
  if (!variant) return null;

  const model = skeletonClone(variant.scene);
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.material = dyedMaterial(variant, colorHex);
    else if (o.isMesh) o.visible = spec.show.includes(o.name);
  });
  if (spec.spear) {
    const hand = model.getObjectByName('handslotr');
    if (hand) makeSpear(hand);
  }
  model.scale.setScalar(TROOP_SCALE);

  const root = new THREE.Group();
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const clip = (n) => LIB.clips.get(n);
  const actions = {};
  const bind = (key, name, loop) => {
    const c = clip(name);
    if (!c) return;
    const a = mixer.clipAction(c);
    a.setLoop(loop === 'once' ? THREE.LoopOnce : THREE.LoopRepeat, loop === 'once' ? 1 : Infinity);
    if (loop === 'once') a.clampWhenFinished = true;
    actions[key] = a;
  };
  bind('idle', 'Idle');
  bind('walk', 'Walking_A');
  bind('run', 'Running_A');
  bind('atk', spec.atk, 'once');
  bind('death', 'Death_A', 'once');

  if (actions.idle) { actions.idle.play(); actions.idle.weight = 1; }
  if (actions.walk) { actions.walk.play(); actions.walk.weight = 0; }
  if (actions.run) { actions.run.play(); actions.run.weight = 0; }
  mixer.update(0.0001);

  return {
    kind: 'troop', type, root, model, mixer, actions, spec, range: spec.ranged ? 'ranged' : 'melee',
    walkW: 0, attackT: 0, dead: false, deathT: 0,
  };
}

const w = (a, v) => { if (a) a.weight = v; };

export function updateTroopRig(rig, dt, walking, speed = 5, attacking = false, dead = false) {
  const A = rig.actions;
  if (dead && !rig.dead) {
    rig.dead = true;
    rig.deathT = A.death ? A.death.getClip().duration : 0.9;
    w(A.idle, 0); w(A.walk, 0); w(A.run, 0); w(A.atk, 0);
    if (A.idle) A.idle.stop();
    if (A.walk) A.walk.stop();
    if (A.run) A.run.stop();
    if (A.death) { A.death.reset(); A.death.weight = 1; A.death.play(); }
  }
  if (rig.dead) { rig.mixer.update(dt); return; }

  if (attacking && rig.attackT <= 0 && A.atk) {
    rig.attackT = A.atk.getClip().duration;
    A.atk.reset(); A.atk.weight = 1; A.atk.play();
  }
  if (rig.attackT > 0) {
    rig.attackT -= dt;
    w(A.idle, 0); w(A.walk, 0); w(A.run, 0);
    rig.mixer.update(dt);
    return;
  }
  if (A.atk) A.atk.stop();

  rig.walkW += ((walking ? 1 : 0) - rig.walkW) * Math.min(1, dt * 7);
  const running = rig.spec.run && speed > 6.5;
  w(A.run, rig.walkW * (running ? 1 : 0));
  w(A.walk, rig.walkW * (running ? 0 : 1));
  w(A.idle, 1 - rig.walkW);
  rig.mixer.timeScale = walking ? THREE.MathUtils.clamp(speed / 2.0, 0.7, 2.4) : 1;
  rig.mixer.update(dt);
}
