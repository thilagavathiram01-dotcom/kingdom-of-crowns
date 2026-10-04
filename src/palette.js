import * as THREE from 'three';

// War of Crowns — kingdom colour scheme (README-2 § Art direction).
// Player is fixed royal blue; AI kingdoms use the golden angle so
// neighbours never look alike.

export const PLAYER_COLOR = 0x2f6fed; // royal blue, always the human

export function kingdomColor(index) {
  if (index === 0) return PLAYER_COLOR;
  const hue = (index * 137.508) % 360; // golden angle
  const sat = 0.65 + (index % 3) * 0.1; // 0.65 / 0.75 / 0.85
  const light = 0.5 + ((index >> 1) % 2) * 0.08; // 0.50 / 0.58
  return new THREE.Color().setHSL(hue / 360, sat, light).getHex();
}

// World palette (neutral terrain)
export const WORLD = {
  grass: 0x6aa84f,
  dryGrass: 0xa9b665,
  forestFloor: 0x3d6b35,
  rock: 0x8a8f98,
  snow: 0xeef2f5,
  river: 0x3b82c4,
  sand: 0xd8c690,
  fogUnexplored: 0x0b0f14,
  fogExploredAlpha: 0.55,
};

// Reserved non-kingdom colours — never assigned to a kingdom
export const RESERVED = {
  neutral: 0x5b4b3a, // bandits / neutrals (dark brown)
  selection: 0xffffff,
  enemyHover: 0xff4d4d,
  allyHover: 0x4dff88,
};
