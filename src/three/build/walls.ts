// Walls: every wall is the rectangle a→b × thickness, built face by face (no CSG) so openings are cut exactly and
// each face can take the paint of the room it looks into. Also: dado tiles, skirting, the exterior lintel band,
// arch spandrels, and the section caps used by the dollhouse cut.

import * as THREE from 'three';
import type { Vec2 } from '@/types/house';
import { BatchSet, type Batch, type P3 } from '../core/batch';
import { orectLocal } from '../core/geo';
import type { MaterialLib } from '../materials';
import { faceRoom, insideAnyWall, wallPoint, type HouseModel, type LevelModel, type OpeningModel, type RoomModel, type WallModel } from './model';

export interface BuildCtx {
  model: HouseModel;
  mats: MaterialLib;
}

export const DEFAULT_WALL_PAINT = '#f1ede4';
const SKIRT_H = 0.1;
const SKIRT_T = 0.012;
const BAND_H = 0.08;
const BAND_T = 0.02;
export const ARCH_SEG = 18;

interface FaceInfo {
  room: RoomModel | null;
  mat: THREE.Material;
  exterior: boolean;
  /** bottom of the face relative to FFL (negative when the room floor is lower / to lap over the plinth) */
  base: number;
  hidden: boolean;
}

/** Matrix taking wall-local coords (x along a→b, y up from FFL, z along the left-hand normal) to world. */
export function wallMatrix(wm: WallModel): THREE.Matrix4 {
  const r = wm.rect;
  const m = new THREE.Matrix4().makeRotationY(Math.atan2(-r.uy, r.ux));
  m.setPosition(r.ax, wm.level.elevation, r.ay);
  return m;
}

/** Height the exterior lintel band sits at: the commonest head height of the level's exterior openings. */
function lintelHeight(lm: LevelModel): number {
  const count = new Map<number, number>();
  for (const wm of lm.walls)
    for (const om of wm.openings) {
      if (om.outSide === 0 && wm.wall.kind !== 'exterior') continue;
      const k = Math.round(om.head * 100) / 100;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  let best = 2.1, n = 0;
  for (const [k, c] of count) if (c > n) { n = c; best = k; }
  return best;
}

export function archHeight(om: OpeningModel, s: number): number {
  if (!om.arch || om.archRise <= 0) return om.head;
  const hw = (om.s1 - om.s0) / 2, sc = (om.s0 + om.s1) / 2;
  const k = Math.min(1, Math.abs(s - sc) / hw);
  return om.head - om.archRise + om.archRise * Math.sqrt(Math.max(0, 1 - k * k));
}

export function buildWalls(ctx: BuildCtx, lm: LevelModel, wallsGroup: THREE.Group, finishGroup: THREE.Group): void {
  const { mats, model } = ctx;
  const set = new BatchSet();
  const trims = new BatchSet();
  const elev = lm.elevation;
  const extMat = mats.paint(model.spec.exterior?.wall ?? '#ece5d6');
  const defMat = mats.paint(DEFAULT_WALL_PAINT);
  const revealMat = mats.reveal();
  const topMat = mats.solid('#3d3a36', 0.9, true);
  const bandMat = mats.trim();
  const lintelH = lintelHeight(lm);
  const hasExterior = lm.walls.some((w) => w.wall.kind === 'exterior');

  lm.walls.forEach((wm, wi) => {
    const r = wm.rect;
    const L = r.len, ht = r.ht, H = wm.height;
    const P = (s: number, h: number, q: number): P3 => [r.ax + r.ux * s + wm.nx * q, elev + h, r.ay + r.uy * s + wm.ny * q];
    const M = wallMatrix(wm);

    // ---- where the face may change owner: opening edges and every room corner lying against this wall
    const cutList: number[] = [0, L];
    for (const om of wm.openings) cutList.push(om.s0, om.s1);
    const addVerts = (poly: Vec2[]) => {
      for (const v of poly) {
        const [s, q] = orectLocal(r, v[0], v[1]);
        if (Math.abs(q) <= ht + 0.15 && s > 0.005 && s < L - 0.005) cutList.push(s);
      }
    };
    for (const rm of lm.rooms) addVerts(rm.poly);
    for (const h of lm.floorOpenings) addVerts(h);
    cutList.sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const c of cutList) if (!cuts.length || c - cuts[cuts.length - 1] > 1e-3) cuts.push(c);

    const infoAt = (x: number, y: number): FaceInfo => {
      if (insideAnyWall(lm, x, y, wm)) return { room: null, mat: defMat, exterior: false, base: 0, hidden: true };
      const room = faceRoom(model, lm, x, y);
      if (room) return { room, mat: mats.paint(room.room.wallColor ?? DEFAULT_WALL_PAINT), exterior: false, base: room.level === lm ? Math.min(0, room.offset) : 0, hidden: false };
      if (wm.wall.kind === 'exterior') return { room: null, mat: extMat, exterior: true, base: lm.onGrade ? -0.03 : 0, hidden: false };
      return { room: null, mat: defMat, exterior: false, base: 0, hidden: false };
    };

    for (const side of [1, -1] as const) {
      const q = side * ht;
      const hint: P3 = [side * wm.nx, 0, side * wm.ny];
      const spans: { sa: number; sb: number; info: FaceInfo }[] = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const sa = cuts[i], sb = cuts[i + 1];
        const [px, py] = wallPoint(wm, (sa + sb) / 2, side * (ht + 0.06));
        spans.push({ sa, sb, info: infoAt(px, py) });
      }
      const rect = (b: Batch, s0: number, s1: number, h0: number, h1: number) => {
        if (s1 - s0 < 1e-4 || h1 - h0 < 1e-4) return;
        b.quad(P(s0, h0, q), P(s1, h0, q), P(s1, h1, q), P(s0, h1, q), hint, [s0, h0, s1, h0, s1, h1, s0, h1], wi);
      };
      for (const { sa, sb, info } of spans) {
        if (info.hidden) continue;
        const room = info.room;
        const dado = room && room.level === lm && room.room.dado && room.room.dado.height > 0.05 ? room.room.dado : null;
        const dadoTop = dado ? (room!.offset + dado.height) : -Infinity;
        const dadoMat = dado ? mats.finish(dado.finish, true) : null;
        for (const p of wm.pieces) {
          const s0 = Math.max(sa, p.s0), s1 = Math.min(sb, p.s1);
          if (s1 - s0 < 1e-4) continue;
          const h0 = p.h0 <= 1e-6 ? info.base : p.h0;
          const h1 = p.h1;
          if (dadoMat && h0 < dadoTop) {
            rect(set.get(dadoMat), s0, s1, h0, Math.min(h1, dadoTop));
            if (h1 > dadoTop) rect(set.get(info.mat), s0, s1, dadoTop, h1);
          } else rect(set.get(info.mat), s0, s1, h0, h1);
        }
        // arch spandrels on this face
        for (const om of wm.openings) {
          if (!om.arch || om.archRise <= 0) continue;
          const sm = (om.s0 + om.s1) / 2;
          if (sm < sa || sm > sb) continue;
          const b = set.get(info.mat);
          for (let k = 0; k < ARCH_SEG; k++) {
            const s0 = om.s0 + ((om.s1 - om.s0) * k) / ARCH_SEG, s1 = om.s0 + ((om.s1 - om.s0) * (k + 1)) / ARCH_SEG;
            const h0 = archHeight(om, s0), h1 = archHeight(om, s1);
            b.quad(P(s0, h0, q), P(s1, h1, q), P(s1, om.head, q), P(s0, om.head, q), hint, [s0, h0, s1, h1, s1, om.head, s0, om.head], wi);
          }
        }
        // skirting along interior room faces (not over door gaps, not in tiled or outdoor rooms)
        if (room && room.level === lm && !room.room.outdoor && !dado) {
          const sk = trims.get(mats.finishFlat(room.room.floor, 0.14));
          let a = sa;
          const gaps = wm.openings.filter((o) => o.sill < SKIRT_H && o.s1 > sa && o.s0 < sb);
          const run = (x0: number, x1: number) => {
            if (x1 - x0 < 0.02) return;
            sk.box(M, (x0 + x1) / 2, room.offset + SKIRT_H / 2, side * (ht + SKIRT_T / 2), x1 - x0, SKIRT_H, SKIRT_T, wi, 'y-' + (side > 0 ? 'z-' : 'z+'));
          };
          for (const g of gaps) { run(a, Math.min(sb, g.s0)); a = Math.max(a, g.s1); }
          run(a, sb);
        }
        // exterior lintel band
        if (info.exterior && hasExterior && lintelH + BAND_H < H - 0.05) {
          const band = trims.get(bandMat);
          let a = sa <= 1e-3 ? -BAND_T : sa;
          const end = sb >= L - 1e-3 ? L + BAND_T : sb;
          const gaps = wm.openings.filter((o) => o.sill < lintelH + BAND_H && o.head > lintelH + 1e-3 && o.s1 > sa && o.s0 < sb);
          const run = (x0: number, x1: number) => {
            if (x1 - x0 < 0.02) return;
            band.box(M, (x0 + x1) / 2, lintelH + BAND_H / 2, side * (ht + BAND_T / 2), x1 - x0, BAND_H, BAND_T, wi, side > 0 ? 'z-' : 'z+');
          };
          for (const g of gaps) { run(a, Math.min(end, g.s0)); a = Math.max(a, g.s1); }
          run(a, end);
        }
      }
    }

    // ---- ends
    for (const end of [0, 1] as const) {
      const s = end ? L : 0;
      const [px, py] = wallPoint(wm, end ? L + 0.06 : -0.06, 0);
      const info = infoAt(px, py);
      if (info.hidden) continue;
      const hint: P3 = end ? [r.ux, 0, r.uy] : [-r.ux, 0, -r.uy];
      set.get(info.mat).quad(P(s, info.base, -ht), P(s, info.base, ht), P(s, H, ht), P(s, H, -ht), hint, [-ht, info.base, ht, info.base, ht, H, -ht, H], wi);
      if (info.exterior && hasExterior && lintelH + BAND_H < H - 0.05) {
        trims.get(bandMat).box(M, end ? L + BAND_T / 2 : -BAND_T / 2, lintelH + BAND_H / 2, 0, BAND_T, BAND_H, 2 * ht + 2 * BAND_T, wi, end ? 'x-' : 'x+');
      }
    }

    // ---- tops, sills, heads, jambs
    const top = set.get(topMat);
    for (const p of wm.pieces) {
      if (p.h1 >= H - 1e-6) top.quad(P(p.s0, H, -ht), P(p.s1, H, -ht), P(p.s1, H, ht), P(p.s0, H, ht), [0, 1, 0], undefined, wi);
    }
    const rev = set.get(revealMat);
    for (const om of wm.openings) {
      const { s0, s1, sill, head } = om;
      if (sill > 1e-4) rev.quad(P(s0, sill, -ht), P(s1, sill, -ht), P(s1, sill, ht), P(s0, sill, ht), [0, 1, 0], [s0, -ht, s1, -ht, s1, ht, s0, ht], wi);
      const spring = om.arch ? head - om.archRise : head;
      rev.quad(P(s0, sill, -ht), P(s0, sill, ht), P(s0, spring, ht), P(s0, spring, -ht), [r.ux, 0, r.uy], [-ht, sill, ht, sill, ht, spring, -ht, spring], wi);
      rev.quad(P(s1, sill, -ht), P(s1, sill, ht), P(s1, spring, ht), P(s1, spring, -ht), [-r.ux, 0, -r.uy], [-ht, sill, ht, sill, ht, spring, -ht, spring], wi);
      if (om.arch && om.archRise > 0) {
        const sc = (s0 + s1) / 2;
        for (let k = 0; k < ARCH_SEG; k++) {
          const a = s0 + ((s1 - s0) * k) / ARCH_SEG, b = s0 + ((s1 - s0) * (k + 1)) / ARCH_SEG;
          const ha = archHeight(om, a), hb = archHeight(om, b);
          const mid = (a + b) / 2;
          const hx = (sc - mid) * r.ux, hz = (sc - mid) * r.uy;
          rev.quad(P(a, ha, -ht), P(b, hb, -ht), P(b, hb, ht), P(a, ha, ht), [hx, spring - (ha + hb) / 2 - 0.01, hz], undefined, wi);
        }
      } else if (head < H - 1e-4) {
        rev.quad(P(s0, head, -ht), P(s1, head, -ht), P(s1, head, ht), P(s0, head, ht), [0, -1, 0], [s0, -ht, s1, -ht, s1, ht, s0, ht], wi);
      }
    }
  });

  const levelId = lm.level.id;
  const pick = (owner: number) => (lm.walls[owner] ? { type: 'wall', levelId, wallId: lm.walls[owner].wall.id } : null);
  set.flush(wallsGroup, { pick, name: 'walls', data: { role: 'wall', clipped: true } });
  trims.flush(finishGroup, { name: 'wall-trim', pick, data: { clipped: true } });
}

/**
 * Section caps for the dollhouse cut: a dark "poché" surface on every wall where the cut plane passes through
 * solid masonry, so cut walls read as solid instead of hollow shells.
 */
export function buildCutCaps(ctx: BuildCtx, lm: LevelModel, cutHeight: number, group: THREE.Group, columns: { x: number; y: number; w: number; d: number }[]): void {
  const set = new BatchSet();
  const b = set.get(ctx.mats.cap());
  const y = lm.elevation + cutHeight - 0.0015;
  for (const wm of lm.walls) {
    if (cutHeight >= wm.height) continue;
    const r = wm.rect;
    const P = (s: number, q: number): P3 => [r.ax + r.ux * s + wm.nx * q, y, r.ay + r.uy * s + wm.ny * q];
    for (const p of wm.pieces) {
      if (!(p.h0 < cutHeight && p.h1 > cutHeight)) continue;
      b.quad(P(p.s0, -r.ht), P(p.s1, -r.ht), P(p.s1, r.ht), P(p.s0, r.ht), [0, 1, 0]);
    }
  }
  for (const c of columns) {
    const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.y - c.d / 2, z1 = c.y + c.d / 2;
    b.quad([x0, y + 0.0005, z0], [x1, y + 0.0005, z0], [x1, y + 0.0005, z1], [x0, y + 0.0005, z1], [0, 1, 0]);
  }
  set.flush(group, { cast: false, receive: true, name: 'cut-caps' });
}
