// RCC frame. Two faces of the same data:
//   normal view    – only what you would see in the finished house: free-standing columns (with base and capital)
//                    and beam downstands, plastered; everything embedded in walls / slabs is left out.
//   structure view – footings, full columns, every beam, colour-coded by element type.
// Columns are split per storey so level cutaways and the dollhouse cut work on them.

import * as THREE from 'three';
import type { Beam, Column } from '@/types/house';
import { BatchSet } from '../core/batch';
import { clamp, finite, orectFromSeg, pointInORect, pointInPoly, type ORect } from '../core/geo';
import { zoneCladding } from './facade';
import { roomAt, type HouseModel, type LevelModel } from './model';
import { FLOOR_GAP } from './floors';
import type { BuildCtx } from './walls';

export interface StructureBuild {
  columns: Column[];
  beams: Beam[];
  /** per level: columns standing free on that storey (walk collision, cut caps) */
  freeColumns: Column[][];
  /** per level: every column passing through that storey (cut caps in structure view) */
  levelColumns: Column[][];
  beamRects: { beam: Beam; rect: ORect; bottom: number; top: number; owner: number }[];
  footTop: number;
}

export interface StructureGroups {
  /** normal-view parts per level (inside each level's finish group) */
  finish: THREE.Group[];
  /** structure-view parts per level */
  struct: THREE.Group[];
  roofFinish: THREE.Group;
  roofStruct: THREE.Group;
}

function columnEmbedded(lm: LevelModel, c: Column): boolean {
  const hx = c.w / 2 - 0.002, hy = c.d / 2 - 0.002;
  const pts: [number, number][] = [[c.x - hx, c.y - hy], [c.x + hx, c.y - hy], [c.x + hx, c.y + hy], [c.x - hx, c.y + hy], [c.x, c.y]];
  return pts.every(([x, y]) => lm.walls.some((w) => pointInORect(w.rect, x, y, 0.004)));
}

/** Index of the level whose floor plate a beam belongs to; levels.length = roof. */
export function beamOwner(model: HouseModel, top: number): number {
  for (const lm of model.levels) if (lm.elevation >= top - 0.25) return lm.index;
  return model.levels.length;
}

export function buildStructure(ctx: BuildCtx, groups: StructureGroups): StructureBuild {
  const { model, mats } = ctx;
  const st = model.spec.structure;
  const levels = model.levels;
  const columns = (st?.columns ?? []).filter((c) => c && [c.x, c.y, c.w, c.d].every(Number.isFinite) && c.w > 0.02 && c.d > 0.02);
  const beams = (st?.beams ?? []).filter((b) => b && b.a && b.b && Number.isFinite(b.top) && b.width > 0.01 && b.depth > 0.01);
  const footing = st?.footing;
  const fSize = clamp(finite(footing?.size, 1.2), 0.3, 6), fDepth = clamp(finite(footing?.depth, 1.5), 0.2, 8), fThick = clamp(finite(footing?.thickness, 0.4), 0.1, 2);
  const footTop = -fDepth + fThick;
  const N = levels.length;

  const freeColumns: Column[][] = levels.map(() => []);
  const levelColumns: Column[][] = levels.map(() => []);
  const beamRects: StructureBuild['beamRects'] = [];
  for (const b of beams) {
    const rect = orectFromSeg(b.a, b.b, b.width);
    if (!rect) { console.warn(`[HouseViewer] beam ${b.id} has zero length, skipped`); continue; }
    beamRects.push({ beam: b, rect, bottom: b.top - b.depth, top: b.top, owner: beamOwner(model, b.top) });
  }
  if (!N) return { columns, beams, freeColumns, levelColumns, beamRects, footTop };

  const facade = ctx.facade;
  const extMat = (lm: LevelModel) => mats.cladding(zoneCladding(facade, lm.index > 0 ? 'upper' : 'ground'), facade.images);
  const sets = () => Array.from({ length: N + 1 }, () => new BatchSet()); // last = roof
  const colStruct = sets(), colFinish = sets(), beamStruct = sets(), beamFinish = sets(), footStruct = new BatchSet();
  const colMat = mats.rcc('column', true);

  // ------------------------------------------------------------------------------------------- columns
  columns.forEach((c, ci) => {
    const through = levels.filter((lm) => !Array.isArray(c.levels) || c.levels.length === 0 || c.levels.includes(lm.level.id));
    if (!through.length) return;
    through.forEach((lm, k) => {
      levelColumns[lm.index].push(c);
      const y0 = k === 0 && lm.index === 0 ? footTop : lm.elevation - lm.slab;
      const y1 = lm.ceilingY;
      colStruct[lm.index].get(colMat).box(null, c.x, (y0 + y1) / 2, c.y, c.w, y1 - y0, c.d, ci);
      // finished column where it stands clear of the walls
      if (columnEmbedded(lm, c)) return;
      freeColumns[lm.index].push(c);
      const room = roomAt(lm, c.x, c.y);
      const outdoors = !room || !!room.room.outdoor;
      const floorY = room ? room.floorY : lm.index === 0 && !(lm.footprint.length >= 3 && pointInPoly(c.x, c.y, lm.footprint)) ? 0 : lm.elevation;
      let topY = lm.ceilingY;
      for (const br of beamRects) if (br.bottom > floorY + 1 && br.bottom < topY && pointInORect(br.rect, c.x, c.y, 0.02)) topY = br.bottom;
      // a column standing outdoors is finished like the walls of its storey (never with a stretched picture)
      const outMat = extMat(lm).userData.fit ? mats.paint('#f3f1ec') : extMat(lm);
      const shaft = colFinish[lm.index].get(outdoors ? outMat : mats.paint(room?.room.wallColor ?? '#f1ede4'));
      const trim = colFinish[lm.index].get(mats.trim());
      shaft.box(null, c.x, (floorY + topY) / 2, c.y, c.w, topY - floorY, c.d, ci, 'y-y+');
      // moulded base and cap belong to the traditional look; a modern column is a plain shaft
      if (outdoors && !facade.traditional) return;
      const bh = Math.min(0.14, (topY - floorY) * 0.1);
      trim.box(null, c.x, floorY + bh / 2, c.y, c.w + 0.07, bh, c.d + 0.07, ci, 'y-');
      trim.box(null, c.x, floorY + bh + 0.015, c.y, c.w + 0.035, 0.03, c.d + 0.035, ci, 'y-');
      trim.box(null, c.x, topY - 0.045, c.y, c.w + 0.06, 0.09, c.d + 0.06, ci, 'y+');
      trim.box(null, c.x, topY - 0.105, c.y, c.w + 0.03, 0.03, c.d + 0.03, ci, 'y+');
    });
    // through the plate above the last storey it serves
    const topLm = through[through.length - 1];
    if (topLm.index === N - 1) colStruct[N].get(mats.rcc('column')).box(null, c.x, (model.roofSoffit + model.roofTop) / 2, c.y, c.w, model.roofTop - model.roofSoffit, c.d, ci);
    else {
      const up = levels[topLm.index + 1];
      colStruct[up.index].get(colMat).box(null, c.x, (topLm.ceilingY + up.elevation) / 2, c.y, c.w, up.elevation - topLm.ceilingY, c.d, ci);
    }
    // isolated footing with a small pedestal
    if (through[0].index === 0) {
      const fs = footStruct.get(mats.rcc('footing'));
      fs.box(null, c.x, -fDepth + fThick / 2, c.y, fSize, fThick, fSize, ci);
      fs.box(null, c.x, footTop + 0.075, c.y, Math.min(fSize, c.w + 0.3), 0.15, Math.min(fSize, c.d + 0.3), ci, 'y-');
    }
  });

  // ------------------------------------------------------------------------------------------- beams
  const lowest = levels[0];
  beams.forEach((b, bi) => {
    const rect = orectFromSeg(b.a, b.b, b.width);
    if (!rect) return;
    const owner = beamOwner(model, b.top);
    const M = new THREE.Matrix4().makeRotationY(Math.atan2(-rect.uy, rect.ux)).setPosition(rect.ax, 0, rect.ay);
    beamStruct[owner].get(mats.rcc(b.kind === 'plinth' ? 'plinthBeam' : 'beam')).box(M, rect.len / 2, b.top - b.depth / 2, 0, rect.len, b.depth, b.width, bi);

    // normal view: plastered downstand. Beams buried in the ground-floor fill are not shown.
    if (lowest.onGrade && b.top <= lowest.elevation + 0.01) return;
    const below = levels[Math.min(N - 1, Math.max(0, owner - 1))];
    const room = roomAt(below, (b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2);
    const indoor = !!room && !room.room.outdoor;
    const bandMat = mats.cladding(zoneCladding(facade, 'band'), facade.images, false);
    const mat = indoor ? mats.ceiling() : bandMat.userData.fit ? mats.paint('#f3f1ec', false) : bandMat;
    const drop = FLOOR_GAP + 0.002;
    const depth = b.depth - drop;
    if (depth > 0.01) beamFinish[owner].get(mat).box(M, rect.len / 2, b.top - drop - depth / 2, 0, rect.len + b.width, depth, b.width, bi, 'y+');
  });

  const colPick = (owner: number) => (columns[owner] ? { type: 'column', columnId: columns[owner].id } : null);
  const beamPick = (owner: number) => (beams[owner] ? { type: 'beam', beamId: beams[owner].id } : null);
  for (let i = 0; i <= N; i++) {
    const sg = i < N ? groups.struct[i] : groups.roofStruct;
    const fg = i < N ? groups.finish[i] : groups.roofFinish;
    colStruct[i].flush(sg, { name: 'rcc-columns', pick: colPick, data: { clipped: i < N } });
    beamStruct[i].flush(sg, { name: 'rcc-beams', pick: beamPick });
    colFinish[i].flush(fg, { name: 'columns', pick: colPick, data: { clipped: true } });
    beamFinish[i].flush(fg, { name: 'beams', pick: beamPick });
  }
  footStruct.flush(groups.struct[0], { name: 'rcc-footings', pick: colPick });
  return { columns, beams, freeColumns, levelColumns, beamRects, footTop };
}
