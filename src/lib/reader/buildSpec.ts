// Stage 3 of the plan reader: a reading of the drawing → a complete, buildable HouseSpec.
//
// What the drawing shows is kept exactly (walls, door positions, swing, rooms, stair treads, columns). What a 2D plan
// never shows is filled with standard values and marked `assumed` so the app can say so: heights, the leaf of a door
// drawn only as a gap, windows when none are drawn, handrails, entry steps, beams, footings and the plot.

import type { HouseSpec, Level, Opening, Railing, Room, Stair, StairStep, Vec2, Vec3 } from '@/types/house';
import { DEFAULTS, gridBeams, newSpec } from '../derive';
import { roomFinish } from '../roomDefaults';
import { feetInches, fmtDims } from '../units';
import type { R, ReadFloor, ReadResult } from './readPlan';
import { parseSize, toSpecWalls } from './readPlan';

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const rectPoly = (r: R): Vec2[] => [[r4(r.x0), r4(r.y0)], [r4(r.x1), r4(r.y0)], [r4(r.x1), r4(r.y1)], [r4(r.x0), r4(r.y1)]];
const near = (a: number, b: number, tol = 0.04) => Math.abs(a - b) <= tol;

/** Outline of a connected group of rectangles (an L-shaped room read as two parts), as one polygon. */
export function unionPolygon(rects: R[]): Vec2[] {
  if (rects.length === 1) return rectPoly(rects[0]);
  const uniq = (v: number[]) => [...v].sort((p, q) => p - q).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.005);
  const xs = uniq(rects.flatMap((r) => [r.x0, r.x1])), ys = uniq(rects.flatMap((r) => [r.y0, r.y1]));
  const fill = (i: number, j: number) => i >= 0 && j >= 0 && i < xs.length - 1 && j < ys.length - 1 && rects.some((r) => (xs[i] + xs[i + 1]) / 2 > r.x0 && (xs[i] + xs[i + 1]) / 2 < r.x1 && (ys[j] + ys[j + 1]) / 2 > r.y0 && (ys[j] + ys[j + 1]) / 2 < r.y1);
  // directed boundary edges, inside on the right, keyed by their start corner
  const next = new Map<string, [number, number]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      if (!fill(i, j)) continue;
      if (!fill(i, j - 1)) next.set(key(i, j), [i + 1, j]);
      if (!fill(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]);
      if (!fill(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]);
      if (!fill(i - 1, j)) next.set(key(i, j + 1), [i, j]);
    }
  const start = next.keys().next().value as string | undefined;
  if (!start) return rectPoly(rects[0]);
  const loop: [number, number][] = [];
  let cur = start.split(',').map(Number) as [number, number];
  for (let guard = 0; guard < 400; guard++) {
    loop.push(cur);
    const n = next.get(key(cur[0], cur[1]));
    if (!n || key(n[0], n[1]) === start) break;
    cur = n;
  }
  const pts = loop.map(([i, j]): Vec2 => [r4(xs[i]), r4(ys[j])]);
  // drop points in the middle of a straight run
  return pts.filter((p, k) => { const a = pts[(k + pts.length - 1) % pts.length], c = pts[(k + 1) % pts.length]; return !((near(a[0], p[0], 0.001) && near(p[0], c[0], 0.001)) || (near(a[1], p[1], 0.001) && near(p[1], c[1], 0.001))); });
}

type Side = 'n' | 's' | 'w' | 'e';
/** Which side of `room` the wall `w` runs along (touching it), and the stretch they share. */
function borders(room: R, w: { rect: R; axis: 'h' | 'v' }): { side: Side; a: number; b: number } | null {
  const r = w.rect;
  if (w.axis === 'h') {
    const a = Math.max(room.x0, r.x0), b = Math.min(room.x1, r.x1);
    if (b - a < 0.2) return null;
    if (near(r.y1, room.y0)) return { side: 'n', a, b };
    if (near(r.y0, room.y1)) return { side: 's', a, b };
  } else {
    const a = Math.max(room.y0, r.y0), b = Math.min(room.y1, r.y1);
    if (b - a < 0.2) return null;
    if (near(r.x1, room.x0)) return { side: 'w', a, b };
    if (near(r.x0, room.x1)) return { side: 'e', a, b };
  }
  return null;
}

/** Shift one floor so its walls sit over the floor below (sheets draw each floor in its own place). */
function alignOffset(lower: ReadFloor, upper: ReadFloor): Vec2 {
  const cands: Vec2[] = [[0, 0], [lower.width - upper.width, 0], [0, lower.depth - upper.depth], [lower.width - upper.width, lower.depth - upper.depth], [(lower.width - upper.width) / 2, (lower.depth - upper.depth) / 2]];
  let best: Vec2 = [0, 0], score = -1;
  for (const [dx, dy] of cands) {
    let s = 0;
    for (const u of upper.walls.filter((w) => w.exterior))
      for (const l of lower.walls) {
        if (l.axis !== u.axis) continue;
        const ox = Math.min(u.rect.x1 + dx, l.rect.x1) - Math.max(u.rect.x0 + dx, l.rect.x0);
        const oy = Math.min(u.rect.y1 + dy, l.rect.y1) - Math.max(u.rect.y0 + dy, l.rect.y0);
        if (ox > 0 && oy > 0) s += ox * oy;
      }
    if (s > score + 1e-6) { score = s; best = [dx, dy]; }
  }
  return best;
}

/** The size as printed, without the drawing's stray marks: 9.'9"'x12' → 9'9"x12'. */
function cleanSize(size: string | undefined, imperial: boolean): string | undefined {
  if (!size) return undefined;
  const d = imperial ? parseSize(size, true) : null;
  return d ? `${feetInches(d[0])}x${feetInches(d[1])}` : size.replace(/\s+/g, '');
}

export interface PlanSource { kind: 'pdf' | 'image'; page: number; url?: string }

export function specFromPlan(res: ReadResult, name: string, source: PlanSource): HouseSpec {
  const spec = newSpec(name, res.floors.length);
  spec.displayUnit = res.imperial ? 'ft' : 'm';
  spec.north = res.north ?? [0, -1];
  const unit = spec.displayUnit;
  spec.underlay = { url: source.url ?? '', kind: source.kind, page: source.page, frames: {} };

  const offsets: Vec2[] = [[0, 0]];
  for (let i = 1; i < res.floors.length; i++) {
    const d = alignOffset(res.floors[i - 1], res.floors[i]);
    offsets.push([offsets[i - 1][0] + d[0], offsets[i - 1][1] + d[1]]);
  }
  const shift = (r: R, i: number): R => ({ x0: r.x0 + offsets[i][0], x1: r.x1 + offsets[i][0], y0: r.y0 + offsets[i][1], y1: r.y1 + offsets[i][1] });
  const floors = res.floors.map((f, i) => ({
    ...f,
    walls: f.walls.map((w) => ({ ...w, rect: shift(w.rect, i) })),
    rooms: f.rooms.map((r) => ({ ...r, rect: shift(r.rect, i) })),
    stairs: f.stairs.map((s) => ({ ...s, rects: s.rects.map((r) => shift(r, i)), steps: s.steps.map((p) => ({ ...p, rect: shift(p.rect, i) })) })),
    columns: f.columns.map((c) => shift(c, i)),
    openings: f.openings.map((o) => { const ax = f.walls[o.wall].axis === 'h' ? 0 : 1; return { ...o, from: o.from + offsets[i][ax], to: o.to + offsets[i][ax] }; }),
    outside: (x: number, y: number) => f.outside(x - offsets[i][0], y - offsets[i][1]),
  }));

  const nameCount = new Map<string, number>();
  const uniqueName = (base: string) => {
    const n = (nameCount.get(base) ?? 0) + 1;
    nameCount.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  };
  let assumedWindows = 0, assumedLeaves = 0;
  const roomGroups: { r: ReadFloor['rooms'][number]; rects: R[] }[][] = [];

  floors.forEach((f, i) => {
    const lv = spec.levels[i];
    if (f.title) lv.name = f.title;
    spec.underlay!.frames[lv.id] = { origin: [f.origin[0] - offsets[i][0] * res.unitsPerMetre, f.origin[1] - offsets[i][1] * res.unitsPerMetre], unitsPerMetre: res.unitsPerMetre };
    const { walls, index } = toSpecWalls(f, lv.id);
    lv.walls = walls;

    // rooms. A space printed with only a size, and open (no wall) to one named room, is part of that room.
    const groups: { r: (typeof f.rooms)[number]; rects: R[] }[] = f.rooms.filter((r) => r.labelled).map((r) => ({ r, rects: [r.rect] }));
    for (const u of f.rooms.filter((r) => !r.labelled)) {
      const open = groups.filter((g) => {
        const a = g.rects[0], b = u.rect;
        const sx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), sy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        const vertical = (near(a.x1, b.x0) || near(b.x1, a.x0)) && sy > 0.4, horizontal = (near(a.y1, b.y0) || near(b.y1, a.y0)) && sx > 0.4;
        if (!vertical && !horizontal) return false;
        // is the shared edge walled?
        const edge: R = vertical ? { x0: (near(a.x1, b.x0) ? a.x1 : b.x1) - 0.04, x1: (near(a.x1, b.x0) ? a.x1 : b.x1) + 0.04, y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) } : { y0: (near(a.y1, b.y0) ? a.y1 : b.y1) - 0.04, y1: (near(a.y1, b.y0) ? a.y1 : b.y1) + 0.04, x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1) };
        const len = vertical ? edge.y1 - edge.y0 : edge.x1 - edge.x0;
        const walled = f.walls.reduce((sum, w) => { const ox = Math.min(w.rect.x1, edge.x1) - Math.max(w.rect.x0, edge.x0), oy = Math.min(w.rect.y1, edge.y1) - Math.max(w.rect.y0, edge.y0); return ox > 0 && oy > 0 ? sum + (vertical ? oy : ox) : sum; }, 0);
        return walled < 0.5 * len;
      });
      if (open.length === 1) open[0].rects.push(u.rect);
      else groups.push({ r: u, rects: [u.rect] });
    }
    lv.rooms = groups.map((g, k): Room => {
      const base = g.r.name === 'Walk In' ? 'Walk-in' : g.r.name;
      return {
        id: `${lv.id}-r${k + 1}`, name: uniqueName(base), type: g.r.type, polygon: unionPolygon(g.rects),
        sizeLabel: cleanSize(g.r.size, res.imperial) ?? fmtDims(g.r.rect.x1 - g.r.rect.x0, g.r.rect.y1 - g.r.rect.y0, unit).replace(/ /g, ''),
        ...roomFinish(g.r.type),
      };
    });
    roomGroups[i] = groups;
    const roomsOn = (wi: number) => groups.flatMap((g, k) => g.rects.map((rect) => ({ r: g.r, k, b: borders(rect, f.walls[wi]) }))).filter((x) => x.b);

    // a door is named after the more private of the rooms it joins
    const PRIVACY = ['bedroom', 'toilet', 'study', 'kitchen', 'store', 'utility', 'pooja', 'walkin', 'dining', 'living', 'hall', 'lobby', 'passage'];
    const owner = (beside: { r: { type: string }; k: number }[]) => {
      const best = [...beside].sort((p, q) => (PRIVACY.indexOf(p.r.type) + 99) % 99 - (PRIVACY.indexOf(q.r.type) + 99) % 99)[0];
      return best ? lv.rooms[best.k]?.name : undefined;
    };
    // openings
    const extDoors = f.openings.filter((o) => o.kind === 'door' && f.walls[o.wall].exterior);
    const main = extDoors.find((o) => /main|entrance|entry/i.test(o.name ?? '')) ?? [...extDoors].sort((p, q) => q.to - q.from - (p.to - p.from))[0];
    lv.openings = f.openings.map((o, k): Opening => {
      const w = index.get(o.wall)!;
      const start = f.walls[o.wall].axis === 'h' ? w.a[0] : w.a[1];
      const base = { id: `${lv.id}-o${k + 1}`, wallId: w.id, at: r4((o.from + o.to) / 2 - start), width: r4(o.to - o.from) };
      const beside = roomsOn(o.wall).filter((x) => x.b!.a <= o.from + 0.05 && x.b!.b >= o.to - 0.05);
      if (o.kind === 'window') return { ...base, kind: 'window', height: 1.2, sill: 0.9, leaf: 'double', style: 'casement', name: 'Window' };
      if (o.kind === 'door') {
        const ext = f.walls[o.wall].exterior;
        return { ...base, kind: 'door', height: DEFAULTS.door, sill: 0, leaf: o.leaf, hinge: o.hinge ?? 'a', swing: o.swing ?? 1, style: !ext ? 'flush' : o === main ? 'teak-panel' : 'steel', name: o.name ?? (o === main ? 'Main entrance' : ext ? 'Door' : `${owner(beside) ?? ''} door`.trim()) };
      }
      // an open doorway into a toilet gets a door; the leaf is not on the drawing
      const toilet = beside.find((x) => x.r.type === 'toilet');
      if (toilet) {
        assumedLeaves++;
        // swing into the toilet: +1 is the +y side of a wall along x, the −x side of a wall along y
        const swing: 1 | -1 = f.walls[o.wall].axis === 'h' ? (toilet.b!.side === 'n' ? 1 : -1) : toilet.b!.side === 'w' ? -1 : 1;
        return { ...base, kind: 'door', height: DEFAULTS.door, sill: 0, leaf: 'single', hinge: 'a', swing, style: 'pvc', name: 'Toilet door', assumed: true };
      }
      const arch = o.to - o.from >= 0.85 && beside.some((x) => x.r.type === 'pooja' || x.r.type === 'kitchen');
      const label = beside.find((x) => ['pooja', 'kitchen', 'utility', 'walkin', 'store'].includes(x.r.type));
      return { ...base, kind: 'opening', height: DEFAULTS.door, sill: 0, leaf: 'none', style: arch ? 'arch' : undefined, name: label ? `${lv.rooms[label.k]?.name ?? label.r.name} opening` : 'Opening' };
    });

    // stairs: a well on the top floor is only a hole; elsewhere the treads rise to the floor above
    const top = i === floors.length - 1;
    lv.stairs = [];
    lv.floorOpenings = [];
    f.stairs.forEach((st, k) => {
      if (st.well) for (const r of st.rects) lv.floorOpenings.push(rectPoly(r));
      if (top || !st.steps.length) return;
      const riser = lv.height / (st.steps.length + 1);
      const steps: StairStep[] = st.steps.map((p, n) => ({ x0: r4(p.rect.x0), y0: r4(p.rect.y0), x1: r4(p.rect.x1), y1: r4(p.rect.y1), top: r4(riser * (n + 1)), kind: p.kind }));
      lv.stairs.push({ id: `${lv.id}-stair${k + 1}`, name: `Staircase to ${spec.levels[i + 1]?.name.toLowerCase() ?? 'the floor above'}`, steps, riser: r4(riser), rails: [], railHeight: 0.9, finish: 'granite-black' });
    });
  });

  // handrails on the open side of each flight, and a railing round each stairwell
  floors.forEach((f, i) => {
    const lv = spec.levels[i];
    for (const st of lv.stairs) st.rails = flightRails(st, f.walls.map((w) => w.rect));
    const below = spec.levels[i - 1]?.stairs ?? [];
    if (lv.floorOpenings.length) lv.railings = wellRailings(lv, f.walls.map((w) => w.rect), below);
  });

  // steps up to each outside door
  const gf = floors[0];
  spec.levels[0].stairs.push(...entrySteps(gf, spec.levels[0]));

  // windows: where the drawing shows none, put standard ones on outside walls and mark them assumed
  floors.forEach((f, i) => {
    const lv = spec.levels[i];
    if (lv.openings.some((o) => o.kind === 'window' || o.kind === 'ventilator')) return;
    assumedWindows += addWindows(lv, f, gf.columns, roomGroups[i]);
  });

  // structure, roof, site
  spec.levels.forEach((lv) => {
    const pts = lv.walls.flatMap((w) => { const t = w.thickness / 2; return w.a[1] === w.b[1] ? [[w.a[0], w.a[1] - t], [w.b[0], w.b[1] + t]] : [[w.a[0] - t, w.a[1]], [w.b[0] + t, w.b[1]]]; });
    if (!pts.length) return;
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    lv.footprint = rectPoly({ x0, y0, x1, y1 });
  });
  const topLv = spec.levels[spec.levels.length - 1];
  spec.roof.elevation = r4(topLv.elevation + topLv.height);
  spec.roof.outline = topLv.footprint;
  if (gf.columns.length >= 4) {
    spec.structure.columns = gf.columns.map((c, k) => ({ id: `c${k + 1}`, x: r4((c.x0 + c.x1) / 2), y: r4((c.y0 + c.y1) / 2), w: r4(c.x1 - c.x0 - 0.006), d: r4(c.y1 - c.y0 - 0.006), levels: spec.levels.map((l) => l.id) }));
    spec.structure.fromPlan = true;
    spec.structure.beams = gridBeams(spec);
  }
  spec.site = plot(gf, spec.levels[0]);

  const counts = spec.levels.map((l) => `${l.name.toLowerCase()}: ${l.walls.length} walls, ${l.openings.filter((o) => !o.assumed).length} doors and openings, ${l.rooms.length} rooms`).join('; ');
  spec.notes = [
    res.by === 'gemini' ? `Understood by Google Gemini from a picture of the drawing, then built by the site: ${counts}. Positions are approximate; check walls and doors against the drawing in the plan editor.` : `Read from the drawing's own linework (no tracing by hand): ${counts}.`,
    res.scaleSource === 'dimension' ? `Scale taken from the dimension "${res.scaleText}" on the drawing.` : 'No dimension line could be read; the scale assumes the commonest wall is 9″ (230 mm). Check it with the Scale tool.',
    `Heights are not on a 2D plan: plinth ${fmtLenNote(DEFAULTS.plinth, unit)}, floor to floor ${fmtLenNote(DEFAULTS.floorToFloor, unit)}, doors ${fmtLenNote(DEFAULTS.door, unit)}.`,
    ...(assumedWindows ? [`The drawing shows no windows: ${assumedWindows} standard windows and ventilators were placed on outside walls and marked "assumed". Move or remove them in the plan.`] : []),
    ...(assumedLeaves ? [`Toilet doorways are drawn as plain gaps; ${assumedLeaves} got a door leaf (assumed).`] : []),
    spec.structure.fromPlan ? `${spec.structure.columns.length} columns read from the drawing; beams follow the column grid, footings are assumed.` : 'No columns are drawn; the frame (columns, beams, footings) is generated when you build.',
    res.north ? 'North arrow read from the drawing.' : 'No north arrow found; north is taken as up the sheet.',
    'The plot, compound wall and gate are assumed.',
    ...res.notes,
  ];
  return spec;
}

const fmtLenNote = (m: number, unit: 'ft' | 'm') => (unit === 'ft' ? `${Math.floor(m / 0.3048 + 1e-6)}′${Math.round(((m / 0.3048) % 1) * 12) || 0}″` : `${m.toFixed(2)} m`);

// ------------------------------------------------------------------------------------------------ stairs

/** A handrail along each long run of treads, on the side that is not against a wall. */
function flightRails(st: Stair, walls: R[]): Vec3[][] {
  const rails: Vec3[][] = [];
  const s = st.steps;
  const dirOf = (a: StairStep, b: StairStep): [number, number] => {
    const dx = (b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2, dy = (b.y0 + b.y1) / 2 - (a.y0 + a.y1) / 2;
    return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  };
  let i = 0;
  while (i < s.length) {
    if (s[i].kind !== 'tread' || i + 1 >= s.length) { i++; continue; }
    const d = dirOf(s[i], s[i + 1]);
    let j = i;
    while (j + 1 < s.length && s[j + 1].kind === 'tread' && dirOf(s[j], s[j + 1])[0] === d[0] && dirOf(s[j], s[j + 1])[1] === d[1]) j++;
    if (j - i + 1 >= 3) {
      const run = s.slice(i, j + 1);
      const vertical = d[1] !== 0;
      const lo = Math.min(...run.map((p) => (vertical ? p.y0 : p.x0))), hi = Math.max(...run.map((p) => (vertical ? p.y1 : p.x1)));
      const sides = vertical ? [run[0].x0, run[0].x1] : [run[0].y0, run[0].y1];
      for (const c of sides) {
        const walled = walls.some((w) => (vertical ? (near(w.x1, c, 0.06) || near(w.x0, c, 0.06)) && Math.min(w.y1, hi) - Math.max(w.y0, lo) > 0.6 * (hi - lo) : (near(w.y1, c, 0.06) || near(w.y0, c, 0.06)) && Math.min(w.x1, hi) - Math.max(w.x0, lo) > 0.6 * (hi - lo)));
        const stepped = s.some((p) => !run.includes(p) && (vertical ? (near(p.x0, c, 0.03) || near(p.x1, c, 0.03)) && p.x0 < c + 0.03 !== run[0].x0 < c - 0.03 && Math.min(p.y1, hi) - Math.max(p.y0, lo) > 0.5 * (hi - lo) : false));
        if (walled || stepped) continue;
        // nosing of the first and last tread, then on to the landing above
        const lead = (p: StairStep) => (vertical ? (d[1] < 0 ? p.y1 : p.y0) : d[0] < 0 ? p.x1 : p.x0);
        const pt = (u: number, h: number): Vec3 => (vertical ? [r4(c), r4(u), r4(h)] : [r4(u), r4(c), r4(h)]);
        const pts: Vec3[] = [pt(lead(run[0]), run[0].top), pt(lead(run[run.length - 1]), run[run.length - 1].top)];
        const next = s[j + 1];
        if (next) pts.push(pt(lead(next), next.top));
        rails.push(pts);
      }
    }
    i = j + 1;
  }
  return rails;
}

/** Railing round a stairwell: every edge of the hole that is not a wall and not where the stair arrives. */
function wellRailings(lv: Level, walls: R[], below: Stair[]): Railing[] {
  const holes: R[] = lv.floorOpenings.map((p) => ({ x0: Math.min(...p.map((v) => v[0])), y0: Math.min(...p.map((v) => v[1])), x1: Math.max(...p.map((v) => v[0])), y1: Math.max(...p.map((v) => v[1])) }));
  type Edge = { vertical: boolean; c: number; a: number; b: number };
  const edges: Edge[] = [];
  const subtract = (iv: [number, number][], a: number, b: number) => iv.flatMap(([p, q]): [number, number][] => (b <= p + 0.01 || a >= q - 0.01 ? [[p, q]] : [[p, Math.max(p, a)], [Math.min(q, b), q]])).filter(([p, q]) => q - p > 0.05);
  for (const h of holes)
    for (const e of [{ vertical: false, c: h.y0, a: h.x0, b: h.x1, out: -1 }, { vertical: false, c: h.y1, a: h.x0, b: h.x1, out: 1 }, { vertical: true, c: h.x0, a: h.y0, b: h.y1, out: -1 }, { vertical: true, c: h.x1, a: h.y0, b: h.y1, out: 1 }]) {
      let free: [number, number][] = [[e.a, e.b]];
      // shared with another piece of the same well
      for (const o of holes) {
        if (o === h) continue;
        const touches = e.vertical ? near(e.out > 0 ? o.x0 : o.x1, e.c, 0.03) : near(e.out > 0 ? o.y0 : o.y1, e.c, 0.03);
        if (touches) free = subtract(free, e.vertical ? o.y0 : o.x0, e.vertical ? o.y1 : o.x1);
      }
      // a wall stands on this edge
      for (const w of walls) {
        const on = e.vertical ? w.x0 <= e.c + 0.06 && w.x1 >= e.c - 0.06 : w.y0 <= e.c + 0.06 && w.y1 >= e.c - 0.06;
        if (on) free = subtract(free, e.vertical ? w.y0 : w.x0, e.vertical ? w.y1 : w.x1);
      }
      // where the stair from below steps onto this floor
      for (const st of below) {
        const n = st.steps.length;
        if (n < 2) continue;
        const last = st.steps[n - 1], prev = st.steps[n - 2];
        const dx = (last.x0 + last.x1) / 2 - (prev.x0 + prev.x1) / 2, dy = (last.y0 + last.y1) / 2 - (prev.y0 + prev.y1) / 2;
        const exitVertical = Math.abs(dx) >= Math.abs(dy);
        const exitC = exitVertical ? (dx > 0 ? last.x1 : last.x0) : dy > 0 ? last.y1 : last.y0;
        if (exitVertical === e.vertical && near(exitC, e.c, 0.05)) free = subtract(free, exitVertical ? last.y0 : last.x0, exitVertical ? last.y1 : last.x1);
      }
      for (const [a, b] of free) edges.push({ vertical: e.vertical, c: e.c, a, b });
    }
  // join collinear pieces, then chain edges that meet at a corner into one railing
  edges.sort((p, q) => Number(p.vertical) - Number(q.vertical) || p.c - q.c || p.a - q.a);
  const joined: Edge[] = [];
  for (const e of edges) {
    const l = joined[joined.length - 1];
    if (l && l.vertical === e.vertical && near(l.c, e.c, 0.02) && e.a <= l.b + 0.03) l.b = Math.max(l.b, e.b);
    else joined.push({ ...e });
  }
  const segs = joined.map((e): [Vec3, Vec3] => (e.vertical ? [[r4(e.c), r4(e.a), 0], [r4(e.c), r4(e.b), 0]] : [[r4(e.a), r4(e.c), 0], [r4(e.b), r4(e.c), 0]]));
  const lines: Vec3[][] = [];
  const used = new Set<number>();
  const same = (p: Vec3, q: Vec3) => near(p[0], q[0], 0.03) && near(p[1], q[1], 0.03);
  segs.forEach((s, i) => {
    if (used.has(i)) return;
    used.add(i);
    const line: Vec3[] = [s[0], s[1]];
    let grew = true;
    while (grew) {
      grew = false;
      segs.forEach((t, j) => {
        if (used.has(j)) return;
        if (same(line[line.length - 1], t[0])) { line.push(t[1]); used.add(j); grew = true; }
        else if (same(line[line.length - 1], t[1])) { line.push(t[0]); used.add(j); grew = true; }
        else if (same(line[0], t[1])) { line.unshift(t[0]); used.add(j); grew = true; }
        else if (same(line[0], t[0])) { line.unshift(t[1]); used.add(j); grew = true; }
      });
    }
    lines.push(line);
  });
  return lines.map((points, k) => ({ id: `${lv.id}-rail${k + 1}`, points, height: 0.95, style: 'ss-glass' as const }));
}

/** Steps from the ground up to each outside door (through the portico where there is one). */
function entrySteps(f: ReadFloor & { walls: ReadFloor['walls'] }, lv: Level): Stair[] {
  const out: Stair[] = [];
  const plinth = lv.elevation;
  f.openings.forEach((o) => {
    const w = f.walls[o.wall];
    if (o.kind !== 'door' || !w.exterior) return;
    const mid = (o.from + o.to) / 2, width = Math.max(1.5, o.to - o.from + 0.6);
    const c0 = w.axis === 'h' ? w.rect.y0 : w.rect.x0, c1 = w.axis === 'h' ? w.rect.y1 : w.rect.x1;
    const probe = (c: number): Vec2 => (w.axis === 'h' ? [mid, c] : [c, mid]);
    const outward = f.outside(...probe(c1 + 0.2)) ? 1 : f.outside(...probe(c0 - 0.2)) ? -1 : 0;
    if (!outward) return;
    let face = outward > 0 ? c1 : c0; // where the ground starts
    let drop = plinth; // height still to climb from the ground
    // a portico outside this door: the steps go at its far edge, and it sits one step down already
    const portico = f.rooms.find((r) => (r.type === 'portico' || r.type === 'balcony') && (w.axis === 'h' ? r.rect.x0 <= mid && r.rect.x1 >= mid && (outward > 0 ? near(r.rect.y0, c1, 0.06) : near(r.rect.y1, c0, 0.06)) : r.rect.y0 <= mid && r.rect.y1 >= mid && (outward > 0 ? near(r.rect.x0, c1, 0.06) : near(r.rect.x1, c0, 0.06))));
    if (portico) { face = w.axis === 'h' ? (outward > 0 ? portico.rect.y1 : portico.rect.y0) : outward > 0 ? portico.rect.x1 : portico.rect.x0; drop = plinth - 0.15; }
    const n = Math.max(1, Math.round(drop / 0.15) - 1);
    const steps: StairStep[] = [];
    for (let k = 0; k < n; k++) {
      const top = r4(-(plinth - drop) - (drop / (n + 1)) * (k + 1));
      const a = face + outward * 0.3 * k, b = face + outward * 0.3 * (k + 1);
      steps.push(w.axis === 'h'
        ? { x0: r4(mid - width / 2), x1: r4(mid + width / 2), y0: r4(Math.min(a, b)), y1: r4(Math.max(a, b)), top, kind: 'tread' }
        : { x0: r4(Math.min(a, b)), x1: r4(Math.max(a, b)), y0: r4(mid - width / 2), y1: r4(mid + width / 2), top, kind: 'tread' });
    }
    // walking order is bottom → top: the outermost step first
    steps.reverse();
    out.push({ id: `${lv.id}-entry-steps-${out.length + 1}`, name: o.name ? `${o.name} steps` : 'Entrance steps', steps, riser: 0.15, rails: [], railHeight: 0.9, finish: 'kota-stone' });
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ windows

function addWindows(lv: Level, f: ReadFloor, columns: R[], groups: { r: ReadFloor['rooms'][number]; rects: R[] }[]): number {
  let n = 0;
  const sized: Record<string, { w: number; sill: number; h: number; kind: Opening['kind']; style: Opening['style']; leaf: Opening['leaf']; walls: number } | undefined> = {
    bedroom: { w: 1.5, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 2 },
    hall: { w: 1.2, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 2 },
    living: { w: 1.5, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 2 },
    dining: { w: 1.2, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 1 },
    study: { w: 1.2, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 1 },
    lobby: { w: 1.2, sill: 0.9, h: 1.2, kind: 'window', style: 'casement', leaf: 'double', walls: 1 },
    kitchen: { w: 1.2, sill: 1.05, h: 1.05, kind: 'window', style: 'casement', leaf: 'double', walls: 1 },
    utility: { w: 0.9, sill: 1.05, h: 1.05, kind: 'window', style: 'sliding-alu', leaf: 'sliding', walls: 1 },
    store: { w: 0.6, sill: 1.8, h: 0.45, kind: 'ventilator', style: 'louvre', leaf: 'none', walls: 1 },
    toilet: { w: 0.6, sill: 1.8, h: 0.45, kind: 'ventilator', style: 'louvre', leaf: 'none', walls: 1 },
  };
  groups.forEach((g, k) => {
    const room = g.r;
    const spec = sized[room.type];
    if (!spec) return;
    const options: { wi: number; lo: number; hi: number }[] = [];
    f.walls.forEach((w, wi) => {
      if (!w.exterior) return;
      const b = borders(g.rects[0], w);
      if (!b) return;
      // the stretch of this wall inside the room, clear of corners, openings and columns
      let free: [number, number][] = [[b.a + 0.4, b.b - 0.4]];
      const cut = (a: number, c: number) => { free = free.flatMap(([p, q]): [number, number][] => (c <= p || a >= q ? [[p, q]] : [[p, a], [c, q]])).filter(([p, q]) => q - p > 0.1); };
      for (const o of f.openings) if (o.wall === wi) cut(o.from - 0.3, o.to + 0.3);
      for (const c of columns) if (w.axis === 'h' ? c.y0 <= w.rect.y1 + 0.02 && c.y1 >= w.rect.y0 - 0.02 : c.x0 <= w.rect.x1 + 0.02 && c.x1 >= w.rect.x0 - 0.02) cut((w.axis === 'h' ? c.x0 : c.y0) - 0.12, (w.axis === 'h' ? c.x1 : c.y1) + 0.12);
      for (const [lo, hi] of free) options.push({ wi, lo, hi });
    });
    options.sort((p, q) => q.hi - q.lo - (p.hi - p.lo));
    const usedWalls = new Set<number>();
    for (const o of options) {
      if (usedWalls.size >= spec.walls || usedWalls.has(o.wi)) continue;
      const width = Math.min(spec.w, o.hi - o.lo - 0.1);
      if (width < Math.min(0.6, spec.w)) continue;
      usedWalls.add(o.wi);
      const w = lv.walls[o.wi];
      const start = f.walls[o.wi].axis === 'h' ? w.a[0] : w.a[1];
      n++;
      lv.openings.push({
        id: `${lv.id}-win${n}`, wallId: w.id, kind: spec.kind, at: r4((o.lo + o.hi) / 2 - start), width: r4(width), height: spec.h, sill: spec.sill,
        leaf: spec.leaf, style: spec.style, name: `${lv.rooms[k]?.name ?? room.name} ${spec.kind === 'ventilator' ? 'ventilator' : 'window'}`, assumed: true,
      });
    }
  });
  return n;
}

// ------------------------------------------------------------------------------------------------ site

function plot(f: ReadFloor, lv: Level): HouseSpec['site'] {
  const pts = [...lv.walls.flatMap((w) => [w.a, w.b]), ...lv.rooms.flatMap((r) => r.polygon)];
  if (!pts.length) return undefined;
  let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const doors = f.openings.filter((o) => o.kind === 'door' && f.walls[o.wall].exterior);
  const main = doors.find((o) => /main|entrance|entry/i.test(o.name ?? '')) ?? [...doors].sort((p, q) => q.to - q.from - (p.to - p.from))[0];
  let front: Side = 's', mid = (x0 + x1) / 2;
  if (main) {
    const w = f.walls[main.wall];
    mid = (main.from + main.to) / 2;
    const probe = (c: number): Vec2 => (w.axis === 'h' ? [mid, c] : [c, mid]);
    const plus = f.outside(...probe((w.axis === 'h' ? w.rect.y1 : w.rect.x1) + 0.2));
    front = w.axis === 'h' ? (plus ? 's' : 'n') : plus ? 'e' : 'w';
  }
  const SIDE = 1.5, FRONT = 5.5;
  const hx0 = x0, hx1 = x1, hy0 = y0, hy1 = y1;
  x0 -= front === 'w' ? FRONT : SIDE; x1 += front === 'e' ? FRONT : SIDE; y0 -= front === 'n' ? FRONT : SIDE; y1 += front === 's' ? FRONT : SIDE;
  const half = 1.8;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo + half + 0.3, Math.min(hi - half - 0.3, v));
  let gate: { a: Vec2; b: Vec2 }, paving: Vec2[];
  if (front === 's' || front === 'n') {
    const g = clamp(mid, x0, x1), edge = front === 's' ? y1 : y0, house = front === 's' ? hy1 : hy0;
    gate = { a: [r4(g - half), r4(edge)], b: [r4(g + half), r4(edge)] };
    paving = rectPoly({ x0: g - half, x1: g + half, y0: Math.min(edge, house), y1: Math.max(edge, house) });
  } else {
    const g = clamp(mid, y0, y1), edge = front === 'e' ? x1 : x0, house = front === 'e' ? hx1 : hx0;
    gate = { a: [r4(edge), r4(g - half)], b: [r4(edge), r4(g + half)] };
    paving = rectPoly({ y0: g - half, y1: g + half, x0: Math.min(edge, house), x1: Math.max(edge, house) });
  }
  return { plot: rectPoly({ x0, y0, x1, y1 }), compoundWall: { height: 1.2, thickness: 0.2, gate }, paving: [paving], assumed: true };
}
