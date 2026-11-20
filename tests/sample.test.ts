import { describe, expect, it } from 'vitest';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import { SAMPLE_FURNISHING } from '@/data/sampleFurnishing';
import { computeQuantities } from '@/lib/quantities';
import { polygonArea, wallLength, pointInPolygon } from '@/lib/geom';
import { catalogByKind } from '@/data/catalog';
import { feetInches, parseLen } from '@/lib/units';

const SQFT = 0.3048 ** 2;

describe('sample house matches the drawing', () => {
  it('footprints: 22x33 ground floor body, 22x36 first floor', () => {
    expect(polygonArea(SAMPLE_HOUSE.levels[0].footprint) / SQFT).toBeCloseTo(22 * 32.996, 0);
    expect(polygonArea(SAMPLE_HOUSE.levels[1].footprint) / SQFT).toBeCloseTo(22 * 36, 0);
  });
  it('room sizes match the labels on the plan', () => {
    const r = (id: string) => SAMPLE_HOUSE.levels.flatMap((l) => l.rooms).find((x) => x.id === id)!;
    const dims = (id: string) => { const p = r(id).polygon; const xs = p.map((v) => v[0]), ys = p.map((v) => v[1]); return [(Math.max(...xs) - Math.min(...xs)) / 0.3048, (Math.max(...ys) - Math.min(...ys)) / 0.3048]; };
    expect(dims('gf-kitchen').map((v) => +v.toFixed(1))).toEqual([10, 12]);
    expect(dims('gf-bedroom').map((v) => +v.toFixed(2))).toEqual([9.75, 12]);
    expect(dims('gf-pooja').map((v) => +v.toFixed(1))).toEqual([4, 5]);
    expect(dims('gf-toilet').map((v) => +v.toFixed(1))).toEqual([4, 7]);
    expect(dims('gf-utility').map((v) => +v.toFixed(1))).toEqual([4, 6]);
    expect(dims('ff-toilet-back').map((v) => +v.toFixed(1))).toEqual([4, 12]);
    expect(dims('ff-walkin-back').map((v) => +v.toFixed(2))).toEqual([4, 8.21]);
  });
  it('every opening fits inside its wall', () => {
    for (const lv of SAMPLE_HOUSE.levels)
      for (const o of lv.openings) {
        const w = lv.walls.find((x) => x.id === o.wallId)!;
        expect(w, o.id).toBeTruthy();
        expect(o.at - o.width / 2, o.id).toBeGreaterThanOrEqual(-1e-6);
        expect(o.at + o.width / 2, o.id).toBeLessThanOrEqual(wallLength(w) + 1e-6);
      }
  });
  it('stair rises 18 risers to the first floor', () => {
    const st = SAMPLE_HOUSE.levels[0].stairs[0];
    const top = Math.max(...st.steps.map((s) => s.top));
    expect(top + st.riser).toBeCloseTo(SAMPLE_HOUSE.levels[1].elevation - SAMPLE_HOUSE.levels[0].elevation, 3);
    expect(st.steps.length).toBe(17);
  });
  it('every furnishing item is a catalog kind and sits in its room', () => {
    for (const it of SAMPLE_FURNISHING) {
      expect(catalogByKind(it.kind), it.kind).toBeTruthy();
      if (!it.roomId) continue;
      const room = SAMPLE_HOUSE.levels.find((l) => l.id === it.levelId)!.rooms.find((r) => r.id === it.roomId)!;
      expect(pointInPolygon([it.x, it.y], room.polygon), `${it.uid} in ${it.roomId}`).toBe(true);
    }
  });
});

describe('quantities', () => {
  it('produces sane totals for the sample', () => {
    const q = computeQuantities(SAMPLE_HOUSE, SAMPLE_FURNISHING);
    console.log(JSON.stringify({ levels: q.levels.map((l) => [l.short, Math.round(l.builtUp / SQFT), Math.round(l.carpet / SQFT)]), concrete: q.concrete, masonry: q.masonry, plaster: q.plaster, materials: q.materials.map((m) => [m.item, m.qty, m.unit, Math.round(m.amount)]), counts: q.counts, schedule: q.schedule.map((s) => [s.kind, s.style, s.count]) }, null, 1));
    expect(q.concrete.total).toBeGreaterThan(20);
    expect(q.concrete.total).toBeLessThan(60);
    expect(q.masonry.bricks).toBeGreaterThan(15000);
    expect(q.masonry.bricks).toBeLessThan(60000);
    expect(q.counts.doors).toBe(8);
  });
});

describe('units', () => {
  it('formats and parses feet-inches', () => {
    expect(feetInches(11.75 * 0.3048)).toBe(`11'9"`);
    expect(parseLen(`11'9"`, 'ft')).toBeCloseTo(11.75 * 0.3048, 6);
    expect(parseLen('3.5m', 'ft')).toBe(3.5);
    expect(parseLen('22', 'ft')).toBeCloseTo(22 * 0.3048, 6);
  });
});

describe('member sections read as built sizes', () => {
  it('9 inch columns and 9x15 beams', async () => {
    const { fmtSection } = await import('@/lib/units');
    const c = SAMPLE_HOUSE.structure.columns[0];
    expect(fmtSection(c.w, c.d, 'ft')).toBe('9″ × 9″');
    expect(fmtSection(c.w, c.d, 'm')).toBe('230 × 230 mm');
    const b = SAMPLE_HOUSE.structure.beams.find((x) => x.kind === 'floor')!;
    expect(fmtSection(b.width, b.depth, 'ft')).toBe('9″ × 15″');
  });
});
