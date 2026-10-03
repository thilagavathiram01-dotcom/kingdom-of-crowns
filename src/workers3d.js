import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Cave Man worker models.
//
// The export is Z-up with a baked +90deg X rotation on the "Armature" node,
// which is exactly what stands the rig upright for us. The painted face lands
// on +Z afterwards, matching the game's atan2(dx, dz) yaw, so a rig needs no
// extra facing fix - the unit group can be yawed straight to the target.
const MODEL_FILES = ['cave_man_1_1', 'cave_man_1_2', 'cave_man_1_3'];

// Tunic + skirt hem. Names carry an "Armature_" prefix in the export.
const CLOTH_JOINTS = new Set(['Spine', 'Spine1', 'Spine2', 'LeftUpLeg', 'RightUpLeg']);

const WALK_BONES = ['Armature_LeftUpLeg', 'Armature_RightUpLeg', 'Armature_LeftLeg', 'Armature_RightLeg'];

export const WORKER_SCALE = 1.55;
const WALK_RATE = 13.5; // rad/s of stride (the only clip we ship is an idle wave)

let LIB = null;

const basePath = () => (import.meta.env?.BASE_URL) || '/';

export async function loadWorkerModels() {
  const base = basePath();
  const atlas = await new THREE.TextureLoader().loadAsync(base + 'textures/atlass_1.png');
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;

  const loader = new GLTFLoader();
  const variants = [];
  for (const file of MODEL_FILES) {
    const gltf = await loader.loadAsync(base + 'models/' + file + '.gltf');
    variants.push(prepareVariant(gltf));
  }

  LIB = {
    atlas,
    variants,
    propMat: makePropMaterial(atlas),
    dressMats: new Map(),
    next: 0,
  };
  return LIB;
}

// One material per kingdom colour (30 total) keeps the shader program shared
// while still letting every worker wear its own kingdom dress.
function dressMaterial(hex) {
  let m = LIB.dressMats.get(hex);
  if (m) return m;

  m = new THREE.MeshStandardMaterial({
    map: LIB.atlas,
    roughness: 0.85,
    metalness: 0.0,
    // the source material is emissive, which keeps workers readable at RTS zoom
    emissiveMap: LIB.atlas,
    emissive: 0xffffff,
    emissiveIntensity: 0.16,
  });
  const dress = { value: new THREE.Color(hex) };
  m.userData.dress = dress;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDress = dress;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCloth;\nvarying float vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCloth = aCloth;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDress;\nvarying float vCloth;')
      .replace('#include <color_fragment>', `#include <color_fragment>
\tif ( vCloth > 0.01 ) {
\t\tfloat l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, uDress * ( 0.34 + l * 1.5 ), clamp( vCloth, 0.0, 1.0 ) );
\t}`);
  };
  m.customProgramCacheKey = () => 'worker-dress-v1';
  LIB.dressMats.set(hex, m);
  return m;
}

// Club + any other prop mesh: atlas colours, never dyed.
function makePropMaterial(atlas) {
  return new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.9,
    metalness: 0.0,
    emissiveMap: atlas,
    emissive: 0xffffff,
    emissiveIntensity: 0.14,
  });
}

// skin attributes are vec4, but they may be interleaved (no getComponent) or
// plain, and normalized on some exports - read component-wise either way.
function component(attr, i, c) {
  if (attr.isInterleavedBufferAttribute) return attr.data.array[i * attr.data.stride + attr.offset + c];
  return attr.getComponent ? attr.getComponent(i, c) : attr.array[i * attr.itemSize + c];
}

// Bake a per-vertex cloth mask from skin weights so only tunic pixels get dyed.
function markCloth(mesh) {
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  if (!si || !sw) return;
  const joints = new Set();
  mesh.skeleton.bones.forEach((b, i) => {
    if (CLOTH_JOINTS.has(String(b.name).replace(/^Armature_/, ''))) joints.add(i);
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
  geo.setAttribute('aCloth', new THREE.BufferAttribute(mask, 1));
}

function prepareVariant(gltf) {
  const scene = gltf.scene;
  const skinned = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  // body = the heavy mesh; club and friends are props
  skinned.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  const body = skinned[0];
  markCloth(body);
  for (const m of skinned) m.castShadow = true;

  // measure the upright, scaled pose so instances can stand exactly on terrain
  scene.scale.setScalar(WORKER_SCALE);
  scene.updateMatrixWorld(true);
  const lift = -new THREE.Box3().setFromObject(scene).min.y;
  scene.scale.setScalar(1);
  scene.updateMatrixWorld(true);

  return { scene, bodyName: body.name, clip: gltf.animations[0] || null, lift };
}

// Returns null until loadWorkerModels() has resolved (game falls back to boxes).
// scale lets the same Cave Man rig serve workers, club brutes and spear hunters.
export function createWorkerRig(colorHex, scale = WORKER_SCALE) {
  if (!LIB) return null;
  const v = LIB.variants[LIB.next++ % LIB.variants.length];
  const model = skeletonClone(v.scene);
  const body = model.getObjectByName(v.bodyName);
  if (body) body.material = dressMaterial(colorHex);
  model.traverse((o) => { if (o.isSkinnedMesh && o !== body) o.material = LIB.propMat; });
  model.scale.setScalar(scale);

  const root = new THREE.Group();
  root.position.y = v.lift * (scale / WORKER_SCALE);
  root.add(model);

  const rig = {
    root,
    lift: v.lift * (scale / WORKER_SCALE),
    phase: Math.random() * Math.PI * 2,
    walkW: 0,
    bones: WALK_BONES.map((n) => model.getObjectByName(n)),
  };
  if (v.clip) {
    rig.mixer = new THREE.AnimationMixer(model);
    rig.action = rig.mixer.clipAction(v.clip);
    rig.action.play();
    rig.action.time = Math.random() * v.clip.duration;
  }
  return rig;
}

// Crossfades the shipped idle wave with a procedural stride. The mixer runs
// first so the leg bones we write below win the frame (weight = 1 - walkW).
// Rigs with real walk/idle clips (adventurers) crossfade the clips instead,
// with the stride rate matched to ground speed so feet stop moonwalking.
export function updateWorkerRig(rig, dt, walking, strideMps = 0) {
  rig.walkW += ((walking ? 1 : 0) - rig.walkW) * Math.min(1, dt * 7);
  if (rig.walkAction) {
    rig.walkAction.weight = rig.walkW;
    if (rig.idleAction) rig.idleAction.weight = 1 - rig.walkW;
    // KayKit walk cycles cover ~2 m/s: hurry or slow the clip to the speed
    // the unit is really moving so feet plant instead of glide.
    if (rig.mixer) {
      rig.mixer.timeScale = walking
        ? THREE.MathUtils.clamp(strideMps / 2.0, 0.6, 3.0)
        : 1.0;
      rig.mixer.update(dt);
    }
    rig.root.position.y = rig.lift;
    rig.root.rotation.z = 0;
    return;
  }
  if (rig.action) rig.action.weight = 1 - rig.walkW;
  if (rig.mixer) rig.mixer.update(dt);

  if (rig.walkW <= 0.002) {
    rig.root.position.y = rig.lift;
    rig.root.rotation.z = 0;
    return;
  }
  rig.phase += dt * WALK_RATE;
  const s = Math.sin(rig.phase);
  const k = rig.walkW;
  const [lUp, rUp, lLeg, rLeg] = rig.bones;
  if (lUp) lUp.rotation.x = s * 0.5 * k;
  if (rUp) rUp.rotation.x = -s * 0.5 * k;
  if (lLeg) lLeg.rotation.x = Math.max(0, -s * 1.25 - 0.12) * 0.65 * k;
  if (rLeg) rLeg.rotation.x = Math.max(0, s * 1.25 - 0.12) * 0.65 * k;
  rig.root.position.y = rig.lift + Math.abs(s) * 0.075 * k;
  rig.root.rotation.z = s * 0.03 * k;
}

// ---------------------------------------------------------------------------
// KayKit adventurers (Rogue_Hooded + Rogue, clips stripped to Idle / Walk /
// PickUp / Cheer / Death): the worker skin. Real walk + idle clips replace
// the procedural stride, so workers read clearly at RTS zoom. Toe-bone
// analysis shows the models face +Z, matching the game's atan2(dx, dz) yaw
// with no extra facing fix. Colours are baked; the team underglow disc +
// minimap keep ownership readable.
const ADVENTURER_FILES = ['rogue_hooded', 'rogue'];
const WALK_CLIPS = ['Walking_A', 'Walking_B'];
export const ADVENTURER_SCALE = 0.85; // ~1.9m tall, matches the old rig

let ADVENTURERS = null;

// Tunic + pants bones whose vertices take the kingdom dye.
const DYE_JOINTS = new Set(['hips', 'spine', 'chest', 'upperlegl', 'upperlegr', 'lowerlegl', 'lowerlegr']);

// Per-vertex dye mask from skin weights (same technique as the Cave Man
// tunic mask). Geometry is shared across clones, so the mask is baked once.
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

function adventurerDyeMaterial(hex) {
  let m = ADVENTURERS.dyeMats.get(hex);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    map: ADVENTURERS.atlas,
    roughness: 0.85,
    metalness: 0.0,
  });
  const dye = { value: new THREE.Color(hex) };
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
  m.customProgramCacheKey = () => 'adv-dye-v1';
  ADVENTURERS.dyeMats.set(hex, m);
  return m;
}

function adventurerCapeMaterial(hex) {
  let m = ADVENTURERS.capeMats.get(hex);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, metalness: 0.0 });
  ADVENTURERS.capeMats.set(hex, m);
  return m;
}

export async function loadAdventurerModels() {
  const base = basePath();
  const loader = new GLTFLoader();
  const variants = [];
  let atlas = null;
  for (const file of ADVENTURER_FILES) {
    const gltf = await loader.loadAsync(base + 'models/workers/' + file + '.glb');
    const scene = gltf.scene;
    // workers carry no weapons: drop every static prop except the cape, which
    // is part of the outfit (rogue ships knives + crossbows in-hand).
    const drop = [];
    scene.traverse((o) => {
      if ((o.isMesh && !o.isSkinnedMesh) && o.name !== 'Rogue_Cape') drop.push(o);
    });
    for (const o of drop) o.parent?.remove(o);
    scene.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; }
      if (o.isSkinnedMesh) {
        markDye(o);
        if (!atlas && o.material?.map) atlas = o.material.map;
      }
    });
    scene.updateMatrixWorld(true);
    const lift = -new THREE.Box3().setFromObject(scene).min.y;
    const clips = new Map(gltf.animations.map((c) => [c.name, c]));
    variants.push({ scene, lift, clips });
  }
  ADVENTURERS = { variants, next: 0, walk: 0, atlas, dyeMats: new Map(), capeMats: new Map() };
  return ADVENTURERS;
}

// Same rig shape as the Cave Man (root/lift/phase/walkW/bones/mixer), plus
// idle + walk actions. updateWorkerRig crossfades the real clips instead of
// the procedural stride when walkAction is present. Tunics + capes take the
// kingdom dye; skin, boots and hoods keep their baked colours.
export function createAdventurerRig(colorHex, scale = ADVENTURER_SCALE) {
  if (!ADVENTURERS) return null;
  const v = ADVENTURERS.variants[ADVENTURERS.next++ % ADVENTURERS.variants.length];
  const model = skeletonClone(v.scene);
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.material = adventurerDyeMaterial(colorHex);
    else if (o.isMesh && o.name === 'Rogue_Cape') o.material = adventurerCapeMaterial(colorHex);
  });
  model.scale.setScalar(scale);
  const root = new THREE.Group();
  root.position.y = v.lift * scale;
  root.add(model);
  const rig = {
    root,
    lift: v.lift * scale,
    phase: 0,
    walkW: 0,
    bones: [null, null, null, null],
    mixer: null,
    action: null,
    idleAction: null,
    walkAction: null,
  };
  const idle = v.clips.get('Idle');
  const walk = v.clips.get(WALK_CLIPS[ADVENTURERS.walk++ % WALK_CLIPS.length]) || v.clips.get('Walking_A');
  if (idle && walk) {
    rig.mixer = new THREE.AnimationMixer(model);
    rig.idleAction = rig.mixer.clipAction(idle);
    rig.walkAction = rig.mixer.clipAction(walk);
    rig.idleAction.play();
    rig.walkAction.play();
    rig.idleAction.weight = 1;
    rig.walkAction.weight = 0;
  }
  return rig;
}