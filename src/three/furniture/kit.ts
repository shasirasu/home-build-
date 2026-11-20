// Furniture kit: the small modelling vocabulary every furniture file is written in.
//
// A `Kit` collects parts (geometry + material + transform). `build()` merges all parts that share a material into
// ONE mesh, so a finished item is a handful of draw calls no matter how many legs, handles or books it has.
// All geometry helpers return UVs in METRES (u runs along the grain / long side), so the tiling textures in
// materials.ts keep their real-world scale when an item is resized.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';
export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export interface Xf {
  at?: V3;
  /** Euler XYZ, radians. */
  rot?: V3;
  scale?: V3 | number;
}
export interface PartOpts extends Xf {
  /** Vertex colour, used by materials created with vertexColors (M.paint()). */
  color?: THREE.ColorRepresentation;
}
export interface BoxOpts extends PartOpts {
  /** Chamfer size (m). Shaded as a soft rounded edge. */
  r?: number;
  grain?: Axis;
}
export interface SoftOpts extends PartOpts {
  r?: number;
  /** Outward bulge per face (m): cushions, mattresses, duvets. */
  puff?: Partial<Record<Face, number>>;
  /** Segments of the flat middle part per axis. */
  seg?: [number, number, number];
  /** Segments per rounded edge. */
  cs?: number;
  skip?: Face[];
}

// ---------------------------------------------------------------------------------------------
// small utilities

export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scl = new THREE.Vector3();

export function xfMatrix(o?: Xf): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (!o) return m;
  const at = o.at ?? [0, 0, 0];
  const rot = o.rot ?? [0, 0, 0];
  const sc = o.scale ?? 1;
  _pos.set(at[0], at[1], at[2]);
  _quat.setFromEuler(_eul.set(rot[0], rot[1], rot[2], 'XYZ'));
  if (typeof sc === 'number') _scl.set(sc, sc, sc);
  else _scl.set(sc[0], sc[1], sc[2]);
  return m.compose(_pos, _quat, _scl);
}

function ensureIndex(geo: THREE.BufferGeometry) {
  if (geo.index) return;
  const n = geo.attributes.position.count;
  const idx = new Array<number>(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(idx);
}

export function flipWinding(geo: THREE.BufferGeometry) {
  ensureIndex(geo);
  const a = geo.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  geo.index!.needsUpdate = true;
}

/** Make every triangle's winding agree with its vertex normals (used after building shapes by hand). */
export function fixWinding(geo: THREE.BufferGeometry) {
  ensureIndex(geo);
  const idx = geo.index!.array as Uint16Array | Uint32Array;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fn = new THREE.Vector3();
  const vn = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]);
    b.fromBufferAttribute(p, idx[i + 1]);
    c.fromBufferAttribute(p, idx[i + 2]);
    fn.subVectors(b, a).cross(c.sub(a));
    vn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      vn.x += n.getX(idx[i + k]);
      vn.y += n.getY(idx[i + k]);
      vn.z += n.getZ(idx[i + k]);
    }
    if (fn.dot(vn) < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}

/** Box-projected UVs in metres. u runs along `grain` (default: the longest side of the part). */
export function boxUV(geo: THREE.BufferGeometry, grain?: Axis): THREE.BufferGeometry {
  const p = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  let g: number;
  if (grain) g = 'xyz'.indexOf(grain);
  else {
    geo.computeBoundingBox();
    const s = geo.boundingBox!.getSize(new THREE.Vector3());
    g = s.x >= s.y && s.x >= s.z ? 0 : s.y >= s.z ? 1 : 2;
  }
  const uv = new Float32Array(p.count * 2);
  const q = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    q[0] = p.getX(i);
    q[1] = p.getY(i);
    q[2] = p.getZ(i);
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const a = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    if (a !== g) {
      uv[i * 2] = q[g];
      uv[i * 2 + 1] = q[3 - a - g];
    } else {
      uv[i * 2] = q[(g + 1) % 3];
      uv[i * 2 + 1] = q[(g + 2) % 3];
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------------------------------------------------------------------------------------------
// geometry generators

/** Box with chamfered edges: 44 triangles. The chamfer strips share the face vertices, so they shade like fillets. */
export function chamferBoxGeo(w: number, h: number, d: number, r = 0.004, grain?: Axis): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  r = Math.max(0, Math.min(r, Math.min(w, h, d) * 0.45));
  const g = grain ? 'xyz'.indexOf(grain) : w >= h && w >= d ? 0 : h >= d ? 1 : 2;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let c = 0; c < 8; c++) {
    const s = [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1];
    for (let a = 0; a < 3; a++) {
      const p = [0, 0, 0];
      for (let j = 0; j < 3; j++) p[j] = s[j] * (j === a ? half[j] : half[j] - r);
      pos.push(p[0], p[1], p[2]);
      nor.push(a === 0 ? s[0] : 0, a === 1 ? s[1] : 0, a === 2 ? s[2] : 0);
      if (a !== g) uv.push(p[g], p[3 - a - g]);
      else uv.push(p[(g + 1) % 3], p[(g + 2) % 3]);
    }
  }
  const tri = (i0: number, i1: number, i2: number, ox: number, oy: number, oz: number) => {
    const ax = pos[i1 * 3] - pos[i0 * 3];
    const ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
    const az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
    const bx = pos[i2 * 3] - pos[i0 * 3];
    const by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
    const bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
    const dot = (ay * bz - az * by) * ox + (az * bx - ax * bz) * oy + (ax * by - ay * bx) * oz;
    if (dot >= 0) idx.push(i0, i1, i2);
    else idx.push(i0, i2, i1);
  };
  const corner = (a: number, sa: number, u: number, su: number, v: number, sv: number) =>
    (sa > 0 ? 1 << a : 0) | (su > 0 ? 1 << u : 0) | (sv > 0 ? 1 << v : 0);
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      const o = [0, 0, 0];
      o[a] = sa;
      const q = [corner(a, sa, u, -1, v, -1), corner(a, sa, u, 1, v, -1), corner(a, sa, u, 1, v, 1), corner(a, sa, u, -1, v, 1)].map((c) => c * 3 + a);
      tri(q[0], q[1], q[2], o[0], o[1], o[2]);
      tri(q[0], q[2], q[3], o[0], o[1], o[2]);
    }
  }
  if (r > 1e-6) {
    for (let e = 0; e < 3; e++) {
      const u = (e + 1) % 3;
      const v = (e + 2) % 3;
      for (const su of [-1, 1])
        for (const sv of [-1, 1]) {
          const c0 = corner(e, -1, u, su, v, sv);
          const c1 = corner(e, 1, u, su, v, sv);
          const o = [0, 0, 0];
          o[u] = su;
          o[v] = sv;
          tri(c0 * 3 + u, c1 * 3 + u, c1 * 3 + v, o[0], o[1], o[2]);
          tri(c0 * 3 + u, c1 * 3 + v, c0 * 3 + v, o[0], o[1], o[2]);
        }
    }
    for (let c = 0; c < 8; c++) tri(c * 3, c * 3 + 1, c * 3 + 2, c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function axisCoords(half: number, r: number, mid: number, cs: number): number[] {
  const inner = Math.max(half - r, 0);
  const out: number[] = [];
  for (let i = cs; i >= 1; i--) out.push(-(inner + r * Math.tan((Math.PI / 4) * (i / cs))));
  if (inner > 1e-6) for (let i = 0; i <= mid; i++) out.push(-inner + (2 * inner * i) / mid);
  else out.push(0);
  for (let i = 1; i <= cs; i++) out.push(inner + r * Math.tan((Math.PI / 4) * (i / cs)));
  return out;
}

/** Rounded box with an optional puffed bulge per face: cushions, mattresses, duvets, upholstery. */
export function softBoxGeo(w: number, h: number, d: number, o: SoftOpts = {}): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const r = Math.max(0.0005, Math.min(o.r ?? 0.03, Math.min(w, h, d) * 0.49));
  const seg = o.seg ?? [2, 1, 2];
  const cs = o.cs ?? 2;
  const coords = [0, 1, 2].map((a) => axisCoords(half[a], r, Math.max(1, seg[a]), cs));
  const inner = half.map((x) => Math.max(x - r, 0));
  const skip = new Set(o.skip ?? []);
  const puff = o.puff ?? {};
  const names: Face[][] = [
    ['nx', 'px'],
    ['ny', 'py'],
    ['nz', 'pz'],
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  const p = [0, 0, 0];
  const c = [0, 0, 0];
  const n = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      if (skip.has(names[a][sa > 0 ? 1 : 0])) continue;
      const cu = coords[u];
      const cv = coords[v];
      const base = pos.length / 3;
      for (let j = 0; j < cv.length; j++)
        for (let i = 0; i < cu.length; i++) {
          p[a] = sa * half[a];
          p[u] = cu[i];
          p[v] = cv[j];
          let len = 0;
          for (let k = 0; k < 3; k++) {
            c[k] = clamp(p[k], -inner[k], inner[k]);
            n[k] = p[k] - c[k];
            len += n[k] * n[k];
          }
          len = Math.sqrt(len) || 1;
          for (let k = 0; k < 3; k++) {
            n[k] /= len;
            p[k] = c[k] + n[k] * r;
          }
          // puff
          for (let k = 0; k < 3; k++)
            for (const sk of [-1, 1]) {
              const amt = puff[names[k][sk > 0 ? 1 : 0]];
              if (!amt) continue;
              const wgt = Math.max(0, sk * n[k]);
              if (wgt <= 0) continue;
              const k1 = (k + 1) % 3;
              const k2 = (k + 2) % 3;
              const f1 = 1 - (c[k1] / (half[k1] || 1)) ** 2;
              const f2 = 1 - (c[k2] / (half[k2] || 1)) ** 2;
              p[k] += sk * amt * wgt * f1 * f2;
            }
          pos.push(p[0], p[1], p[2]);
        }
      const nu = cu.length;
      for (let j = 0; j < cv.length - 1; j++)
        for (let i = 0; i < nu - 1; i++) {
          const q0 = base + j * nu + i;
          const q1 = q0 + 1;
          const q2 = q0 + nu + 1;
          const q3 = q0 + nu;
          if (sa > 0) idx.push(q0, q1, q2, q0, q2, q3);
          else idx.push(q0, q2, q1, q0, q3, q2);
        }
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  return boxUV(geo);
}

/** A plump pillow: pinched corners, zero thickness at the seam. w along x, d along z, h = thickness. */
export function pillowGeo(w: number, d: number, h: number, nx = 8, nz = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const f = (s: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const u = Math.sin((Math.PI / 2) * (-1 + (2 * i) / nx));
        const v = Math.sin((Math.PI / 2) * (-1 + (2 * j) / nz));
        const x = (w / 2) * u * (1 - 0.07 * (1 - v * v));
        const z = (d / 2) * v * (1 - 0.07 * (1 - u * u));
        const y = side * (h / 2) * f(u) * f(v);
        pos.push(x, y, z);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const q0 = base + j * (nx + 1) + i;
        const q1 = q0 + 1;
        const q2 = q0 + nx + 2;
        const q3 = q0 + nx + 1;
        if (side > 0) idx.push(q0, q2, q1, q0, q3, q2);
        else idx.push(q0, q1, q2, q0, q2, q3);
      }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getZ(i);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Cylinder / cone along Y, centred. `bevel` softens both rims. UVs: u along the axis, v around. */
export function cylGeo(rBot: number, rTop: number, h: number, seg = 16, open = false, bevel = 0): THREE.BufferGeometry {
  if (bevel > 0 && !open) {
    const b = Math.min(bevel, h * 0.45, Math.min(rBot, rTop) * 0.6);
    return latheGeo(
      [
        [0, -h / 2],
        [rBot - b, -h / 2],
        [rBot, -h / 2 + b],
        [rTop, h / 2 - b],
        [rTop - b, h / 2],
        [0, h / 2],
      ],
      seg,
    );
  }
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  const p = geo.attributes.position;
  const r = Math.max(rBot, rTop);
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.95) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getY(i), uv.getX(i) * 2 * Math.PI * r);
  }
  return geo;
}

/**
 * Surface of revolution about Y. `profile` = [radius, y] pairs. Go bottom → top for outside surfaces, top → bottom
 * for inside surfaces (bowl interiors); repeat a point for a crisp crease.
 */
export function latheGeo(profile: [number, number][], seg = 20, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  const geo = new THREE.LatheGeometry(pts, seg, 0, phiLength);
  let len = 0;
  let rMax = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) len += pts[i].distanceTo(pts[i - 1]);
    rMax = Math.max(rMax, pts[i].x);
  }
  const uv = geo.attributes.uv;
  const nrm = geo.attributes.normal;
  const p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    // flat caps get a planar projection (no pinwheel on table tops), walls unroll around the axis
    if (Math.abs(nrm.getY(i)) > 0.92) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, uv.getY(i) * len, uv.getX(i) * phiLength * rMax);
  }
  fixWinding(geo);
  return geo;
}

/** Tube swept along a polyline with exact vertices (no resampling): rails, frames, piping, chains. */
export function sweepGeo(pts: THREE.Vector3[], radius: number | ((t: number) => number), radial = 6, closed = false, caps = true): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const prevT = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const tangent = (i: number, out: THREE.Vector3) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const b = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    return out.subVectors(b, a).normalize();
  };
  tangent(0, T);
  N.set(0, 1, 0);
  if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
  N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
  let dist = 0;
  const rings = closed ? n + 1 : n;
  for (let ii = 0; ii < rings; ii++) {
    const i = ii % n;
    if (ii > 0) {
      prevT.copy(T);
      tangent(i, T);
      axis.crossVectors(prevT, T);
      const s = axis.length();
      if (s > 1e-6) {
        axis.divideScalar(s);
        N.applyAxisAngle(axis, Math.atan2(s, prevT.dot(T)));
      }
      dist += pts[i].distanceTo(pts[(i - 1 + n) % n]);
    }
    B.crossVectors(T, N).normalize();
    const rad = typeof radius === 'number' ? radius : radius(ii / (rings - 1));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const sx = Math.sin(a);
      const nx = N.x * cx + B.x * sx;
      const ny = N.y * cx + B.y * sx;
      const nz = N.z * cx + B.z * sx;
      pos.push(pts[i].x + nx * rad, pts[i].y + ny * rad, pts[i].z + nz * rad);
      nor.push(nx, ny, nz);
      uv.push(dist, (k / radial) * 2 * Math.PI * rad);
    }
  }
  for (let i = 0; i < rings - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + ((k + 1) % radial);
      const d = (i + 1) * radial + k;
      idx.push(a, b, c, a, c, d);
    }
  if (!closed && caps) {
    for (const end of [0, rings - 1]) {
      const base = pos.length / 3;
      const i = end;
      tangent(i === 0 ? 0 : n - 1, T);
      const sgn = end === 0 ? -1 : 1;
      pos.push(pts[i === 0 ? 0 : n - 1].x, pts[i === 0 ? 0 : n - 1].y, pts[i === 0 ? 0 : n - 1].z);
      nor.push(T.x * sgn, T.y * sgn, T.z * sgn);
      uv.push(0, 0);
      for (let k = 0; k < radial; k++) {
        const src = end * radial + k;
        pos.push(pos[src * 3], pos[src * 3 + 1], pos[src * 3 + 2]);
        nor.push(T.x * sgn, T.y * sgn, T.z * sgn);
        uv.push(0, 0);
      }
      for (let k = 0; k < radial; k++) idx.push(base, base + 1 + k, base + 1 + ((k + 1) % radial));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  fixWinding(geo);
  return geo;
}

/** Polyline with rounded corners (returns the vertex list for sweepGeo). */
export function filletPath(pts: V3[], fillet: number, cornerSeg = 3, closed = false): THREE.Vector3[] {
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const n = P.length;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (isEnd || fillet <= 0) {
      out.push(P[i].clone());
      continue;
    }
    const a = P[(i - 1 + n) % n];
    const b = P[i];
    const c = P[(i + 1) % n];
    const ba = a.clone().sub(b);
    const bc = c.clone().sub(b);
    const f = Math.min(fillet, ba.length() * 0.49, bc.length() * 0.49);
    const p0 = b.clone().add(ba.normalize().multiplyScalar(f));
    const p1 = b.clone().add(bc.normalize().multiplyScalar(f));
    for (let k = 0; k <= cornerSeg; k++) {
      const t = k / cornerSeg;
      // quadratic bezier p0 → b → p1
      const q = p0.clone().multiplyScalar((1 - t) * (1 - t)).add(b.clone().multiplyScalar(2 * t * (1 - t))).add(p1.clone().multiplyScalar(t * t));
      out.push(q);
    }
  }
  return out;
}

/** Skin over a stack of rings (each ring = same number of points). Smooth normals; caps are crisp. */
export function loftGeo(rings: V3[][], o: { closed?: boolean; capStart?: boolean; capEnd?: boolean; flip?: boolean; inside?: boolean } = {}): THREE.BufferGeometry {
  const closed = o.closed ?? true;
  const m = rings[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const cols = closed ? m : m - 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      const c = (i + 1) * m + ((j + 1) % m);
      const d = (i + 1) * m + j;
      idx.push(a, b, c, a, c, d);
    }
  const cap = (ri: number, rev: boolean) => {
    const ring = rings[ri];
    const base = pos.length / 3;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of ring) {
      cx += p[0];
      cy += p[1];
      cz += p[2];
      pos.push(p[0], p[1], p[2]);
    }
    pos.push(cx / m, cy / m, cz / m);
    for (let j = 0; j < cols; j++) {
      const a = base + j;
      const b = base + ((j + 1) % m);
      if (rev) idx.push(base + m, b, a);
      else idx.push(base + m, a, b);
    }
  };
  if (o.capStart) cap(0, true);
  if (o.capEnd) cap(rings.length - 1, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // orientation: the first quad must face away from the centroid of the whole shape
  let flip = o.flip ?? false;
  if (o.flip === undefined) {
    const cen = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) cen.add(_pos.set(pos[i], pos[i + 1], pos[i + 2]));
    cen.multiplyScalar(3 / pos.length);
    let vote = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      a.fromArray(pos, idx[t] * 3);
      b.fromArray(pos, idx[t + 1] * 3);
      c.fromArray(pos, idx[t + 2] * 3);
      const fnv = b.clone().sub(a).cross(c.clone().sub(a));
      const mid = a.add(b).add(c).multiplyScalar(1 / 3).sub(cen);
      vote += Math.sign(fnv.dot(mid)) * fnv.length();
    }
    flip = vote < 0;
    if (o.inside) flip = !flip; // faces look inward: bowls, basins, wells
  }
  if (flip) flipWinding(geo);
  geo.computeVertexNormals();
  return boxUV(geo);
}

export function roundRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  if (r) s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x0 + w, y0 + h - r);
  if (r) s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y0 + h);
  if (r) s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  if (r) s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Rounded-rectangle loop in the XZ plane (y = 0): piping, rims, rails. */
export function roundRectLoop(w: number, d: number, r: number, cornerSeg = 3): V3[] {
  const out: V3[] = [];
  r = Math.max(0.0001, Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4));
  const cs: [number, number, number][] = [
    [w / 2 - r, d / 2 - r, 0],
    [-(w / 2 - r), d / 2 - r, Math.PI / 2],
    [-(w / 2 - r), -(d / 2 - r), Math.PI],
    [w / 2 - r, -(d / 2 - r), Math.PI * 1.5],
  ];
  for (const [cx, cz, a0] of cs)
    for (let k = 0; k <= cornerSeg; k++) {
      const a = a0 + (k / cornerSeg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
    }
  return out;
}

// ---------------------------------------------------------------------------------------------
// the kit

function normalise(geo: THREE.BufferGeometry, mat: THREE.Material, color?: THREE.ColorRepresentation) {
  ensureIndex(geo);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const count = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') geo.deleteAttribute(name);
  if ((mat as THREE.MeshStandardMaterial).vertexColors) {
    if (!geo.attributes.color || color !== undefined) {
      const c = new THREE.Color(color ?? '#ffffff');
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
  } else if (geo.attributes.color) geo.deleteAttribute('color');
  geo.morphAttributes = {};
  geo.clearGroups();
}

export class Kit {
  readonly root = new THREE.Group();
  rnd: () => number;
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  private subs: Kit[] = [];
  private extras: THREE.Object3D[] = [];
  /** True for child groups made with sub(): their meshes are tagged so the engine's item baking leaves them alone. */
  private isSub = false;

  constructor(name: string, seed = 1) {
    this.root.name = name;
    this.rnd = rng(seed);
  }

  private top(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }
  /** Run `fn` with a local transform applied to everything it adds. */
  at(x: Xf, fn: () => void): this {
    this.stack.push(this.top().clone().multiply(xfMatrix(x)));
    fn();
    this.stack.pop();
    return this;
  }
  /** Build something once and mirror it across the YZ plane (left / right pairs). */
  mirrorX(fn: (side: 1 | -1) => void): this {
    fn(1);
    return this.at({ scale: [-1, 1, 1] }, () => fn(-1));
  }
  mirrorZ(fn: (side: 1 | -1) => void): this {
    fn(1);
    return this.at({ scale: [1, 1, -1] }, () => fn(-1));
  }
  /** Child group with its own origin (e.g. the rotor of a fan), kept as a separate Object3D. */
  sub(name: string, at: V3 = [0, 0, 0]): Kit {
    const k = new Kit(name);
    k.isSub = true;
    k.rnd = this.rnd;
    k.root.position.set(at[0], at[1], at[2]);
    this.subs.push(k);
    return k;
  }
  /** Random number in [a, b). */
  r(a = 0, b = 1): number {
    return a + (b - a) * this.rnd();
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rnd() * arr.length) % arr.length];
  }

  add(mat: THREE.Material, geo: THREE.BufferGeometry, o?: PartOpts): this {
    const m = xfMatrix(o).premultiply(this.top());
    geo.applyMatrix4(m);
    if (m.determinant() < 0) flipWinding(geo);
    normalise(geo, mat, o?.color);
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(geo);
    return this;
  }

  /** Chamfered box centred on (x, y, z). */
  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, o?: BoxOpts): this {
    return this.add(mat, chamferBoxGeo(Math.abs(w), Math.abs(h), Math.abs(d), o?.r, o?.grain), { ...o, at: [x, y, z] });
  }
  /** Chamfered box from its extents. */
  bx(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, o?: BoxOpts): this {
    return this.box(mat, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }
  /** True rounded box (appliance bodies, doors). */
  rbox(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, o?: PartOpts & { r?: number; seg?: number }): this {
    const geo = new RoundedBoxGeometry(w, h, d, o?.seg ?? 2, Math.min(o?.r ?? 0.012, Math.min(w, h, d) * 0.49));
    return this.add(mat, boxUV(geo), { ...o, at: [x, y, z] });
  }
  /** Soft rounded box with puffed faces (cushions, mattresses). */
  soft(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, o?: SoftOpts): this {
    return this.add(mat, softBoxGeo(w, h, d, o), { at: [x, y, z], rot: o?.rot, scale: o?.scale, color: o?.color });
  }
  pillow(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, o?: PartOpts): this {
    return this.add(mat, pillowGeo(w, d, h), { ...o, at: [x, y, z] });
  }
  /** Cylinder centred on (x, y, z); axis = 'y' unless given. */
  cyl(mat: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0, o?: PartOpts & { rTop?: number; seg?: number; axis?: Axis; open?: boolean; bevel?: number }): this {
    const geo = cylGeo(r, o?.rTop ?? r, h, o?.seg ?? 16, o?.open ?? false, o?.bevel ?? 0);
    if (o?.axis === 'x') geo.rotateZ(-Math.PI / 2);
    else if (o?.axis === 'z') geo.rotateX(Math.PI / 2);
    return this.add(mat, geo, { ...o, at: [x, y, z] });
  }
  /** Straight round bar between two points. */
  rod(mat: THREE.Material, a: V3, b: V3, r: number, o?: { seg?: number; rTop?: number; color?: THREE.ColorRepresentation; bevel?: number }): this {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const vb = new THREE.Vector3(b[0], b[1], b[2]);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    if (len < 1e-6) return this;
    const geo = cylGeo(r, o?.rTop ?? r, len, o?.seg ?? 8, false, o?.bevel ?? 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geo.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return this.add(mat, geo, { color: o?.color });
  }
  sphere(mat: THREE.Material, r: number, x = 0, y = 0, z = 0, o?: PartOpts & { seg?: number }): this {
    const s = o?.seg ?? 12;
    const geo = new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.7)));
    return this.add(mat, geo, { ...o, at: [x, y, z] });
  }
  lathe(mat: THREE.Material, profile: [number, number][], x = 0, y = 0, z = 0, o?: PartOpts & { seg?: number; phi?: number }): this {
    return this.add(mat, latheGeo(profile, o?.seg ?? 20, o?.phi ?? Math.PI * 2), { ...o, at: [x, y, z] });
  }
  /** Torus in the XY plane (axis = Z) unless rotated. */
  torus(mat: THREE.Material, R: number, r: number, x = 0, y = 0, z = 0, o?: PartOpts & { arc?: number; seg?: number; tseg?: number }): this {
    const geo = new THREE.TorusGeometry(R, r, o?.tseg ?? 6, o?.seg ?? 20, o?.arc ?? Math.PI * 2);
    return this.add(mat, geo, { ...o, at: [x, y, z] });
  }
  /** Smooth tube through points (Catmull-Rom): hoses, stems, taps. */
  tube(mat: THREE.Material, pts: V3[], r: number, o?: { radial?: number; seg?: number; closed?: boolean; color?: THREE.ColorRepresentation }): this {
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      o?.closed ?? false,
      'centripetal',
    );
    const seg = o?.seg ?? Math.max(6, pts.length * 4);
    const geo = new THREE.TubeGeometry(curve, seg, r, o?.radial ?? 6, o?.closed ?? false);
    const len = curve.getLength();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 2 * Math.PI * r);
    if (!(o?.closed ?? false)) {
      // end caps
      const a = pts[0];
      const b = pts[pts.length - 1];
      this.sphere(mat, r, a[0], a[1], a[2], { seg: 6, color: o?.color });
      this.sphere(mat, r, b[0], b[1], b[2], { seg: 6, color: o?.color });
    }
    return this.add(mat, geo, { color: o?.color });
  }
  /** Tube along a polyline with rounded corners: frames, rails, piping. */
  pipe(mat: THREE.Material, pts: V3[], r: number, o?: { radial?: number; fillet?: number; closed?: boolean; cornerSeg?: number; color?: THREE.ColorRepresentation } & Xf): this {
    const path = o?.fillet ? filletPath(pts, o.fillet, o.cornerSeg ?? 3, o.closed ?? false) : pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    return this.add(mat, sweepGeo(path, r, o?.radial ?? 6, o?.closed ?? false), o);
  }
  /** Extrude a 2D shape along +Z by `depth` (shape lies in XY). */
  extrude(mat: THREE.Material, shape: THREE.Shape, depth: number, o?: PartOpts & { bevel?: number; bevelSeg?: number; curveSeg?: number; grain?: Axis }): this {
    const b = o?.bevel ?? 0;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(depth - 2 * b, 1e-4),
      bevelEnabled: b > 0,
      bevelThickness: b,
      bevelSize: b,
      bevelOffset: -b,
      bevelSegments: o?.bevelSeg ?? 1,
      curveSegments: o?.curveSeg ?? 8,
    });
    if (b > 0) geo.translate(0, 0, b);
    geo.computeVertexNormals();
    return this.add(mat, boxUV(geo, o?.grain), o);
  }
  loft(mat: THREE.Material, rings: V3[][], o?: PartOpts & { closed?: boolean; capStart?: boolean; capEnd?: boolean; flip?: boolean; inside?: boolean }): this {
    return this.add(mat, loftGeo(rings, o), o);
  }
  /** Flat-shaded tapered block (frustum): base [w, d] at y0, top [w, d] at y1, top optionally shifted in x / z. */
  taper(mat: THREE.Material, base: [number, number], top: [number, number], y0: number, y1: number, o?: PartOpts & { shift?: [number, number] }): this {
    const [bw, bd] = base;
    const [tw, td] = top;
    const [sx, sz] = o?.shift ?? [0, 0];
    const B: V3[] = [
      [-bw / 2, y0, bd / 2],
      [bw / 2, y0, bd / 2],
      [bw / 2, y0, -bd / 2],
      [-bw / 2, y0, -bd / 2],
    ];
    const T: V3[] = [
      [sx - tw / 2, y1, sz + td / 2],
      [sx + tw / 2, y1, sz + td / 2],
      [sx + tw / 2, y1, sz - td / 2],
      [sx - tw / 2, y1, sz - td / 2],
    ];
    const pos: number[] = [];
    const quad = (a: V3, b: V3, c: V3, d: V3) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 4; i++) quad(B[i], B[(i + 1) % 4], T[(i + 1) % 4], T[i]);
    quad(T[0], T[1], T[2], T[3]);
    quad(B[3], B[2], B[1], B[0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return this.add(mat, boxUV(geo), o);
  }
  /** Flat rectangle facing +Z, centred (use rot to lay it down). UVs in metres, centred. */
  quad(mat: THREE.Material, w: number, h: number, o?: PartOpts): this {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * w, (uv.getY(i) - 0.5) * h);
    return this.add(mat, geo, o);
  }
  /** Instanced copies of one geometry (leaves, petals). Colours are optional per-instance tints. */
  inst(mat: THREE.Material, geo: THREE.BufferGeometry, matrices: THREE.Matrix4[], colors?: THREE.Color[], name = 'instances'): this {
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    const top = this.top();
    const m = new THREE.Matrix4();
    for (let i = 0; i < matrices.length; i++) {
      im.setMatrixAt(i, m.multiplyMatrices(top, matrices[i]));
      if (colors) im.setColorAt(i, colors[i % colors.length]);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.name = name;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingBox();
    im.computeBoundingSphere();
    this.extras.push(im);
    return this;
  }

  build(): THREE.Group {
    for (const [mat, geos] of this.buckets) {
      let geo: THREE.BufferGeometry | null = geos[0];
      if (geos.length > 1) {
        geo = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
      }
      if (!geo) {
        console.warn(`[furniture] could not merge parts of ${this.root.name} / ${mat.name}`);
        continue;
      }
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = mat.name || 'part';
      mesh.castShadow = !mat.userData.noCast;
      mesh.receiveShadow = !mat.userData.noReceive;
      if (mat.transparent) mesh.renderOrder = 2;
      if (this.isSub) mesh.userData.noBake = true;
      this.root.add(mesh);
    }
    this.buckets.clear();
    for (const e of this.extras) this.root.add(e);
    for (const s of this.subs) this.root.add(s.build());
    return this.root;
  }
}
