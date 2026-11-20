// Derived house model: everything the builders, the walk controller and picking need that is not written in the
// spec itself (wall frames, wall pieces around openings, heights, which room is on which side of a wall …).
// Computed once per setHouse(). Odd input is clamped or skipped with a console.warn, never thrown.

import type { HouseSpec, Level, Opening, Room, Vec2, Wall } from '@/types/house';
import { EPS, cleanPoly, clamp, finite, interiorPoint, orectFromSeg, pointInORect, pointInPoly, polyBBox, type ORect } from '../core/geo';

export interface WallPiece {
  /** along the wall from a */
  s0: number; s1: number;
  /** above the level FFL */
  h0: number; h1: number;
}

export interface OpeningModel {
  opening: Opening;
  wall: WallModel;
  s0: number; s1: number;
  sill: number; head: number;
  /** Side of the wall (sign of the left-hand normal) that looks outdoors; 0 for an opening between two rooms. */
  outSide: 1 | -1 | 0;
  roomPlus: RoomModel | null;
  roomMinus: RoomModel | null;
  arch: boolean;
  /** Height of the arched part below the crown (0 when not an arch). */
  archRise: number;
}

export interface WallModel {
  wall: Wall;
  level: LevelModel;
  rect: ORect;
  /** left-hand normal of a→b (the +1 side) */
  nx: number; ny: number;
  height: number;
  openings: OpeningModel[];
  pieces: WallPiece[];
}

export interface RoomModel {
  room: Room;
  level: LevelModel;
  poly: Vec2[];
  /** absolute floor height */
  floorY: number;
  offset: number;
  anchor: Vec2;
  box: { x0: number; y0: number; x1: number; y1: number };
}

export interface LevelModel {
  level: Level;
  index: number;
  elevation: number;
  /** absolute underside of whatever covers this level (next slab or roof slab) */
  ceilingY: number;
  /** absolute top of this storey (next FFL or roof terrace) */
  topY: number;
  slab: number;
  onGrade: boolean;
  footprint: Vec2[];
  floorOpenings: Vec2[][];
  walls: WallModel[];
  rooms: RoomModel[];
  wallById: Map<string, WallModel>;
  openingById: Map<string, OpeningModel>;
}

export interface HouseModel {
  spec: HouseSpec;
  levels: LevelModel[];
  levelById: Map<string, LevelModel>;
  roofTop: number;
  roofSoffit: number;
  roofOutline: Vec2[];
  /** plan bounds of the building (all footprints, rooms and the roof) */
  box: { x0: number; y0: number; x1: number; y1: number };
  /** plan bounds including the plot */
  siteBox: { x0: number; y0: number; x1: number; y1: number };
  topY: number;
  centre: Vec2;
  radius: number;
}

const warn = (...a: unknown[]) => console.warn('[HouseViewer]', ...a);

export function buildModel(spec: HouseSpec): HouseModel {
  const srcLevels = [...(spec.levels ?? [])].filter((l) => l && Number.isFinite(l.elevation)).sort((a, b) => a.elevation - b.elevation);
  const roof = spec.roof;
  const top = srcLevels[srcLevels.length - 1];
  const roofTop = roof && Number.isFinite(roof.elevation) ? roof.elevation : top ? top.elevation + finite(top.height, 3) : 3;
  const roofSlab = roof ? clamp(finite(roof.slab, 0.125), 0.02, 1) : 0.125;
  const roofOutline = cleanPoly(roof?.outline) ;

  const levels: LevelModel[] = [];
  srcLevels.forEach((level, index) => {
    const next = srcLevels[index + 1];
    const elevation = level.elevation;
    const slab = clamp(finite(level.slab, 0), 0, 1);
    let topY = next ? next.elevation : roofTop;
    if (!(topY > elevation + 0.5)) topY = elevation + Math.max(2.4, finite(level.height, 3));
    const slabAbove = next ? clamp(finite(next.slab, 0.125), 0, 1) : roofSlab;
    const ceilingY = topY - slabAbove;
    const lm: LevelModel = {
      level, index, elevation, ceilingY, topY, slab,
      onGrade: index === 0 && slab <= 0.001,
      footprint: cleanPoly(level.footprint),
      floorOpenings: (level.floorOpenings ?? []).map((p) => cleanPoly(p)).filter((p) => p.length >= 3),
      walls: [], rooms: [], wallById: new Map(), openingById: new Map(),
    };
    for (const room of level.rooms ?? []) {
      const poly = cleanPoly(room?.polygon);
      if (poly.length < 3) { warn(`room ${room?.id} has no usable polygon, skipped`); continue; }
      const offset = finite(room.floorOffset, 0);
      lm.rooms.push({ room, level: lm, poly, offset, floorY: elevation + offset, anchor: interiorPoint(poly, lm.floorOpenings), box: polyBBox(poly) });
    }
    levels.push(lm);
  });

  // walls + openings
  for (const lm of levels) {
    const defH = Math.max(0.3, lm.ceilingY - lm.elevation);
    for (const wall of lm.level.walls ?? []) {
      if (!wall || !wall.a || !wall.b) continue;
      const rect = orectFromSeg(wall.a, wall.b, clamp(finite(wall.thickness, 0.115), 0.02, 1.5));
      if (!rect) { warn(`wall ${wall.id} has zero length, skipped`); continue; }
      const height = clamp(finite(wall.height, defH), 0.05, 30);
      const wm: WallModel = { wall, level: lm, rect, nx: -rect.uy, ny: rect.ux, height, openings: [], pieces: [] };
      lm.walls.push(wm);
      lm.wallById.set(wall.id, wm);
    }
    for (const o of lm.level.openings ?? []) {
      const wm = o ? lm.wallById.get(o.wallId) : undefined;
      if (!o || !wm) { warn(`opening ${o?.id} refers to a missing wall, skipped`); continue; }
      const L = wm.rect.len;
      let w = finite(o.width, 0);
      const at = finite(o.at, L / 2);
      let s0 = at - w / 2, s1 = at + w / 2;
      const margin = Math.min(0.02, L * 0.05);
      if (s0 < margin || s1 > L - margin) {
        s0 = clamp(s0, margin, L - margin);
        s1 = clamp(s1, margin, L - margin);
        w = s1 - s0;
        warn(`opening ${o.id} runs past its wall, clamped`);
      }
      if (!(w > 0.05)) { warn(`opening ${o.id} is too narrow, skipped`); continue; }
      const sill = clamp(finite(o.sill, 0), 0, wm.height - 0.05);
      let head = sill + Math.max(0.05, finite(o.height, 2.1));
      if (head > wm.height - 0.02) head = wm.height;
      if (wm.openings.some((p) => s0 < p.s1 - EPS && s1 > p.s0 + EPS)) { warn(`opening ${o.id} overlaps another opening, skipped`); continue; }
      const arch = o.style === 'arch' && o.kind !== 'window' && o.kind !== 'ventilator';
      const archRise = arch ? Math.min(w * 0.3, 0.36, (head - sill) * 0.3) : 0;
      const om: OpeningModel = { opening: o, wall: wm, s0, s1, sill, head, outSide: 0, roomPlus: null, roomMinus: null, arch, archRise };
      wm.openings.push(om);
      lm.openingById.set(o.id, om);
    }
    for (const wm of lm.walls) {
      wm.openings.sort((a, b) => a.s0 - b.s0);
      let cursor = 0;
      for (const om of wm.openings) {
        if (om.s0 > cursor + EPS) wm.pieces.push({ s0: cursor, s1: om.s0, h0: 0, h1: wm.height });
        if (om.sill > EPS) wm.pieces.push({ s0: om.s0, s1: om.s1, h0: 0, h1: om.sill });
        if (om.head < wm.height - EPS) wm.pieces.push({ s0: om.s0, s1: om.s1, h0: om.head, h1: wm.height });
        cursor = om.s1;
      }
      if (wm.rect.len > cursor + EPS) wm.pieces.push({ s0: cursor, s1: wm.rect.len, h0: 0, h1: wm.height });
      for (const om of wm.openings) {
        const mid = (om.s0 + om.s1) / 2;
        om.roomPlus = sideRoom(wm, mid, 1);
        om.roomMinus = sideRoom(wm, mid, -1);
        const inP = !!om.roomPlus && !om.roomPlus.room.outdoor;
        const inM = !!om.roomMinus && !om.roomMinus.room.outdoor;
        if (inP && !inM) om.outSide = -1;
        else if (inM && !inP) om.outSide = 1;
        else if (!inP && !inM && wm.wall.kind === 'exterior' && lm.footprint.length) {
          const [px, py] = wallPoint(wm, mid, wm.rect.ht + 0.1);
          om.outSide = pointInPoly(px, py, lm.footprint) ? -1 : 1;
        }
      }
    }
  }

  // bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p: Vec2[]) => { for (const v of p) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); } };
  for (const lm of levels) {
    grow(lm.footprint);
    for (const r of lm.rooms) grow(r.poly);
    for (const w of lm.walls) grow([w.wall.a, w.wall.b]);
  }
  grow(roofOutline);
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 8; y1 = 8; }
  const box = { x0, y0, x1, y1 };
  const siteBox = { ...box };
  const plot = cleanPoly(spec.site?.plot);
  for (const v of plot) { siteBox.x0 = Math.min(siteBox.x0, v[0]); siteBox.y0 = Math.min(siteBox.y0, v[1]); siteBox.x1 = Math.max(siteBox.x1, v[0]); siteBox.y1 = Math.max(siteBox.y1, v[1]); }
  const parapet = roof?.parapet ? finite(roof.parapet.height, 0) : 0;
  const topY = roofTop + Math.max(0, parapet);
  const centre: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2];
  const radius = Math.hypot(x1 - x0, y1 - y0, topY) / 2;

  return {
    spec, levels, levelById: new Map(levels.map((l) => [l.level.id, l])),
    roofTop, roofSoffit: roofTop - roofSlab, roofOutline, box, siteBox, topY, centre, radius,
  };
}

/** Plan point at distance s along the wall and q across it (q > 0 = left-hand-normal side). */
export function wallPoint(wm: WallModel, s: number, q: number): Vec2 {
  const r = wm.rect;
  return [r.ax + r.ux * s + wm.nx * q, r.ay + r.uy * s + wm.ny * q];
}

export function roomAt(lm: LevelModel, x: number, y: number): RoomModel | null {
  for (const r of lm.rooms) {
    if (x < r.box.x0 || x > r.box.x1 || y < r.box.y0 || y > r.box.y1) continue;
    if (pointInPoly(x, y, r.poly)) return r;
  }
  return null;
}

/** Room just beyond a wall face at distance s along the wall. */
export function sideRoom(wm: WallModel, s: number, side: 1 | -1): RoomModel | null {
  const [x, y] = wallPoint(wm, s, side * (wm.rect.ht + 0.06));
  return roomAt(wm.level, x, y);
}

export function insideAnyWall(lm: LevelModel, x: number, y: number, except?: WallModel, grow = 0.002): boolean {
  for (const w of lm.walls) if (w !== except && pointInORect(w.rect, x, y, grow)) return true;
  return false;
}

export function inFloorOpening(lm: LevelModel, x: number, y: number): boolean {
  for (const h of lm.floorOpenings) if (pointInPoly(x, y, h)) return true;
  return false;
}

/** True when this level has a floor (slab or ground-floor fill) under the point. */
export function hasFloorAt(lm: LevelModel, x: number, y: number): boolean {
  if (lm.footprint.length >= 3 && pointInPoly(x, y, lm.footprint)) return !inFloorOpening(lm, x, y);
  return false;
}

/** Absolute height of the soffit (slab / roof underside) above a point of a level; falls back to the level's ceiling. */
export function ceilingAbove(model: HouseModel, lm: LevelModel, x: number, y: number): number {
  for (let i = lm.index + 1; i < model.levels.length; i++) {
    const up = model.levels[i];
    if (hasFloorAt(up, x, y)) return up.elevation - up.slab;
  }
  if (model.roofOutline.length >= 3 && pointInPoly(x, y, model.roofOutline)) return model.roofSoffit;
  return lm.ceilingY;
}

/**
 * Room that owns a point for painting a wall face: a room of this level, or (over a floor opening such as a
 * stairwell) the room below that the void belongs to.
 */
export function faceRoom(model: HouseModel, lm: LevelModel, x: number, y: number): RoomModel | null {
  const r = roomAt(lm, x, y);
  if (r) return r;
  if (inFloorOpening(lm, x, y)) {
    for (let i = lm.index - 1; i >= 0; i--) {
      const below = roomAt(model.levels[i], x, y);
      if (below) return below;
    }
  }
  return null;
}

/** The entrance: an exterior door on the lowest level, preferring the one called / styled as the main door. */
export function findMainDoor(model: HouseModel): OpeningModel | null {
  let best: OpeningModel | null = null;
  let bestScore = -1;
  for (const lm of model.levels) {
    for (const wm of lm.walls)
      for (const om of wm.openings) {
        const o = om.opening;
        if (o.kind !== 'door' && o.kind !== 'opening') continue;
        if (om.sill > 0.3) continue;
        let score = 0;
        if (o.kind === 'door') score += 2;
        if (wm.wall.kind === 'exterior' || om.outSide !== 0) score += 4;
        if (o.style === 'teak-panel') score += 3;
        if (/main|entrance|front/i.test(o.name ?? '') || /main|entr/i.test(o.id)) score += 5;
        if (o.leaf === 'double') score += 1;
        score += Math.min(1, (om.s1 - om.s0) / 3);
        score -= lm.index * 6;
        if (score > bestScore) { bestScore = score; best = om; }
      }
  }
  return best;
}
