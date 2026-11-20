// Picking (ray → Selection) and the highlight overlays drawn for hovered / selected parts of the house.

import * as THREE from 'three';
import type { Selection } from './api';
import { Batch, polyFaceDiff } from './core/batch';
import type { HouseView } from './build/house';
import { wallMatrix } from './build/walls';

export interface PickHit {
  /** null = something solid but not selectable was hit (roof, ground …) */
  sel: Selection | null;
  point: THREE.Vector3;
  object: THREE.Object3D;
  distance: number;
}

/** Visible meshes under the given roots (labels, lines and anything flagged noPick are left out). */
export function collectTargets(roots: (THREE.Object3D | null | undefined)[], out: THREE.Object3D[] = []): THREE.Object3D[] {
  const visit = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.noPick) return;
    if ((o as THREE.Mesh).isMesh) out.push(o);
    for (const c of o.children) visit(c);
  };
  for (const r of roots) if (r) visit(r);
  return out;
}

export function selectionOf(hit: THREE.Intersection): Selection | null {
  let o: THREE.Object3D | null = hit.object;
  const ud = o.userData;
  if (ud.sel) return ud.sel as Selection;
  if (typeof ud.pick === 'function' && Array.isArray(ud.owners) && hit.faceIndex != null) {
    const owner = ud.owners[hit.faceIndex];
    const s = owner >= 0 ? (ud.pick(owner) as Selection | null) : null;
    if (s) return s;
  }
  while (o) {
    if (typeof o.userData.uid === 'string') return { type: 'item', uid: o.userData.uid };
    o = o.parent;
  }
  return null;
}

export class Picker {
  readonly raycaster = new THREE.Raycaster();

  /**
   * Nearest thing under the pointer. Parts of clipped objects above the dollhouse cut are ignored.
   */
  pick(ndc: THREE.Vector2, camera: THREE.Camera, targets: THREE.Object3D[], cutY: number | null, filter?: (sel: Selection | null, hit: THREE.Intersection) => boolean): PickHit | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const h of hits) {
      if (cutY !== null && h.point.y > cutY + 1e-3 && isClipped(h.object)) continue;
      const sel = selectionOf(h);
      // pick proxies only matter when they resolve to something
      if (h.object.userData.proxy && !sel) continue;
      if (filter && !filter(sel, h)) continue;
      return { sel, point: h.point, object: h.object, distance: h.distance };
    }
    return null;
  }

  /** Intersection of the pointer ray with the horizontal plane y. */
  planePoint(ndc: THREE.Vector2, camera: THREE.Camera, y: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, camera);
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return out.copy(ray.origin).addScaledVector(ray.direction, t);
  }
}

function isClipped(o: THREE.Object3D): boolean {
  return !!o.userData.clipped;
}

export const sameSelection = (a: Selection | null, b: Selection | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

// ------------------------------------------------------------------------------------------------ highlights

export class Highlight {
  readonly group = new THREE.Group();
  private fill: THREE.MeshBasicMaterial;
  private line: THREE.LineBasicMaterial;

  constructor(color: string, fillOpacity: number, lineOpacity: number) {
    this.group.name = 'highlight';
    this.group.renderOrder = 40;
    this.fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.line = new THREE.LineBasicMaterial({ color, transparent: true, opacity: lineOpacity, depthTest: false, toneMapped: false });
  }

  setColor(color: string): void {
    this.fill.color.set(color);
    this.line.color.set(color);
  }

  clear(): void {
    for (const c of [...this.group.children]) {
      c.removeFromParent();
      (c as THREE.Mesh).geometry?.dispose();
    }
  }

  dispose(): void {
    this.clear();
    this.fill.dispose();
    this.line.dispose();
    this.group.removeFromParent();
  }

  private addBox(m: THREE.Matrix4 | null, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, cz);
    if (m) g.applyMatrix4(m);
    const mesh = new THREE.Mesh(g, this.fill);
    mesh.renderOrder = 40;
    this.group.add(mesh);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), this.line);
    e.renderOrder = 41;
    this.group.add(e);
  }

  /**
   * Show the overlay for a selection. `maxY` limits walls / openings / columns to the visible (cut) height.
   * Items are outlined by the renderer instead, so they produce nothing here.
   */
  show(view: HouseView | null, sel: Selection | null, structure: boolean, maxY: number): void {
    this.clear();
    if (!view || !sel || sel.type === 'item') return;
    const model = view.model;
    if (sel.type === 'room') {
      const lm = model.levelById.get(sel.levelId);
      const rm = lm?.rooms.find((r) => r.room.id === sel.roomId);
      if (!lm || !rm) return;
      const b = new Batch();
      polyFaceDiff(b, rm.poly, lm.floorOpenings, rm.floorY + 0.006, true);
      if (!b.empty) {
        const mesh = new THREE.Mesh(b.build(), this.fill);
        mesh.renderOrder = 40;
        this.group.add(mesh);
      }
      const pts = rm.poly.map((p) => new THREE.Vector3(p[0], rm.floorY + 0.012, p[1]));
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), this.line);
      loop.renderOrder = 41;
      this.group.add(loop);
    } else if (sel.type === 'wall') {
      const lm = model.levelById.get(sel.levelId);
      const wm = lm?.wallById.get(sel.wallId);
      if (!lm || !wm) return;
      const H = Math.min(wm.height, maxY - lm.elevation);
      if (H <= 0.02) return;
      this.addBox(wallMatrix(wm), wm.rect.len / 2, H / 2, 0, wm.rect.len + 0.012, H + 0.006, wm.rect.ht * 2 + 0.014);
    } else if (sel.type === 'opening') {
      const lm = model.levelById.get(sel.levelId);
      const om = lm?.openingById.get(sel.openingId);
      if (!lm || !om) return;
      const top = Math.min(om.head, maxY - lm.elevation);
      if (top - om.sill <= 0.02) return;
      this.addBox(wallMatrix(om.wall), (om.s0 + om.s1) / 2, (om.sill + top) / 2, 0, om.s1 - om.s0 + 0.01, top - om.sill + 0.01, om.wall.rect.ht * 2 + 0.06);
    } else if (sel.type === 'stair') {
      const lv = view.levels.find((l) => l.lm.level.id === sel.levelId);
      const sg = lv?.stairs.find((s) => s.stair.id === sel.stairId);
      if (!lv || !sg) return;
      for (const s of sg.steps) this.addBox(null, (s.x0 + s.x1) / 2, lv.lm.elevation + s.top + 0.004 - 0.02, (s.y0 + s.y1) / 2, s.x1 - s.x0 + 0.01, 0.05, s.y1 - s.y0 + 0.01);
    } else if (sel.type === 'column') {
      const c = view.structure.columns.find((k) => k.id === sel.columnId);
      if (!c || !model.levels.length) return;
      const through = model.levels.filter((lm) => !Array.isArray(c.levels) || !c.levels.length || c.levels.includes(lm.level.id));
      if (!through.length) return;
      const y0 = structure ? view.structure.footTop : through[0].elevation - (through[0].onGrade ? through[0].elevation : 0);
      const y1 = Math.min(maxY, through[through.length - 1].index === model.levels.length - 1 ? model.roofTop : through[through.length - 1].topY);
      if (y1 - y0 > 0.02) this.addBox(null, c.x, (y0 + y1) / 2, c.y, c.w + 0.014, y1 - y0, c.d + 0.014);
    } else if (sel.type === 'beam') {
      const br = view.structure.beamRects.find((b) => b.beam.id === sel.beamId);
      if (!br) return;
      const M = new THREE.Matrix4().makeRotationY(Math.atan2(-br.rect.uy, br.rect.ux)).setPosition(br.rect.ax, 0, br.rect.ay);
      this.addBox(M, br.rect.len / 2, (br.top + br.bottom) / 2, 0, br.rect.len + 0.012, br.top - br.bottom + 0.012, br.rect.ht * 2 + 0.014);
    }
  }
}
