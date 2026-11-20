// A deliberately awkward house for the dev harness (#spec=odd): angled walls, an L-shaped plate, a room drawn
// across a stairwell, openings that overflow / overlap / point at missing walls, a zero-length wall and beam,
// both alternative railing styles, no site, no parapet, and furniture with bad data. The engine must render it
// without throwing (it warns on the console instead).

import type { HouseSpec, PlacedItem, Vec2 } from '@/types/house';

const L: Vec2[] = [[0, 0], [9, 0], [9, 5], [5, 5], [5, 9], [0, 9]];
const T = 0.23;

export const ODD_HOUSE: HouseSpec = {
  id: 'odd-house',
  name: 'Odd input test',
  displayUnit: 'm',
  north: [0, -1],
  exterior: { wall: '#e9e1cf', band: '#7c5f47', plinth: '#6a655d' },
  levels: [
    {
      id: 'g', name: 'Ground', short: 'G', elevation: 0.3, height: 3, slab: 0,
      footprint: L,
      walls: [
        { id: 'w1', a: [0, T / 2], b: [9, T / 2], thickness: T, kind: 'exterior' },
        { id: 'w2', a: [9 - T / 2, T], b: [9 - T / 2, 5], thickness: T, kind: 'exterior' },
        { id: 'w3', a: [5, 5 - T / 2], b: [9 - T, 5 - T / 2], thickness: T, kind: 'exterior' },
        { id: 'w4', a: [5 - T / 2, 5], b: [5 - T / 2, 9], thickness: T, kind: 'exterior' },
        { id: 'w5', a: [0, 9 - T / 2], b: [5 - T, 9 - T / 2], thickness: T, kind: 'exterior' },
        { id: 'w6', a: [T / 2, T], b: [T / 2, 9 - T], thickness: T, kind: 'exterior' },
        // a partition at 35° across the main room, and a low garden-type wall
        { id: 'w7', a: [3.2, 0.4], b: [6.4, 2.64], thickness: 0.115, kind: 'partition' },
        { id: 'w8', a: [0.3, 5.2], b: [4.6, 5.2], thickness: 0.115, kind: 'interior', height: 1.1 },
        // bad walls
        { id: 'w-zero', a: [2, 2], b: [2, 2], thickness: 0.2, kind: 'interior' },
        { id: 'w-nan', a: [1, Number.NaN], b: [2, 3], thickness: 0.2, kind: 'interior' },
      ],
      openings: [
        { id: 'd1', wallId: 'w5', kind: 'door', at: 2.3, width: 1.0, height: 2.1, sill: 0, leaf: 'single', hinge: 'a', swing: -1, style: 'teak-panel', name: 'Entrance' },
        { id: 'win-wide', wallId: 'w3', kind: 'window', at: 1.5, width: 30, height: 1.2, sill: 0.9, leaf: 'double', style: 'casement' },
        { id: 'win-high', wallId: 'w1', kind: 'window', at: 2, width: 1.2, height: 5, sill: 0.9, leaf: 'sliding', style: 'sliding-alu' },
        { id: 'win-overlap', wallId: 'w1', kind: 'window', at: 2.4, width: 1.2, height: 1.2, sill: 0.9, leaf: 'double', style: 'casement' },
        { id: 'd-end', wallId: 'w2', kind: 'door', at: 0.1, width: 0.9, height: 2.1, sill: 0, leaf: 'single', style: 'steel' },
        { id: 'arch-angled', wallId: 'w7', kind: 'opening', at: 1.9, width: 1.1, height: 2.2, sill: 0, leaf: 'none', style: 'arch' },
        { id: 'd-sliding', wallId: 'w6', kind: 'door', at: 6.8, width: 1.8, height: 2.1, sill: 0, leaf: 'sliding', style: 'sliding-alu' },
        { id: 'vent', wallId: 'w4', kind: 'ventilator', at: 2, width: 0.6, height: 0.45, sill: 2.0, leaf: 'none', style: 'louvre' },
        { id: 'orphan', wallId: 'nope', kind: 'door', at: 1, width: 1, height: 2.1, sill: 0, leaf: 'single' },
        { id: 'tiny', wallId: 'w4', kind: 'window', at: 3.4, width: 0.01, height: 1, sill: 1, leaf: 'single' },
      ],
      rooms: [
        { id: 'r-main', name: 'Great room', type: 'living', polygon: [[T, T], [9 - T, T], [9 - T, 5 - T], [5 - T, 5 - T], [5 - T, 9 - T], [T, 9 - T]], sizeLabel: 'L-shaped', floor: 'terrazzo', wallColor: '#c9d2bf' },
        { id: 'r-bad', name: 'Bad polygon', type: 'other', polygon: [[1, 1], [2, 2]], floor: 'no-such-finish', wallColor: 'not-a-colour' },
        { id: 'r-deck', name: 'Deck', type: 'balcony', polygon: [[5, 5], [9, 5], [9, 9], [5, 9]], floor: 'kota-stone', wallColor: '#e9e1cf', floorOffset: -0.1, outdoor: true },
      ],
      stairs: [
        { id: 's-straight', name: 'Straight flight', riser: 0.165, finish: 'granite-black', railHeight: 0.9,
          steps: Array.from({ length: 10 }, (_, i) => ({ x0: 6.6 + i * 0.22, y0: 0.4, x1: 6.6 + (i + 1) * 0.22, y1: 1.3, top: 0.165 * (i + 1), kind: 'tread' as const })),
          rails: [[[6.6, 1.3, 0.165], [8.8, 1.3, 1.65]]] },
      ],
      floorOpenings: [],
      railings: [
        { id: 'deck-ms', points: [[9, 5, -0.1], [9, 9, -0.1], [5, 9, -0.1]], height: 1.0, style: 'ms-baluster' },
        { id: 'one-point', points: [[1, 1, 0]], height: 1, style: 'wood' },
      ],
    },
    {
      id: 'f', name: 'First', short: 'F', elevation: 3.3, height: 2.9, slab: 0.12,
      footprint: [[0, 0], [9, 0], [9, 5], [0, 5]],
      walls: [
        { id: 'f1', a: [0, T / 2], b: [9, T / 2], thickness: T, kind: 'exterior' },
        { id: 'f2', a: [9 - T / 2, T], b: [9 - T / 2, 5], thickness: T, kind: 'exterior' },
        { id: 'f3', a: [T / 2, T], b: [T / 2, 5], thickness: T, kind: 'exterior' },
      ],
      openings: [{ id: 'fw', wallId: 'f1', kind: 'window', at: 4.5, width: 1.5, height: 1.2, sill: 0.9, leaf: 'double', style: 'casement' }],
      // one room drawn right across the stairwell, as a traced plan might be
      rooms: [{ id: 'f-loft', name: 'Loft', type: 'lobby', polygon: [[T, T], [9 - T, T], [9 - T, 5], [T, 5]], floor: 'wood-walnut', wallColor: '#e3d3b6' }],
      stairs: [],
      // the well touches the plate edge on one side and pokes past it on another
      floorOpenings: [[[6.4, 0.3], [9.4, 0.3], [9.4, 1.4], [6.4, 1.4]]],
      railings: [{ id: 'loft-wood', points: [[T, 5, 0], [9 - T, 5, 0]], height: 0.95, style: 'wood' }],
    },
  ],
  structure: {
    columns: [{ id: 'c-free', x: 7, y: 7, w: 0.3, d: 0.3, levels: ['g'] }, { id: 'c-bad', x: Number.NaN, y: 1, w: 0.3, d: 0.3, levels: ['g'] }],
    beams: [
      { id: 'b-zero', a: [1, 1], b: [1, 1], top: 3.3, width: 0.2, depth: 0.4, kind: 'floor' },
      { id: 'b-diag', a: [0.2, 4.9], b: [8.8, 0.2], top: 3.3, width: 0.2, depth: 0.4, kind: 'floor' },
    ],
    footing: { size: 1, depth: 1.2, thickness: 0.3 },
    plinthHeight: 0.3,
  },
  roof: { kind: 'flat', elevation: 6.2, slab: 0.12, outline: [[0, 0], [9, 0], [9, 5], [0, 5]], parapet: { height: 0, thickness: 0.15 } },
};

export const ODD_ITEMS: PlacedItem[] = [
  { uid: 'o1', kind: 'sofa-3seat', levelId: 'g', roomId: 'r-main', x: 2, y: 7.6, rot: Math.PI, w: 2.1, d: 0.9, h: 0.85, color: '#36506b' },
  { uid: 'o2', kind: 'no-such-kind', levelId: 'g', roomId: 'r-main', x: 2, y: 3, rot: 0.4, w: 0.8, d: 0.8, h: 0.8 },
  { uid: 'o3', kind: 'bed-queen', levelId: 'missing-level', x: 3, y: 3, rot: 0, w: 1.6, d: 2.08, h: 1.05 },
  { uid: 'o4', kind: 'rug', levelId: 'g', x: Number.NaN, y: 2, rot: 0, w: 2, d: 1.4, h: 0.012 },
  { uid: 'o5', kind: 'ceiling-fan', levelId: 'f', roomId: 'f-loft', x: 3, y: 2.5, rot: 0, w: 1.2, d: 1.2, h: 0.42 },
  { uid: 'o6', kind: 'armchair', levelId: 'g', roomId: 'r-deck', x: 7.6, y: 6.2, rot: -0.7, w: 0, d: -1, h: Number.NaN },
];
