// Furniture and fixtures library: one detailed procedural model per catalog kind (src/data/catalog.ts).
//
//   buildItem({ kind, w, d, h, color }) → THREE.Group
//     · local origin = centre of the footprint at the item's bottom, +Z = front, X = width, Y = up
//     · built from the w / d / h passed in, so resizing adds shutters / doors / folds instead of stretching
//     · group.name = kind, group.userData = { kind, w, d, h, color, triangles, shared: true, ... }
//
// CACHING. A model is built once per (kind, w, d, h, colour) and kept as a prototype; every later call returns
// `prototype.clone()`, which SHARES the prototype's geometries and materials. So:
//     · do not dispose or mutate a returned mesh's geometry / material (swap `mesh.material` instead),
//     · call clearFurnitureCache() when the viewer is torn down.
// Materials are cached separately by colour + parameters (materials.ts) and shared between all kinds.

import * as THREE from 'three';
import type { FurnitureBuilder } from '../api';
import { catalogByKind } from '@/data/catalog';
import { Kit, hashStr } from './kit';
import { M, disposeMaterials } from './materials';
import type { Registry, Spec } from './types';
import { bedroom } from './bedroom';
import { living } from './living';
import { dining } from './dining';
import { kitchen } from './kitchen';
import { bath } from './bath';
import { pooja } from './pooja';
import { utility } from './utility';
import { lighting } from './lighting';
import { decor } from './decor';
import { outdoor } from './outdoor';

const REGISTRY: Registry = { ...bedroom, ...living, ...dining, ...kitchen, ...bath, ...pooja, ...utility, ...lighting, ...decor, ...outdoor };

/** Every kind that has a real model. */
export const FURNITURE_KINDS: string[] = Object.keys(REGISTRY);

const MAX_PROTOTYPES = 400;
const prototypes = new Map<string, THREE.Group>();

const mm = (v: number) => Math.round(v * 1000);
const safe = (v: number, fallback: number) => (Number.isFinite(v) && v > 0.004 ? v : fallback);

function placeholder(k: Kit, s: Spec) {
  k.box(M.lam(s.color, 0.7), s.w, s.h, s.d, 0, s.h / 2, 0, { r: Math.min(0.02, Math.min(s.w, s.h, s.d) * 0.2) });
}

export function countTriangles(obj: THREE.Object3D): number {
  let n = 0;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += t * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
  });
  return Math.round(n);
}

function makePrototype(s: Spec): THREE.Group {
  const fn = REGISTRY[s.kind];
  let k = new Kit(s.kind, hashStr(s.kind));
  let failed = false;
  try {
    if (fn) fn(k, s);
    else placeholder(k, s);
  } catch (err) {
    console.warn(`[furniture] ${s.kind} failed to build, using a placeholder`, err);
    failed = true;
    k = new Kit(s.kind);
    placeholder(k, s);
  }
  let g: THREE.Group;
  try {
    g = k.build();
  } catch (err) {
    console.warn(`[furniture] ${s.kind} failed to merge, using a placeholder`, err);
    failed = true;
    k = new Kit(s.kind);
    placeholder(k, s);
    g = k.build();
  }
  g.name = s.kind;
  Object.assign(g.userData, { kind: s.kind, w: s.w, d: s.d, h: s.h, color: s.color, triangles: countTriangles(g), shared: true, placeholder: !fn || failed });
  return g;
}

export const buildItem: FurnitureBuilder = ({ kind, w, d, h, color }) => {
  const cat = catalogByKind(kind);
  const s: Spec = {
    kind,
    w: safe(w, cat?.w ?? 0.5),
    d: safe(d, cat?.d ?? 0.5),
    h: safe(h, cat?.h ?? 0.5),
    color: color || cat?.colors[0] || '#b9a88f',
  };
  const key = `${kind}|${mm(s.w)}|${mm(s.d)}|${mm(s.h)}|${s.color.toLowerCase()}`;
  let proto = prototypes.get(key);
  if (proto) {
    // refresh LRU position
    prototypes.delete(key);
    prototypes.set(key, proto);
  } else {
    proto = makePrototype(s);
    prototypes.set(key, proto);
    if (prototypes.size > MAX_PROTOTYPES) {
      const oldest = prototypes.keys().next().value as string;
      const old = prototypes.get(oldest)!;
      prototypes.delete(oldest);
      // frees GPU buffers; if a clone is still on screen three.js simply uploads them again
      old.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
  }
  return proto.clone(true);
};

/** Drop every cached prototype, material and texture (viewer teardown / hot reload). */
export function clearFurnitureCache() {
  for (const g of prototypes.values()) g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  prototypes.clear();
  disposeMaterials();
}

export function furnitureCacheSize(): number {
  return prototypes.size;
}
