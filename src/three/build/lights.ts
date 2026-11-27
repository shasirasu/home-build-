// Outdoor lighting, placed by rule from the house and the kinds of light the design switches on:
//   wall      up-and-down lights beside the outside doors and along the outside walls
//   uplight   lights in the ground that graze up the walls and the free-standing columns
//   soffit    an LED line around the ceiling of every covered outdoor room (portico, sit-out)
//   downlight recessed spots in those ceilings
//   roofline  an LED line under the parapet coping
//   bollard   low posts along the driveway
//   gate      a lamp on each gate pillar
//   windows   the rooms lit behind the windows
// A light is three things: the fitting (always there), the light it throws on walls and ground (additive pictures,
// shown at night), and for a few of them a real lamp that lights the scene.
// Everything is filed under the part of the house it hangs on (a storey, the roof, the site), so it is hidden,
// cut and ghosted together with that part.

import * as THREE from 'three';
import type { Column, ExteriorLightKind, Vec2 } from '@/types/house';
import { Batch, BatchSet, type P3 } from '../core/batch';
import { offsetPoly, pointInPoly, polyBBox, signedArea } from '../core/geo';
import type { MaterialLib } from '../materials';
import { accentMaterial, isFront, type FacadeInfo } from './facade';
import { ceilingAbove, faceRoom, hasFloorAt, insideAnyWall, roomAt, wallPoint, type HouseModel, type LevelModel, type RoomModel, type WallModel } from './model';
import type { SiteBuild } from './site';

export interface LightsBuild {
  /** what shows only when the lights are on: one group per storey, one for the roof, one for the site */
  night: THREE.Group[];
  /**
   * The windows as seen from outside after dark, one group per storey: shown all night, glowing when the rooms are
   * lit (the 'windows' kind of the design, lights on) and dark otherwise.
   */
  panes: THREE.Group[];
  /** the few real lamps (their base strength is in userData.base) */
  lamps: THREE.PointLight[];
  /** how many of each kind were placed */
  counts: Partial<Record<ExteriorLightKind, number>>;
}

/** Where the parts go: `fittings` is drawn with the finishes of that part, `root` is the part itself. */
export interface LightParents {
  levels: { fittings: THREE.Group; root: THREE.Group }[];
  roof: { fittings: THREE.Group; root: THREE.Group };
  site: THREE.Group;
}

const MAX_LAMPS = 4;

export function buildLights(model: HouseModel, mats: MaterialLib, f: FacadeInfo, site: SiteBuild, freeColumns: Column[][], parents: LightParents): LightsBuild {
  const out: LightsBuild = { night: [], panes: [], lamps: [], counts: {} };
  const kinds = f.design.lighting.kinds;
  const N = model.levels.length;
  if (!N) return out;

  // slots 0 … N-1 are the storeys, N the roof, N + 1 the site. A storey's lights are sliced by the dollhouse cut.
  const ROOF = N, SITE = N + 1;
  const slots = Array.from({ length: N + 2 }, (_, i) => ({ fit: new BatchSet(), glow: new BatchSet(), panes: new BatchSet(), halos: [] as number[], clip: i < N }));
  const metalOf = (o: number) => slots[o].fit.get(accentMaterial(f, mats, slots[o].clip));
  const lampOf = (o: number) => slots[o].fit.get(mats.lamp(slots[o].clip));
  const glowOf = (o: number, kind: 'updown' | 'up' | 'pool' | 'wash') => slots[o].glow.get(mats.glow(kind, slots[o].clip));
  const lampSpots: { x: number; y: number; z: number; rank: number; power: number; owner: number }[] = [];
  const count = (k: ExteriorLightKind, n = 1) => { out.counts[k] = (out.counts[k] ?? 0) + n; };

  /** Which way an outside wall face looks, and what it looks onto. */
  const faceAt = (lm: LevelModel, wm: WallModel, s: number, side: 1 | -1): 'open' | 'covered' | null => {
    const [px, py] = wallPoint(wm, s, side * (wm.rect.ht + 0.08));
    if (insideAnyWall(lm, px, py, wm)) return null;
    const room = faceRoom(model, lm, px, py);
    if (room) return room.room.outdoor ? 'covered' : null;
    return wm.wall.kind === 'exterior' ? 'open' : null;
  };

  /** Solid stretches of a wall between its openings, at lamp height. */
  const solidRuns = (wm: WallModel, h: number): [number, number][] => {
    const cuts = wm.openings.filter((o) => o.sill < h + 0.2 && o.head > h - 0.2).map((o) => [o.s0, o.s1] as [number, number]).sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    let a = 0;
    for (const [c0, c1] of cuts) { if (c0 - a > 0.05) runs.push([a, c0]); a = Math.max(a, c1); }
    if (wm.rect.len - a > 0.05) runs.push([a, wm.rect.len]);
    return runs;
  };

  /**
   * Light on a wall face: the picture spans s ∈ [sc − hw, sc + hw] and h ∈ [h0, h1] (above FFL), clipped to the
   * part of the wall that is really there.
   */
  const wallGlow = (b: Batch, lm: LevelModel, wm: WallModel, side: 1 | -1, sc: number, hw: number, h0: number, h1: number, hMax: number) => {
    const r = wm.rect;
    const s0 = Math.max(0, sc - hw), s1 = Math.min(r.len, sc + hw);
    const y0 = Math.max(h0, lm.onGrade ? -0.03 : 0), y1 = Math.min(h1, hMax);
    if (s1 - s0 < 0.05 || y1 - y0 < 0.05) return;
    const q = side * (r.ht + 0.022);
    const P = (s: number, h: number): P3 => [r.ax + r.ux * s + wm.nx * q, lm.elevation + h, r.ay + r.uy * s + wm.ny * q];
    const u = (s: number) => (s - (sc - hw)) / (2 * hw), v = (h: number) => (h - h0) / (h1 - h0);
    b.quad(P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [side * wm.nx, 0, side * wm.ny], [u(s0), v(y0), u(s1), v(y0), u(s1), v(y1), u(s0), v(y1)]);
  };

  /** A pool of light on the ground / a floor. */
  const pool = (o: number, x: number, y: number, z: number, radius: number) => {
    glowOf(o, 'pool').quad([x - radius, y, z - radius], [x + radius, y, z - radius], [x + radius, y, z + radius], [x - radius, y, z + radius], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
  };

  /** Does the wall carry on, flush, on the storey above this point? */
  const wallAbove = (lm: LevelModel, x: number, y: number): boolean => {
    const up = model.levels[lm.index + 1];
    return !!up && insideAnyWall(up, x, y, undefined, 0.01);
  };

  // ------------------------------------------------------------------------------------------- wall lights
  if (kinds.wall) {
    const LH = 2.0;
    let placed = 0;
    for (const lm of model.levels) {
      const metal = metalOf(lm.index), lamp = lampOf(lm.index), halos = slots[lm.index].halos;
      for (const wm of lm.walls) {
        if (wm.height < LH + 0.3) continue;
        const r = wm.rect;
        for (const side of [1, -1] as const) {
          const spots: number[] = [];
          const runs = solidRuns(wm, LH);
          const inRun = (s: number) => runs.some(([a, b]) => s > a + 0.14 && s < b - 0.14);
          // beside every outside door
          for (const om of wm.openings) {
            if (om.opening.kind !== 'door' || om.outSide !== side) continue;
            for (const s of [om.s0 - 0.34, om.s1 + 0.34]) if (inRun(s) && faceAt(lm, wm, s, side)) spots.push(s);
          }
          // and along the walls: every outside wall of the ground storey, the front only above it
          for (const [a, b] of runs) {
            const len = b - a;
            if (len < 2.6) continue;
            const n = Math.max(1, Math.round(len / 3.8));
            for (let i = 0; i < n; i++) {
              const s = a + (len * (i + 0.5)) / n;
              const face = faceAt(lm, wm, s, side);
              if (!face) continue;
              if (lm.index > 0 && !isFront(f, side * wm.nx, side * wm.ny)) continue;
              if (spots.some((p) => Math.abs(p - s) < 1.2)) continue;
              spots.push(s);
            }
          }
          const M = new THREE.Matrix4().makeRotationY(Math.atan2(-r.uy, r.ux)).setPosition(r.ax, lm.elevation, r.ay);
          for (const s of spots) {
            if (placed >= 28) break;
            placed++;
            const z = side * (r.ht + 0.045);
            metal.box(M, s, LH, z, 0.075, 0.2, 0.09, -1, side > 0 ? 'z-' : 'z+');
            lamp.box(M, s, LH + 0.103, z, 0.055, 0.006, 0.07);
            lamp.box(M, s, LH - 0.103, z, 0.055, 0.006, 0.07);
            wallGlow(glowOf(lm.index, 'updown'), lm, wm, side, s, 0.75, LH - 1.95, LH + 1.95, wm.height);
            const [hx, hy] = wallPoint(wm, s, side * (r.ht + 0.1));
            halos.push(hx, lm.elevation + LH, hy);
            const main = f.mainDoor && f.mainDoor.wall === wm;
            // the real lamp stands well off the wall and is weak: the pools on the wall are the picture's job, and a
            // strong lamp this close would flood the whole wall evenly
            if (lm.index === 0) lampSpots.push({ x: hx + side * wm.nx * 0.9, y: lm.elevation + LH, z: hy + side * wm.ny * 0.9, rank: main ? 3 : 0.5, power: 1.6, owner: 0 });
          }
          count('wall', Math.min(spots.length, 28));
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------- ground uplights
  if (kinds.uplight) {
    const lm = model.levels[0];
    const metal = metalOf(0), lamp = lampOf(0), halos = slots[0].halos;
    let placed = 0;
    for (const wm of lm.walls) {
      const r = wm.rect;
      for (const side of [1, -1] as const) {
        const ox = side * wm.nx, oy = side * wm.ny;
        // the front and the two sides; the back stays dark
        if (f.front && ox * f.front[0] + oy * f.front[1] < -0.3) continue;
        for (const [a, b] of solidRuns(wm, 0.6)) {
          const len = b - a;
          if (len < 1.2) continue;
          const n = Math.max(1, Math.round(len / 2.4));
          for (let i = 0; i < n && placed < 22; i++) {
            const s = a + (len * (i + 0.5)) / n;
            if (faceAt(lm, wm, s, side) !== 'open') continue;
            placed++;
            const [gx, gy] = wallPoint(wm, s, side * (r.ht + 0.3));
            metal.rod(null, gx, 0.0, gy, gx, 0.03, gy, 0.07, 14, true);
            lamp.rod(null, gx, 0.03, gy, gx, 0.036, gy, 0.05, 14, true);
            const [ix, iy] = wallPoint(wm, s, 0);
            const reach = wallAbove(lm, ix, iy) ? Math.min(4.6, model.topY - lm.elevation) : wm.height;
            // the light carries on up the storey above: that part belongs to it, so it goes when that storey is hidden
            const h0 = -lm.elevation + 0.05, split = Math.min(reach, wm.height);
            wallGlow(glowOf(0, 'up'), lm, wm, side, s, 0.8, h0, h0 + 4.6, split);
            if (reach > split + 0.05 && N > 1) {
              const r2 = wm.rect, q = side * (r2.ht + 0.022), hw = 0.8;
              const s0 = Math.max(0, s - hw), s1 = Math.min(r2.len, s + hw);
              const P = (ss: number, h: number): P3 => [r2.ax + r2.ux * ss + wm.nx * q, lm.elevation + h, r2.ay + r2.uy * ss + wm.ny * q];
              const u = (ss: number) => (ss - (s - hw)) / (2 * hw), v = (h: number) => (h - h0) / 4.6;
              if (s1 - s0 > 0.05) glowOf(1, 'up').quad(P(s0, split), P(s1, split), P(s1, reach), P(s0, reach), [side * wm.nx, 0, side * wm.ny], [u(s0), v(split), u(s1), v(split), u(s1), v(reach), u(s0), v(reach)]);
            }
            halos.push(gx, 0.08, gy);
            count('uplight');
          }
        }
      }
    }
    // free-standing columns outdoors: one light at the foot of the face that looks to the front
    for (const c of freeColumns[0] ?? []) {
      const room = roomAt(lm, c.x, c.y);
      if (room && !room.room.outdoor) continue;
      const fr = f.front ?? [0, 1];
      const ax = Math.abs(fr[0]) > Math.abs(fr[1]);
      const d = (ax ? c.w : c.d) / 2, hw = (ax ? c.d : c.w) / 2;
      const nx = ax ? Math.sign(fr[0]) : 0, ny = ax ? 0 : Math.sign(fr[1]);
      const gx = c.x + nx * (d + 0.22), gy = c.y + ny * (d + 0.22);
      const base = room ? room.floorY : 0;
      const topY = Math.min(base + 3.6, ceilingAbove(model, lm, c.x, c.y));
      metal.rod(null, gx, base, gy, gx, base + 0.03, gy, 0.06, 14, true);
      lamp.rod(null, gx, base + 0.03, gy, gx, base + 0.036, gy, 0.042, 14, true);
      const fx = c.x + nx * (d + 0.02), fy = c.y + ny * (d + 0.02);
      const tx = -ny * hw, ty = nx * hw;
      glowOf(0, 'up').quad([fx - tx, base, fy - ty], [fx + tx, base, fy + ty], [fx + tx, topY, fy + ty], [fx - tx, topY, fy - ty], [nx, 0, ny], [0.2, 0, 0.8, 0, 0.8, (topY - base) / 4.6, 0.2, (topY - base) / 4.6]);
      halos.push(gx, base + 0.08, gy);
      count('uplight');
    }
  }

  // ------------------------------------------------------------------------------------------- covered outdoor rooms
  if (kinds.soffit || kinds.downlight) {
    for (const lm of model.levels) {
      for (const rm of lm.rooms as RoomModel[]) {
        if (!rm.room.outdoor || rm.poly.length < 3) continue;
        const [ax, ay] = rm.anchor;
        // these hang from the slab over the room, so they belong to whatever that slab belongs to (the storey
        // above, or the roof) and go when it is taken off
        const above = model.levels.find((up) => up.index > lm.index && hasFloorAt(up, ax, ay));
        const covered = !!above || (model.roofOutline.length >= 3 && pointInPoly(ax, ay, model.roofOutline));
        if (!covered) continue;
        const own = above ? above.index : ROOF;
        const metal = metalOf(own), lamp = lampOf(own), halos = slots[own].halos;
        const cy = ceilingAbove(model, lm, ax, ay);
        if (!(cy > rm.floorY + 2)) continue;
        const bb = polyBBox(rm.poly);
        const w = bb.x1 - bb.x0, dpt = bb.y1 - bb.y0;
        if (kinds.soffit) {
          const ring = offsetPoly(rm.poly, -0.14);
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len < 0.3) continue;
            const M = new THREE.Matrix4().makeRotationY(Math.atan2(-(b[1] - a[1]), b[0] - a[0])).setPosition(a[0], 0, a[1]);
            lamp.box(M, len / 2, cy - 0.008, 0, len, 0.012, 0.03, -1, 'y+');
          }
          pool(own, ax, rm.floorY + 0.012, ay, Math.max(w, dpt) * 0.62);
          count('soffit');
        }
        if (kinds.downlight) {
          const nx = Math.max(1, Math.round(w / 1.4)), ny = Math.max(1, Math.round(dpt / 1.4));
          for (let i = 0; i < nx; i++)
            for (let j = 0; j < ny; j++) {
              const x = bb.x0 + (w * (i + 0.5)) / nx, y = bb.y0 + (dpt * (j + 0.5)) / ny;
              if (!pointInPoly(x, y, rm.poly)) continue;
              metal.rod(null, x, cy - 0.006, y, x, cy, y, 0.06, 14, true);
              lamp.rod(null, x, cy - 0.009, y, x, cy - 0.006, y, 0.042, 14, true);
              pool(own, x, rm.floorY + 0.014, y, 0.95);
              halos.push(x, cy - 0.03, y);
              count('downlight');
            }
        }
        // one real lamp under the ceiling, no stronger than the nearest wall can take: in a shallow portico it is
        // only an arm's length from the wall, and at full strength it would bleach it from top to bottom
        let near = Infinity;
        for (let i = 0; i < rm.poly.length; i++) {
          const a = rm.poly[i], b = rm.poly[(i + 1) % rm.poly.length];
          const ex = b[0] - a[0], ey = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((ax - a[0]) * ex + (ay - a[1]) * ey) / (ex * ex + ey * ey || 1)));
          near = Math.min(near, Math.hypot(ax - a[0] - ex * t, ay - a[1] - ey * t));
        }
        const full = kinds.soffit && kinds.downlight ? 9 : 6;
        const drop = Math.min(0.9, (cy - rm.floorY) * 0.3);
        const reach = Math.hypot(Math.max(0.3, near), drop);
        lampSpots.push({ x: ax, y: cy - drop, z: ay, rank: 5, power: Math.max(0.5, Math.min(full, 1.5 * reach * reach)), owner: own });
      }
    }
  }

  // ------------------------------------------------------------------------------------------- roofline strip
  const roof = model.spec.roof;
  const outline = model.roofOutline;
  if (kinds.roofline && outline.length >= 3) {
    const ph = Math.max(0, roof?.parapet?.height ?? 0);
    const sgn = signedArea(outline) >= 0 ? 1 : -1;
    const n = outline.length;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.4) continue;
      const nx = ((b[1] - a[1]) / len) * sgn, ny = (-(b[0] - a[0]) / len) * sgn;
      const open = f.design.parapet !== 'solid' && len > 1.2 && isFront(f, nx, ny);
      const y = ph > 0.05 ? model.roofTop + (open ? 0.1 : ph) - 0.03 : model.roofTop - 0.03;
      const M = new THREE.Matrix4().makeRotationY(Math.atan2(-(b[1] - a[1]), b[0] - a[0])).setPosition(a[0], 0, a[1]);
      // the matrix's +z is the left of a→b; put the strip on the outward side whichever way the outline winds
      const zo = -sgn;
      lampOf(ROOF).box(M, len / 2, y, zo * 0.012, len, 0.018, 0.012);
      const o = 0.024;
      const P = (p: Vec2, yy: number): P3 => [p[0] + nx * o, yy, p[1] + ny * o];
      const drop = Math.min(1.5, y - (model.levels[N - 1].elevation + 0.4));
      if (drop > 0.2) glowOf(ROOF, 'wash').quad(P(a, y - drop), P(b, y - drop), P(b, y), P(a, y), [nx, 0, ny], [0, 0, 1, 0, 1, 1, 0, 1]);
      total += len;
    }
    if (total > 0) count('roofline', Math.round(total));
  }

  // ------------------------------------------------------------------------------------------- driveway bollards
  const siteSpec = model.spec.site;
  if (kinds.bollard && siteSpec?.plot && siteSpec.plot.length >= 3) {
    const paving = (siteSpec.paving ?? []).filter((p) => p && p.length >= 3);
    let best: Vec2[] | null = null, bestA = 0;
    for (const p of paving) { const a = Math.abs(signedArea(p)); if (a > bestA) { bestA = a; best = p; } }
    const hb = model.box;
    const metal = metalOf(SITE), lamp = lampOf(SITE), halos = slots[SITE].halos;
    let placed = 0;
    if (best && bestA > 4) {
      const sgn = signedArea(best) >= 0 ? 1 : -1;
      for (let i = 0; i < best.length; i++) {
        const a = best[i], b = best[(i + 1) % best.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 2.4) continue;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        // the edges that run from the gate toward the house
        if (f.front && Math.abs(ux * f.front[0] + uy * f.front[1]) < 0.7) continue;
        const nx = uy * sgn, ny = -ux * sgn;
        const n = Math.max(1, Math.round((len - 1.2) / 2.6));
        for (let k = 0; k <= n && placed < 14; k++) {
          const t = n === 0 ? 0.5 : (0.6 + ((len - 1.2) * k) / n) / len;
          const x = a[0] + (b[0] - a[0]) * t + nx * 0.28, y = a[1] + (b[1] - a[1]) * t + ny * 0.28;
          if (!pointInPoly(x, y, siteSpec.plot)) continue;
          if (x > hb.x0 - 0.3 && x < hb.x1 + 0.3 && y > hb.y0 - 0.3 && y < hb.y1 + 0.3) continue;
          placed++;
          metal.box(null, x, 0.25, y, 0.085, 0.5, 0.085, -1, 'y-');
          lamp.box(null, x, 0.535, y, 0.08, 0.07, 0.08, -1, 'y-y+');
          metal.box(null, x, 0.58, y, 0.1, 0.02, 0.1);
          pool(SITE, x, 0.034, y, 1.35);
          halos.push(x, 0.54, y);
          count('bollard');
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------- gate lamps
  if (kinds.gate) {
    const metal = metalOf(SITE), lamp = lampOf(SITE), halos = slots[SITE].halos;
    for (const [x, y, h] of site.pillars) {
      metal.box(null, x, h + 0.012, y, 0.2, 0.024, 0.2);
      lamp.box(null, x, h + 0.024 + 0.09, y, 0.15, 0.18, 0.15, -1, 'y-');
      metal.box(null, x, h + 0.024 + 0.19, y, 0.19, 0.02, 0.19);
      pool(SITE, x, 0.036, y, 1.9);
      halos.push(x, h + 0.12, y);
      lampSpots.push({ x, y: h + 0.15, z: y, rank: 2, power: 5, owner: SITE });
      count('gate');
    }
  }

  // ------------------------------------------------------------------------------------------- lit windows
  {
    for (const lm of model.levels) {
      const win = slots[lm.index].panes.get(mats.windowGlow());
      for (const wm of lm.walls) {
        const r = wm.rect;
        for (const om of wm.openings) {
          const k = om.opening.kind;
          if (om.outSide === 0 || (k !== 'window' && k !== 'ventilator')) continue;
          const o = om.outSide;
          // just behind the glass, which sits toward the outside of a thick wall
          const q = o * (r.ht > 0.085 ? r.ht - 0.15 : -r.ht * 0.6);
          const s0 = om.s0 + 0.045, s1 = om.s1 - 0.045, h0 = om.sill + 0.045, h1 = om.head - 0.045;
          if (s1 - s0 < 0.1 || h1 - h0 < 0.1) continue;
          const P = (s: number, h: number): P3 => [r.ax + r.ux * s + wm.nx * q, lm.elevation + h, r.ay + r.uy * s + wm.ny * q];
          win.quad(P(s0, h0), P(s1, h0), P(s1, h1), P(s0, h1), [o * wm.nx, 0, o * wm.ny], [0, 0, 1, 0, 1, 1, 0, 1]);
          if (kinds.windows) count('windows');
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------- assemble
  const part = (o: number) => (o < N ? parents.levels[o] : o === ROOF ? parents.roof : { fittings: parents.site, root: parents.site });
  slots.forEach((slot, o) => {
    const p = part(o);
    if (!p) return;
    for (const m of slot.fit.flush(p.fittings, { name: 'light-fittings', cast: true, data: { clipped: slot.clip } })) m.userData.noPick = true;
    const night = new THREE.Group();
    night.name = 'lights-on';
    night.visible = false;
    for (const m of slot.glow.flush(night, { name: 'light', cast: false, receive: false })) { m.userData.noPick = true; m.renderOrder = 3; }
    if (slot.halos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(slot.halos, 3));
      const pts = new THREE.Points(g, mats.halo(slot.clip));
      pts.name = 'light-halos';
      pts.userData.noPick = true;
      pts.renderOrder = 4;
      pts.frustumCulled = false;
      night.add(pts);
    }
    p.root.add(night);
    out.night[o] = night;
    if (o < N) {
      const panes = new THREE.Group();
      panes.name = 'window-panes';
      panes.visible = false;
      for (const m of slot.panes.flush(panes, { name: 'window-pane', cast: false, receive: false })) m.userData.noPick = true;
      p.root.add(panes);
      out.panes[o] = panes;
    }
  });
  lampSpots.sort((a, b) => b.rank - a.rank);
  const chosen: typeof lampSpots = [];
  for (const s of lampSpots) {
    if (chosen.length >= MAX_LAMPS) break;
    if (chosen.some((c) => Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z) < 2.5)) continue;
    chosen.push(s);
  }
  for (const s of chosen) {
    const l = new THREE.PointLight('#ffd0a0', 0, 11, 2);
    l.position.set(s.x, s.y, s.z);
    l.castShadow = false;
    l.userData.base = s.power;
    l.userData.noPick = true;
    out.night[s.owner]?.add(l);
    out.lamps.push(l);
  }
  return out;
}
