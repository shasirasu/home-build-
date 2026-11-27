// The modern outside of the house: which finish each outside surface takes (zones), and the details a facade
// designer adds on top of plain walls: box frames or hoods around the windows, the deep frame around the upper
// front, vertical fins, a canopy over the door, a pergola on the terrace.
// Everything is placed by rule from the house itself (its front is the side the main door looks out of), so it
// works for any plan, not just the sample.

import * as THREE from 'three';
import { resolveExterior } from '@/data/exterior';
import type { Cladding, ExteriorDesign, ExteriorImage, ExteriorZone, Vec2 } from '@/types/house';
import { BatchSet } from '../core/batch';
import { pointInPoly } from '../core/geo';
import type { MaterialLib } from '../materials';
import { roomAt, wallPoint, type HouseModel, type LevelModel, type OpeningModel, type WallModel } from './model';

export interface FacadeInfo {
  design: ExteriorDesign;
  images: Record<string, ExteriorImage> | undefined;
  /** Outward direction of the entrance front in plan (unit), or null when the house has no door to tell by. */
  front: Vec2 | null;
  /** Along the front, so that (lat, up, front) is a right-handed frame. */
  lat: Vec2;
  /** Extent of the whole house along `lat`. */
  span: [number, number];
  /** Extent of the entrance bay along `lat` (the tall strip the door sits in), or null. */
  bay: [number, number] | null;
  mainDoor: OpeningModel | null;
  /** Lintel bands, moulded columns and copings instead of the modern trims. */
  traditional: boolean;
  /** Total height the outside is finished over (for a picture stretched over a wall). */
  height: number;
}

const dot = (a: Vec2, x: number, y: number) => a[0] * x + a[1] * y;

export function facadeInfo(model: HouseModel, mainDoor: OpeningModel | null, front: Vec2 | null): FacadeInfo {
  const design = resolveExterior(model.spec);
  const f: Vec2 | null = front ? [front[0], front[1]] : null;
  const lat: Vec2 = f ? [f[1], -f[0]] : [1, 0];
  const b = model.box;
  const corners: Vec2[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const ls = corners.map((c) => dot(lat, c[0], c[1]));
  const span: [number, number] = [Math.min(...ls), Math.max(...ls)];
  let bay: [number, number] | null = null;
  if (f && mainDoor) {
    const wm = mainDoor.wall;
    const sc = (mainDoor.s0 + mainDoor.s1) / 2;
    const cx = wm.rect.ax + wm.rect.ux * sc, cy = wm.rect.ay + wm.rect.uy * sc;
    const c = dot(lat, cx, cy);
    const total = span[1] - span[0];
    const w = Math.min(total, Math.max(mainDoor.s1 - mainDoor.s0 + 1.5, total * 0.36, 1.8));
    let l0 = c - w / 2, l1 = c + w / 2;
    // keep it on the house, and take it to the corner rather than leave a sliver of the other finish
    if (l0 < span[0]) { l1 += span[0] - l0; l0 = span[0]; }
    if (l1 > span[1]) { l0 -= l1 - span[1]; l1 = span[1]; }
    if (l0 - span[0] < 0.75) l0 = span[0];
    if (span[1] - l1 < 0.75) l1 = span[1];
    bay = [l0, l1];
  }
  const ph = Math.max(0, model.spec.roof?.parapet?.height ?? 0);
  return { design, images: design.images, front: f, lat, span, bay, mainDoor, traditional: design.windows === 'band', height: Math.max(3, model.roofTop + ph) };
}

/** Does a surface whose outward normal is (ox, oy) belong to the entrance front? */
export function isFront(f: FacadeInfo, ox: number, oy: number): boolean {
  return !!f.front && ox * f.front[0] + oy * f.front[1] > 0.7;
}

/** The zone an outside wall surface belongs to: `(ox, oy)` its outward normal, `(px, py)` a point on it. */
export function zoneAt(f: FacadeInfo, levelIndex: number, ox: number, oy: number, px: number, py: number): ExteriorZone {
  const upper = levelIndex > 0;
  if (isFront(f, ox, oy)) {
    switch (f.design.feature) {
      case 'front': return 'feature';
      case 'front-upper': if (upper) return 'feature'; break;
      case 'front-ground': if (!upper) return 'feature'; break;
      case 'entrance': {
        const l = dot(f.lat, px, py);
        if (f.bay && l > f.bay[0] && l < f.bay[1]) return 'feature';
        break;
      }
    }
  }
  return upper ? 'upper' : 'ground';
}

export const zoneCladding = (f: FacadeInfo, zone: ExteriorZone): Cladding => f.design.zones[zone];

/** The dark (or light) metal of the frame, boxes, hoods, canopy, gate. */
export function accentMaterial(f: FacadeInfo, mats: MaterialLib, clip = false): THREE.MeshStandardMaterial {
  return mats.solid(f.design.accent, 0.5, clip, 0.3);
}

/** The plastered, painted mass of the big frame around the upper front (same colour as the metal, but matt). */
export function frameMaterial(f: FacadeInfo, mats: MaterialLib): THREE.MeshStandardMaterial {
  return mats.solid(f.design.accent, 0.88, false, 0);
}

/** Front-most straight run of a plan outline: its depth along `front` and its extent along `lat`. */
export function frontEdge(f: FacadeInfo, poly: Vec2[]): { depth: number; l0: number; l1: number } | null {
  if (!f.front || poly.length < 3) return null;
  let depth = -Infinity;
  for (const p of poly) depth = Math.max(depth, dot(f.front, p[0], p[1]));
  let l0 = Infinity, l1 = -Infinity;
  for (const p of poly) {
    if (dot(f.front, p[0], p[1]) < depth - 0.05) continue;
    const l = dot(f.lat, p[0], p[1]);
    l0 = Math.min(l0, l); l1 = Math.max(l1, l);
  }
  return l1 - l0 > 0.5 ? { depth, l0, l1 } : null;
}

/** Matrix of the frame (x along the front, y up, z out of the front) with its origin at lateral `l`, depth `d`. */
export function frontMatrix(f: FacadeInfo, l: number, d: number): THREE.Matrix4 {
  const fr = f.front ?? [0, 1], lt = f.lat;
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(lt[0], 0, lt[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(fr[0], 0, fr[1]));
  m.setPosition(lt[0] * l + fr[0] * d, 0, lt[1] * l + fr[1] * d);
  return m;
}

function wallMatrix(wm: WallModel): THREE.Matrix4 {
  const r = wm.rect;
  const m = new THREE.Matrix4().makeRotationY(Math.atan2(-r.uy, r.ux));
  m.setPosition(r.ax, wm.level.elevation, r.ay);
  return m;
}

/** Is the ground just outside this door already under a floor or the roof? */
function doorCovered(model: HouseModel, om: OpeningModel): boolean {
  const wm = om.wall, out = om.outSide || 1;
  const sc = (om.s0 + om.s1) / 2;
  const x = wm.rect.ax + wm.rect.ux * sc + wm.nx * out * (wm.rect.ht + 0.9);
  const y = wm.rect.ay + wm.rect.uy * sc + wm.ny * out * (wm.rect.ht + 0.9);
  for (const lm of model.levels) if (lm.index > wm.level.index && lm.footprint.length >= 3 && pointInPoly(x, y, lm.footprint)) return true;
  return model.roofOutline.length >= 3 && pointInPoly(x, y, model.roofOutline);
}

export interface FacadeGroups {
  /** finish group of each storey */
  levels: THREE.Group[];
  roof: THREE.Group;
}

export function buildFacade(model: HouseModel, mats: MaterialLib, f: FacadeInfo, groups: FacadeGroups): void {
  const d = f.design;
  const N = model.levels.length;
  if (!N) return;
  const accent = accentMaterial(f, mats, true);

  // the upper front: where the frame and the fin screen go (worked out first: other details keep clear of them)
  const top = model.levels[N - 1];
  const edge = frontEdge(f, top.footprint.length >= 3 ? top.footprint : model.roofOutline);
  /** Is this window behind the fin screen? (its hood would poke through the fins) */
  const screened = (om: OpeningModel): boolean => {
    if (d.fins === 'none' || !f.bay || !edge || N < 2 || om.wall.level.index < 1) return false;
    const wm = om.wall, o = om.outSide || 1;
    if (!isFront(f, wm.nx * o, wm.ny * o)) return false;
    const sc = (om.s0 + om.s1) / 2;
    const x = wm.rect.ax + wm.rect.ux * sc, y = wm.rect.ay + wm.rect.uy * sc;
    const l = dot(f.lat, x, y), dp = dot(f.front!, x, y);
    return l > f.bay[0] - 0.1 && l < f.bay[1] + 0.1 && edge.depth - dp < 0.8;
  };

  // ---------------------------------------------------------------------------------------- window surrounds
  if (d.windows === 'box' || d.windows === 'hood') {
    model.levels.forEach((lm: LevelModel) => {
      const set = new BatchSet();
      const b = set.get(accent);
      for (const wm of lm.walls) {
        const M = wallMatrix(wm);
        const ht = wm.rect.ht;
        for (const om of wm.openings) {
          const k = om.opening.kind;
          if (om.outSide === 0 || om.arch || (k !== 'window' && k !== 'ventilator')) continue;
          const out = om.outSide;
          const W = om.s1 - om.s0, sc = (om.s0 + om.s1) / 2;
          if (d.windows === 'box') {
            const D = k === 'ventilator' ? 0.1 : 0.16, T = 0.05;
            const zc = out * (ht + D / 2 - 0.005);
            const face = out > 0 ? 'z-' : 'z+';
            b.box(M, om.s0 - T / 2, (om.sill + om.head) / 2, zc, T, om.head - om.sill + 2 * T, D, -1, face);
            b.box(M, om.s1 + T / 2, (om.sill + om.head) / 2, zc, T, om.head - om.sill + 2 * T, D, -1, face);
            b.box(M, sc, om.head + T / 2, zc, W, T, D, -1, face);
            b.box(M, sc, om.sill - T / 2, zc, W, T, D, -1, face);
          } else if (k === 'window' && !screened(om)) {
            // no hood under a portico or sit-out: the slab above already shades the window
            const [px, py] = wallPoint(wm, sc, out * (ht + 0.3));
            if (roomAt(lm, px, py)) continue;
            const D = 0.45, T = 0.06;
            b.box(M, sc, om.head + 0.05 + T / 2, out * (ht + D / 2 - 0.005), W + 0.3, T, D, -1, out > 0 ? 'z-' : 'z+');
          }
        }
      }
      set.flush(groups.levels[lm.index], { name: 'window-surrounds', data: { clipped: true } });
    });
  }

  // ---------------------------------------------------------------------------------------- canopy over the door
  const door = f.mainDoor;
  if (d.canopy && door && door.outSide !== 0 && !doorCovered(model, door)) {
    const wm = door.wall, out = door.outSide, ht = wm.rect.ht;
    const M = wallMatrix(wm);
    const W = door.s1 - door.s0, sc = (door.s0 + door.s1) / 2;
    const y = Math.min(door.head + 0.35, wm.height - 0.2), D = 1.35, T = 0.09;
    const set = new BatchSet();
    set.get(accent).box(M, sc, y + T / 2, out * (ht + D / 2), W + 1.4, T, D, -1, out > 0 ? 'z-' : 'z+');
    const steel = set.get(mats.steel());
    for (const x of [sc - W / 2 - 0.5, sc + W / 2 + 0.5]) steel.rod(M, x, y + T, out * (ht + D - 0.12), x, Math.min(y + 0.85, wm.height - 0.05), out * (ht + 0.01), 0.011, 8, true);
    set.flush(groups.levels[wm.level.index], { name: 'canopy', data: { clipped: true } });
  }

  // ---------------------------------------------------------------------------------------- the upper front
  if (!edge) return;
  const roof = model.spec.roof;
  const ph = Math.max(0, roof?.parapet?.height ?? 0);
  const upper = N > 1 ? model.levels[1] : model.levels[0];
  const yBot = N > 1 ? upper.elevation - Math.max(upper.slab, 0.1) - 0.012 : upper.elevation;
  const solidTop = d.parapet === 'solid' && ph > 0.05;
  const yTop = solidTop ? model.roofTop + ph + (f.traditional ? 0.06 : 0.03) : model.roofTop + 0.012;
  const w = edge.l1 - edge.l0;
  const M = frontMatrix(f, edge.l0, edge.depth);
  const set = new BatchSet();
  const FD = 0.45, FT = 0.14;
  const hasFrame = d.frame && w > 2.2 && yTop - yBot > 1.8;
  if (hasFrame) {
    const b = set.get(frameMaterial(f, mats));
    // two fins and two slabs, wrapped just round the corners so the frame reads as a sleeve over the box
    b.box(M, FT / 2 - 0.02, (yBot + yTop) / 2, FD / 2 - 0.06, FT, yTop - yBot, FD + 0.12);
    b.box(M, w - FT / 2 + 0.02, (yBot + yTop) / 2, FD / 2 - 0.06, FT, yTop - yBot, FD + 0.12);
    b.box(M, w / 2, yTop - FT / 2, FD / 2 + 0.001, w - 2 * FT + 0.04, FT, FD, -1, 'x+x-z-');
    b.box(M, w / 2, yBot + FT / 2, FD / 2 + 0.001, w - 2 * FT + 0.04, FT, FD, -1, 'x+x-z-');
  }

  // ---- fins screening the entrance bay of the upper storey
  if (d.fins !== 'none' && f.bay && N > 1) {
    const inset = hasFrame ? FT + 0.03 : 0.04;
    const x0 = Math.max(f.bay[0] - edge.l0, 0) + inset, x1 = Math.min(f.bay[1] - edge.l0, w) - inset;
    // up to the underside of whatever closes the top: the frame, the roof overhang, or the parapet coping
    const over = Math.max(0, Math.min(1.2, Number(d.overhang) || 0));
    const y0 = yBot + (hasFrame ? FT : 0.02), y1 = hasFrame ? yTop - FT : over > 0.02 ? Math.max(model.roofSoffit, model.roofTop - 0.12) : solidTop ? model.roofTop + ph : model.roofTop;
    if (x1 - x0 > 0.6 && y1 - y0 > 1.2) {
      const mat = d.fins === 'wood' ? mats.wood('#9a6238', false, 0.6) : accentMaterial(f, mats, false);
      const b = set.get(mat);
      // open enough that the window behind still reads through the screen from the street
      // (and far enough out to clear the box frame of a window behind it)
      const FW = 0.04, FDp = 0.1, z = 0.27;
      const n = Math.max(2, Math.round((x1 - x0) / 0.2));
      for (let i = 0; i <= n; i++) b.box(M, x0 + ((x1 - x0) * i) / n, (y0 + y1) / 2, z, FW, y1 - y0, FDp, -1, 'y-');
      // the two flats that carry them, back at the wall
      const rail = set.get(accentMaterial(f, mats, false));
      for (const y of [y0 + 0.25, y1 - 0.25]) rail.box(M, (x0 + x1) / 2, y, z - FDp / 2 - 0.02, x1 - x0 + FW, 0.05, 0.04);
      for (const x of [x0, x1]) for (const y of [y0 + 0.25, y1 - 0.25]) rail.box(M, x, y, (z - FDp / 2) / 2, 0.03, 0.03, z - FDp / 2);
    }
  }

  // ---- pergola on the terrace, over the front
  if (d.pergola && model.roofOutline.length >= 3) {
    const inset = (roof?.parapet?.thickness ?? 0.15) + 0.25;
    const pw = Math.min(w - 2 * inset, 4.6), pd = 3.0, H = 2.35;
    // room for it on the roof?
    const backX = (edge.l0 + inset + pw / 2), backD = edge.depth - inset - pd;
    const bx = f.lat[0] * backX + (f.front?.[0] ?? 0) * backD, by = f.lat[1] * backX + (f.front?.[1] ?? 1) * backD;
    if (pw > 1.8 && pointInPoly(bx, by, model.roofOutline)) {
      const wood = d.fins !== 'metal';
      const mat = wood ? mats.wood('#8a5a34', false, 0.6) : accentMaterial(f, mats, false);
      const b = set.get(mat);
      const y0 = model.roofTop, x0 = inset, x1 = inset + pw, z1 = -inset, z0 = -inset - pd;
      const P = 0.1;
      for (const x of [x0 + P / 2, x1 - P / 2]) for (const z of [z0 + P / 2, z1 - P / 2]) b.box(M, x, y0 + H / 2, z, P, H, P, -1, 'y-');
      for (const z of [z0 + P / 2, z1 - P / 2]) b.box(M, (x0 + x1) / 2, y0 + H - 0.09, z, pw + 0.5, 0.18, 0.06);
      const n = Math.max(3, Math.round(pw / 0.42));
      for (let i = 0; i <= n; i++) b.box(M, x0 + (pw * i) / n, y0 + H + 0.07, (z0 + z1) / 2, 0.045, 0.14, pd + 0.5);
    }
  }
  set.flush(groups.roof, { name: 'facade' });
}
