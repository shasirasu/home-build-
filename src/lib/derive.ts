import type { Beam, Column, HouseSpec, Level, Stair, StairStep, Vec2, Wall } from '@/types/house';
import { bbox, dist, uid, wallCorners } from './geom';

// Helpers that turn a traced plan (walls, rooms, openings, stairs) into a complete HouseSpec: footprint, roof,
// slab holes over stairs and an RCC frame at the wall corners. Used for uploaded plans; the sample has its own.

export const DEFAULTS = { floorToFloor: 3.048, slab: 0.125, plinth: 0.45, wall9: 0.23, wall45: 0.115, door: 2.1 };

export function emptyLevel(index: number, below?: Level): Level {
  const names = ['Ground floor', 'First floor', 'Second floor', 'Third floor'];
  const shorts = ['GF', 'FF', 'SF', 'TF'];
  const elevation = below ? below.elevation + below.height : DEFAULTS.plinth;
  return {
    id: shorts[index]?.toLowerCase() ?? `l${index}`,
    name: names[index] ?? `Floor ${index}`,
    short: shorts[index] ?? `L${index}`,
    elevation: Math.round(elevation * 10000) / 10000,
    height: DEFAULTS.floorToFloor,
    slab: index === 0 ? 0 : DEFAULTS.slab,
    footprint: [],
    walls: [],
    openings: [],
    rooms: [],
    stairs: [],
    floorOpenings: [],
    railings: [],
  };
}

export function newSpec(name: string, floors: number): HouseSpec {
  const levels: Level[] = [];
  for (let i = 0; i < floors; i++) levels.push(emptyLevel(i, levels[i - 1]));
  const top = levels[levels.length - 1];
  return {
    id: uid('house'),
    name,
    displayUnit: 'ft',
    north: [0, -1],
    exterior: { wall: '#ece5d6', band: '#8a6a4f', plinth: '#6f6a62' },
    levels,
    structure: { columns: [], beams: [], footing: { size: 1.2, depth: 1.5, thickness: 0.4 }, plinthHeight: DEFAULTS.plinth },
    roof: { kind: 'flat', elevation: top.elevation + top.height, slab: DEFAULTS.slab, outline: [], parapet: { height: 0.9, thickness: 0.15 } },
    notes: [
      'Traced from your drawing. Heights are not on a 2D plan: plinth 0.45 m, floor to floor 3.05 m (10′), doors 2.1 m.',
      'The RCC frame (columns at wall corners, beams along 9″ walls) is generated, not designed. Ask your engineer for the real one.',
    ],
  };
}

/** Outer outline of a level from its walls (bounding box of all wall rectangles). */
function wallsOutline(walls: Wall[]): Vec2[] {
  if (!walls.length) return [];
  const pts = walls.flatMap((w) => wallCorners(w));
  const b = bbox(pts);
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
}

/** A straight flight of stairs inside a rectangle, rising from the `from` end to the far end. */
export function straightStair(id: string, x0: number, y0: number, x1: number, y1: number, rise: number, dir: 'n' | 's' | 'e' | 'w'): Stair {
  const run = dir === 'n' || dir === 's' ? Math.abs(y1 - y0) : Math.abs(x1 - x0);
  const risers = Math.max(2, Math.round(rise / 0.17));
  const riser = rise / risers;
  const treads = risers - 1;
  const t = run / treads;
  const [ax0, ax1] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay0, ay1] = [Math.min(y0, y1), Math.max(y0, y1)];
  const steps: StairStep[] = [];
  for (let i = 0; i < treads; i++) {
    const top = Math.round(riser * (i + 1) * 10000) / 10000;
    if (dir === 's') steps.push({ x0: ax0, x1: ax1, y0: ay0 + i * t, y1: ay0 + (i + 1) * t, top, kind: 'tread' });
    if (dir === 'n') steps.push({ x0: ax0, x1: ax1, y0: ay1 - (i + 1) * t, y1: ay1 - i * t, top, kind: 'tread' });
    if (dir === 'e') steps.push({ x0: ax0 + i * t, x1: ax0 + (i + 1) * t, y0: ay0, y1: ay1, top, kind: 'tread' });
    if (dir === 'w') steps.push({ x0: ax1 - (i + 1) * t, x1: ax1 - i * t, y0: ay0, y1: ay1, top, kind: 'tread' });
  }
  return { id, name: 'Stair', steps, riser, rails: [], railHeight: 0.9, finish: 'granite-black' };
}

const key = (p: Vec2) => `${Math.round(p[0] * 20)}:${Math.round(p[1] * 20)}`;

/** Fill in footprint, roof, stair holes and a generated frame for a traced spec. Returns a new spec. */
export function deriveSpec(input: HouseSpec): HouseSpec {
  const spec: HouseSpec = structuredClone(input);
  const levels = spec.levels;
  // Elevations stack up; footprints from walls.
  levels.forEach((lv, i) => {
    if (i > 0) lv.elevation = Math.round((levels[i - 1].elevation + levels[i - 1].height) * 10000) / 10000;
    lv.slab = i === 0 ? 0 : lv.slab || DEFAULTS.slab;
    const out = wallsOutline(lv.walls);
    if (out.length) lv.footprint = out;
  });
  // Holes in the slab above each stair, where the plan did not already give one: only over the upper part of the
  // flight, where a person on the stair would otherwise hit the slab (2.05 m headroom).
  levels.forEach((lv, i) => {
    const above = levels[i + 1];
    if (!above) return;
    for (const st of lv.stairs) {
      const high = st.steps.filter((s) => s.top >= 0 && s.top + 2.05 > lv.height - above.slab);
      if (!high.length) continue;
      const b = bbox(high.flatMap((s) => [[s.x0, s.y0], [s.x1, s.y1]] as Vec2[]));
      const has = above.floorOpenings.some((poly) => { const o = bbox(poly); return Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > 0.2 && Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0) > 0.2; });
      if (!has) above.floorOpenings.push([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]);
    }
  });
  const top = levels[levels.length - 1];
  spec.roof.elevation = Math.round((top.elevation + top.height) * 10000) / 10000;
  spec.roof.outline = top.footprint.length ? top.footprint : levels[0].footprint;

  if (spec.structure.fromPlan && spec.structure.columns.length >= 4) {
    spec.structure.beams = gridBeams(spec);
    return spec;
  }
  // Frame: columns at the ends of 9" walls on the ground floor (merged), beams along those walls.
  const gf = levels[0];
  const heavy = gf.walls.filter((w) => w.thickness >= 0.18 && dist(w.a, w.b) > 0.3);
  const colMap = new Map<string, Vec2>();
  for (const w of heavy) for (const p of [w.a, w.b]) colMap.set(key(p), p);
  // Long walls get an intermediate column so spans stay under ~4.5 m.
  for (const w of heavy) {
    const L = dist(w.a, w.b);
    const n = Math.floor(L / 4.5);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const p: Vec2 = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
      colMap.set(key(p), p);
    }
  }
  const size = 0.225;
  const columns: Column[] = [...colMap.values()].map((p, i) => ({ id: `c${i}`, x: p[0], y: p[1], w: size, d: size, levels: levels.map((l) => l.id) }));
  const beams: Beam[] = [];
  heavy.forEach((w, i) => {
    beams.push({ id: `pb${i}`, a: w.a, b: w.b, top: spec.structure.plinthHeight - 0.05, width: 0.22, depth: 0.3, kind: 'plinth' });
    levels.slice(1).forEach((lv) => beams.push({ id: `fb${i}-${lv.id}`, a: w.a, b: w.b, top: lv.elevation, width: 0.22, depth: 0.38, kind: 'floor' }));
    beams.push({ id: `rb${i}`, a: w.a, b: w.b, top: spec.roof.elevation, width: 0.22, depth: 0.38, kind: 'roof' });
  });
  spec.structure.columns = columns;
  spec.structure.beams = beams;
  return spec;
}

export const newWallId = () => uid('w');
export const newRoomId = () => uid('r');
export const newOpeningId = () => uid('o');
export const newStairId = () => uid('s');

/** Beams along the column grid: between neighbouring columns in each row and each line, at plinth, floors and roof. */
export function gridBeams(spec: HouseSpec): Beam[] {
  const cols = spec.structure.columns;
  const beams: Beam[] = [];
  const tol = 0.2;
  const lines = (key: 'x' | 'y') => {
    const other = key === 'x' ? 'y' : 'x';
    const groups: Column[][] = [];
    for (const c of [...cols].sort((p, q) => p[key] - q[key])) {
      const g = groups.find((gr) => Math.abs(gr[0][key] - c[key]) < tol);
      if (g) g.push(c); else groups.push([c]);
    }
    return groups.map((g) => g.sort((p, q) => p[other] - q[other])).filter((g) => g.length > 1);
  };
  const tops: { top: number; kind: Beam['kind']; depth: number }[] = [
    { top: spec.structure.plinthHeight - 0.05, kind: 'plinth', depth: 0.3 },
    ...spec.levels.slice(1).map((l) => ({ top: l.elevation, kind: 'floor' as const, depth: 0.38 })),
    { top: spec.roof.elevation, kind: 'roof', depth: 0.38 },
  ];
  let n = 0;
  for (const g of [...lines('x'), ...lines('y')])
    for (let i = 0; i + 1 < g.length; i++)
      for (const t of tops) beams.push({ id: `b${n++}`, a: [g[i].x, g[i].y], b: [g[i + 1].x, g[i + 1].y], top: t.top, width: 0.22, depth: t.depth, kind: t.kind });
  return beams;
}
