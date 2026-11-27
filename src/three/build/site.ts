// Site: the plot (lawn), paving, compound wall with coping, gate pillars and a sliding MS gate, a few shrubs.
// Kept subtle and cheap: a handful of merged meshes.

import * as THREE from 'three';
import type { Vec2 } from '@/types/house';
import { BatchSet, polyFace, polyFaceDiff } from '../core/batch';
import { clamp, cleanPoly, finite, hashString, pointInPoly, rng, segDist } from '../core/geo';
import { accentMaterial, zoneCladding } from './facade';
import type { BuildCtx } from './walls';

export interface SiteBuild {
  /** compound wall runs for walk collision: [ax, ay, bx, by, thickness, height] */
  wallRuns: [number, number, number, number, number, number][];
  /** tops of the gate pillars (plan x, y and height), for the gate lamps */
  pillars: [number, number, number][];
}

export function buildSite(ctx: BuildCtx, group: THREE.Group): SiteBuild {
  const { model, mats, facade } = ctx;
  const site = model.spec.site;
  const wallRuns: SiteBuild['wallRuns'] = [];
  const pillars: SiteBuild['pillars'] = [];
  const plot = cleanPoly(site?.plot);
  if (!site || plot.length < 3) return { wallRuns, pillars };
  const set = new BatchSet();
  const paving = (site.paving ?? []).map((p) => cleanPoly(p)).filter((p) => p.length >= 3);

  // lawn (minus the paving so nothing is coplanar) and paving
  polyFaceDiff(set.get(mats.textured('grass', undefined, 0.95)), plot, paving, 0.012, true);
  const pav = set.get(mats.textured('pavers', undefined, 0.85));
  for (const p of paving) polyFace(pav, p, [], 0.02, true);
  for (const m of set.flush(group, { cast: false, name: 'site-ground' })) m.userData.ground = true;

  const built = new BatchSet();
  const cw = site.compoundWall;
  if (cw && cw.height > 0.1) {
    const H = clamp(finite(cw.height, 1.2), 0.2, 4), T = clamp(finite(cw.thickness, 0.2), 0.05, 0.6);
    const boundary = mats.cladding(zoneCladding(facade, 'boundary'), facade.images, false);
    const wallMat = built.get(boundary.userData.fit ? mats.paint('#ece5d6', false, 0.9) : boundary);
    const copMat = built.get(facade.traditional ? mats.paint('#f7f4ee', false, 0.85) : accentMaterial(facade, mats));
    const modern = !facade.traditional;
    const gate = cw.gate && cw.gate.a && cw.gate.b ? cw.gate : null;
    const run = (a: Vec2, b: Vec2) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) return;
      const M = new THREE.Matrix4().makeRotationY(Math.atan2(-(b[1] - a[1]), b[0] - a[0])).setPosition(a[0], 0, a[1]);
      wallMat.box(M, len / 2, H / 2, 0, len + T, H, T, -1, 'y-');
      if (modern) copMat.box(M, len / 2, H + 0.015, 0, len + T + 0.02, 0.03, T + 0.02);
      else copMat.box(M, len / 2, H + 0.03, 0, len + T + 0.06, 0.06, T + 0.06);
      wallRuns.push([a[0], a[1], b[0], b[1], T, H]);
    };
    for (let i = 0; i < plot.length; i++) {
      const a = plot[i], b = plot[(i + 1) % plot.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      // is the gate on this edge?
      const onEdge = gate && segDist(gate.a[0], gate.a[1], a[0], a[1], b[0], b[1]) < 0.3 && segDist(gate.b[0], gate.b[1], a[0], a[1], b[0], b[1]) < 0.3;
      if (!onEdge || !gate) { run(a, b); continue; }
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      let t0 = (gate.a[0] - a[0]) * ux + (gate.a[1] - a[1]) * uy, t1 = (gate.b[0] - a[0]) * ux + (gate.b[1] - a[1]) * uy;
      if (t0 > t1) [t0, t1] = [t1, t0];
      t0 = clamp(t0, 0, len); t1 = clamp(t1, 0, len);
      const g0: Vec2 = [a[0] + ux * t0, a[1] + uy * t0], g1: Vec2 = [a[0] + ux * t1, a[1] + uy * t1];
      if (t0 > 0.3) run(a, g0);
      if (len - t1 > 0.3) run(g1, b);
      buildGate(g0, g1, ux, uy);
    }

    function buildGate(g0: Vec2, g1: Vec2, ux: number, uy: number) {
      const gw = Math.hypot(g1[0] - g0[0], g1[1] - g0[1]);
      if (gw < 0.5) return;
      const M = new THREE.Matrix4().makeRotationY(Math.atan2(-uy, ux)).setPosition(g0[0], 0, g0[1]);
      // which way is "inside the plot"
      const nx = -uy, ny = ux;
      const mid: Vec2 = [(g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2];
      const inward = pointInPoly(mid[0] + nx * 0.5, mid[1] + ny * 0.5, plot) ? 1 : -1;
      // pillars
      const PH = H + 0.35, PW = Math.max(0.3, T + 0.12);
      for (const x of [0, gw]) {
        wallMat.box(M, x, PH / 2, 0, PW, PH, PW, -1, 'y-');
        if (modern) copMat.box(M, x, PH + 0.02, 0, PW + 0.03, 0.04, PW + 0.03);
        else {
          copMat.box(M, x, PH + 0.04, 0, PW + 0.08, 0.08, PW + 0.08);
          copMat.box(M, x, PH + 0.11, 0, PW - 0.06, 0.06, PW - 0.06);
        }
        pillars.push([g0[0] + ux * x, g0[1] + uy * x, PH + (modern ? 0.04 : 0.14)]);
      }
      // sliding gate just inside the wall line, on a floor track
      const style = facade.design.gate;
      const ms = built.get(style === 'bars' && !modern ? mats.metal('#2c2e31', false, 0.55, 0.55) : accentMaterial(facade, mats));
      const z = inward * (PW / 2 + 0.05);
      const GH = Math.max(0.9, H + 0.15), x0 = PW / 2 - 0.05, x1 = gw - PW / 2 + 0.05;
      const tube = 0.05;
      const y0 = 0.09, gh = GH - y0;
      ms.box(M, (x0 + x1) / 2, 0.012, z, gw + 0.6, 0.012, 0.06); // track
      // frame
      ms.box(M, (x0 + x1) / 2, y0 + tube / 2, z, x1 - x0, tube, tube);
      ms.box(M, (x0 + x1) / 2, GH - tube / 2, z, x1 - x0, tube, tube);
      ms.box(M, x0 + tube / 2, y0 + gh / 2, z, tube, gh, tube);
      ms.box(M, x1 - tube / 2, y0 + gh / 2, z, tube, gh, tube);
      if (style === 'slats') {
        // horizontal timber slats between steel stiles
        const wood = built.get(mats.wood('#9a6238', false, 0.6));
        const n = Math.max(3, Math.round((gh - 2 * tube) / 0.115));
        const pitch = (gh - 2 * tube) / n;
        for (let i = 0; i < n; i++) wood.box(M, (x0 + x1) / 2, y0 + tube + pitch * (i + 0.5), z, x1 - x0 - 2 * tube, pitch * 0.74, 0.022);
        const stiles = Math.max(1, Math.round((x1 - x0) / 1.6));
        for (let i = 1; i < stiles; i++) ms.box(M, x0 + ((x1 - x0) * i) / stiles, y0 + gh / 2, z - inward * 0.02, 0.04, gh - 2 * tube, 0.02);
      } else if (style === 'sheet') {
        // flush sheet panels with fine joints
        const panels = Math.max(2, Math.round((x1 - x0) / 1.1));
        const pw = (x1 - x0 - 2 * tube) / panels;
        for (let i = 0; i < panels; i++) ms.box(M, x0 + tube + pw * (i + 0.5), y0 + gh / 2, z, pw - 0.012, gh - 2 * tube - 0.012, 0.012);
      } else {
        ms.box(M, (x0 + x1) / 2, y0 + gh * 0.42, z, x1 - x0, 0.03, 0.03);
        const bars = Math.max(2, Math.round((x1 - x0) / 0.11));
        for (let i = 1; i < bars; i++) ms.box(M, x0 + ((x1 - x0) * i) / bars, y0 + gh / 2, z, 0.016, gh - 2 * tube, 0.016, -1, 'y+y-');
        // lower sheet panel for privacy
        ms.box(M, (x0 + x1) / 2, y0 + tube + gh * 0.2, z, x1 - x0 - 2 * tube, gh * 0.4 - tube, 0.004);
      }
      for (const wx of [x0 + 0.35, x1 - 0.35]) ms.rod(M, wx, 0.05, z - 0.02, wx, 0.05, z + 0.02, 0.05, 12, true);
      // the closed gate stops the walker like the wall does
      const off = (inward * (PW / 2 + 0.05));
      wallRuns.push([g0[0] + nx * off, g0[1] + ny * off, g1[0] + nx * off, g1[1] + ny * off, 0.08, GH]);
    }
  }

  // shrubs along the inside of the plot edge, clear of paving and the house
  const r = rng(hashString(model.spec.id ?? 'site'));
  const leafA = built.get(mats.solid('#5f8a4b', 0.95));
  const leafB = built.get(mats.solid('#4c7740', 0.95));
  const pot = built.get(mats.solid('#8a6a4f', 0.9));
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const hb = model.box;
  const clearOfHouse = (x: number, y: number) => x < hb.x0 - 0.9 || x > hb.x1 + 0.9 || y < hb.y0 - 0.9 || y > hb.y1 + 1.6;
  const spots: Vec2[] = [];
  for (let i = 0; i < plot.length; i++) {
    const a = plot[i], b = plot[(i + 1) % plot.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 2) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    let nx = -uy, ny = ux;
    if (!pointInPoly(a[0] + ux * len * 0.5 + nx * 0.6, a[1] + uy * len * 0.5 + ny * 0.6, plot)) { nx = -nx; ny = -ny; }
    const count = Math.floor(len / 2.6);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5 + (r() - 0.5) * 0.5) / count;
      const x = a[0] + ux * len * t + nx * (0.75 + r() * 0.25), y = a[1] + uy * len * t + ny * (0.75 + r() * 0.25);
      if (!pointInPoly(x, y, plot) || !clearOfHouse(x, y)) continue;
      if (paving.some((p) => pointInPoly(x, y, p) || p.some((_, j) => segDist(x, y, p[j][0], p[j][1], p[(j + 1) % p.length][0], p[(j + 1) % p.length][1]) < 0.7))) continue;
      spots.push([x, y]);
    }
  }
  for (const [x, y] of spots.slice(0, 22)) {
    const s = 0.34 + r() * 0.22;
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x + (r() - 0.5) * s * 0.9, s * (0.7 + r() * 0.35), y + (r() - 0.5) * s * 0.9),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)),
        new THREE.Vector3(s * (0.8 + r() * 0.4), s * (0.7 + r() * 0.3), s * (0.8 + r() * 0.4)),
      );
      (k % 2 ? leafA : leafB).geometry(blob, m);
    }
    pot.box(null, x, 0.03, y, s * 1.1, 0.06, s * 1.1);
  }
  blob.dispose();
  built.flush(group, { name: 'site-built' });
  return { wallRuns, pillars };
}
