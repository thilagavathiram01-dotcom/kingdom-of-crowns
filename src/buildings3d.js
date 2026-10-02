import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// KayKit Medieval Hexagon Pack (CC0 licensed, free for commercial use):
// castle -> HQ, barracks -> Barracks, tower_A -> Turret, neutral wall_straight
// -> Wall segments. The pack bakes 4 team colors (blue/red/green/yellow),
// cycled by kingdom index; rally flags + trim keep the exact kingdom identity.
// Collision footprints are untouched — this module is visuals only, and every
// building keeps its procedural box fallback when models fail to load.
const COLORS = ['blue', 'red', 'green', 'yellow'];
const FILES = { hq: 'building_castle', barracks: 'building_barracks', turret: 'building_tower_A' };

let LIB = null;

const basePath = () => (import.meta.env?.BASE_URL) || '/';

export async function loadBuildingModels() {
  const base = basePath();
  const loader = new GLTFLoader();
  const lib = { hq: [], barracks: [], turret: [], wall: null, sizes: {} };
  for (const c of COLORS) {
    for (const [type, stem] of Object.entries(FILES)) {
      const gltf = await loader.loadAsync(`${base}models/buildings/${c}/${stem}_${c}.gltf`);
      gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      gltf.scene.updateMatrixWorld(true);
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(gltf.scene).getSize(size);
      lib[type].push(gltf.scene);
      if (!lib.sizes[type]) lib.sizes[type] = size;
    }
  }
  const wall = await loader.loadAsync(`${base}models/buildings/neutral/wall_straight.gltf`);
  wall.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  wall.scene.updateMatrixWorld(true);
  const wsize = new THREE.Vector3();
  new THREE.Box3().setFromObject(wall.scene).getSize(wsize);
  lib.wall = wall.scene;
  lib.sizes.wall = wsize;
  LIB = lib;
  return lib;
}

// Clone a variant, stretched so its widest horizontal extent is targetW
// metres. Uniform scale keeps the low-poly proportions intact. The source
// size is returned too, so elastic walls can stretch per-axis to their slot.
export function buildingModel(type, variant, targetW) {
  if (!LIB) return null;
  const pool = type === 'wall' ? [LIB.wall] : LIB[type];
  if (!pool || !pool.length || !LIB.sizes[type]) return null;
  const src = pool[variant % pool.length];
  const size = LIB.sizes[type];
  const model = src.clone(true);
  const w = Math.max(size.x, size.z) || 1;
  const k = targetW / w;
  model.scale.setScalar(k);
  return { model, size, height: size.y * k };
}
