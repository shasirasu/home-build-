import type { Finish } from '@/types/house';

// Floor and wall finishes. The 3D engine paints procedural textures from `pattern`, `color`, `accent`, `size`.
// Prices are indicative ranges for India (supply + lay), per square metre, for the quantities sheet.
export const FINISHES: Finish[] = [
  { id: 'vitrified-ivory', name: 'Vitrified tile · ivory 600×600', use: 'floor', color: '#e9e2d4', accent: '#cfc6b4', pattern: 'tile', size: [0.6, 0.6], roughness: 0.28, pricePerSqm: [900, 1600] },
  { id: 'vitrified-grey', name: 'Vitrified tile · grey 800×800', use: 'floor', color: '#b9b6b0', accent: '#9a968f', pattern: 'tile', size: [0.8, 0.8], roughness: 0.3, pricePerSqm: [1100, 1900] },
  { id: 'marble-white', name: 'Italian marble · white', use: 'floor', color: '#f2efe9', accent: '#c9c3b8', pattern: 'marble', size: [1.2, 0.6], roughness: 0.18, pricePerSqm: [3500, 8000] },
  { id: 'wood-oak', name: 'Engineered wood · oak', use: 'floor', color: '#c49a6c', accent: '#9c7448', pattern: 'plank', size: [1.2, 0.18], roughness: 0.55, pricePerSqm: [2800, 5500] },
  { id: 'wood-walnut', name: 'Engineered wood · walnut', use: 'floor', color: '#7a5236', accent: '#5a3a24', pattern: 'plank', size: [1.2, 0.18], roughness: 0.55, pricePerSqm: [3200, 6200] },
  { id: 'granite-black', name: 'Granite · black galaxy', use: 'both', color: '#2a2a2c', accent: '#8d8a84', pattern: 'stone', size: [1.0, 0.6], roughness: 0.2, pricePerSqm: [1800, 3200] },
  { id: 'kota-stone', name: 'Kota stone', use: 'floor', color: '#8f9a8c', accent: '#76806f', pattern: 'stone', size: [0.6, 0.6], roughness: 0.6, pricePerSqm: [700, 1200] },
  { id: 'anti-skid', name: 'Anti-skid ceramic 300×300', use: 'floor', color: '#c8c2b6', accent: '#a39d91', pattern: 'tile', size: [0.3, 0.3], roughness: 0.75, pricePerSqm: [650, 1100] },
  { id: 'terracotta', name: 'Terracotta tile', use: 'floor', color: '#b4633e', accent: '#8e4a2c', pattern: 'tile', size: [0.3, 0.3], roughness: 0.8, pricePerSqm: [800, 1400] },
  { id: 'terrazzo', name: 'Terrazzo', use: 'floor', color: '#d9d3c7', accent: '#8a8375', pattern: 'terrazzo', size: [0.6, 0.6], roughness: 0.35, pricePerSqm: [1400, 2600] },
  { id: 'wall-tile-white', name: 'Glazed wall tile · white 300×600', use: 'wall', color: '#f4f3ef', accent: '#d6d3cb', pattern: 'tile', size: [0.3, 0.6], roughness: 0.15, pricePerSqm: [700, 1300] },
  { id: 'wall-tile-sage', name: 'Glazed wall tile · sage 300×600', use: 'wall', color: '#a9b8a2', accent: '#8a9a84', pattern: 'tile', size: [0.3, 0.6], roughness: 0.15, pricePerSqm: [800, 1400] },
  { id: 'cement', name: 'Cement screed', use: 'floor', color: '#9d9a94', accent: '#8a8781', pattern: 'plain', roughness: 0.85, pricePerSqm: [350, 600] },
];

export const finishById = (id: string): Finish => FINISHES.find((f) => f.id === id) ?? FINISHES[0];

// Wall paint palette offered in Design mode.
export const PAINTS: { id: string; name: string; hex: string }[] = [
  { id: 'chalk', name: 'Chalk white', hex: '#f3f0ea' },
  { id: 'ivory', name: 'Warm ivory', hex: '#efe6d2' },
  { id: 'sand', name: 'Sandstone', hex: '#e3d3b6' },
  { id: 'sage', name: 'Sage', hex: '#c9d2bf' },
  { id: 'mist', name: 'Mist blue', hex: '#cfd8de' },
  { id: 'blush', name: 'Blush', hex: '#ead3cb' },
  { id: 'terracotta', name: 'Terracotta', hex: '#c97c5d' },
  { id: 'olive', name: 'Olive', hex: '#8c8f62' },
  { id: 'teal', name: 'Deep teal', hex: '#2f5d62' },
  { id: 'charcoal', name: 'Charcoal', hex: '#3d3d3b' },
];
