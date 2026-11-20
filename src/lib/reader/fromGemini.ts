// What Gemini saw in a picture of a plan → the same `ReadResult` the site's own reader produces.
//
// Gemini is used only to understand the drawing (where the walls, doors, rooms and stairs are, and what the
// dimension says). Its positions are approximate, so this squares them up: walls are made straight, lines that
// are nearly in line are put on one line, ends are joined at corners, openings are placed on their walls.
// From here on the house is built exactly as for a drawing the site read itself (buildSpec.ts).

import type { Vec2 } from '@/types/house';
import { titleCase } from '../roomDefaults';
import { makeOutside, parseDim, parseSize, readRooms, type R, type ReadFloor, type ReadOpening, type ReadResult, type ReadStair, type ReadStep, type ReadWall } from './readPlan';

interface GBox { x0: number; y0: number; x1: number; y1: number }
export interface GeminiFloor {
  name: string;
  order: number;
  scale: GBox & { text: string };
  walls: (GBox & { thick: boolean; exterior: boolean })[];
  openings: (GBox & { kind: 'door' | 'window' | 'opening'; label: string })[];
  rooms: (GBox & { name: string; size: string })[];
  stairs: (GBox & { up: 'n' | 's' | 'e' | 'w'; treads: number })[];
}
export interface GeminiPlan { floors: GeminiFloor[] }

const T_FULL = 0.23, T_HALF = 0.115;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Put values that are nearly equal on one value (walls drawn in line end up exactly in line). */
function cluster(values: number[], tol: number): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v); else groups.push([v]);
  }
  const centres = groups.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
  return (v) => centres.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), centres[0] ?? v);
}

export function readingFromGemini(plan: GeminiPlan, drawing: { width: number; height: number }, model?: string): ReadResult {
  const notes: string[] = [];
  const fail = (reason: string): ReadResult => ({ ok: false, reason, unitsPerMetre: 0, imperial: true, scaleSource: 'dimension', floors: [], north: null, notes, by: 'gemini', model });
  const src = (plan?.floors ?? []).filter((f) => f.walls?.length >= 3).sort((a, b) => a.order - b.order);
  if (!src.length) return fail('Gemini found no floor plan in this picture. Use a clearer, straight-on image of the plan, or trace it by hand.');
  const X = (x: number) => (x / 1000) * drawing.width, Y = (y: number) => (y / 1000) * drawing.height;
  const imperial = src.some((f) => /['’′"]/.test(f.scale?.text ?? '') || f.rooms.some((r) => /['’′]/.test(r.size)));

  // scale: the dimension Gemini read, cross-checked against the sizes printed in the rooms
  const scales: number[] = [];
  let scaleText: string | undefined;
  for (const f of src) {
    const L = f.scale ? parseDim(f.scale.text, imperial) : null;
    const len = f.scale ? Math.hypot(X(f.scale.x1) - X(f.scale.x0), Y(f.scale.y1) - Y(f.scale.y0)) : 0;
    const fromDim = L && len > 5 ? len / L : null;
    const fromRooms: number[] = [];
    for (const r of f.rooms) {
      const d = parseSize(r.size, imperial);
      if (!d) continue;
      const w = Math.abs(X(r.x1) - X(r.x0)), h = Math.abs(Y(r.y1) - Y(r.y0));
      const [a, b] = Math.abs(w / d[0] - h / d[1]) <= Math.abs(w / d[1] - h / d[0]) ? d : [d[1], d[0]];
      fromRooms.push(w / a, h / b);
    }
    const rooms = fromRooms.length >= 4 ? median(fromRooms) : null;
    if (fromDim && (!rooms || Math.abs(fromDim - rooms) / rooms < 0.12)) { scales.push(fromDim); scaleText ??= f.scale.text; }
    else if (rooms) scales.push(rooms);
    else if (fromDim) { scales.push(fromDim); scaleText ??= f.scale.text; }
  }
  if (!scales.length) return fail('Gemini could not read a dimension on this drawing, so its scale is unknown. Trace it by hand and set the scale with one known length.');
  const upm = median(scales);
  if (!scaleText) notes.push('The scale was worked out from the room sizes printed on the drawing.');

  const floors: ReadFloor[] = [];
  src.forEach((f, fi) => {
    // 1. straight walls in metres (sheet frame)
    interface W { axis: 'h' | 'v'; c: number; a: number; b: number; t: number }
    let skew = 0;
    const raw: W[] = [];
    for (const w of f.walls) {
      const x0 = X(w.x0) / upm, y0 = Y(w.y0) / upm, x1 = X(w.x1) / upm, y1 = Y(w.y1) / upm;
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), len = Math.hypot(dx, dy);
      if (len < 0.25) continue;
      if (Math.min(dx, dy) / len > 0.2) { skew++; continue; }
      const t = w.thick || w.exterior ? T_FULL : T_HALF;
      raw.push(dx >= dy ? { axis: 'h', c: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1), t } : { axis: 'v', c: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1), t });
    }
    if (skew) notes.push(`${skew} angled wall${skew > 1 ? 's were' : ' was'} left out (only walls along the sheet are built); add them in the plan editor.`);
    if (raw.length < 3) return;
    // Two things a picture-reader tends to get wrong, corrected from what it also told us:
    // a portico / sit-out / balcony is open, so the outline it drew round one is not a wall;
    const fx0 = Math.min(...raw.map((w) => (w.axis === 'v' ? w.c : w.a))), fx1 = Math.max(...raw.map((w) => (w.axis === 'v' ? w.c : w.b)));
    const fy0 = Math.min(...raw.map((w) => (w.axis === 'h' ? w.c : w.a))), fy1 = Math.max(...raw.map((w) => (w.axis === 'h' ? w.c : w.b)));
    const cutOut = (w: W, lo: number, hi: number): W[] => (hi <= w.a || lo >= w.b ? [w] : [{ ...w, b: Math.min(w.b, lo) }, { ...w, a: Math.max(w.a, hi) }].filter((p) => p.b - p.a > 0.3));
    let straight: W[] = raw;
    for (const r of f.rooms) {
      if (!/portico|porch|sit\s*-?\s*out|verandah?|balcon/i.test(r.name ?? '')) continue;
      const bx0 = Math.min(X(r.x0), X(r.x1)) / upm, bx1 = Math.max(X(r.x0), X(r.x1)) / upm, by0 = Math.min(Y(r.y0), Y(r.y1)) / upm, by1 = Math.max(Y(r.y0), Y(r.y1)) / upm;
      straight = straight.flatMap((w) => {
        const onEdge = w.axis === 'h' ? Math.abs(w.c - fy0) < 0.3 || Math.abs(w.c - fy1) < 0.3 : Math.abs(w.c - fx0) < 0.3 || Math.abs(w.c - fx1) < 0.3;
        if (!onEdge) return [w];
        if (w.axis === 'h') return w.c > by0 - 0.3 && w.c < by1 + 0.6 ? cutOut(w, bx0 - 0.6, bx1 + 0.6) : [w];
        return w.a < by1 && w.b > by0 ? cutOut(w, by0 - 0.25, by1 + 0.6) : [w];
      });
    }
    // and the long edge of a stair is not a wall unless a doorway is drawn in it (else nobody could reach the stair).
    // Gemini usually traces the building's outline (outer faces) for the outside walls. When that outline measures
    // the same as the overall dimension it read, move those walls in by half their thickness so the house keeps
    // its true outside size.
    const dimLen = f.scale ? parseDim(f.scale.text, imperial) : null;
    if (dimLen && (Math.abs(fx1 - fx0 - dimLen) / dimLen < 0.03 || Math.abs(fy1 - fy0 - dimLen) / dimLen < 0.03)) {
      for (const w of straight) {
        if (w.axis === 'v') { if (Math.abs(w.c - fx0) < 0.3) w.c = fx0 + w.t / 2; else if (Math.abs(w.c - fx1) < 0.3) w.c = fx1 - w.t / 2; }
        else if (Math.abs(w.c - fy0) < 0.3) w.c = fy0 + w.t / 2; else if (Math.abs(w.c - fy1) < 0.3) w.c = fy1 - w.t / 2;
      }
    }
    const outlineInset = dimLen && (Math.abs(fx1 - fx0 - dimLen) / dimLen < 0.03 || Math.abs(fy1 - fy0 - dimLen) / dimLen < 0.03) ? T_FULL / 2 : 0;
    let openedStair = 0;
    straight = straight.filter((w) => {
      const edge = w.axis === 'h' ? Math.abs(w.c - fy0) < 0.45 || Math.abs(w.c - fy1) < 0.45 : Math.abs(w.c - fx0) < 0.45 || Math.abs(w.c - fx1) < 0.45;
      if (edge) return true;
      let along = 0;
      for (const st of f.stairs) {
        const sx0 = Math.min(X(st.x0), X(st.x1)) / upm, sx1 = Math.max(X(st.x0), X(st.x1)) / upm, sy0 = Math.min(Y(st.y0), Y(st.y1)) / upm, sy1 = Math.max(Y(st.y0), Y(st.y1)) / upm;
        const vertical = st.up === 'n' || st.up === 's';
        if (vertical !== (w.axis === 'v')) continue;
        const beside = w.axis === 'v' ? Math.abs(w.c - sx0) < 0.35 || Math.abs(w.c - sx1) < 0.35 : Math.abs(w.c - sy0) < 0.35 || Math.abs(w.c - sy1) < 0.35;
        if (beside) along += Math.max(0, Math.min(w.b, w.axis === 'v' ? sy1 : sx1) - Math.max(w.a, w.axis === 'v' ? sy0 : sx0));
      }
      if (along < 0.6 * (w.b - w.a)) return true;
      const hasDoor = f.openings.some((o) => {
        const mx = (X(o.x0) + X(o.x1)) / 2 / upm, my = (Y(o.y0) + Y(o.y1)) / 2 / upm;
        return w.axis === 'v' ? Math.abs(mx - w.c) < 0.4 && my > w.a && my < w.b : Math.abs(my - w.c) < 0.4 && mx > w.a && mx < w.b;
      });
      if (!hasDoor) openedStair++;
      return hasDoor;
    });
    if (openedStair) notes.push('A line along the stair with no doorway in it was read as the stair\'s open side, not a wall.');
    raw.length = 0;
    raw.push(...straight);
    if (raw.length < 3) return;
    // 2. lines nearly in line → one line; ends pulled onto the wall they meet
    const snapH = cluster(raw.filter((w) => w.axis === 'h').map((w) => w.c), 0.16), snapV = cluster(raw.filter((w) => w.axis === 'v').map((w) => w.c), 0.16);
    for (const w of raw) w.c = w.axis === 'h' ? snapH(w.c) : snapV(w.c);
    const H = raw.filter((w) => w.axis === 'h'), V = raw.filter((w) => w.axis === 'v');
    const meet = (end: number, across: number, others: W[]) => others.filter((o) => Math.abs(o.c - end) < 0.4 && across >= o.a - 0.4 && across <= o.b + 0.4).sort((p, q) => Math.abs(p.c - end) - Math.abs(q.c - end))[0];
    for (const w of H) { const m0 = meet(w.a, w.c, V), m1 = meet(w.b, w.c, V); if (m0) w.a = m0.c; if (m1) w.b = m1.c; }
    for (const w of V) { const m0 = meet(w.a, w.c, H), m1 = meet(w.b, w.c, H); if (m0) w.a = m0.c; if (m1) w.b = m1.c; }
    // pieces of one wall that Gemini split (at a door, or by overlap) become one wall; a split at a doorway stays a gap
    const gaps: { axis: 'h' | 'v'; c: number; a: number; b: number }[] = [];
    const mergeRow = (set: W[]): W[] => {
      const out: W[] = [];
      for (const w of [...set].sort((p, q) => p.c - q.c || p.a - q.a)) {
        const l = out[out.length - 1];
        if (l && Math.abs(l.c - w.c) < 0.01 && w.a - l.b <= 3.6) {
          const gap = w.a - l.b;
          const door = gap > 0.35 && f.openings.some((o) => {
            const mx = (X(o.x0) + X(o.x1)) / 2 / upm, my = (Y(o.y0) + Y(o.y1)) / 2 / upm;
            const u = l.axis === 'h' ? mx : my, v = l.axis === 'h' ? my : mx;
            const len = Math.hypot(X(o.x1) - X(o.x0), Y(o.y1) - Y(o.y0)) / upm;
            return Math.abs(v - l.c) < 0.5 && u > l.b + 0.05 && u < w.a - 0.05 && gap <= 1.6 * len + 0.3;
          });
          if (gap <= 0.35 || door) {
            if (door) gaps.push({ axis: l.axis, c: l.c, a: l.b, b: w.a });
            l.b = Math.max(l.b, w.b); l.t = Math.max(l.t, w.t);
            continue;
          }
        }
        out.push({ ...w });
      }
      return out;
    };
    const Hm = mergeRow(H), Vm = mergeRow(V);
    // 3. rectangles: a wall along x runs through its corners; a wall along y stops at the faces it meets
    const rectsH: R[] = Hm.map((w) => {
      const endAt = (end: number, sign: number) => {
        const v = Vm.find((o) => Math.abs(o.c - end) < 0.02 && w.c >= o.a - 0.05 && w.c <= o.b + 0.05);
        if (!v) return end;
        const through = v.a < w.c - 0.3 && v.b > w.c + 0.3; // the other wall carries on both ways: stop at its face
        return through ? end - (sign * v.t) / 2 : end + (sign * v.t) / 2;
      };
      return { x0: endAt(w.a, -1), x1: endAt(w.b, 1), y0: w.c - w.t / 2, y1: w.c + w.t / 2 };
    });
    const rectsV: R[] = Vm.map((w) => {
      const endAt = (end: number, sign: number) => {
        const k = Hm.findIndex((o) => Math.abs(o.c - end) < 0.02 && w.c >= o.a - 0.05 && w.c <= o.b + 0.05);
        if (k < 0) return end;
        const r = rectsH[k];
        const covered = r.x0 <= w.c - w.t / 2 + 0.02 && r.x1 >= w.c + w.t / 2 - 0.02;
        return covered ? end - (sign * Hm[k].t) / 2 : end + (sign * Hm[k].t) / 2;
      };
      return { x0: w.c - w.t / 2, x1: w.c + w.t / 2, y0: endAt(w.a, -1), y1: endAt(w.b, 1) };
    });
    let all: { rect: R; axis: 'h' | 'v' }[] = [...rectsH.map((rect) => ({ rect, axis: 'h' as const })), ...rectsV.map((rect) => ({ rect, axis: 'v' as const }))].filter((w) => w.rect.x1 - w.rect.x0 > 0.05 && w.rect.y1 - w.rect.y0 > 0.05);
    // 4. the floor's own frame: origin at the top-left of its walls
    // (the outline Gemini drew, portico included, so an open portico still lies inside the floor's frame)
    const ox = Math.min(fx0 - T_FULL / 2 + outlineInset, ...all.map((w) => w.rect.x0)), oy = Math.min(fy0 - T_FULL / 2 + outlineInset, ...all.map((w) => w.rect.y0));
    const shift = (r: R): R => ({ x0: r.x0 - ox, x1: r.x1 - ox, y0: r.y0 - oy, y1: r.y1 - oy });
    all = all.map((w) => ({ ...w, rect: shift(w.rect) }));
    const Wd = Math.max(fx1 + T_FULL / 2 - outlineInset - ox, ...all.map((w) => w.rect.x1)), Dp = Math.max(fy1 + T_FULL / 2 - outlineInset - oy, ...all.map((w) => w.rect.y1));
    const outside = makeOutside(all.map((w) => w.rect), Wd, Dp);
    const walls: ReadWall[] = all.map((w) => {
      const r = w.rect;
      let ext = false;
      for (const k of [0.2, 0.5, 0.8]) {
        const p1: Vec2 = w.axis === 'h' ? [r.x0 + (r.x1 - r.x0) * k, r.y0 - 0.14] : [r.x0 - 0.14, r.y0 + (r.y1 - r.y0) * k];
        const p2: Vec2 = w.axis === 'h' ? [r.x0 + (r.x1 - r.x0) * k, r.y1 + 0.14] : [r.x1 + 0.14, r.y0 + (r.y1 - r.y0) * k];
        if (outside(p1[0], p1[1]) || outside(p2[0], p2[1])) ext = true;
      }
      return { rect: r, axis: w.axis, exterior: ext };
    });
    // 5. openings onto their walls
    const openings: ReadOpening[] = [];
    for (const o of f.openings) {
      const p0: Vec2 = [X(o.x0) / upm - ox, Y(o.y0) / upm - oy], p1: Vec2 = [X(o.x1) / upm - ox, Y(o.y1) / upm - oy];
      const mid: Vec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const axis: 'h' | 'v' = Math.abs(p1[0] - p0[0]) >= Math.abs(p1[1] - p0[1]) ? 'h' : 'v';
      let best = -1, bd = 0.45;
      walls.forEach((w, i) => {
        if (w.axis !== axis) return;
        const r = w.rect;
        const dx = Math.max(r.x0 - mid[0], 0, mid[0] - r.x1), dy = Math.max(r.y0 - mid[1], 0, mid[1] - r.y1), d = Math.hypot(dx, dy);
        if (d < bd) { bd = d; best = i; }
      });
      if (best < 0) continue;
      const w = walls[best], lo = axis === 'h' ? w.rect.x0 : w.rect.y0, hi = axis === 'h' ? w.rect.x1 : w.rect.y1;
      let from = Math.min(axis === 'h' ? p0[0] : p0[1], axis === 'h' ? p1[0] : p1[1]), to = Math.max(axis === 'h' ? p0[0] : p0[1], axis === 'h' ? p1[0] : p1[1]);
      // a gap Gemini drew between two wall pieces is the truest measure of this opening
      const g = gaps.find((x) => x.axis === axis && Math.abs((axis === 'h' ? x.c - oy : x.c - ox) - (axis === 'h' ? mid[1] : mid[0])) < 0.5 && (axis === 'h' ? mid[0] : mid[1]) > x.a - (axis === 'h' ? ox : oy) - 0.3 && (axis === 'h' ? mid[0] : mid[1]) < x.b - (axis === 'h' ? ox : oy) + 0.3);
      if (g) { from = g.a - (axis === 'h' ? ox : oy); to = g.b - (axis === 'h' ? ox : oy); }
      from = Math.max(lo + 0.06, from); to = Math.min(hi - 0.06, to);
      const width = to - from;
      if (width < 0.45 || width > 3.6) continue;
      if (openings.some((x) => x.wall === best && x.from < to && from < x.to)) continue;
      const ext = w.exterior;
      const c = axis === 'h' ? w.rect.y1 + 0.2 : w.rect.x1 + 0.2, at = (from + to) / 2;
      const plusOut = axis === 'h' ? outside(at, c) : outside(c, at);
      const inward: 1 | -1 = axis === 'h' ? (plusOut ? -1 : 1) : plusOut ? 1 : -1;
      const label = o.label?.trim() ? titleCase(o.label) : undefined;
      if (o.kind === 'window') openings.push({ wall: best, from, to, kind: 'window', leaf: 'double', drawnLeaf: true });
      else if (o.kind === 'door' || ext || label) openings.push({ wall: best, from, to, kind: 'door', leaf: ext && width >= 1.15 ? 'double' : 'single', hinge: 'a', swing: ext ? inward : 1, name: label, drawnLeaf: o.kind === 'door' });
      else openings.push({ wall: best, from, to, kind: 'opening', leaf: 'none', drawnLeaf: false });
    }
    // 6. stairs: each run cut into its treads, in walking order; a square run at a turn is a landing
    const steps: ReadStep[] = [];
    const runRects: R[] = [];
    f.stairs.forEach((s, k) => {
      const r: R = { x0: Math.min(X(s.x0), X(s.x1)) / upm - ox, x1: Math.max(X(s.x0), X(s.x1)) / upm - ox, y0: Math.min(Y(s.y0), Y(s.y1)) / upm - oy, y1: Math.max(Y(s.y0), Y(s.y1)) / upm - oy };
      if (r.x1 - r.x0 < 0.3 || r.y1 - r.y0 < 0.3) return;
      runRects.push(r);
      const vertical = s.up === 'n' || s.up === 's';
      const len = vertical ? r.y1 - r.y0 : r.x1 - r.x0, wid = vertical ? r.x1 - r.x0 : r.y1 - r.y0;
      const next = f.stairs[k + 1];
      if (next && next.up !== s.up && len <= wid * 1.25) { steps.push({ rect: r, kind: 'landing' }); return; }
      const n = Math.max(2, Math.min(30, s.treads > 0 && len / s.treads >= 0.2 && len / s.treads <= 0.4 ? s.treads : Math.round(len / 0.28)));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        steps.push({ kind: 'tread', rect: s.up === 'n' ? { ...r, y0: r.y1 - len * f1, y1: r.y1 - len * f0 } : s.up === 's' ? { ...r, y0: r.y0 + len * f0, y1: r.y0 + len * f1 } : s.up === 'e' ? { ...r, x0: r.x0 + len * f0, x1: r.x0 + len * f1 } : { ...r, x0: r.x1 - len * f1, x1: r.x1 - len * f0 } });
      }
    });
    const stairs: ReadStair[] = [];
    if (steps.length >= 3) {
      const b: R = { x0: Math.min(...runRects.map((r) => r.x0)), y0: Math.min(...runRects.map((r) => r.y0)), x1: Math.max(...runRects.map((r) => r.x1)), y1: Math.max(...runRects.map((r) => r.y1)) };
      const below = floors[floors.length - 1]?.stairs ?? [];
      const well = below.some((st) => st.rects.some((o) => Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > 0.4 && Math.min(o.y1, b.y1) - Math.max(o.y0, b.y0) > 0.4));
      stairs.push({ steps, rects: runRects, ordered: true, well });
    }
    // 7. rooms: the printed name and size at the room's centre, grown to the walls like any other reading
    const texts = f.rooms.flatMap((r) => {
      const cx = (X(r.x0) + X(r.x1)) / 2 / upm - ox, cy = (Y(r.y0) + Y(r.y1)) / 2 / upm - oy;
      const base = { angle: 0, size: 0.25, width: 1.2 };
      return [...(r.name?.trim() ? [{ ...base, str: r.name.trim(), x: cx, y: cy - 0.16 }] : []), ...(parseSize(r.size ?? '', imperial) ? [{ ...base, str: r.size, x: cx, y: cy + 0.16 }] : [])];
    });
    const rooms = readRooms(texts, walls.map((w) => w.rect), stairs, { x0: 0, y0: 0, x1: Wd, y1: Dp }, imperial);
    floors.push({
      title: titleCase((f.name || ['Ground floor', 'First floor', 'Second floor'][fi] || `Floor ${fi}`).replace(/\s*plan\s*$/i, '')), rank: f.order,
      origin: [ox * upm, oy * upm], width: Wd, depth: Dp, walls, openings, rooms, stairs, columns: [], outside,
    });
  });
  if (!floors.length) return fail('Gemini could not make out the walls in this picture. Use a clearer, straight-on image, or trace it by hand.');
  notes.push('Understood by Gemini from a picture: positions are approximate. Check the plan against the drawing before you rely on sizes.');
  return { ok: true, unitsPerMetre: upm, imperial, scaleSource: 'dimension', scaleText, floors, north: null, notes: [...new Set(notes)], by: 'gemini', model };
}
