import type { PlacedItem } from '@/types/house';
import { catalogByKind } from './catalog';

// Furniture for the sample house. Positions are written in feet (like the plan) and converted to metres.
// rot: 0 = front faces +y (toward the entrance side), 180 = faces the back, 90 = faces +x, -90 = faces -x.
// Each piece is placed against a real wall face from the plan and kept clear of door swings and windows.

const FT = 0.3048;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
let n = 0;

function put(kind: string, levelId: string, roomId: string | undefined, xFt: number, yFt: number, rotDeg: number, o: Partial<PlacedItem> = {}): PlacedItem {
  const c = catalogByKind(kind);
  if (!c) throw new Error(`Unknown catalog kind ${kind}`);
  n += 1;
  return {
    uid: `s${String(n).padStart(3, '0')}-${kind}`,
    kind, levelId, roomId,
    x: r4(xFt * FT), y: r4(yFt * FT), rot: r4((rotDeg * Math.PI) / 180),
    w: c.w, d: c.d, h: c.h,
    elevation: c.mount === 'wall' ? c.elevation : undefined,
    color: c.colors[0],
    ...o,
  };
}

const m = (ft: number) => r4(ft * FT);

export const SAMPLE_FURNISHING: PlacedItem[] = [
  // Ground floor · kitchen (L-shaped counter: back wall + west wall under the window)
  put('kitchen-counter', 'gf', 'gf-kitchen', 1.7375, 1.737, 0, { w: 0.6 }),
  put('hob-unit', 'gf', 'gf-kitchen', 4.1985, 1.737, 0),
  put('chimney', 'gf', 'gf-kitchen', 4.1985, 1.54, 0),
  put('microwave', 'gf', 'gf-kitchen', 1.7375, 1.376, 0),
  put('kitchen-counter', 'gf', 'gf-kitchen', 1.737, 3.911, 90, { w: m(2.378) }),
  put('kitchen-sink-unit', 'gf', 'gf-kitchen', 1.737, 6.75, 90),
  put('kitchen-counter', 'gf', 'gf-kitchen', 1.737, 9.17, 90, { w: m(1.56) }),
  put('refrigerator', 'gf', 'gf-kitchen', 1.934, 11.35, 90),
  put('wall-cabinet', 'gf', 'gf-kitchen', 1.327, 3.911, 90, { w: m(2.378) }),
  put('wall-cabinet', 'gf', 'gf-kitchen', 1.327, 9.17, 90, { w: m(1.56) }),
  put('water-purifier', 'gf', 'gf-kitchen', 10.486, 3.0, -90),
  put('ceiling-light', 'gf', 'gf-kitchen', 5.75, 6.75, 0),

  // Ground floor · bedroom (headboard on the east wall, wardrobe and dresser on the kitchen partition)
  put('bed-queen', 'gf', 'gf-bedroom', 17.835, 6.75, -90),
  put('bedside-table', 'gf', 'gf-bedroom', 20.591, 3.275, -90),
  put('bedside-table', 'gf', 'gf-bedroom', 20.591, 10.225, -90),
  put('wardrobe-2door', 'gf', 'gf-bedroom', 12.485, 2.6, 90),
  put('dresser', 'gf', 'gf-bedroom', 12.19, 6.6, 90),
  put('curtains', 'gf', 'gf-bedroom', 16.5, 0.95, 0, { w: 1.9 }),
  put('ceiling-fan', 'gf', 'gf-bedroom', 16.374, 6.75, 0),

  // Ground floor · hall (dining by the kitchen, living facing a TV on the pooja/toilet partition)
  put('dining-set-4', 'gf', 'gf-hall', 11.2, 17.3, 0),
  put('pendant-light', 'gf', 'gf-hall', 11.2, 17.3, 0),
  put('tv-unit', 'gf', 'gf-hall', 16.185, 24.5, -90),
  put('tv', 'gf', 'gf-hall', 16.776, 24.5, -90),
  put('sofa-3seat', 'gf', 'gf-hall', 9.2, 24.5, 90),
  put('rug', 'gf', 'gf-hall', 12.6, 24.5, 90),
  put('coffee-table', 'gf', 'gf-hall', 12.8, 24.5, 90),
  put('armchair', 'gf', 'gf-hall', 12.8, 29.6, 180),
  put('side-table', 'gf', 'gf-hall', 9.2, 28.8, 90),
  put('ceiling-fan', 'gf', 'gf-hall', 12.6, 24.5, 0),
  put('shoe-rack', 'gf', 'gf-hall', 11.2, 31.69, 180),
  put('wall-art', 'gf', 'gf-hall', 11.2, 32.19, 180, { w: 0.7, h: 0.5, elevation: 1.3 }),
  put('plant-tall', 'gf', 'gf-hall', 15.9, 28.3, 0),

  // Ground floor · pooja, toilet, utility
  put('pooja-mandir', 'gf', 'gf-pooja', 20.509, 16.0, -90),
  put('ceiling-light', 'gf', 'gf-pooja', 19.25, 16.0, 0),
  put('wc', 'gf', 'gf-toilet', 19.25, 19.796, 0),
  put('washbasin', 'gf', 'gf-toilet', 18.006, 22.3, 90),
  put('mirror', 'gf', 'gf-toilet', 17.3, 22.3, 90),
  put('shower', 'gf', 'gf-toilet', 20.722, 22.6, -90),
  put('geyser', 'gf', 'gf-toilet', 20.657, 24.6, -90),
  put('towel-rail', 'gf', 'gf-toilet', 17.415, 24.5, 90),
  put('ceiling-light', 'gf', 'gf-toilet', 19.25, 22.4, 0),
  put('utility-sink', 'gf', 'gf-utility', 20.427, 28.0, -90),
  put('washing-machine', 'gf', 'gf-utility', 20.296, 30.9, -90),
  put('ceiling-light', 'gf', 'gf-utility', 19.25, 29.25, 0),

  // Portico and front yard
  put('jhoola', 'gf', 'gf-portico', 17.0, 34.5, 0),
  put('plant-outdoor', 'gf', 'gf-portico', 1.8, 34.5, 0),
  put('plant-outdoor', 'gf', 'gf-portico', 20.2, 34.5, 0),
  put('ceiling-light', 'gf', 'gf-portico', 7.75, 34.5, 0),
  put('car', 'gf', undefined, 15.5, 45.5, 180, { elevation: -0.45 }),

  // First floor · bedroom 2 (back)
  put('bed-queen', 'ff', 'ff-bed-back', 6.6, 9.338, 180, { color: '#6b7a6a' }),
  put('bedside-table', 'ff', 'ff-bed-back', 3.125, 12.094, 180),
  put('bedside-table', 'ff', 'ff-bed-back', 10.075, 12.094, 180),
  put('study-desk', 'ff', 'ff-bed-back', 6.0, 1.737, 0),
  put('desk-chair', 'ff', 'ff-bed-back', 6.0, 3.6, 180),
  put('bookshelf', 'ff', 'ff-bed-back', 11.977, 2.6, -90),
  put('rug', 'ff', 'ff-bed-back', 6.6, 6.4, 0, { color: '#5b6b7a' }),
  put('curtains', 'ff', 'ff-bed-back', 0.95, 6.75, 90),
  put('ceiling-fan', 'ff', 'ff-bed-back', 6.6, 6.75, 0),
  put('wardrobe-3door', 'ff', 'ff-walkin-back', 15.89, 3.31, -90),
  put('mirror', 'ff', 'ff-walkin-back', 12.92, 3.3, 90, { h: 1.5, elevation: 0.35 }),
  put('ceiling-light', 'ff', 'ff-walkin-back', 14.87, 4.85, 0),
  put('wc', 'ff', 'ff-toilet-back', 19.25, 1.672, 0),
  put('washbasin', 'ff', 'ff-toilet-back', 20.492, 5.6, -90),
  put('mirror', 'ff', 'ff-toilet-back', 21.197, 5.6, -90),
  put('glass-partition', 'ff', 'ff-toilet-back', 19.77, 9.9, 0),
  put('shower', 'ff', 'ff-toilet-back', 19.25, 12.225, 180),
  put('geyser', 'ff', 'ff-toilet-back', 20.657, 10.5, -90),
  put('towel-rail', 'ff', 'ff-toilet-back', 17.415, 4.0, 90),
  put('ceiling-light', 'ff', 'ff-toilet-back', 19.25, 6.75, 0),

  // First floor · lobby
  put('sofa-2seat', 'ff', 'ff-lobby', 19.804, 18.0, -90, { color: '#36506b' }),
  put('side-table', 'ff', 'ff-lobby', 19.8, 15.1, -90),
  put('armchair', 'ff', 'ff-lobby', 16.0, 18.0, 90),
  put('bookshelf', 'ff', 'ff-lobby', 9.5, 14.028, 0),
  put('wall-art', 'ff', 'ff-lobby', 9.5, 22.44, 180, { color: '#2f5d62' }),
  put('plant-tall', 'ff', 'ff-lobby', 20.3, 21.4, 0),
  put('ceiling-light', 'ff', 'ff-lobby', 12.5, 18.0, 0),

  // First floor · bedroom 3 (front)
  put('bed-queen', 'ff', 'ff-bed-front', 6.6, 26.661, 0, { color: '#c8b49a' }),
  put('bedside-table', 'ff', 'ff-bed-front', 3.125, 23.905, 0),
  put('bedside-table', 'ff', 'ff-bed-front', 10.075, 23.905, 0),
  put('study-desk', 'ff', 'ff-bed-front', 6.0, 34.262, 180),
  put('desk-chair', 'ff', 'ff-bed-front', 6.0, 32.4, 0),
  put('dresser', 'ff', 'ff-bed-front', 11.813, 33.2, -90),
  put('rug', 'ff', 'ff-bed-front', 6.6, 30.3, 0, { color: '#d8cfc0' }),
  put('curtains', 'ff', 'ff-bed-front', 0.95, 29.25, 90, { color: '#7d8a77' }),
  put('ceiling-fan', 'ff', 'ff-bed-front', 6.6, 29.25, 0),
  put('wardrobe-3door', 'ff', 'ff-walkin-front', 15.89, 32.65, -90, { color: '#7b5d45' }),
  put('mirror', 'ff', 'ff-walkin-front', 12.92, 32.65, 90, { h: 1.5, elevation: 0.35 }),
  put('ceiling-light', 'ff', 'ff-walkin-front', 14.87, 31.1, 0),
  put('wc', 'ff', 'ff-toilet-front', 19.25, 34.327, 180),
  put('washbasin', 'ff', 'ff-toilet-front', 20.492, 29.6, -90),
  put('mirror', 'ff', 'ff-toilet-front', 21.197, 29.6, -90),
  put('glass-partition', 'ff', 'ff-toilet-front', 19.77, 26.1, 0),
  put('shower', 'ff', 'ff-toilet-front', 19.25, 23.774, 0),
  put('geyser', 'ff', 'ff-toilet-front', 20.657, 25.0, -90),
  put('towel-rail', 'ff', 'ff-toilet-front', 17.415, 32.0, 90),
  put('ceiling-light', 'ff', 'ff-toilet-front', 19.25, 29.25, 0),
];
