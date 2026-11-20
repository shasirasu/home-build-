// Floors and floor plates: room floor finishes (true-size procedural textures), door thresholds, the ground-floor
// plinth, upper RCC slabs with their stairwell holes, the white soffit under them (the ceiling of the storey below)
// and the slab band that shows on the elevation.

import * as THREE from 'three';
import type { Vec2 } from '@/types/house';
import { Batch, BatchSet, polyFace, polyFaceDiff, polySides } from '../core/batch';
import { offsetPoly, pointInPoly } from '../core/geo';
import type { LevelModel, RoomModel } from './model';
import { wallMatrix, type BuildCtx } from './walls';

/** Finished floors sit exactly at FFL; structural tops stay a hair below so nothing is coplanar. */
export const FLOOR_GAP = 0.004;
export const BAND_OUT = 0.02;
const PLINTH_OUT = 0.03;

export interface FloorBuild {
  floors: THREE.Mesh[];
}

/** Ring between two matching polygons (same vertex count) at height y. */
export function ringFace(b: Batch, outer: Vec2[], inner: Vec2[], y: number, up: boolean): void {
  const n = Math.min(outer.length, inner.length);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.quad([outer[i][0], y, outer[i][1]], [outer[j][0], y, outer[j][1]], [inner[j][0], y, inner[j][1]], [inner[i][0], y, inner[i][1]], [0, up ? 1 : -1, 0]);
  }
}

export function buildFloors(ctx: BuildCtx, lm: LevelModel, finishGroup: THREE.Group, rccGroup: THREE.Group): FloorBuild {
  const { mats, model } = ctx;
  const elev = lm.elevation;
  const floors: THREE.Mesh[] = [];
  const fp = lm.footprint;
  const hasFp = fp.length >= 3;
  const inFootprint = (r: RoomModel) => hasFp && pointInPoly(r.anchor[0], r.anchor[1], fp);

  // ---- room floors: one mesh per room so a floor can be picked / highlighted as its room
  for (const rm of lm.rooms) {
    const b = new Batch();
    // stairwells are cut out of the room floor too (a traced room may be drawn right across the well)
    polyFaceDiff(b, rm.poly, lm.floorOpenings, rm.floorY, true);
    if (b.empty) continue;
    const mesh = new THREE.Mesh(b.build(), mats.finish(rm.room.floor));
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = `floor:${rm.room.id}`;
    mesh.userData.sel = { type: 'room', levelId: lm.level.id, roomId: rm.room.id };
    mesh.userData.floor = true;
    mesh.userData.room = rm;
    finishGroup.add(mesh);
    floors.push(mesh);
  }

  const set = new BatchSet();

  // ---- thresholds: the strip of floor inside each doorway (rooms are clear inside-face polygons)
  for (const wm of lm.walls) {
    const M = wallMatrix(wm);
    for (const om of wm.openings) {
      if (om.sill > 0.02) continue;
      const offs = [om.roomPlus, om.roomMinus].filter((r): r is RoomModel => !!r).map((r) => r.offset);
      const h = offs.length ? Math.max(...offs) : 0;
      const isDoor = om.opening.kind === 'door';
      const side = om.roomPlus && !om.roomPlus.room.outdoor ? om.roomPlus : (om.roomMinus ?? om.roomPlus);
      const mat = isDoor || !side ? mats.finish('granite-black') : mats.finish(side.room.floor);
      const b = set.get(mat);
      const W = om.s1 - om.s0, t = wm.rect.ht * 2;
      const sc = (om.s0 + om.s1) / 2;
      // a 6 mm slab so it has a visible edge where the two floors differ in height
      b.box(M, sc, h - 0.003 + 0.0005, 0, W, 0.007, t + 0.004, -1, 'y-');
      const lo = offs.length ? Math.min(...offs) : 0;
      if (h - lo > 0.01) {
        // riser face down to the lower floor on that side
        const lowSide = om.roomPlus && om.roomPlus.offset === lo ? 1 : -1;
        b.box(M, sc, (h + lo) / 2, lowSide * (t / 2 + 0.004), W, h - lo, 0.008, -1, 'y-');
      }
    }
  }

  // ---- sunken / raised rooms inside the plate: kerb faces
  const sunken = lm.rooms.filter((r) => r.offset < -0.005 && inFootprint(r));
  const kerb = set.get(mats.solid('#c9c5bb', 0.8));
  for (const r of sunken) polySides(kerb, r.poly, r.floorY, elev, false);
  for (const r of lm.rooms) if (r.offset > 0.005) polySides(kerb, r.poly, elev - FLOOR_GAP, r.floorY, true);

  set.flush(finishGroup, { cast: false, name: 'thresholds' });

  // ---- the plate itself
  if (!hasFp) return { floors };
  const holes = [...lm.floorOpenings, ...sunken.map((r) => r.poly)];
  const rcc = new BatchSet();
  const fill = new BatchSet();
  const band = new BatchSet();

  if (lm.onGrade) {
    // solid plinth from the ground up to FFL, in the plinth stone colour
    const pm = mats.solid(model.spec.exterior?.plinth ?? '#6f6a62', 0.88);
    const b = fill.get(pm);
    const outer = offsetPoly(fp, PLINTH_OUT);
    polyFaceDiff(b, outer, sunken.map((r) => r.poly), elev - FLOOR_GAP, true);
    polySides(b, outer, -0.2, elev - FLOOR_GAP, true);
    // rooms outside the footprint (portico, sit-out) get their own plinth up to their floor
    for (const rm of lm.rooms) {
      if (inFootprint(rm)) continue;
      const o = offsetPoly(rm.poly, PLINTH_OUT);
      polyFace(b, o, [], rm.floorY - FLOOR_GAP, true);
      polySides(b, o, -0.2, rm.floorY - FLOOR_GAP, true);
    }
    fill.flush(finishGroup, { name: 'plinth', data: { plinth: true } });
  } else if (lm.slab > 0.001) {
    const top = rcc.get(mats.solid('#bdb8ad', 0.85));
    const soffit = rcc.get(mats.ceiling());
    const y1 = elev - FLOOR_GAP, y0 = elev - lm.slab;
    polyFaceDiff(top, fp, holes, y1, true);
    polySides(top, fp, y0, y1, true);
    polyFaceDiff(soffit, fp, lm.floorOpenings, y0, false);
    for (const h of lm.floorOpenings) polySides(soffit, h, y0, y1, false);
    // under sunken rooms the slab drops with them
    for (const r of sunken) polyFace(top, r.poly, [], r.floorY - FLOOR_GAP, true);
    rcc.flush(rccGroup, { name: 'slab', data: { rcc: 'slab' } });

    // slab band on the elevation
    const bm = mats.paint(model.spec.exterior?.band ?? '#8a6a4f', false, 0.85);
    const bb = band.get(bm);
    const outer = offsetPoly(fp, BAND_OUT);
    polySides(bb, outer, y0 - 0.012, elev, true);
    ringFace(bb, outer, fp, elev, true);
    ringFace(bb, outer, fp, y0 - 0.012, false);
    band.flush(finishGroup, { name: 'slab-band' });
  }
  return { floors };
}
