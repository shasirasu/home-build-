import { describe, expect, it } from 'vitest';
import { deriveSpec, newSpec, straightStair } from '@/lib/derive';
import type { Wall } from '@/types/house';

const w = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, a, b, thickness: 0.23, kind: 'exterior' });

describe('derive a traced plan', () => {
  it('fills footprint, roof, frame and stair holes', () => {
    const s = newSpec('Test', 2);
    s.levels[0].walls = [w('n', [0, 0], [8, 0]), w('e', [8, 0], [8, 10]), w('s', [8, 10], [0, 10]), w('w', [0, 10], [0, 0])];
    s.levels[1].walls = s.levels[0].walls.map((x) => ({ ...x, id: x.id + '1' }));
    s.levels[0].stairs = [straightStair('st', 1, 2, 2, 6, s.levels[0].height, 'n')];
    const d = deriveSpec(s);
    expect(d.levels[0].footprint).toHaveLength(4);
    expect(d.levels[1].elevation).toBeCloseTo(d.levels[0].elevation + d.levels[0].height, 6);
    expect(d.roof.elevation).toBeCloseTo(d.levels[1].elevation + d.levels[1].height, 6);
    expect(d.levels[1].floorOpenings).toHaveLength(1);
    expect(d.structure.columns.length).toBeGreaterThanOrEqual(4);
    expect(d.structure.beams.some((b) => b.kind === 'roof')).toBe(true);
  });
  it('a straight stair rises to the floor above', () => {
    const st = straightStair('s', 0, 0, 1, 4, 3.048, 's');
    const top = Math.max(...st.steps.map((x) => x.top));
    expect(top + st.riser).toBeCloseTo(3.048, 4);
    expect(st.riser).toBeLessThan(0.19);
    expect(st.steps[0].y0).toBe(0); // rises toward +y
  });
});
