import type { HouseSpec, Opening, Room, StairStep, Vec2, Wall } from '@/types/house';

// The first sample: "House Plan-Model.pdf" (G+1, 22' × 36', entrance facing north).
//
// Every wall, opening, room and stair block below is read from the vector geometry of the PDF, not traced by eye:
// the drawing is a CAD export at 14.024 pt per foot. Ground floor plan frame origin (back-left outer corner) is at
// (460.16, 45.16) pt and first floor at (71.0, 45.16) pt on the page as displayed (page /Rotate 270).
// Coordinates here are written in FEET exactly as measured, then converted to metres.

const FT = 0.3048;
const F = (v: number) => Math.round(v * FT * 10000) / 10000;
const P = (x: number, y: number): Vec2 => [F(x), F(y)];
const rectPoly = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

/** A wall from its CAD rectangle (feet). Horizontal when wider than deep. */
function wall(id: string, x0: number, y0: number, x1: number, y1: number, kind: Wall['kind']): Wall {
  const horiz = x1 - x0 >= y1 - y0;
  return horiz
    ? { id, a: P(x0, (y0 + y1) / 2), b: P(x1, (y0 + y1) / 2), thickness: F(y1 - y0), kind }
    : { id, a: P((x0 + x1) / 2, y0), b: P((x0 + x1) / 2, y1), thickness: F(x1 - x0), kind };
}

/** An opening between two coordinates (feet) along its wall's axis. */
function opening(w: Wall, id: string, from: number, to: number, o: Omit<Opening, 'id' | 'wallId' | 'at' | 'width'>): Opening {
  const horiz = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
  const start = horiz ? w.a[0] : w.a[1];
  return { id, wallId: w.id, at: Math.round((F((from + to) / 2) - start) * 10000) / 10000, width: F(to - from), ...o };
}

const DOOR_H = 2.1;
const WIN = { sill: 0.9, height: 1.2 };
const VENT = { sill: 1.8, height: 0.45 };

// ---------------------------------------------------------------------------------------------- Ground floor
const gw = {
  back: wall('gf-w-back', 0, 0, 22, 0.753, 'exterior'),
  west: wall('gf-w-west', 0, 0.753, 0.753, 32.251, 'exterior'),
  east: wall('gf-w-east', 21.247, 0.753, 22, 32.251, 'exterior'),
  front: wall('gf-w-front', 0, 32.251, 22, 32.996, 'exterior'),
  mid: wall('gf-w-mid', 0.753, 12.75, 21.247, 13.503, 'interior'),
  kitBed: wall('gf-w-kitchen-bed', 10.748, 0.753, 11.501, 12.75, 'interior'),
  hallSide: wall('gf-w-hall-side', 16.874, 13.503, 17.251, 32.251, 'partition'),
  poojaToilet: wall('gf-w-pooja-toilet', 17.251, 18.5, 21.247, 18.877, 'partition'),
  toiletUtility: wall('gf-w-toilet-utility', 17.251, 25.876, 21.247, 26.253, 'partition'),
};

const gfOpenings: Opening[] = [
  opening(gw.front, 'gf-d-main', 5.75, 9.755, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'double', swing: -1, style: 'teak-panel', name: 'Main entrance' }),
  opening(gw.back, 'gf-d-back', 6.418, 9.755, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'a', swing: 1, style: 'steel', name: 'Back door' }),
  opening(gw.mid, 'gf-o-kitchen', 6.418, 9.755, { kind: 'opening', height: DOOR_H, sill: 0, leaf: 'none', style: 'arch', name: 'Kitchen opening' }),
  opening(gw.mid, 'gf-d-bedroom', 12.502, 15.83, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'a', swing: -1, style: 'flush', name: 'Bedroom door' }),
  opening(gw.hallSide, 'gf-o-pooja', 14.504, 17.499, { kind: 'opening', height: DOOR_H, sill: 0, leaf: 'none', style: 'arch', name: 'Pooja opening' }),
  opening(gw.hallSide, 'gf-o-utility', 29.248, 31.746, { kind: 'opening', height: DOOR_H, sill: 0, leaf: 'none', name: 'Utility opening' }),
  opening(gw.toiletUtility, 'gf-d-toilet', 17.747, 20.246, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'a', swing: -1, style: 'pvc', name: 'Toilet door', assumed: true }),
  // Windows and ventilators are not drawn on the plan: standard positions, marked assumed.
  opening(gw.west, 'gf-win-kitchen', 4.75, 8.75, { kind: 'window', sill: 1.05, height: 1.05, leaf: 'double', style: 'casement', name: 'Kitchen window', assumed: true }),
  opening(gw.back, 'gf-win-bedroom', 14.0, 19.0, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Bedroom window', assumed: true }),
  opening(gw.front, 'gf-win-hall', 12.5, 16.0, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Hall window', assumed: true }),
  opening(gw.east, 'gf-v-toilet', 19.5, 21.5, { kind: 'ventilator', ...VENT, leaf: 'none', style: 'louvre', name: 'Toilet ventilator', assumed: true }),
  opening(gw.east, 'gf-win-utility', 26.5, 29.5, { kind: 'window', sill: 1.05, height: 1.05, leaf: 'sliding', style: 'sliding-alu', name: 'Utility window', assumed: true }),
];

const gfRooms: Room[] = [
  { id: 'gf-kitchen', name: 'Kitchen', type: 'kitchen', polygon: rectPoly(0.753, 0.753, 10.748, 12.75), sizeLabel: `10'x12'`, floor: 'vitrified-ivory', wallColor: '#f3f0ea' },
  { id: 'gf-bedroom', name: 'Bedroom', type: 'bedroom', polygon: rectPoly(11.501, 0.753, 21.247, 12.75), sizeLabel: `9'9"x12'`, floor: 'wood-oak', wallColor: '#cfd8de' },
  { id: 'gf-hall', name: 'Hall', type: 'hall', polygon: rectPoly(4.167, 13.503, 16.874, 32.251), sizeLabel: `16'1"x18'9"`, floor: 'vitrified-ivory', wallColor: '#efe6d2' },
  { id: 'gf-stair', name: 'Staircase', type: 'staircase', polygon: rectPoly(0.753, 13.503, 4.167, 32.251), sizeLabel: `3'5"x18'9"`, floor: 'vitrified-ivory', wallColor: '#efe6d2' },
  { id: 'gf-pooja', name: 'Pooja', type: 'pooja', polygon: rectPoly(17.251, 13.503, 21.247, 18.5), sizeLabel: `4'x5'`, floor: 'marble-white', wallColor: '#e3d3b6' },
  { id: 'gf-toilet', name: 'Toilet', type: 'toilet', polygon: rectPoly(17.251, 18.877, 21.247, 25.876), sizeLabel: `4'x7'`, floor: 'anti-skid', wallColor: '#f3f0ea', dado: { finish: 'wall-tile-sage', height: 2.1 } },
  { id: 'gf-utility', name: 'Utility', type: 'utility', polygon: rectPoly(17.251, 26.253, 21.247, 32.251), sizeLabel: `4'x6'`, floor: 'anti-skid', wallColor: '#f3f0ea', dado: { finish: 'wall-tile-white', height: 1.2 } },
  { id: 'gf-portico', name: 'Portico', type: 'portico', polygon: rectPoly(0, 32.996, 22, 36), sizeLabel: `22'x3'`, floor: 'kota-stone', wallColor: '#e9e2d4', floorOffset: -0.15, outdoor: true },
];

// Dog-legged stair, read block by block from the plan: a step up from the hall onto the bottom landing, 12 treads of
// 1'0" running toward the back, the top landing, then 2 treads turning east onto the first floor. 18 risers in all.
const FLOOR_TO_FLOOR = 3.048; // 10'0" — the plan gives no heights; this is the usual G+1 value
const R = Math.round((FLOOR_TO_FLOOR / 18) * 100000) / 100000;
const box = (x0: number, y0: number, x1: number, y1: number, risers: number, kind: StairStep['kind']): StairStep => ({
  x0: F(x0), y0: F(y0), x1: F(x1), y1: F(y1), top: Math.round(risers * R * 10000) / 10000, kind,
});
const TREAD = (28.836 - 16.917) / 12;
const gfStairSteps: StairStep[] = [
  box(4.167, 28.836, 5.168, 32.251, 1, 'tread'),
  box(0.753, 28.836, 4.167, 32.251, 2, 'landing'),
  ...Array.from({ length: 12 }, (_, i) => box(0.753, 28.836 - (i + 1) * TREAD, 4.167, 28.836 - i * TREAD, 3 + i, 'tread')),
  box(0.753, 13.503, 4.167, 16.917, 15, 'landing'),
  box(4.167, 13.503, 5.168, 16.917, 16, 'tread'),
  box(5.168, 13.503, 6.17, 16.917, 17, 'tread'),
];

// ---------------------------------------------------------------------------------------------- First floor
const fw = {
  back: wall('ff-w-back', 0, 0, 22, 0.753, 'exterior'),
  west: wall('ff-w-west', 0, 0.753, 0.753, 35.246, 'exterior'),
  east: wall('ff-w-east', 21.247, 0.753, 22, 35.246, 'exterior'),
  front: wall('ff-w-front', 0, 35.246, 22, 36, 'exterior'),
  midBack: wall('ff-w-mid-back', 0.753, 12.75, 21.247, 13.503, 'interior'),
  midFront: wall('ff-w-mid-front', 0.753, 22.496, 21.247, 23.249, 'interior'),
  walkinBackWest: wall('ff-w-walkin-back-west', 12.502, 0.753, 12.87, 8.959, 'partition'),
  walkinBackFront: wall('ff-w-walkin-back-front', 12.502, 8.959, 16.874, 9.336, 'partition'),
  toiletBackWest: wall('ff-w-toilet-back-west', 16.874, 0.753, 17.251, 12.75, 'partition'),
  walkinFrontBack: wall('ff-w-walkin-front-back', 12.502, 26.664, 16.874, 27.04, 'partition'),
  walkinFrontWest: wall('ff-w-walkin-front-west', 12.502, 27.04, 12.87, 35.246, 'partition'),
  toiletFrontWest: wall('ff-w-toilet-front-west', 16.874, 23.249, 17.251, 35.246, 'partition'),
};

const ffOpenings: Opening[] = [
  opening(fw.midBack, 'ff-d-bed-back', 13.537, 16.874, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'b', swing: -1, style: 'flush', name: 'Bedroom door' }),
  opening(fw.midFront, 'ff-d-bed-front', 13.537, 16.874, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'b', swing: 1, style: 'flush', name: 'Bedroom door' }),
  opening(fw.walkinBackWest, 'ff-o-walkin-back', 5.921, 8.335, { kind: 'opening', height: DOOR_H, sill: 0, leaf: 'none', name: 'Walk-in opening' }),
  opening(fw.walkinFrontWest, 'ff-o-walkin-front', 27.665, 30.086, { kind: 'opening', height: DOOR_H, sill: 0, leaf: 'none', name: 'Walk-in opening' }),
  opening(fw.toiletBackWest, 'ff-d-toilet-back', 5.921, 8.335, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'a', swing: -1, style: 'pvc', name: 'Toilet door', assumed: true }),
  opening(fw.toiletFrontWest, 'ff-d-toilet-front', 27.665, 30.086, { kind: 'door', height: DOOR_H, sill: 0, leaf: 'single', hinge: 'b', swing: -1, style: 'pvc', name: 'Toilet door', assumed: true }),
  opening(fw.back, 'ff-win-bed-back', 3.5, 8.5, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Bedroom window', assumed: true }),
  opening(fw.west, 'ff-win-bed-back-side', 4.75, 8.75, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Bedroom side window', assumed: true }),
  opening(fw.east, 'ff-v-toilet-back', 2.5, 4.5, { kind: 'ventilator', ...VENT, leaf: 'none', style: 'louvre', name: 'Toilet ventilator', assumed: true }),
  opening(fw.east, 'ff-win-lobby', 16.0, 20.0, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Lobby window', assumed: true }),
  opening(fw.west, 'ff-win-stair', 17.5, 20.5, { kind: 'window', ...WIN, leaf: 'sliding', style: 'sliding-alu', name: 'Stairwell window', assumed: true }),
  opening(fw.front, 'ff-win-bed-front', 3.5, 8.5, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Bedroom window', assumed: true }),
  opening(fw.west, 'ff-win-bed-front-side', 27.25, 31.25, { kind: 'window', ...WIN, leaf: 'double', style: 'casement', name: 'Bedroom side window', assumed: true }),
  opening(fw.east, 'ff-v-toilet-front', 31.0, 33.0, { kind: 'ventilator', ...VENT, leaf: 'none', style: 'louvre', name: 'Toilet ventilator', assumed: true }),
];

const ffRooms: Room[] = [
  { id: 'ff-bed-back', name: 'Bedroom 2', type: 'bedroom', polygon: [P(0.753, 0.753), P(12.502, 0.753), P(12.502, 9.336), P(16.874, 9.336), P(16.874, 12.75), P(0.753, 12.75)], sizeLabel: `11'9"x12'`, floor: 'wood-oak', wallColor: '#c9d2bf' },
  { id: 'ff-walkin-back', name: 'Walk-in 2', type: 'walkin', polygon: rectPoly(12.87, 0.753, 16.874, 8.959), sizeLabel: `4'x8'3"`, floor: 'wood-oak', wallColor: '#f3f0ea' },
  { id: 'ff-toilet-back', name: 'Toilet 2', type: 'toilet', polygon: rectPoly(17.251, 0.753, 21.247, 12.75), sizeLabel: `4'x12'`, floor: 'anti-skid', wallColor: '#f3f0ea', dado: { finish: 'wall-tile-white', height: 2.1 } },
  { id: 'ff-lobby', name: 'Lobby', type: 'lobby', polygon: [P(6.17, 13.503), P(21.247, 13.503), P(21.247, 22.496), P(4.167, 22.496), P(4.167, 16.917), P(6.17, 16.917)], sizeLabel: `20'6"x9'`, floor: 'vitrified-ivory', wallColor: '#efe6d2' },
  { id: 'ff-bed-front', name: 'Bedroom 3', type: 'bedroom', polygon: [P(0.753, 23.249), P(16.874, 23.249), P(16.874, 26.664), P(12.502, 26.664), P(12.502, 35.246), P(0.753, 35.246)], sizeLabel: `11'9"x12'`, floor: 'wood-walnut', wallColor: '#e3d3b6' },
  { id: 'ff-walkin-front', name: 'Walk-in 3', type: 'walkin', polygon: rectPoly(12.87, 27.04, 16.874, 35.246), sizeLabel: `4'x8'3"`, floor: 'wood-walnut', wallColor: '#f3f0ea' },
  { id: 'ff-toilet-front', name: 'Toilet 3', type: 'toilet', polygon: rectPoly(17.251, 23.249, 21.247, 35.246), sizeLabel: `4'x12'`, floor: 'anti-skid', wallColor: '#f3f0ea', dado: { finish: 'wall-tile-sage', height: 2.1 } },
];

// ---------------------------------------------------------------------------------------------- Structure
const SLAB = 0.125;
const GF_FFL = 0.45; // 1'6" plinth
const FF_FFL = Math.round((GF_FFL + FLOOR_TO_FLOOR) * 10000) / 10000;
const ROOF = Math.round((FF_FFL + FLOOR_TO_FLOOR) * 10000) / 10000;
const COL = 0.2235; // 9" columns, 3 mm under the 9" wall so embedded ones stay inside the wall faces
const cx = [0.3765, 11.1245, 21.6235];
const cy = [0.3765, 13.1265, 22.8725, 32.6235, 35.6225];
const colAt = (x: number, y: number) => ({ id: `c-${x.toFixed(1)}-${y.toFixed(1)}`, x: F(x), y: F(y), w: COL, d: COL, levels: ['gf', 'ff'] });
const columns = [
  ...cx.map((x) => colAt(x, cy[0])),
  ...cx.map((x) => colAt(x, cy[1])),
  ...[cx[0], cx[2]].flatMap((x) => cy.slice(2).map((y) => colAt(x, y))),
];

type BeamKind = 'plinth' | 'floor' | 'roof';
const beam = (id: string, ax: number, ay: number, bx: number, by: number, top: number, kind: BeamKind, depth: number) => ({
  id, a: P(ax, ay), b: P(bx, by), top, width: 0.22, depth, kind,
});
const gridBeams = (kind: BeamKind, top: number, depth: number) => [
  ...cy.map((y, i) => beam(`${kind}-y${i}`, cx[0], y, cx[2], y, top, kind, depth)),
  beam(`${kind}-x0`, cx[0], cy[0], cx[0], cy[4], top, kind, depth),
  beam(`${kind}-x2`, cx[2], cy[0], cx[2], cy[4], top, kind, depth),
  beam(`${kind}-x1`, cx[1], cy[0], cx[1], cy[1], top, kind, depth),
];
const plinthBeams = [
  beam('plinth-back', cx[0], cy[0], cx[2], cy[0], 0.4, 'plinth', 0.3),
  beam('plinth-mid', cx[0], cy[1], cx[2], cy[1], 0.4, 'plinth', 0.3),
  beam('plinth-front', cx[0], cy[3], cx[2], cy[3], 0.4, 'plinth', 0.3),
  beam('plinth-west', cx[0], cy[0], cx[0], cy[3], 0.4, 'plinth', 0.3),
  beam('plinth-east', cx[2], cy[0], cx[2], cy[3], 0.4, 'plinth', 0.3),
  beam('plinth-core', cx[1], cy[0], cx[1], cy[1], 0.4, 'plinth', 0.3),
  beam('plinth-portico', cx[0], cy[4], cx[2], cy[4], 0.25, 'plinth', 0.3),
  beam('plinth-portico-w', cx[0], cy[3], cx[0], cy[4], 0.25, 'plinth', 0.3),
  beam('plinth-portico-e', cx[2], cy[3], cx[2], cy[4], 0.25, 'plinth', 0.3),
];

export const SAMPLE_HOUSE: HouseSpec = {
  id: 'sample-house-plan-model',
  name: 'House Plan-Model',
  description: `G+1 house on a 22' × 36' footprint: kitchen, bedroom, hall, pooja, toilet and utility on the ground floor; two bedroom suites with walk-ins and toilets around a lobby on the first floor.`,
  displayUnit: 'ft',
  north: [0, 1],
  exterior: { wall: '#ece5d6', band: '#8a6a4f', plinth: '#6f6a62' },
  levels: [
    {
      id: 'gf', name: 'Ground floor', short: 'GF', elevation: GF_FFL, height: FLOOR_TO_FLOOR, slab: 0,
      footprint: rectPoly(0, 0, 22, 32.996),
      walls: Object.values(gw), openings: gfOpenings, rooms: gfRooms,
      stairs: [
        { id: 'gf-stair', name: 'Staircase to first floor', steps: gfStairSteps, riser: R, finish: 'granite-black', railHeight: 0.9,
          rails: [[[F(4.167), F(28.836), 3 * R], [F(4.167), F(28.836 - 11 * TREAD), 14 * R], [F(4.167), F(16.917), 15 * R]]] },
        { id: 'gf-entry-steps', name: 'Entrance step', steps: [box(5.0, 36.0, 10.5, 37.0, 0, 'tread')].map((s) => ({ ...s, top: -0.3 })), riser: 0.15, finish: 'kota-stone', railHeight: 0.9, rails: [] },
      ],
      floorOpenings: [],
      railings: [],
    },
    {
      id: 'ff', name: 'First floor', short: 'FF', elevation: FF_FFL, height: FLOOR_TO_FLOOR, slab: SLAB,
      footprint: rectPoly(0, 0, 22, 36),
      walls: Object.values(fw), openings: ffOpenings, rooms: ffRooms, stairs: [],
      floorOpenings: [[P(0.753, 13.503), P(6.17, 13.503), P(6.17, 16.917), P(4.167, 16.917), P(4.167, 22.496), P(0.753, 22.496)]],
      railings: [{ id: 'ff-well-rail', points: [[F(4.167), F(22.496), 0], [F(4.167), F(16.917), 0], [F(6.17), F(16.917), 0]], height: 0.95, style: 'ss-glass' }],
    },
  ],
  structure: {
    columns,
    beams: [...plinthBeams, ...gridBeams('floor', FF_FFL, 0.38), ...gridBeams('roof', ROOF, 0.38)],
    footing: { size: 1.2, depth: 1.5, thickness: 0.4 },
    plinthHeight: GF_FFL,
  },
  roof: { kind: 'flat', elevation: ROOF, slab: SLAB, outline: rectPoly(0, 0, 22, 36), parapet: { height: 0.9, thickness: 0.15 } },
  site: {
    plot: [P(-5, -4), P(27, -4), P(27, 54), P(-5, 54)],
    compoundWall: { height: 1.2, thickness: 0.2, gate: { a: P(4.5, 54), b: P(20.5, 54) } },
    paving: [rectPoly(4.5, 37, 20.5, 54), rectPoly(5.0, 36, 10.5, 37)],
    assumed: true,
  },
  underlay: {
    url: '/plans/house-plan-model.pdf', kind: 'pdf', page: 1, rotation: 270,
    frames: { gf: { origin: [460.16, 45.16], unitsPerMetre: 14.024 / FT }, ff: { origin: [71.0, 45.16], unitsPerMetre: 14.024 / FT } },
  },
  notes: [
    'Walls, openings, rooms, columns and stair blocks are read from the vector geometry of the PDF (14.024 pt per foot).',
    `Heights are not on the plan: plinth 1'6" (0.45 m), floor to floor 10'0" (3.048 m), 18 risers of 6¾" (169 mm), doors 7'0" (2.1 m).`,
    'Windows and ventilators are not drawn on the plan. They sit at standard positions and are marked "assumed"; move or remove them in Design.',
    'The plan draws door leaves for the bedroom doors only. Main, back and toilet doors use standard leaves.',
    'The plan shows no stair to the terrace, so the roof is a closed terrace slab with a 3\' parapet.',
    'Beams, footings and the site (plot, compound wall, gate, paving) are assumed for the structure view.',
    'The north arrow points down the drawing: the entrance and portico face north.',
  ],
};
