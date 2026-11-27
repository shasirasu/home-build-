// Flat roof: RCC slab over the outline, terrace tiles on top, white soffit below (the top storey's ceiling), the
// slab edge (a band, or a projecting overhang), and the parapet. The parapet is built edge by edge so the front
// can be glass or a steel rail while the other sides stay solid.

import * as THREE from 'three';
import type { Vec2 } from '@/types/house';
import { BatchSet, polyFace, polySides, type P3 } from '../core/batch';
import { clamp, finite, offsetPoly, signedArea } from '../core/geo';
import { accentMaterial, isFront, zoneAt, zoneCladding } from './facade';
import { BAND_OUT, FLOOR_GAP, ringFace } from './floors';
import type { BuildCtx } from './walls';

export function buildRoof(ctx: BuildCtx, wallsGroup: THREE.Group, finishGroup: THREE.Group, rccGroup: THREE.Group, front: [number, number] | null): void {
  const { model, mats, facade } = ctx;
  const outline = model.roofOutline;
  if (outline.length < 3) return;
  const roof = model.spec.roof;
  const d = facade.design;
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

  // ---- terrace finish: terracotta tiles on the traditional house, a quiet light tile on the modern ones
  polyFace(fin.get(mats.finish(facade.traditional ? 'terracotta' : 'anti-skid')), inner, [], top, true);

  // ---- slab edge on the elevation: a thin band, or the slab carried out past the walls
  const bb = fin.get(mats.cladding(zoneCladding(facade, 'band'), facade.images, false));
  const over = clamp(finite(d.overhang, 0), 0, 1.2);
  if (over > 0.02) {
    const outer = offsetPoly(outline, over);
    const y0 = Math.max(soffit, top - 0.12);
    polySides(bb, outer, y0, top, true);
    ringFace(bb, outer, outline, top, true);
    ringFace(fin.get(mats.ceiling()), outer, outline, y0, false);
  } else {
    const bandOuter = offsetPoly(outline, BAND_OUT);
    polySides(bb, bandOuter, soffit - 0.012, top, true);
    ringFace(bb, bandOuter, outline, top, true);
    ringFace(bb, bandOuter, outline, soffit - 0.012, false);
  }

  // ---- parapet
  if (ph > 0.05) {
    const n = outline.length;
    const sgn = signedArea(outline) >= 0 ? 1 : -1;
    const walls = new BatchSet();
    const topLevel = model.levels.length - 1;
    const parapetMat = mats.cladding(zoneCladding(facade, 'parapet'), facade.images, false);
    // a picture stretched over the wall belongs on the outside face only
    const innerMat = parapetMat.userData.fit ? mats.paint('#f3f1ec', false) : parapetMat;
    const bandMat = mats.cladding(zoneCladding(facade, 'band'), facade.images, false);
    const kerbMat = bandMat.userData.fit ? mats.paint('#f3f1ec', false) : bandMat;
    const copMat = facade.traditional ? mats.paint('#f7f4ee', false, 0.85) : accentMaterial(facade, mats);
    const copH = facade.traditional ? 0.06 : 0.03, copOut = facade.traditional ? 0.03 : 0.012;
    const co = offsetPoly(outline, copOut), ci = offsetPoly(outline, -pt - copOut);
    const edges = outline.map((a, i) => {
      const b = outline[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = len > 1e-6 ? ((b[1] - a[1]) / len) * sgn : 0, ny = len > 1e-6 ? (-(b[0] - a[0]) / len) * sgn : 0;
      const open = d.parapet !== 'solid' && len > 1.2 && isFront(facade, nx, ny);
      return { a, b, ia: inner[i], ib: inner[(i + 1) % n], len, nx, ny, kind: open ? d.parapet : 'solid' as const };
    });
    const V = (p: Vec2, y: number): P3 => [p[0], y, p[1]];
    let run = 0;
    edges.forEach((e, i) => {
      if (e.len < 1e-6) return;
      const { a, b, ia, ib, nx, ny } = e;
      const solid = e.kind === 'solid';
      // an open edge keeps a low kerb so the glass or rail stands on something
      const h = solid ? ph : 0.1;
      const y1 = top + h;
      // outside face: the parapet finish, or the feature finish where the front carries it up
      const segs: [number, number][] = [[0, 1]];
      // (not past a projecting roof slab: that cuts the wall off, and the parapet above it is its own thing)
      const carry = over <= 0.02;
      const bay = carry && d.feature === 'entrance' ? facade.bay : null;
      if (bay && isFront(facade, nx, ny)) {
        const la = facade.lat[0] * a[0] + facade.lat[1] * a[1], lb = facade.lat[0] * b[0] + facade.lat[1] * b[1];
        if (Math.abs(lb - la) > 0.2) {
          const ts = bay.map((l) => (l - la) / (lb - la)).filter((t) => t > 0.01 && t < 0.99).sort((x, y) => x - y);
          segs.length = 0;
          let t0 = 0;
          for (const t of [...ts, 1]) { segs.push([t0, t]); t0 = t; }
        }
      }
      for (const [t0, t1] of segs) {
        const p0: Vec2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1: Vec2 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
        const zone = zoneAt(facade, topLevel, nx, ny, mx, my);
        // (the low kerb under glass or a rail is part of the slab edge, whatever the wall below it is finished in)
        const mat = !solid ? kerbMat : carry && zone === 'feature' ? mats.cladding(zoneCladding(facade, 'feature'), facade.images, false) : parapetMat;
        const u0 = run + e.len * t0, u1 = run + e.len * t1;
        const uv = mat.userData.fit ? [t0, top / facade.height, t1, top / facade.height, t1, y1 / facade.height, t0, y1 / facade.height] : [u0, top, u1, top, u1, y1, u0, y1];
        walls.get(mat).quad(V(p0, top), V(p1, top), V(p1, y1), V(p0, y1), [nx, 0, ny], uv);
      }
      const pm = walls.get(solid ? innerMat : kerbMat);
      pm.quad(V(ia, top), V(ib, top), V(ib, y1), V(ia, y1), [-nx, 0, -ny], [run, top, run + e.len, top, run + e.len, y1, run, y1]);
      pm.quad(V(a, y1), V(b, y1), V(ib, y1), V(ia, y1), [0, 1, 0]);
      // where a full-height stretch meets a kerb, close its end
      const prev = edges[(i + n - 1) % n], next = edges[(i + 1) % n];
      if (solid && prev.kind !== 'solid') pm.quad(V(a, top + 0.1), V(ia, top + 0.1), V(ia, y1), V(a, y1), [-(b[0] - a[0]), 0, -(b[1] - a[1])]);
      if (solid && next.kind !== 'solid') pm.quad(V(b, top + 0.1), V(ib, top + 0.1), V(ib, y1), V(b, y1), [b[0] - a[0], 0, b[1] - a[1]]);
      run += e.len;

      if (solid) {
        // coping
        const cop = fin.get(copMat);
        const oa = co[i], ob = co[(i + 1) % n], qa = ci[i], qb = ci[(i + 1) % n];
        cop.quad(V(oa, y1), V(ob, y1), V(ob, y1 + copH), V(oa, y1 + copH), [nx, 0, ny]);
        cop.quad(V(qa, y1), V(qb, y1), V(qb, y1 + copH), V(qa, y1 + copH), [-nx, 0, -ny]);
        cop.quad(V(oa, y1 + copH), V(ob, y1 + copH), V(qb, y1 + copH), V(qa, y1 + copH), [0, 1, 0]);
        cop.quad(V(oa, y1), V(ob, y1), V(qb, y1), V(qa, y1), [0, -1, 0]);
        if (prev.kind !== 'solid') cop.quad(V(oa, y1), V(qa, y1), V(qa, y1 + copH), V(oa, y1 + copH), [-(b[0] - a[0]), 0, -(b[1] - a[1])]);
        if (next.kind !== 'solid') cop.quad(V(ob, y1), V(qb, y1), V(qb, y1 + copH), V(ob, y1 + copH), [b[0] - a[0], 0, b[1] - a[1]]);
        return;
      }

      // ---- glass or rail along the centre of the kerb
      const ca: Vec2 = [(a[0] + ia[0]) / 2, (a[1] + ia[1]) / 2], cb: Vec2 = [(b[0] + ib[0]) / 2, (b[1] + ib[1]) / 2];
      const cl = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]);
      if (cl < 0.5) return;
      const ux = (cb[0] - ca[0]) / cl, uy = (cb[1] - ca[1]) / cl;
      const M = new THREE.Matrix4().makeRotationY(Math.atan2(-uy, ux)).setPosition(ca[0], 0, ca[1]);
      const e0 = 0.06, e1 = cl - 0.06, yTop = top + ph;
      if (e.kind === 'glass') {
        const bays = Math.max(1, Math.round((e1 - e0) / 1.3));
        const bw = (e1 - e0) / bays;
        const gl = fin.get(mats.glass(false));
        const steel = fin.get(mats.steel());
        for (let k = 0; k < bays; k++) {
          const x0 = e0 + k * bw + 0.012, x1 = e0 + (k + 1) * bw - 0.012;
          gl.box(M, (x0 + x1) / 2, (y1 + yTop) / 2, 0, x1 - x0, yTop - y1, 0.012);
          // a pair of spigots under each pane
          for (const x of [x0 + Math.min(0.22, (x1 - x0) / 4), x1 - Math.min(0.22, (x1 - x0) / 4)]) steel.box(M, x, y1 + 0.07, 0, 0.05, 0.14, 0.05, -1, 'y-');
        }
        steel.box(M, (e0 + e1) / 2, yTop + 0.012, 0, e1 - e0 + 0.04, 0.024, 0.045);
      } else {
        const ms = fin.get(accentMaterial(facade, mats));
        const posts = Math.max(1, Math.round((e1 - e0) / 1.25));
        for (let k = 0; k <= posts; k++) ms.box(M, e0 + ((e1 - e0) * k) / posts, (y1 + yTop) / 2, 0, 0.04, yTop - y1, 0.04, -1, 'y-');
        ms.box(M, (e0 + e1) / 2, yTop + 0.015, 0, e1 - e0 + 0.06, 0.03, 0.06);
        const bars = Math.max(2, Math.round((yTop - y1) / 0.16) - 1);
        for (let k = 1; k <= bars; k++) ms.box(M, (e0 + e1) / 2, y1 + ((yTop - y1) * k) / (bars + 1), 0, e1 - e0, 0.016, 0.016, -1, 'x+x-');
      }
    });
    walls.flush(wallsGroup, { name: 'parapet', data: { role: 'wall' } });

    // ---- rainwater spouts on the side facing away from the entrance (the modern styles keep the pipes inside)
    if (facade.traditional) {
      let best = -1, bestScore = -Infinity;
      edges.forEach((e, i) => {
        if (e.len < 1) return;
        const score = e.len * 0.2 + (front ? -(e.nx * front[0] + e.ny * front[1]) * 10 : 0);
        if (score > bestScore) { bestScore = score; best = i; }
      });
      if (best >= 0) {
        const { a, b, len, nx, ny } = edges[best];
        const pipe = fin.get(mats.solid('#55524d', 0.6));
        for (const t of len > 5 ? [0.18, 0.82] : [0.5]) {
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          pipe.rod(null, x - nx * (pt + 0.02), top + 0.07, y - ny * (pt + 0.02), x + nx * 0.22, top + 0.045, y + ny * 0.22, 0.038, 10, true);
        }
      }
    }
  }
  fin.flush(finishGroup, { name: 'roof-finish' });
}
