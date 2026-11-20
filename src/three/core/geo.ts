// 2D plan geometry helpers used by the builders, the walk controller and picking.
// Everything here works in PLAN space (metres, +x right, +y down the drawing). 3D: X = plan x, Z = plan y.

import type { Vec2 } from '@/types/house';

export const EPS = 1e-5;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function finite(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pointInPoly(x: number, y: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed area (shoelace). Positive = counter-clockwise in a y-up reading of the coordinates. */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polyBBox(poly: Vec2[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToPolyEdge(x: number, y: number, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    d = Math.min(d, segDist(x, y, a[0], a[1], b[0], b[1]));
  }
  return d;
}

/** Drop repeated / non-finite points; returns [] when fewer than 3 usable points remain. */
export function cleanPoly(poly: Vec2[] | undefined | null): Vec2[] {
  if (!Array.isArray(poly)) return [];
  const out: Vec2[] = [];
  for (const p of poly) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 1e-4) continue;
    out.push([p[0], p[1]]);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out.length >= 3 && Math.abs(signedArea(out)) > 1e-6 ? out : [];
}

/** A point guaranteed inside the polygon, as far from the edges as a coarse search finds (label anchor). */
export function interiorPoint(poly: Vec2[], holes: Vec2[][] = []): Vec2 {
  if (poly.length < 3) return poly[0] ?? [0, 0];
  const a = signedArea(poly);
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  const b = polyBBox(poly);
  let best: Vec2 = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  let bestD = -1;
  const inHole = (x: number, y: number) => holes.some((h) => pointInPoly(x, y, h));
  const edgeDist = (x: number, y: number) => {
    let d = distToPolyEdge(x, y, poly);
    for (const h of holes) d = Math.min(d, distToPolyEdge(x, y, h));
    return d;
  };
  const consider = (x: number, y: number, bonus: number) => {
    if (!pointInPoly(x, y, poly) || inHole(x, y)) return;
    const d = edgeDist(x, y) * bonus;
    if (d > bestD) { bestD = d; best = [x, y]; }
  };
  const N = 14;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) consider(b.x0 + ((b.x1 - b.x0) * (i + 0.5)) / (N + 1), b.y0 + ((b.y1 - b.y0) * (j + 0.5)) / (N + 1), 1);
  // Prefer the centroid when it is comfortably inside: it reads as the "middle" of simple rooms.
  if (Math.abs(a) > 1e-9) {
    const c: Vec2 = [cx / (6 * a), cy / (6 * a)];
    if (pointInPoly(c[0], c[1], poly) && !inHole(c[0], c[1]) && edgeDist(c[0], c[1]) >= bestD * 0.75) return c;
  }
  return best;
}

/**
 * Offset a simple polygon by `d` metres: positive grows it, negative shrinks it (mitred corners), whatever its winding.
 */
export function offsetPoly(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  if (n < 3 || d === 0) return poly.map((p) => [p[0], p[1]] as Vec2);
  const sgn = signedArea(poly) >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    let e1x = p1[0] - p0[0], e1y = p1[1] - p0[1];
    let e2x = p2[0] - p1[0], e2y = p2[1] - p1[1];
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    // outward normals of the two edges meeting at p1
    const n1x = e1y * sgn, n1y = -e1x * sgn;
    const n2x = e2y * sgn, n2y = -e2x * sgn;
    const k = 1 + n1x * n2x + n1y * n2y;
    if (k < 0.15) {
      // very sharp corner: fall back to the bisector without the long mitre
      out.push([p1[0] + (n1x + n2x) * d * 0.5, p1[1] + (n1y + n2y) * d * 0.5]);
    } else out.push([p1[0] + ((n1x + n2x) / k) * d, p1[1] + ((n1y + n2y) / k) * d]);
  }
  return out;
}

/** Oriented rectangle: centre-line a→b, half thickness. Used for walls, beams, furniture footprints. */
export interface ORect {
  ax: number; ay: number;
  /** unit direction a→b */
  ux: number; uy: number;
  len: number;
  /** half thickness */
  ht: number;
}

export function orectFromSeg(a: Vec2, b: Vec2, thickness: number): ORect | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-4) || !Number.isFinite(len)) return null;
  return { ax: a[0], ay: a[1], ux: dx / len, uy: dy / len, len, ht: Math.max(0, thickness) / 2 };
}

/** Rectangle from a centre, size and rotation (rot as PlacedItem.rot: local +Z (depth) turns toward +X). */
export function orectFromCentre(cx: number, cy: number, w: number, d: number, rot: number): ORect {
  // local X (width) in plan = (cos rot, -sin rot); the rectangle runs along it, `d` thick.
  const ux = Math.cos(rot), uy = -Math.sin(rot);
  return { ax: cx - (ux * w) / 2, ay: cy - (uy * w) / 2, ux, uy, len: w, ht: d / 2 };
}

/** Local coordinates of a point in a rect frame: s along a→b, q across (left-hand normal n = (-uy, ux)). */
export function orectLocal(r: ORect, x: number, y: number): [number, number] {
  const dx = x - r.ax, dy = y - r.ay;
  return [dx * r.ux + dy * r.uy, -dx * r.uy + dy * r.ux];
}

export function pointInORect(r: ORect, x: number, y: number, grow = 0): boolean {
  const [s, q] = orectLocal(r, x, y);
  return s >= -grow && s <= r.len + grow && Math.abs(q) <= r.ht + grow;
}

export function distToORect(r: ORect, x: number, y: number): number {
  const [s, q] = orectLocal(r, x, y);
  const ds = s < 0 ? -s : s > r.len ? s - r.len : 0;
  const dq = Math.max(0, Math.abs(q) - r.ht);
  return Math.hypot(ds, dq);
}

export function orectCorners(r: ORect): Vec2[] {
  const nx = -r.uy, ny = r.ux;
  const bx = r.ax + r.ux * r.len, by = r.ay + r.uy * r.len;
  return [
    [r.ax + nx * r.ht, r.ay + ny * r.ht],
    [bx + nx * r.ht, by + ny * r.ht],
    [bx - nx * r.ht, by - ny * r.ht],
    [r.ax - nx * r.ht, r.ay - ny * r.ht],
  ];
}

/** Separating-axis overlap test for two oriented rectangles (touching within `slack` does not count). */
export function orectsOverlap(a: ORect, b: ORect, slack = 0.002): boolean {
  const ca = orectCorners(a), cb = orectCorners(b);
  const axes: Vec2[] = [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]];
  for (const [x, y] of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of ca) { const v = p[0] * x + p[1] * y; if (v < a0) a0 = v; if (v > a1) a1 = v; }
    for (const p of cb) { const v = p[0] * x + p[1] * y; if (v < b0) b0 = v; if (v > b1) b1 = v; }
    if (a1 <= b0 + slack || b1 <= a0 + slack) return false;
  }
  return true;
}

/**
 * Push a circle out of an oriented rectangle. Returns the corrected centre, or null when they do not touch.
 */
export function pushCircleOutOfORect(r: ORect, x: number, y: number, radius: number): [number, number] | null {
  const [s, q] = orectLocal(r, x, y);
  const cs = clamp(s, 0, r.len), cq = clamp(q, -r.ht, r.ht);
  let ds = s - cs, dq = q - cq;
  const d2 = ds * ds + dq * dq;
  if (d2 >= radius * radius) return null;
  let ns: number, nq: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const k = radius / d;
    ns = cs + ds * k; nq = cq + dq * k;
  } else {
    // centre inside the rectangle: leave through the nearest side
    const toS0 = s, toS1 = r.len - s, toQ0 = q + r.ht, toQ1 = r.ht - q;
    const m = Math.min(toS0, toS1, toQ0, toQ1);
    ns = s; nq = q;
    if (m === toQ0) nq = -r.ht - radius;
    else if (m === toQ1) nq = r.ht + radius;
    else if (m === toS0) ns = -radius;
    else ns = r.len + radius;
    ds = dq = 0;
  }
  return [r.ax + r.ux * ns - r.uy * nq, r.ay + r.uy * ns + r.ux * nq];
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * `subject` minus `holes` as a list of convex pieces (trapezoids), by horizontal slab decomposition.
 * Robust where earcut-with-holes is not: holes may touch or cross the subject's edge, overlap each other or lie
 * partly outside. Even-odd fill per polygon. Each piece is 3–4 points in order around it.
 */
export function polyDifference(subject: Vec2[], holes: Vec2[][]): Vec2[][] {
  type E = { x0: number; y0: number; x1: number; y1: number; tag: number };
  const edges: E[] = [];
  const ys: number[] = [];
  const add = (poly: Vec2[], tag: number) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      ys.push(a[1]);
      if (Math.abs(a[1] - b[1]) < 1e-9) continue;
      edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], tag } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], tag });
    }
  };
  add(subject, 0);
  holes.forEach((h, i) => add(h, i + 1));
  // slab boundaries also at every crossing of two edges, so edges never cross inside a slab
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i], b = edges[j];
      const d = (a.x1 - a.x0) * (b.y1 - b.y0) - (a.y1 - a.y0) * (b.x1 - b.x0);
      if (Math.abs(d) < 1e-12) continue;
      const t = ((b.x0 - a.x0) * (b.y1 - b.y0) - (b.y0 - a.y0) * (b.x1 - b.x0)) / d;
      const u = ((b.x0 - a.x0) * (a.y1 - a.y0) - (b.y0 - a.y0) * (a.x1 - a.x0)) / d;
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) ys.push(a.y0 + t * (a.y1 - a.y0));
    }
  ys.sort((p, q) => p - q);
  const out: Vec2[][] = [];
  const inHole = new Uint8Array(holes.length + 1);
  for (let k = 0; k < ys.length - 1; k++) {
    const ya = ys[k], yb = ys[k + 1];
    if (yb - ya < 1e-7) continue;
    const ym = (ya + yb) / 2;
    const act: { xa: number; xb: number; xm: number; tag: number }[] = [];
    for (const e of edges) {
      if (e.y0 > ym || e.y1 < ym) continue;
      const f = (y: number) => e.x0 + ((e.x1 - e.x0) * (y - e.y0)) / (e.y1 - e.y0);
      act.push({ xa: f(ya), xb: f(yb), xm: f(ym), tag: e.tag });
    }
    act.sort((p, q) => p.xm - q.xm || p.xa + p.xb - (q.xa + q.xb));
    inHole.fill(0);
    let holesIn = 0;
    for (let i = 0; i < act.length - 1; i++) {
      const e = act[i];
      inHole[e.tag] ^= 1;
      if (e.tag > 0) holesIn += inHole[e.tag] ? 1 : -1;
      if (!inHole[0] || holesIn > 0) continue;
      const n = act[i + 1];
      if (n.xm - e.xm < 1e-7) continue;
      const piece: Vec2[] = [[e.xa, ya], [n.xa, ya]];
      piece.push([n.xb, yb], [e.xb, yb]);
      out.push(piece);
    }
  }
  return out;
}
