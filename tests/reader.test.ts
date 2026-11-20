import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPrims } from '@/lib/reader/extract';
import { readPlan, parseDim, parseSize, type ReadResult } from '@/lib/reader/readPlan';
import { specFromPlan } from '@/lib/reader/buildSpec';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import type { HouseSpec, Level, Opening, Vec2 } from '@/types/house';
import { polygonArea, wallCorners } from '@/lib/geom';

// The plan reader must rebuild the sample house from the PDF alone. SAMPLE_HOUSE is the hand-checked reference.

const FT = 0.3048;
let res: ReadResult;
let spec: HouseSpec;

beforeAll(async () => {
  const data = new Uint8Array(fs.readFileSync('public/plans/house-plan-model.pdf'));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const prims = await extractPrims((await doc.getPage(1)) as never, pdfjs.OPS as never);
  res = readPlan(prims);
  spec = specFromPlan(res, 'Read from PDF', { kind: 'pdf', page: 1 });
});

const bboxOf = (p: Vec2[]) => ({ x0: Math.min(...p.map((v) => v[0])), y0: Math.min(...p.map((v) => v[1])), x1: Math.max(...p.map((v) => v[0])), y1: Math.max(...p.map((v) => v[1])) });
const centreOf = (lv: Level, o: Opening): Vec2 => {
  const w = lv.walls.find((x) => x.id === o.wallId)!;
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return [w.a[0] + ((w.b[0] - w.a[0]) * o.at) / L, w.a[1] + ((w.b[1] - w.a[1]) * o.at) / L];
};
/** Share of grid cells where two wall sets disagree, relative to the reference's wall area. */
function wallMismatch(a: Level, b: Level): number {
  const cell = 0.025, W = 7, D = 11.2;
  const nx = Math.ceil(W / cell), ny = Math.ceil(D / cell);
  const paint = (lv: Level) => {
    const g = new Uint8Array(nx * ny);
    for (const w of lv.walls) {
      const r = bboxOf(wallCorners(w));
      for (let j = Math.max(0, Math.round(r.y0 / cell)); j < Math.min(ny, Math.round(r.y1 / cell)); j++)
        for (let i = Math.max(0, Math.round(r.x0 / cell)); i < Math.min(nx, Math.round(r.x1 / cell)); i++) g[j * nx + i] = 1;
    }
    return g;
  };
  const ga = paint(a), gb = paint(b);
  let diff = 0, ref = 0;
  for (let k = 0; k < ga.length; k++) { if (ga[k] !== gb[k]) diff++; if (ga[k]) ref++; }
  return diff / ref;
}

describe('text parsing', () => {
  it('reads sizes the way plans write them, typos included', () => {
    expect(parseDim(`22'`, true)).toBeCloseTo(22 * FT, 6);
    expect(parseDim(`11'9"`, true)).toBeCloseTo(11.75 * FT, 6);
    expect(parseDim(`9.'9"'`, true)).toBeCloseTo(9.75 * FT, 6);
    expect(parseSize(`9.'9"'x12'`, true)!.map((v) => +(v / FT).toFixed(2))).toEqual([9.75, 12]);
    expect(parseSize(`20'6"x9'`, true)!.map((v) => +(v / FT).toFixed(2))).toEqual([20.5, 9]);
    expect(parseDim('3000', false)).toBe(3);
    expect(parseDim('KITCHEN', true)).toBeNull();
  });
});

describe('plan reader rebuilds the sample from the PDF alone', () => {
  it('finds the scale, north and both floors', () => {
    expect(res.ok).toBe(true);
    expect(res.unitsPerMetre * FT).toBeCloseTo(14.024, 1);
    expect(res.scaleSource).toBe('dimension');
    expect(res.north).toEqual([0, 1]);
    expect(spec.levels.map((l) => l.name)).toEqual(['Ground Floor', 'First Floor']);
    expect(spec.underlay!.frames.gf.origin.map((v) => +v.toFixed(1))).toEqual([460.2, 45.2]);
    expect(spec.underlay!.frames.ff.origin.map((v) => +v.toFixed(1))).toEqual([71, 45.2]);
  });

  it('walls cover the same ground as the hand-checked walls (within 1.5%)', () => {
    expect(wallMismatch(SAMPLE_HOUSE.levels[0], spec.levels[0])).toBeLessThan(0.015);
    expect(wallMismatch(SAMPLE_HOUSE.levels[1], spec.levels[1])).toBeLessThan(0.015);
  });

  it('no two walls overlap', () => {
    for (const lv of spec.levels) {
      const rs = lv.walls.map((w) => bboxOf(wallCorners(w)));
      for (let i = 0; i < rs.length; i++)
        for (let j = i + 1; j < rs.length; j++) {
          const ox = Math.min(rs[i].x1, rs[j].x1) - Math.max(rs[i].x0, rs[j].x0), oy = Math.min(rs[i].y1, rs[j].y1) - Math.max(rs[i].y0, rs[j].y0);
          expect(ox > 0.004 && oy > 0.004, `${lv.id} ${lv.walls[i].id} overlaps ${lv.walls[j].id}`).toBe(false);
        }
    }
  });

  it('every opening drawn on the plan is found, same place, same kind', () => {
    for (const li of [0, 1]) {
      const ref = SAMPLE_HOUSE.levels[li], got = spec.levels[li];
      const drawn = ref.openings.filter((o) => o.kind === 'door' || o.kind === 'opening');
      for (const o of drawn) {
        const c = centreOf(ref, o);
        const m = got.openings.find((g) => { const gc = centreOf(got, g); return Math.hypot(gc[0] - c[0], gc[1] - c[1]) < 0.04; });
        expect(m, `${o.id} not found`).toBeTruthy();
        expect(m!.kind, o.id).toBe(o.kind);
        expect(Math.abs(m!.width - o.width), o.id).toBeLessThan(0.03);
        expect(m!.leaf, o.id).toBe(o.leaf);
        if (o.kind === 'door') expect(m!.swing, `${o.id} swing`).toBe(o.swing);
        if (o.leaf === 'single' && !o.assumed) expect(m!.hinge, `${o.id} hinge`).toBe(o.hinge);
      }
      expect(got.openings.filter((g) => g.kind === 'door' || g.kind === 'opening').length, `level ${li} count`).toBe(drawn.length);
    }
    const main = spec.levels[0].openings.find((o) => o.style === 'teak-panel')!;
    expect(main.name).toBe('Main Entrance');
    expect(spec.levels[0].openings.find((o) => o.name === 'Back Door')?.style).toBe('steel');
    expect(spec.levels[0].openings.find((o) => o.style === 'pvc')?.assumed).toBe(true);
  });

  it('rooms have the right names and the sizes printed on the plan', () => {
    const got = (li: number, name: string) => spec.levels[li].rooms.find((r) => r.name === name)!;
    const same = (li: number, name: string, refId: string) => {
      const a = bboxOf(got(li, name).polygon), b = bboxOf(SAMPLE_HOUSE.levels[li].rooms.find((r) => r.id === refId)!.polygon);
      for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(a[k] - b[k]), `${name} ${k}`).toBeLessThan(0.02);
    };
    same(0, 'Kitchen', 'gf-kitchen'); same(0, 'Bedroom', 'gf-bedroom'); same(0, 'Hall', 'gf-hall'); same(0, 'Staircase', 'gf-stair');
    same(0, 'Pooja', 'gf-pooja'); same(0, 'Toilet', 'gf-toilet'); same(0, 'Utility', 'gf-utility'); same(0, 'Portico', 'gf-portico');
    same(1, 'Walk-in', 'ff-walkin-back'); same(1, 'Toilet 2', 'ff-toilet-back'); same(1, 'Walk-in 2', 'ff-walkin-front'); same(1, 'Toilet 3', 'ff-toilet-front');
    // the entry area printed as 4'5"x3'5" has no wall to its bedroom, so each bedroom is read as one L-shaped room
    const l = (id: string) => polygonArea(SAMPLE_HOUSE.levels[1].rooms.find((r) => r.id === id)!.polygon);
    expect(got(1, 'Bedroom 2').polygon.length).toBe(6);
    expect(polygonArea(got(1, 'Bedroom 2').polygon)).toBeCloseTo(l('ff-bed-back'), 1);
    expect(polygonArea(got(1, 'Bedroom 3').polygon)).toBeCloseTo(l('ff-bed-front'), 1);
    expect(spec.levels[1].rooms.map((r) => r.name).sort()).toEqual(['Bedroom 2', 'Bedroom 3', 'Lobby', 'Toilet 2', 'Toilet 3', 'Walk-in', 'Walk-in 2']);
    expect(spec.levels[1].openings.filter((o) => o.kind === 'door' && o.style === 'flush').map((o) => o.name).sort()).toEqual(['Bedroom 2 door', 'Bedroom 3 door']);
    expect(got(0, 'Hall').sizeLabel).toBe(`16'1"x18'9"`);
    expect(got(0, 'Portico').outdoor).toBe(true);
    expect(got(0, 'Toilet').dado).toBeTruthy();
  });

  it('the stair has the same 17 steps in the same order, rising 18 risers', () => {
    const ref = SAMPLE_HOUSE.levels[0].stairs[0], got = spec.levels[0].stairs[0];
    expect(got.steps.length).toBe(17);
    got.steps.forEach((s, i) => {
      const r = ref.steps[i];
      expect(s.kind, `step ${i}`).toBe(r.kind);
      expect(Math.abs(s.top - r.top), `step ${i} top`).toBeLessThan(0.002);
      for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(s[k] - r[k]), `step ${i} ${k}`).toBeLessThan(0.02);
    });
    expect(got.rails.length).toBe(1);
    got.rails[0].forEach((p, i) => p.forEach((v, k) => expect(Math.abs(v - ref.rails[0][i][k]), `rail ${i}.${k}`).toBeLessThan(0.02)));
  });

  it('the first floor has the stairwell and its railing, not a second stair', () => {
    const ff = spec.levels[1];
    expect(ff.stairs.length).toBe(0);
    const hole = ff.floorOpenings.reduce((s, p) => s + polygonArea(p), 0);
    expect(hole).toBeCloseTo(polygonArea(SAMPLE_HOUSE.levels[1].floorOpenings[0]), 1);
    expect(ff.railings.length).toBe(1);
    const pts = ff.railings[0].points, ref = SAMPLE_HOUSE.levels[1].railings[0].points;
    expect(pts.length).toBe(3);
    const ordered = Math.hypot(pts[0][0] - ref[0][0], pts[0][1] - ref[0][1]) < 0.05 ? pts : [...pts].reverse();
    ordered.forEach((p, i) => { expect(Math.abs(p[0] - ref[i][0])).toBeLessThan(0.02); expect(Math.abs(p[1] - ref[i][1])).toBeLessThan(0.02); });
  });

  it('columns, entry step and assumed windows', () => {
    expect(spec.structure.columns.length).toBe(12);
    expect(spec.structure.fromPlan).toBe(true);
    for (const c of SAMPLE_HOUSE.structure.columns) expect(spec.structure.columns.some((g) => Math.hypot(g.x - c.x, g.y - c.y) < 0.02), c.id).toBe(true);
    expect(spec.structure.beams.filter((b) => b.kind === 'roof').length).toBeGreaterThanOrEqual(10);
    const entries = spec.levels[0].stairs.filter((s) => s.id.includes('entry-steps'));
    expect(entries.map((s) => s.name).sort()).toEqual(['Back Door steps', 'Main Entrance steps']);
    expect(entries.find((s) => s.name.startsWith('Main'))!.steps.map((s) => +s.top.toFixed(2))).toEqual([-0.3]); // one step below the portico
    expect(entries.find((s) => s.name.startsWith('Back'))!.steps.map((s) => +s.top.toFixed(2))).toEqual([-0.3, -0.15]); // two steps up to the back door
    const wins = spec.levels.flatMap((l) => l.openings.filter((o) => o.kind === 'window' || o.kind === 'ventilator'));
    expect(wins.length).toBeGreaterThanOrEqual(10);
    expect(wins.every((o) => o.assumed)).toBe(true);
    for (const lv of spec.levels) for (const o of lv.openings) {
      const w = lv.walls.find((x) => x.id === o.wallId)!;
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      expect(o.at - o.width / 2, o.id).toBeGreaterThanOrEqual(-1e-6);
      expect(o.at + o.width / 2, o.id).toBeLessThanOrEqual(L + 1e-6);
    }
  });
});

describe('automatic furnishing of the house read from the PDF', () => {
  it('furnishes every room type without blocking doors or overlapping', async () => {
    const { autoFurnish, mainRect } = await import('@/lib/furnish');
    const { catalogByKind } = await import('@/data/catalog');
    const items = autoFurnish(spec);
    const rooms = spec.levels.flatMap((l) => l.rooms.map((r) => ({ ...r, levelId: l.id })));
    const inRoom = (id: string) => items.filter((i) => i.roomId === id).map((i) => i.kind);
    expect(items.length).toBeGreaterThan(45);
    for (const r of rooms) {
      const k = inRoom(r.id);
      if (r.type === 'bedroom') { expect(k.some((x) => x.startsWith('bed-')), `${r.name} bed`).toBe(true); expect(k.some((x) => x.startsWith('wardrobe')), `${r.name} wardrobe`).toBe(true); }
      if (r.type === 'kitchen') { expect(k, r.name).toContain('hob-unit'); expect(k, r.name).toContain('kitchen-sink-unit'); expect(k, r.name).toContain('refrigerator'); }
      if (r.type === 'toilet') { expect(k, r.name).toContain('wc'); expect(k, r.name).toContain('washbasin'); }
      if (r.type === 'hall') { expect(k.some((x) => x.startsWith('sofa')), 'hall sofa').toBe(true); expect(k, 'hall dining').toContain('dining-set-4'); expect(k, 'hall tv').toContain('tv-unit'); }
      if (r.type === 'utility') expect(k, r.name).toContain('washing-machine');
      if (r.type === 'pooja') expect(k, r.name).toContain('pooja-mandir');
      if (r.type === 'portico') expect(k.filter((x) => x === 'plant-outdoor').length, 'portico planters').toBe(2);
      if (r.type === 'walkin') expect(k.some((x) => x.startsWith('wardrobe')), r.name).toBe(true);
    }
    // footprints: inside their room, and floor pieces never overlap each other
    const fp = (i: (typeof items)[number]) => {
      const q = Math.abs(Math.round(i.rot / (Math.PI / 2))) % 2 === 1;
      const w = q ? i.d : i.w, d = q ? i.w : i.d;
      return { x0: i.x - w / 2, x1: i.x + w / 2, y0: i.y - d / 2, y1: i.y + d / 2 };
    };
    for (const it of items) {
      const room = rooms.find((r) => r.id === it.roomId)!;
      const b = mainRect(room.polygon), f = fp(it);
      expect(f.x0 >= b.x0 - 0.02 && f.x1 <= b.x1 + 0.02 && f.y0 >= b.y0 - 0.02 && f.y1 <= b.y1 + 0.02, `${it.kind} inside ${room.name}`).toBe(true);
    }
    const solid = items.filter((i) => catalogByKind(i.kind)!.mount === 'floor' && i.kind !== 'rug');
    for (let a = 0; a < solid.length; a++)
      for (let b = a + 1; b < solid.length; b++) {
        if (solid[a].levelId !== solid[b].levelId) continue;
        const p = fp(solid[a]), q = fp(solid[b]);
        const over = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.03 && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > 0.03;
        expect(over, `${solid[a].kind} overlaps ${solid[b].kind} in ${solid[a].roomId}`).toBe(false);
      }
    // nothing stands in a doorway
    for (const lv of spec.levels)
      for (const o of lv.openings.filter((x) => x.kind === 'door' || x.kind === 'opening')) {
        const c = centreOf(lv, o);
        for (const it of solid.filter((i) => i.levelId === lv.id)) {
          const f = fp(it);
          expect(c[0] > f.x0 && c[0] < f.x1 && c[1] > f.y0 && c[1] < f.y1, `${it.kind} blocks ${o.name}`).toBe(false);
        }
      }
  });
});
