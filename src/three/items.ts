// Furniture layer. setItems() diffs by uid: only items whose shape changed are rebuilt, items that merely moved
// are re-posed. Each item's meshes are baked into one mesh per material (draw calls ≈ materials, not parts).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { catalogByKind, type Mount } from '@/data/catalog';
import type { PlacedItem } from '@/types/house';
import { finite, orectFromCentre, type ORect } from './core/geo';
import { ceilingAbove, type HouseModel, type LevelModel } from './build/model';
import { buildItem } from './furniture';

export interface ItemEntry {
  item: PlacedItem;
  obj: THREE.Group;
  mount: Mount;
  shapeKey: string;
  poseKey: string;
  levelIndex: number;
  /** absolute height of the item's bottom */
  bottom: number;
  rect: ORect;
  /** geometries created by baking (owned here, disposed on removal) */
  owned: THREE.BufferGeometry[];
}

const shapeKeyOf = (i: PlacedItem) => `${i.kind}|${i.w}|${i.d}|${i.h}|${i.color ?? ''}`;
const poseKeyOf = (i: PlacedItem) => `${i.levelId}|${i.roomId ?? ''}|${i.x}|${i.y}|${i.rot}|${i.elevation ?? 0}`;

export function mountOf(kind: string): Mount {
  return catalogByKind(kind)?.mount ?? 'floor';
}

/** Absolute height of an item's bottom for a given pose. */
export function itemBottom(model: HouseModel | null, item: PlacedItem, lm: LevelModel | null): number {
  const h = finite(item.h, 0.5);
  if (!model || !lm) return finite(item.elevation, 0);
  if (mountOf(item.kind) === 'ceiling') return ceilingAbove(model, lm, item.x, item.y) - h;
  const room = item.roomId ? lm.rooms.find((r) => r.room.id === item.roomId) : null;
  return lm.elevation + (room ? room.offset : 0) + finite(item.elevation, 0);
}

function fallbackBox(item: PlacedItem): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(item.w, item.h, item.d), new THREE.MeshStandardMaterial({ color: item.color ?? '#b9a88f', roughness: 0.7 }));
  m.position.y = item.h / 2;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return g;
}

/** Build the raw model for an item (never throws). */
export function buildRaw(item: PlacedItem): THREE.Group {
  const w = Math.max(0.01, finite(item.w, 0.5)), d = Math.max(0.01, finite(item.d, 0.5)), h = Math.max(0.005, finite(item.h, 0.5));
  try {
    const g = buildItem({ kind: item.kind, w, d, h, color: item.color });
    if (g && (g as THREE.Object3D).isObject3D) return g;
  } catch (e) {
    console.warn(`[HouseViewer] furniture "${item.kind}" failed to build`, e);
  }
  return fallbackBox({ ...item, w, d, h });
}

/**
 * Merge an item's static meshes per material. Returns the group to use and the geometries it now owns.
 * Anything unusual (instanced / skinned meshes, multi-material meshes, lines, sprites, lights) is kept as built.
 */
export function bakeItem(src: THREE.Group): { group: THREE.Group; owned: THREE.BufferGeometry[] } {
  src.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  type Bucket = { mat: THREE.Material; cast: boolean; receive: boolean; order: number; geos: THREE.BufferGeometry[] };
  const buckets = new Map<string, Bucket>();
  const keep: THREE.Object3D[] = [];
  let meshes = 0;
  let ok = true;
  const visibleChain = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== src.parent; p = p.parent) if (!p.visible) return false;
    return true;
  };
  src.traverse((o) => {
    if (o === src) return;
    const m = o as THREE.Mesh;
    const simple = m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh
      && !Array.isArray(m.material) && !!m.geometry?.getAttribute('position') && !m.geometry.morphAttributes?.position
      && !(m.material as THREE.MeshStandardMaterial).vertexColors && Object.keys(m.userData ?? {}).every((k) => k !== 'noBake');
    if (m.isMesh && simple) {
      if (!visibleChain(o)) return;
      meshes++;
      const mat = m.material as THREE.Material;
      const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
      let b = buckets.get(key);
      if (!b) { b = { mat, cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder, geos: [] }; buckets.set(key, b); }
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      // non-interleaved float attributes only
      for (const name of ['position', 'normal', 'uv']) {
        const a = g.getAttribute(name) as THREE.BufferAttribute;
        if ((a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) {
          const n = a.itemSize, arr = new Float32Array(a.count * n);
          for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) arr[i * n + k] = a.getComponent(i, k);
          g.setAttribute(name, new THREE.Float32BufferAttribute(arr, n));
        }
      }
      const mw = new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
      g.applyMatrix4(mw);
      if (mw.determinant() < 0) {
        // mirrored part: restore the winding
        for (const name of ['position', 'normal', 'uv']) {
          const a = g.getAttribute(name) as THREE.BufferAttribute;
          const n = a.itemSize, arr = a.array as Float32Array;
          for (let i = 0; i + 2 < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
        }
      }
      g.morphAttributes = {};
      b.geos.push(g);
    } else if (m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (o as THREE.Light).isLight) {
      keep.push(o);
    }
  });
  if (meshes < 3 || meshes <= buckets.size) {
    for (const b of buckets.values()) for (const g of b.geos) g.dispose();
    return { group: src, owned: [] };
  }
  const out = new THREE.Group();
  out.name = src.name;
  Object.assign(out.userData, src.userData);
  const owned: THREE.BufferGeometry[] = [];
  for (const b of buckets.values()) {
    let merged: THREE.BufferGeometry | null = null;
    try { merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false); } catch { merged = null; }
    if (!merged) { ok = false; break; }
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    out.add(mesh);
    owned.push(merged);
  }
  if (!ok) {
    for (const g of owned) g.dispose();
    return { group: src, owned: [] };
  }
  for (const o of keep) {
    const mw = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    o.removeFromParent();
    mw.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return { group: out, owned };
}

export class ItemLayer {
  readonly group = new THREE.Group();
  readonly entries = new Map<string, ItemEntry>();
  private model: HouseModel | null = null;

  constructor() {
    this.group.name = 'furniture';
  }

  setModel(model: HouseModel | null): void {
    this.model = model;
    for (const e of this.entries.values()) this.pose(e);
  }

  /** Returns true when anything changed. */
  set(items: PlacedItem[]): boolean {
    let changed = false;
    const seen = new Set<string>();
    for (const item of items ?? []) {
      if (!item || typeof item.uid !== 'string' || seen.has(item.uid)) continue;
      if (![item.x, item.y].every(Number.isFinite)) { console.warn(`[HouseViewer] item ${item.uid} has no position, skipped`); continue; }
      seen.add(item.uid);
      const sk = shapeKeyOf(item), pk = poseKeyOf(item);
      let e = this.entries.get(item.uid);
      if (e && e.shapeKey !== sk) { this.drop(e); e = undefined; }
      if (!e) {
        const { group, owned } = bakeItem(buildRaw(item));
        group.userData.uid = item.uid;
        group.name = `item:${item.uid}`;
        e = { item, obj: group, mount: mountOf(item.kind), shapeKey: sk, poseKey: '', levelIndex: 0, bottom: 0, rect: orectFromCentre(item.x, item.y, item.w, item.d, item.rot), owned };
        this.entries.set(item.uid, e);
        this.group.add(group);
        changed = true;
      }
      if (e.poseKey !== pk || e.item !== item) {
        const moved = e.poseKey !== pk;
        e.item = item;
        if (moved) { this.pose(e); changed = true; }
      }
    }
    for (const [uid, e] of this.entries) if (!seen.has(uid)) { this.drop(e); this.entries.delete(uid); changed = true; }
    return changed;
  }

  pose(e: ItemEntry): void {
    const item = e.item;
    const lm = this.model ? (this.model.levelById.get(item.levelId) ?? this.model.levels[0] ?? null) : null;
    e.levelIndex = lm ? lm.index : 0;
    e.bottom = itemBottom(this.model, item, lm);
    e.obj.position.set(item.x, e.bottom, item.y);
    e.obj.rotation.set(0, finite(item.rot, 0), 0);
    e.obj.updateMatrixWorld(true);
    e.rect = orectFromCentre(item.x, item.y, Math.max(0.01, item.w), Math.max(0.01, item.d), finite(item.rot, 0));
    e.poseKey = poseKeyOf(item);
  }

  private drop(e: ItemEntry): void {
    e.obj.removeFromParent();
    for (const g of e.owned) g.dispose();
  }

  dispose(): void {
    for (const e of this.entries.values()) this.drop(e);
    this.entries.clear();
    this.group.removeFromParent();
  }
}
