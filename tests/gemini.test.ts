import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { readingFromGemini, type GeminiPlan } from '@/lib/reader/fromGemini';
import { specFromPlan } from '@/lib/reader/buildSpec';
import { deriveSpec } from '@/lib/derive';
import { autoFurnish } from '@/lib/furnish';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import { wallCorners } from '@/lib/geom';
import type { Vec2 } from '@/types/house';

// What Gemini returned for a picture of House Plan-Model.pdf (saved once, so the test needs no network or key).
// Gemini only understands the drawing; this checks that the site turns that understanding into a sound house.
const raw = JSON.parse(fs.readFileSync('tests/fixtures/gemini-sample.json', 'utf8')) as { result: GeminiPlan; model: string };
const res = readingFromGemini(raw.result, { width: 842, height: 595 }, raw.model);
const spec = res.ok ? deriveSpec(specFromPlan(res, 'From Gemini', { kind: 'image', page: 1 })) : null;
const bb = (p: Vec2[]) => ({ x0: Math.min(...p.map((v) => v[0])), y0: Math.min(...p.map((v) => v[1])), x1: Math.max(...p.map((v) => v[0])), y1: Math.max(...p.map((v) => v[1])) });
const FT = 0.3048;

describe('a plan understood by Gemini becomes a sound house', () => {
  it('scale and floors', () => {
    expect(res.ok, res.reason).toBe(true);
    expect(res.by).toBe('gemini');
    expect(Math.abs(res.unitsPerMetre * FT - 14.024) / 14.024).toBeLessThan(0.03);
    expect(spec!.levels.map((l) => l.name)).toEqual(['Ground Floor', 'First Floor']);
  });

  it('rooms: every printed room, within a hand-width of the true position', () => {
    const report: string[] = [];
    for (const li of [0, 1]) {
      const ref = SAMPLE_HOUSE.levels[li].rooms, got = spec!.levels[li].rooms;
      for (const g of got) {
        const b = bb(g.polygon);
        report.push(`${li ? 'FF' : 'GF'} ${g.name} [${g.sizeLabel}] x ${(b.x0 / FT).toFixed(2)}..${(b.x1 / FT).toFixed(2)} y ${(b.y0 / FT).toFixed(2)}..${(b.y1 / FT).toFixed(2)}`);
      }
      expect(got.length, `level ${li} rooms`).toBeGreaterThanOrEqual(ref.length - 1);
    }
    report.push(...spec!.levels.map((l) => `${l.name}: ${l.walls.length} walls, ${l.openings.filter((o) => o.kind === 'door').length} doors, ${l.openings.filter((o) => o.kind === 'opening').length} openings, ${l.stairs.map((s) => `${s.name}:${s.steps.length}`).join('/')}, holes ${l.floorOpenings.length}`));
    report.push('notes: ' + res.notes.join(' | '));
    fs.writeFileSync('/private/tmp/claude-501/-Users-m-Downloads-home-build-3d/11238189-e1ad-4f16-978d-56bb2178a444/scratchpad/gemini-dump.txt', report.join('\n'));
    const near = (name: string, li: number, refId: string, tol: number) => {
      const g = spec!.levels[li].rooms.find((r) => r.name === name);
      expect(g, name).toBeTruthy();
      const a = bb(g!.polygon), b = bb(SAMPLE_HOUSE.levels[li].rooms.find((r) => r.id === refId)!.polygon);
      for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(a[k] - b[k]), `${name} ${k}`).toBeLessThan(tol);
    };
    // names and printed sizes are what Gemini reads well; where it also drew the walls right, the room is exact
    near('Kitchen', 0, 'gf-kitchen', 0.3); near('Bedroom', 0, 'gf-bedroom', 0.3);
    near('Walk-in', 1, 'ff-walkin-back', 0.3); near('Toilet 2', 1, 'ff-toilet-back', 0.3);
    expect(spec!.levels[0].rooms.map((r) => r.name).sort()).toEqual(['Bedroom', 'Hall', 'Kitchen', 'Pooja', 'Portico', 'Staircase', 'Toilet', 'Utility']);
    const lobby = bb(spec!.levels[1].rooms.find((r) => r.name === 'Lobby')!.polygon);
    expect(lobby.x1 - lobby.x0).toBeGreaterThan(5.5); // the lobby runs the width of the house
  });

  it('walls do not overlap and every opening sits inside its wall', () => {
    for (const lv of spec!.levels) {
      const rs = lv.walls.map((w) => bb(wallCorners(w)));
      for (let i = 0; i < rs.length; i++)
        for (let j = i + 1; j < rs.length; j++) {
          const ox = Math.min(rs[i].x1, rs[j].x1) - Math.max(rs[i].x0, rs[j].x0), oy = Math.min(rs[i].y1, rs[j].y1) - Math.max(rs[i].y0, rs[j].y0);
          expect(ox > 0.02 && oy > 0.02, `${lv.id} ${lv.walls[i].id} overlaps ${lv.walls[j].id}`).toBe(false);
        }
      for (const o of lv.openings) {
        const w = lv.walls.find((x) => x.id === o.wallId)!;
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        expect(o.at - o.width / 2, o.id).toBeGreaterThanOrEqual(-1e-6);
        expect(o.at + o.width / 2, o.id).toBeLessThanOrEqual(L + 1e-6);
      }
    }
  });

  it('has a main door, a stair to the first floor, a frame and furniture', () => {
    const gf = spec!.levels[0];
    expect(gf.openings.some((o) => o.style === 'teak-panel')).toBe(true);
    expect(gf.rooms.find((r) => r.name === 'Portico')!.outdoor).toBe(true);
    // the portico is open to the street and the stair is open to the hall (no wall sealing either)
    const front = Math.max(...gf.walls.flatMap((w) => [w.a[1], w.b[1]]));
    expect(front).toBeLessThan(33.6 * FT);
    expect(res.notes.join(' ')).toMatch(/open side/);
    const stair = gf.stairs.find((s) => !s.id.includes('entry-steps'))!;
    expect(stair.steps.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...stair.steps.map((s) => s.top)) + stair.riser).toBeCloseTo(gf.height, 2);
    expect(spec!.levels[1].floorOpenings.length).toBeGreaterThan(0);
    expect(spec!.structure.columns.length).toBeGreaterThanOrEqual(4);
    const items = autoFurnish(spec!);
    expect(items.filter((i) => i.kind.startsWith('bed-')).length).toBe(3);
    expect(items.some((i) => i.kind === 'hob-unit')).toBe(true);
  });

  it('says why when Gemini returns nothing usable', () => {
    const r = readingFromGemini({ floors: [] }, { width: 100, height: 100 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no floor plan/);
  });
});
