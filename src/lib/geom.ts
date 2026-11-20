import type { Level, Opening, Room, Vec2, Wall } from '@/types/house';

export const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const wallLength = (w: Wall) => dist(w.a, w.b);

export function polygonArea(p: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(p: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += dist(p[i], p[(i + 1) % p.length]);
  return s;
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(p: Vec2[]) {
  const xs = p.map((v) => v[0]);
  const ys = p.map((v) => v[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A point inside the polygon, near its visual centre (centroid when inside, else the best grid sample). */
export function labelPoint(p: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) > 1e-9) {
    const c: Vec2 = [cx / (3 * a), cy / (3 * a)];
    if (pointInPolygon(c, p)) return c;
  }
  const b = bbox(p);
  let best: Vec2 = p[0];
  let bestD = -1;
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const q: Vec2 = [b.x0 + ((b.x1 - b.x0) * i) / 12, b.y0 + ((b.y1 - b.y0) * j) / 12];
      if (!pointInPolygon(q, p)) continue;
      let d = Infinity;
      for (let k = 0; k < p.length; k++) d = Math.min(d, segDist(q, p[k], p[(k + 1) % p.length]));
      if (d > bestD) { bestD = d; best = q; }
    }
  return best;
}

export function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Closest point on segment a-b to p, with the parameter t along it. */
export function projectOnSeg(p: Vec2, a: Vec2, b: Vec2): { pt: Vec2; t: number; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  const pt: Vec2 = [a[0] + t * dx, a[1] + t * dy];
  return { pt, t, d: Math.hypot(p[0] - pt[0], p[1] - pt[1]) };
}

export function roomAt(level: Level, pt: Vec2): Room | undefined {
  return level.rooms.find((r) => pointInPolygon(pt, r.polygon));
}

/** Default wall height: up to the underside of the slab above. */
export function wallHeight(levels: Level[], levelIndex: number, roofSlab: number, w?: Wall): number {
  if (w?.height) return w.height;
  const lv = levels[levelIndex];
  const above = levels[levelIndex + 1];
  return lv.height - (above ? above.slab : roofSlab);
}

/** The two end points of an opening along its wall. */
export function openingEnds(w: Wall, o: Opening): [Vec2, Vec2] {
  const L = wallLength(w) || 1;
  const ux = (w.b[0] - w.a[0]) / L, uy = (w.b[1] - w.a[1]) / L;
  const s = o.at - o.width / 2, e = o.at + o.width / 2;
  return [[w.a[0] + ux * s, w.a[1] + uy * s], [w.a[0] + ux * e, w.a[1] + uy * e]];
}

/** Rectangle corners of a wall (a-left, b-left, b-right, a-right). */
export function wallCorners(w: Wall): Vec2[] {
  const L = wallLength(w) || 1;
  const nx = -(w.b[1] - w.a[1]) / L, ny = (w.b[0] - w.a[0]) / L;
  const h = w.thickness / 2;
  return [
    [w.a[0] + nx * h, w.a[1] + ny * h],
    [w.b[0] + nx * h, w.b[1] + ny * h],
    [w.b[0] - nx * h, w.b[1] - ny * h],
    [w.a[0] - nx * h, w.a[1] - ny * h],
  ];
}

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
