// Assembles the whole house from a HouseSpec: one group per storey (walls, finishes, RCC, structure-view parts),
// the roof, the site. Everything is derived from the spec; nothing is specific to the sample.

import * as THREE from 'three';
import type { HouseSpec } from '@/types/house';
import { disposeGeometries } from '../core/batch';
import { orectFromSeg, type ORect } from '../core/geo';
import type { MaterialLib } from '../materials';
import { buildFacade, facadeInfo, type FacadeInfo } from './facade';
import { buildFloors } from './floors';
import { buildLights, type LightsBuild } from './lights';
import { buildModel, findMainDoor, type HouseModel, type LevelModel, type OpeningModel } from './model';
import { buildOpenings, type DoorLeaf } from './openings';
import { buildRoof } from './roof';
import { buildSite, type SiteBuild } from './site';
import { buildRailings, buildStairs, type StairGeom } from './stairs';
import { buildStructure, type StructureBuild } from './structure';
import { buildWalls, type BuildCtx } from './walls';

export interface LevelView {
  lm: LevelModel;
  /** everything of this storey: hidden as one when the storey is cut away */
  group: THREE.Group;
  /** wall masonry (ghosted in structure view) */
  walls: THREE.Group;
  /** finishes: floors, joinery, trims, railings, plastered frame members (hidden in structure view) */
  finish: THREE.Group;
  /** slab + stairs (recoloured in structure view) */
  rcc: THREE.Group;
  /** structure-view only: columns, beams, footings */
  struct: THREE.Group;
  /** section caps of the dollhouse cut (rebuilt when the cut moves) */
  caps: THREE.Group;
  labels: THREE.Group;
  floors: THREE.Mesh[];
  proxies: THREE.Object3D[];
  stairs: StairGeom[];
}

export interface RoofView {
  group: THREE.Group;
  walls: THREE.Group;
  finish: THREE.Group;
  rcc: THREE.Group;
  struct: THREE.Group;
}

export interface HouseView {
  model: HouseModel;
  ctx: BuildCtx;
  root: THREE.Group;
  levels: LevelView[];
  roof: RoofView;
  site: THREE.Group;
  siteBuild: SiteBuild;
  structure: StructureBuild;
  doors: DoorLeaf[];
  mainDoor: OpeningModel | null;
  /** outward direction of the entrance in plan (unit), or null */
  front: [number, number] | null;
  facade: FacadeInfo;
  lights: LightsBuild;
}

const group = (name: string, parent?: THREE.Object3D) => {
  const g = new THREE.Group();
  g.name = name;
  parent?.add(g);
  return g;
};

export function buildHouse(spec: HouseSpec, mats: MaterialLib): HouseView {
  const model = buildModel(spec);
  const root = group('house');
  const mainDoor = findMainDoor(model);
  let front: [number, number] | null = null;
  if (mainDoor) {
    const s = mainDoor.outSide !== 0 ? mainDoor.outSide : 1;
    front = [mainDoor.wall.nx * s, mainDoor.wall.ny * s];
  }
  const facade = facadeInfo(model, mainDoor, front);
  const ctx: BuildCtx = { model, mats, facade };

  const levels: LevelView[] = [];
  const doors: DoorLeaf[] = [];
  for (const lm of model.levels) {
    const g = group(`level:${lm.level.id}`, root);
    const lv: LevelView = {
      lm, group: g,
      walls: group('walls', g), finish: group('finish', g), rcc: group('rcc', g), struct: group('struct', g), caps: group('caps', g), labels: group('labels', g),
      floors: [], proxies: [], stairs: [],
    };
    lv.struct.visible = false;
    lv.caps.visible = false;
    const step = (what: string, fn: () => void) => {
      try { fn(); } catch (e) { console.warn(`[HouseViewer] ${what} of level ${lm.level.id} failed`, e); }
    };
    step('walls', () => buildWalls(ctx, lm, lv.walls, lv.finish));
    step('floors', () => { lv.floors = buildFloors(ctx, lm, lv.finish, lv.rcc).floors; });
    step('openings', () => { doors.push(...buildOpenings(ctx, lm, lv.finish, lv.proxies)); });
    step('stairs', () => { lv.stairs = buildStairs(ctx, lm, lv.rcc, lv.finish); });
    step('railings', () => buildRailings(ctx, lm, lv.finish));
    levels.push(lv);
  }

  const roofGroup = group('roof', root);
  const roof: RoofView = { group: roofGroup, walls: group('walls', roofGroup), finish: group('finish', roofGroup), rcc: group('rcc', roofGroup), struct: group('struct', roofGroup) };
  roof.struct.visible = false;
  try { if (model.levels.length) buildRoof(ctx, roof.walls, roof.finish, roof.rcc, front); } catch (e) { console.warn('[HouseViewer] roof failed', e); }

  let structure: StructureBuild = { columns: [], beams: [], freeColumns: levels.map(() => []), levelColumns: levels.map(() => []), beamRects: [], footTop: -1 };
  try {
    structure = buildStructure(ctx, { finish: levels.map((l) => l.finish), struct: levels.map((l) => l.struct), roofFinish: roof.finish, roofStruct: roof.struct });
  } catch (e) { console.warn('[HouseViewer] structure failed', e); }

  try { buildFacade(model, mats, facade, { levels: levels.map((l) => l.finish), roof: roof.finish }); } catch (e) { console.warn('[HouseViewer] facade failed', e); }

  const site = group('site', root);
  let siteBuild: SiteBuild = { wallRuns: [], pillars: [] };
  try { siteBuild = buildSite(ctx, site); } catch (e) { console.warn('[HouseViewer] site failed', e); }

  let lights: LightsBuild = { night: [], panes: [], lamps: [], counts: {} };
  try {
    lights = buildLights(model, mats, facade, siteBuild, structure.freeColumns, {
      levels: levels.map((l) => ({ fittings: l.finish, root: l.group })), roof: { fittings: roof.finish, root: roof.group }, site,
    });
  } catch (e) { console.warn('[HouseViewer] lights failed', e); }

  root.updateMatrixWorld(true);
  return { model, ctx, root, levels, roof, site, siteBuild, structure, doors, mainDoor, front, facade, lights };
}

export function disposeHouse(view: HouseView): void {
  disposeGeometries(view.root);
  view.root.traverse((o) => {
    const s = o as THREE.Sprite;
    if (s.isSprite) (s.material as THREE.Material).dispose();
  });
  view.root.removeFromParent();
}

/** Fixed things a door leaf must not swing into on its storey: other walls, stair blocks, free-standing columns. */
export function doorObstacles(view: HouseView, leaf: DoorLeaf): ORect[] {
  const lv = view.levels[leaf.levelIndex];
  const out: ORect[] = [];
  if (!lv) return out;
  for (const wm of lv.lm.walls) {
    if (wm === leaf.om.wall) continue;
    for (const p of wm.pieces) {
      if (p.h0 > 1.9) continue;
      out.push({ ...wm.rect, ax: wm.rect.ax + wm.rect.ux * p.s0, ay: wm.rect.ay + wm.rect.uy * p.s0, len: p.s1 - p.s0 });
    }
  }
  // the door's own wall beyond the opening still stops a leaf that would fold back through it
  for (const sg of lv.stairs)
    for (const s of sg.steps) {
      if (s.top < 0.03 || s.botFront > 2.0) continue;
      const r = orectFromSeg([s.x0, (s.y0 + s.y1) / 2], [s.x1, (s.y0 + s.y1) / 2], s.y1 - s.y0);
      if (r) out.push(r);
    }
  for (const c of view.structure.freeColumns[leaf.levelIndex] ?? []) {
    const r = orectFromSeg([c.x - c.w / 2, c.y], [c.x + c.w / 2, c.y], c.d);
    if (r) out.push(r);
  }
  return out;
}
