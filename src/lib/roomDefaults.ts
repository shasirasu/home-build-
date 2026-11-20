import type { Room, RoomType } from '@/types/house';

// How a room is finished when the plan only gives its name. Used by the plan reader and the plan editor.

export const ROOM_TYPES: RoomType[] = ['bedroom', 'kitchen', 'hall', 'living', 'dining', 'toilet', 'pooja', 'utility', 'staircase', 'lobby', 'walkin', 'portico', 'balcony', 'store', 'study', 'passage', 'other'];

export const TYPE_DEFAULTS: Partial<Record<RoomType, { floor: string; wall: string; dado?: { finish: string; height: number }; outdoor?: boolean; floorOffset?: number }>> = {
  bedroom: { floor: 'wood-oak', wall: '#cfd8de' },
  kitchen: { floor: 'vitrified-ivory', wall: '#f3f0ea' },
  hall: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  living: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  dining: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  toilet: { floor: 'anti-skid', wall: '#f3f0ea', dado: { finish: 'wall-tile-white', height: 2.1 } },
  utility: { floor: 'anti-skid', wall: '#f3f0ea', dado: { finish: 'wall-tile-white', height: 1.2 } },
  pooja: { floor: 'marble-white', wall: '#e3d3b6' },
  walkin: { floor: 'wood-oak', wall: '#f3f0ea' },
  staircase: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  lobby: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  passage: { floor: 'vitrified-ivory', wall: '#efe6d2' },
  study: { floor: 'wood-oak', wall: '#c9d2bf' },
  store: { floor: 'vitrified-grey', wall: '#f3f0ea' },
  portico: { floor: 'kota-stone', wall: '#e9e2d4', outdoor: true, floorOffset: -0.15 },
  balcony: { floor: 'anti-skid', wall: '#e9e2d4', outdoor: true },
};

const KEYWORDS: [RegExp, RoomType][] = [
  [/walk\s*-?\s*in|wardrobe|dress/i, 'walkin'],
  [/bed|guest\s*room|master|children|kids/i, 'bedroom'],
  [/kitchen|pantry/i, 'kitchen'],
  [/toilet|bath|w\.?\s*c\.?\b|wash\s*room|powder|lavatory/i, 'toilet'],
  [/pooja|puja|prayer|mandir/i, 'pooja'],
  [/utility|wash\s*area|laundry|service/i, 'utility'],
  [/stair/i, 'staircase'],
  [/portico|porch|sit\s*-?\s*out|verandah?|car\s*park|parking/i, 'portico'],
  [/balcon|terrace|deck/i, 'balcony'],
  [/dining/i, 'dining'],
  [/living|drawing|lounge|family/i, 'living'],
  [/hall/i, 'hall'],
  [/study|office|work/i, 'study'],
  [/store|storage/i, 'store'],
  [/lobby|foyer/i, 'lobby'],
  [/passage|corridor|lift/i, 'passage'],
];

export function roomTypeFromName(name: string): RoomType {
  for (const [re, t] of KEYWORDS) if (re.test(name)) return t;
  return 'other';
}

/** Finish fields for a room of this type. */
export function roomFinish(type: RoomType): Pick<Room, 'floor' | 'wallColor' | 'dado' | 'outdoor' | 'floorOffset'> {
  const d = TYPE_DEFAULTS[type];
  return { floor: d?.floor ?? 'vitrified-ivory', wallColor: d?.wall ?? '#efe6d2', dado: d?.dado ? { ...d.dado } : undefined, outdoor: d?.outdoor, floorOffset: d?.floorOffset };
}

export const titleCase = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
