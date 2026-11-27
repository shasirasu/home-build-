import { describe, expect, it } from 'vitest';
import { CLADDINGS, DEFAULT_STYLE, EXTERIOR_STYLES, LIGHT_KINDS, designOfStyle, resolveExterior } from '@/data/exterior';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import type { ExteriorDesign, HouseSpec } from '@/types/house';
import { buildModel, findMainDoor } from '@/three/build/model';
import { facadeInfo, zoneAt } from '@/three/build/facade';

const withDesign = (design: unknown): Pick<HouseSpec, 'exterior'> => ({ exterior: { ...SAMPLE_HOUSE.exterior, design: design as ExteriorDesign } });

describe('exterior design', () => {
  it('a house without a design gets the default modern style', () => {
    const d = resolveExterior(SAMPLE_HOUSE);
    expect(d.style).toBe(DEFAULT_STYLE);
    expect(d).toEqual(resolveExterior(withDesign(designOfStyle(DEFAULT_STYLE))));
    expect(resolveExterior(null).style).toBe(DEFAULT_STYLE);
  });

  it('every style uses real materials and resolves to itself', () => {
    const ids = new Set(CLADDINGS.map((c) => c.id));
    expect(new Set(EXTERIOR_STYLES.map((s) => s.id)).size).toBe(EXTERIOR_STYLES.length);
    for (const s of EXTERIOR_STYLES) {
      for (const c of Object.values(s.design.zones)) expect(ids.has(c.material), `${s.id}: ${c.material}`).toBe(true);
      expect(s.design.style).toBe(s.id);
      const r = resolveExterior(withDesign(s.design));
      expect(r.zones).toEqual(s.design.zones);
      expect(r.feature).toBe(s.design.feature);
      expect(r.parapet).toBe(s.design.parapet);
      expect(r.lighting.color).toBe(s.design.lighting.color);
      for (const k of LIGHT_KINDS) expect(r.lighting.kinds[k.id]).toBe(!!s.design.lighting.kinds[k.id]);
    }
  });

  it('odd or partial designs are completed, never thrown on', () => {
    const r = resolveExterior(withDesign({
      style: 'no-such-style',
      zones: { ground: { material: 'brick', color: 'not a colour' }, upper: { material: 'unobtainium' }, feature: { material: 'image', image: 'missing' }, plinth: null },
      overhang: 99, parapet: 'lava', windows: 'band',
      lighting: { kinds: { wall: true }, brightness: -4, color: '#12345' },
    }));
    expect(r.style).toBe(EXTERIOR_STYLES[0].id);
    expect(r.zones.ground).toEqual({ material: 'brick', color: CLADDINGS.find((c) => c.id === 'brick')!.color });
    expect(r.zones.upper.material).toBe('paint');
    // a picture that is not in the house falls back to the style's finish
    expect(r.zones.feature).toEqual(designOfStyle(EXTERIOR_STYLES[0].id).zones.feature);
    expect(r.overhang).toBe(1.2);
    expect(r.parapet).toBe(EXTERIOR_STYLES[0].design.parapet);
    expect(r.windows).toBe('band');
    expect(r.lighting.brightness).toBe(0.3);
    expect(r.lighting.color).toBe(EXTERIOR_STYLES[0].design.lighting.color);
    expect(r.lighting.kinds.wall).toBe(true);
    expect(r.lighting.kinds.uplight).toBe(false);
  });

  it("keeps the owner's picture on a surface", () => {
    const d = designOfStyle('warm-minimal');
    d.images = { 'pic-1': { url: 'data:image/jpeg;base64,AAAA', name: 'Mural', aspect: 2 } };
    d.zones.feature = { material: 'image', image: 'pic-1', size: 0.01, fit: 'fit' };
    const r = resolveExterior(withDesign(d));
    expect(r.zones.feature).toEqual({ material: 'image', image: 'pic-1', size: 0.2, fit: 'fit' });
    expect(r.images?.['pic-1'].name).toBe('Mural');
  });

  it('finds the front of the sample house and puts the feature finish on its entrance bay', () => {
    const model = buildModel(SAMPLE_HOUSE);
    const door = findMainDoor(model);
    expect(door).not.toBeNull();
    const s = door!.outSide || 1;
    const front: [number, number] = [door!.wall.nx * s, door!.wall.ny * s];
    // the entrance and portico face down the drawing (+y)
    expect(front[1]).toBeGreaterThan(0.99);
    const f = facadeInfo(model, door, front);
    expect(f.design.style).toBe(DEFAULT_STYLE);
    expect(f.design.feature).toBe('entrance');
    expect(f.bay).not.toBeNull();
    const [l0, l1] = f.bay!;
    expect(l1 - l0).toBeGreaterThan(1.8);
    const mid = (l0 + l1) / 2;
    // lat runs along the front: a point at the middle of the bay on the front face
    const px = f.lat[0] * mid, py = f.lat[1] * mid;
    expect(zoneAt(f, 1, 0, 1, px, py)).toBe('feature');
    expect(zoneAt(f, 0, 0, 1, px, py)).toBe('feature');
    // the back and the sides take the storey finishes
    expect(zoneAt(f, 0, 0, -1, px, py)).toBe('ground');
    expect(zoneAt(f, 1, 1, 0, px, py)).toBe('upper');
    // outside the bay on the front
    const out = f.span[0] + 0.05 < l0 ? f.span[0] + 0.05 : f.span[1] - 0.05;
    expect(zoneAt(f, 1, 0, 1, f.lat[0] * out, f.lat[1] * out)).toBe('upper');
  });
});
