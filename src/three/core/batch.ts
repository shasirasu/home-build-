// Geometry batching: builders push quads / boxes / prisms into one bucket per material, so a whole storey's walls
// (or all its window frames) end up as a single draw call. Each triangle remembers an "owner" index so picking can
// map a hit back to the wall / opening / column it came from.

import * as THREE from 'three';
import { polyDifference } from './geo';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();

export type P3 = [number, number, number];

export class Batch {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  owners: number[] = [];

  get empty() {
    return this.idx.length === 0;
  }

  private vert(p: P3, n: THREE.Vector3, u: number, v: number): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    return i;
  }

  /**
   * Triangle. Winding is fixed up so the face normal points along (nx, ny, nz) when a hint is given.
   */
  tri(a: P3, b: P3, c: P3, hint?: P3, uvs?: number[], owner = -1): void {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _c.set(c[0], c[1], c[2]);
    _n.subVectors(_b, _a).cross(_p.subVectors(_c, _a));
    if (_n.lengthSq() < 1e-14) return;
    _n.normalize();
    let flip = false;
    if (hint && _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) { flip = true; _n.negate(); }
    const u = uvs ?? [0, 0, 0, 0, 0, 0];
    const i0 = this.vert(a, _n, u[0], u[1]);
    const i1 = this.vert(b, _n, u[2], u[3]);
    const i2 = this.vert(c, _n, u[4], u[5]);
    if (flip) this.idx.push(i0, i2, i1); else this.idx.push(i0, i1, i2);
    this.owners.push(owner);
  }

  /** Planar quad a-b-c-d (in order around the face). `hint` = direction the face must look. */
  quad(a: P3, b: P3, c: P3, d: P3, hint?: P3, uvs?: number[], owner = -1): void {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _c.set(c[0], c[1], c[2]);
    _n.subVectors(_b, _a).cross(_p.subVectors(_c, _a));
    if (_n.lengthSq() < 1e-14) {
      // degenerate first corner: try the other diagonal
      _n.subVectors(_c, _a).cross(_p.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]));
      if (_n.lengthSq() < 1e-14) return;
    }
    _n.normalize();
    let flip = false;
    if (hint && _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) { flip = true; _n.negate(); }
    const u = uvs ?? [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this.vert(a, _n, u[0], u[1]);
    const i1 = this.vert(b, _n, u[2], u[3]);
    const i2 = this.vert(c, _n, u[4], u[5]);
    const i3 = this.vert(d, _n, u[6], u[7]);
    if (flip) this.idx.push(i0, i2, i1, i0, i3, i2); else this.idx.push(i0, i1, i2, i0, i2, i3);
    this.owners.push(owner, owner);
  }

  /**
   * Axis-aligned box in local space (centre + size), optionally transformed by `m`. UVs are in metres, laid along
   * the two axes of each face (so wood grain / tiles keep their true size).
   * `skip`: faces to leave out, any of 'x+','x-','y+','y-','z+','z-'.
   */
  box(m: THREE.Matrix4 | null, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, owner = -1, skip = ''): void {
    if (!(sx > 0) || !(sy > 0) || !(sz > 0)) return;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const C = (x: number, y: number, z: number): P3 => {
      if (!m) return [cx + x, cy + y, cz + z];
      _p.set(cx + x, cy + y, cz + z).applyMatrix4(m);
      return [_p.x, _p.y, _p.z];
    };
    const p000 = C(-hx, -hy, -hz), p100 = C(hx, -hy, -hz), p010 = C(-hx, hy, -hz), p110 = C(hx, hy, -hz);
    const p001 = C(-hx, -hy, hz), p101 = C(hx, -hy, hz), p011 = C(-hx, hy, hz), p111 = C(hx, hy, hz);
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    if (!skip.includes('z+')) this.quad(p001, p101, p111, p011, undefined, [x0, y0, x1, y0, x1, y1, x0, y1], owner);
    if (!skip.includes('z-')) this.quad(p100, p000, p010, p110, undefined, [x1, y0, x0, y0, x0, y1, x1, y1], owner);
    if (!skip.includes('x+')) this.quad(p101, p100, p110, p111, undefined, [z1, y0, z0, y0, z0, y1, z1, y1], owner);
    if (!skip.includes('x-')) this.quad(p000, p001, p011, p010, undefined, [z0, y0, z1, y0, z1, y1, z0, y1], owner);
    if (!skip.includes('y+')) this.quad(p011, p111, p110, p010, undefined, [x0, z1, x1, z1, x1, z0, x0, z0], owner);
    if (!skip.includes('y-')) this.quad(p000, p100, p101, p001, undefined, [x0, z0, x1, z0, x1, z1, x0, z1], owner);
  }

  /** Append an existing geometry (position / normal / uv), transformed by `m`. */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, owner = -1): void {
    const pos = g.getAttribute('position');
    if (!pos) return;
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const base = this.pos.length / 3;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const flip = m ? m.determinant() < 0 : false;
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i);
      if (m) _p.applyMatrix4(m);
      this.pos.push(_p.x, _p.y, _p.z);
      if (nor) {
        _n.fromBufferAttribute(nor, i);
        if (nm) _n.applyMatrix3(nm).normalize();
        this.nor.push(_n.x, _n.y, _n.z);
      } else this.nor.push(0, 1, 0);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
    }
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i, i1 = index ? index.getX(i + 1) : i + 1, i2 = index ? index.getX(i + 2) : i + 2;
      if (flip) this.idx.push(base + i0, base + i2, base + i1); else this.idx.push(base + i0, base + i1, base + i2);
      this.owners.push(owner);
    }
  }

  /**
   * Cylinder between two points (for rails, bars, pipes), in the space of `m` (null = world).
   * `seg` radial segments, optional end caps.
   */
  rod(m: THREE.Matrix4 | null, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, seg = 8, caps = true, owner = -1): void {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (!(len > 1e-5) || !(radius > 0)) return;
    const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1, !caps);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3((bx - ax) / len, (by - ay) / len, (bz - az) / len));
    const t = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1));
    if (m) t.premultiply(m);
    this.geometry(g, t, owner);
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export interface BatchMeshOptions {
  cast?: boolean;
  receive?: boolean;
  name?: string;
  /** Maps a triangle's owner index to a selection (stored on mesh.userData.pick). */
  pick?: (owner: number) => unknown;
  /** Extra userData for every mesh. */
  data?: Record<string, unknown>;
  renderOrder?: number;
}

/** One Batch per material. */
export class BatchSet {
  private map = new Map<THREE.Material, Batch>();

  get(mat: THREE.Material): Batch {
    let b = this.map.get(mat);
    if (!b) { b = new Batch(); this.map.set(mat, b); }
    return b;
  }

  /** Build one mesh per material and add them to `parent`. */
  flush(parent: THREE.Object3D, o: BatchMeshOptions = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, b] of this.map) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.castShadow = o.cast ?? true;
      mesh.receiveShadow = o.receive ?? true;
      mesh.name = o.name ?? '';
      if (o.renderOrder !== undefined) mesh.renderOrder = o.renderOrder;
      mesh.userData.owners = b.owners;
      mesh.userData.baseMaterial = mat;
      if (o.pick) mesh.userData.pick = o.pick;
      if (o.data) Object.assign(mesh.userData, o.data);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

/** Dispose every geometry below `root` (materials and textures are owned by the material library). */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && typeof g.dispose === 'function') g.dispose();
  });
}

/** Flat polygon (with holes) triangulated in plan, at height y. Returns triangles as index triples into `pts`. */
export function triangulate(contour: [number, number][], holes: [number, number][][] = []): { pts: [number, number][]; tris: number[][] } {
  const c = contour.map((p) => new THREE.Vector2(p[0], p[1]));
  const h = holes.map((hole) => hole.map((p) => new THREE.Vector2(p[0], p[1])));
  // ShapeUtils wants the contour and holes with opposite windings
  if (THREE.ShapeUtils.isClockWise(c)) c.reverse();
  for (const hole of h) if (!THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(c, h);
  const pts: [number, number][] = [...c, ...h.flat()].map((v) => [v.x, v.y]);
  return { pts, tris };
}

/** Horizontal polygon face at height y. `up` = true looks up (+Y), false looks down. UV = plan metres. */
export function polyFace(batch: Batch, contour: [number, number][], holes: [number, number][][], y: number, up: boolean, owner = -1): void {
  if (contour.length < 3) return;
  const { pts, tris } = triangulate(contour, holes);
  const hint: P3 = [0, up ? 1 : -1, 0];
  for (const t of tris) {
    const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
    batch.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], hint, [a[0], a[1], b[0], b[1], c[0], c[1]], owner);
  }
}

/** Vertical faces along a closed plan polygon from y0 to y1. `outward` = true: faces look away from the polygon. */
export function polySides(batch: Batch, poly: [number, number][], y0: number, y1: number, outward: boolean, owner = -1): void {
  const n = poly.length;
  if (n < 2 || !(y1 > y0)) return;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = (area >= 0 ? 1 : -1) * (outward ? 1 : -1);
  let run = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (dy / len) * sgn, ny = (-dx / len) * sgn;
    batch.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [nx, 0, ny], [run, y0, run + len, y0, run + len, y1, run, y1], owner);
    run += len;
  }
}

/**
 * Horizontal face of `contour` minus `holes`, robust to holes that touch or cross the contour (see polyDifference).
 */
export function polyFaceDiff(batch: Batch, contour: [number, number][], holes: [number, number][][], y: number, up: boolean, owner = -1): void {
  if (contour.length < 3) return;
  if (!holes.length) { polyFace(batch, contour, [], y, up, owner); return; }
  const hint: P3 = [0, up ? 1 : -1, 0];
  for (const q of polyDifference(contour, holes)) {
    const [a, b, c, d] = q;
    batch.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], hint, [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], owner);
  }
}
