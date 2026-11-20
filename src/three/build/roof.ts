// Flat roof: RCC slab over the outline, terrace tiles on top, white soffit below (the top storey's ceiling),
// parapet with coping and a couple of rainwater spouts.

import * as THREE from 'three';
import { BatchSet, polyFace, polySides } from '../core/batch';
import { clamp, finite, offsetPoly } from '../core/geo';
import { BAND_OUT, FLOOR_GAP, ringFace } from './floors';
import type { BuildCtx } from './walls';

export function buildRoof(ctx: BuildCtx, wallsGroup: THREE.Group, finishGroup: THREE.Group, rccGroup: THREE.Group, front: [number, number] | null): void {
  const { model, mats } = ctx;
  const outline = model.roofOutline;
  if (outline.length < 3) return;
  const roof = model.spec.roof;
  const top = model.roofTop, soffit = model.roofSoffit;

  // ---- slab
  const rcc = new BatchSet();
  const slabMat = rcc.get(mats.solid('#bdb8ad', 0.85));
  polyFace(slabMat, outline, [], top - FLOOR_GAP, true);
  polySides(slabMat, outline, soffit, top - FLOOR_GAP, true);
  polyFace(rcc.get(mats.ceiling()), outline, [], soffit, false);
  rcc.flush(rccGroup, { name: 'roof-slab', data: { rcc: 'slab' } });

  const fin = new BatchSet();
  const ph = clamp(finite(roof?.parapet?.height, 0), 0, 3);
  const pt = clamp(finite(roof?.parapet?.thickness, 0.15), 0.05, 0.6);
  const inner = ph > 0.05 ? offsetPoly(outline, -pt) : outline;

  // ---- terrace finish
  polyFace(fin.get(mats.finish('terracotta')), inner, [], top, true);

  // ---- slab band on the elevation
  const bb = fin.get(mats.paint(model.spec.exterior?.band ?? '#8a6a4f', false, 0.85));
  const bandOuter = offsetPoly(outline, BAND_OUT);
  polySides(bb, bandOuter, soffit - 0.012, top, true);
  ringFace(bb, bandOuter, outline, top, true);
  ringFace(bb, bandOuter, outline, soffit - 0.012, false);

  // ---- parapet
  if (ph > 0.05) {
    const walls = new BatchSet();
    const pm = walls.get(mats.paint(model.spec.exterior?.wall ?? '#ece5d6', false));
    polySides(pm, outline, top, top + ph, true);
    polySides(pm, inner, top, top + ph, false);
    ringFace(pm, outline, inner, top + ph, true);
    walls.flush(wallsGroup, { name: 'parapet', data: { role: 'wall' } });

    const cop = fin.get(mats.paint('#f7f4ee', false, 0.85));
    const co = offsetPoly(outline, 0.03), ci = offsetPoly(outline, -pt - 0.03);
    polySides(cop, co, top + ph, top + ph + 0.06, true);
    polySides(cop, ci, top + ph, top + ph + 0.06, false);
    ringFace(cop, co, ci, top + ph + 0.06, true);
    ringFace(cop, co, ci, top + ph, false);

    // ---- rainwater spouts on the side facing away from the entrance
    let best = -1, bestScore = -Infinity;
    const n = outline.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = outline[i], b = outline[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      const nx = ((b[1] - a[1]) / len) * sgn, ny = (-(b[0] - a[0]) / len) * sgn;
      const score = len * 0.2 + (front ? -(nx * front[0] + ny * front[1]) * 10 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) {
      const a = outline[best], b = outline[(best + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = ((b[1] - a[1]) / len) * sgn, ny = (-(b[0] - a[0]) / len) * sgn;
      const pipe = fin.get(mats.solid('#55524d', 0.6));
      for (const t of len > 5 ? [0.18, 0.82] : [0.5]) {
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        pipe.rod(null, x - nx * (pt + 0.02), top + 0.07, y - ny * (pt + 0.02), x + nx * 0.22, top + 0.045, y + ny * 0.22, 0.038, 10, true);
      }
    }
  }
  fin.flush(finishGroup, { name: 'roof-finish' });
}
