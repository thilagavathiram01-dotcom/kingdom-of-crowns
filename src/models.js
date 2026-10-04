import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';

// README-2 § Model implementation: cached GLTF loader, per-kingdom team
// tinting, size normalisation, procedural fallback (zero downloads).

const loader = new GLTFLoader();
const cache = new Map();

export async function preload(manifest) {
  await Promise.all(Object.entries(manifest).map(async ([key, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material && 'flatShading' in o.material) o.material.flatShading = true;
        }
      });
      cache.set(key, gltf);
    } catch (err) {
      console.warn(`[models] ${key} unavailable, using procedural fallback`, err);
    }
  }));
}

export function hasModel(key) {
  return cache.has(key);
}

// Convention: any material named "Team" / "team_*" gets the kingdom colour.
// Falls back to TEAM_PARTS name mapping for packs without Team materials.
const TEAM_PARTS = {
  hq: ['Roof', 'Banner', 'roof', 'banner'],
  worker: ['Hat', 'hat', 'Hood'],
  swordsman: ['Cape', 'Shield', 'cape', 'shield'],
};

export function spawnModel(key, teamColor, targetHeight = 3) {
  const gltf = cache.get(key);
  if (!gltf) return proceduralFallback(key, teamColor);
  const root = SkeletonUtils.clone(gltf.scene);
  const wants = TEAM_PARTS[key] || [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (/^team/i.test(o.material.name)) o.material.color.set(teamColor);
    else if (wants.includes(o.material.name)) o.material.color.set(teamColor);
  });
  const box = new THREE.Box3().setFromObject(root);
  const h = Math.max(0.001, box.max.y - box.min.y);
  root.scale.setScalar(targetHeight / h);
  return { root, clips: gltf.animations || [] };
}

function mat(c) {
  return new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
}

export function proceduralFallback(key, color) {
  const g = new THREE.Group();
  if (key === 'mill') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 6, 8), mat(0xd9c9a3));
    base.position.y = 3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.4, 8), mat(color));
    roof.position.y = 7.2;
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.1), mat(0x8b5a2b));
      b.position.y = 2.5;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i * Math.PI) / 2;
      pivot.add(b);
      blades.add(pivot);
    }
    blades.position.set(0, 5, 2.3);
    blades.name = 'blades';
    g.add(base, roof, blades);
  } else if (key === 'farm') {
    const soil = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 5), mat(0x6b4a2b));
    soil.position.y = 0.15;
    g.add(soil);
    for (let i = 0; i < 3; i++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.5), mat(0x6aa84f));
      row.position.set(0, 0.5, -1.5 + i * 1.5);
      g.add(row);
    }
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), mat(0x8b5a2b));
    flag.position.set(2.2, 1.2, 2.2);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.05), mat(color));
    banner.position.set(1.7, 2.0, 2.2);
    g.add(flag, banner);
  } else {
    // generic kingdom-tinted keep: stone base + team roof + banner
    const baseH = key === 'hq' || key === 'wonder' ? 3.2 : 2.2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(3, baseH, 3), mat(0x9aa0a8));
    base.position.y = baseH / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 4), mat(color));
    roof.position.y = baseH + 0.9;
    roof.rotation.y = Math.PI / 4;
    g.add(base, roof);
  }
  return { root: g, clips: [] };
}

export const ANIMATION_RULES = {
  Idle: { loop: true },
  Walk: { loop: true, speedScale: true },
  Chop: { loop: true }, Work: { loop: true },
  Attack: { loop: false },
  Death: { loop: false, fadeSec: 3 },
};
