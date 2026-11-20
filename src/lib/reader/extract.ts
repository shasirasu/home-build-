// Stage 1 of the plan reader: pull the drawing's own geometry out of a vector PDF page.
//
// A CAD-exported plan is not a picture: the file holds every line, filled shape, curve and text string with exact
// coordinates. pdf.js exposes them as an operator list; this turns that into plain primitives in DISPLAY space
// (points, origin top-left, y down, page rotation applied), which is the same space the underlay image uses.
// No AI and no image processing: just the file's contents.

import type { Vec2 } from '@/types/house';

export interface Seg {
  a: Vec2;
  b: Vec2;
  color: string;
  /** Index of the sub-path this segment came from (lets later stages drop whole shapes, e.g. stair treads). */
  loop: number;
}

export interface Loop {
  id: number;
  pts: Vec2[];
  closed: boolean;
  filled: boolean;
  stroked: boolean;
  color: string;
  fill: string;
  hasCurve: boolean;
}

export interface Curve {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  color: string;
}

export interface TextItem {
  str: string;
  /** Centre of the string. */
  x: number;
  y: number;
  /** Reading direction in degrees on the displayed page (0 = left to right, 90 = top to bottom). */
  angle: number;
  size: number;
  width: number;
}

export interface Prims {
  width: number;
  height: number;
  segs: Seg[];
  loops: Loop[];
  curves: Curve[];
  texts: TextItem[];
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): Vec2 => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The slice of pdf.js this needs; satisfied by a PDFPageProxy in the browser and in Node. */
export interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent(): Promise<{ items: unknown[] }>;
}

export async function extractPrims(page: PdfPageLike, OPS: Record<string, number>): Promise<Prims> {
  const vp = page.getViewport({ scale: 1 });
  const view = vp.transform as M;
  const list = await page.getOperatorList();
  const segs: Seg[] = [];
  const loops: Loop[] = [];
  const curves: Curve[] = [];

  let ctm: M = [1, 0, 0, 1, 0, 0];
  let stroke = '#000000';
  let fill = '#000000';
  const stack: { ctm: M; stroke: string; fill: string }[] = [];
  const hex = (a: unknown[]): string => {
    if (typeof a[0] === 'string') return (a[0] as string).toLowerCase();
    const [r, g, b] = a as number[];
    const h = (v: number) => Math.round(Math.max(0, Math.min(255, v <= 1 ? v * 255 : v))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  };
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const closeOps = new Set([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ctm, stroke, fill });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) ({ ctm, stroke, fill } = s); }
    else if (fn === OPS.transform) ctm = mul(ctm, args as unknown as M);
    else if (fn === OPS.setStrokeRGBColor) stroke = hex(args);
    else if (fn === OPS.setFillRGBColor) fill = hex(args);
    else if (fn === OPS.setStrokeGray) stroke = hex([args[0], args[0], args[0]]);
    else if (fn === OPS.setFillGray) fill = hex([args[0], args[0], args[0]]);
    else if (fn === OPS.constructPath) {
      const paint = args[0] as number;
      const isStroke = strokeOps.has(paint);
      const isFill = fillOps.has(paint);
      if (!isStroke && !isFill) continue; // clip paths
      const data = (args[1] as ArrayLike<number>[])[0];
      if (!data) continue;
      const m = mul(view, ctm);
      let pts: Vec2[] = [];
      let hasCurve = false;
      let closed = false;
      const flush = () => {
        if (pts.length >= 2) {
          const id = loops.length;
          const isClosed = closed || closeOps.has(paint) || (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01);
          const ring = isClosed && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01 ? pts.slice(0, -1) : pts;
          loops.push({ id, pts: ring, closed: isClosed, filled: isFill, stroked: isStroke, color: stroke, fill, hasCurve });
          if (isStroke && !hasCurve) {
            const n = ring.length;
            for (let k = 0; k < (isClosed ? n : n - 1); k++) segs.push({ a: ring[k], b: ring[(k + 1) % n], color: stroke, loop: id });
          }
        }
        pts = [];
        hasCurve = false;
        closed = false;
      };
      let j = 0;
      while (j < data.length) {
        const op = data[j];
        if (op === 0) { flush(); pts.push(apply(m, data[j + 1], data[j + 2])); j += 3; }
        else if (op === 1) { pts.push(apply(m, data[j + 1], data[j + 2])); j += 3; }
        else if (op === 2) {
          const p0 = pts[pts.length - 1] ?? apply(m, data[j + 1], data[j + 2]);
          const p1 = apply(m, data[j + 1], data[j + 2]), p2 = apply(m, data[j + 3], data[j + 4]), p3 = apply(m, data[j + 5], data[j + 6]);
          if (isStroke) curves.push({ p0, p1, p2, p3, color: stroke });
          pts.push(p3);
          hasCurve = true;
          j += 7;
        } else if (op === 3) {
          const p0 = pts[pts.length - 1] ?? apply(m, data[j + 1], data[j + 2]);
          const c = apply(m, data[j + 1], data[j + 2]), p3 = apply(m, data[j + 3], data[j + 4]);
          if (isStroke) curves.push({ p0, p1: c, p2: c, p3, color: stroke });
          pts.push(p3);
          hasCurve = true;
          j += 5;
        } else if (op === 4) { closed = true; j += 1; }
        else j += 1;
      }
      flush();
    }
  }

  const tc = await page.getTextContent();
  const texts: TextItem[] = [];
  for (const raw of tc.items) {
    const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const t = mul(view, it.transform as M);
    const len = Math.hypot(t[0], t[1]) || 1;
    const ux = t[0] / len, uy = t[1] / len; // reading direction in display space
    const size = Math.hypot(t[2], t[3]) || it.height || 10;
    const w = it.width ?? size * it.str.length * 0.5;
    // "up" for the glyphs is the transformed y axis; the visual centre sits about 0.35 em above the baseline
    const vx = t[2] / size, vy = t[3] / size;
    texts.push({
      str: it.str.trim(),
      x: t[4] + (ux * w) / 2 + vx * size * 0.35,
      y: t[5] + (uy * w) / 2 + vy * size * 0.35,
      angle: Math.round((Math.atan2(uy, ux) * 180) / Math.PI),
      size,
      width: w,
    });
  }
  return { width: vp.width, height: vp.height, segs, loops, curves, texts };
}
