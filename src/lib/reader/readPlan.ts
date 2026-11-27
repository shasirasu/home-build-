// Stage 2 of the plan reader: turn the drawing's primitives into floors, scale, walls, openings, rooms, stairs and
// columns. Deterministic geometry only (no AI): the same steps a person follows reading a CAD plan.
//
//   1. scale     a dimension text ("22'") + the dimension line it sits on  → drawing units per metre
//   2. floors    groups of linework separated on the sheet, named by their titles ("GROUND FLOOR PLAN")
//   3. columns   small filled squares
//   4. stairs    stacks of tread rectangles, ordered bottom → top by the arrow drawn on them
//   5. walls     pairs of parallel face lines 3"–10" apart  → wall rectangles, corners and junctions closed
//   6. openings  gaps between collinear wall pieces; a swing arc makes it a door and gives hinge + swing side
//   7. rooms     each printed name + size, grown to the surrounding wall faces
//
// Everything is in metres in the floor's own frame: origin = top-left of its linework, +x right, +y down.

import type { Opening, Vec2, Wall } from '@/types/house';
import type { Curve, Loop, Prims, Seg, TextItem } from './extract';
import { roomTypeFromName, titleCase } from '../roomDefaults';

export interface R { x0: number; y0: number; x1: number; y1: number }

export interface ReadRoom { name: string; type: ReturnType<typeof roomTypeFromName>; size?: string; rect: R; labelled: boolean }
export interface ReadOpening { wall: number; from: number; to: number; kind: Opening['kind']; leaf: Opening['leaf']; hinge?: 'a' | 'b'; swing?: 1 | -1; name?: string; drawnLeaf: boolean }
export interface ReadWall { rect: R; axis: 'h' | 'v'; exterior: boolean }
export interface ReadStep { rect: R; kind: 'tread' | 'landing' }
export interface ReadStair { steps: ReadStep[]; rects: R[]; ordered: boolean; /** The same stair as on the floor below, seen from above: a hole in this floor, not a room. */ well: boolean }

export interface ReadFloor {
  title: string;
  rank: number;
  /** Top-left of this floor's linework on the page (drawing units) and its size in metres. */
  origin: Vec2;
  width: number;
  depth: number;
  walls: ReadWall[];
  openings: ReadOpening[];
  rooms: ReadRoom[];
  stairs: ReadStair[];
  columns: R[];
  /** True when a point (metres) is outside the building envelope. */
  outside: (x: number, y: number) => boolean;
}

export interface ReadResult {
  ok: boolean;
  reason?: string;
  unitsPerMetre: number;
  imperial: boolean;
  scaleSource: 'dimension' | 'wall-thickness';
  scaleText?: string;
  floors: ReadFloor[];
  north: Vec2 | null;
  notes: string[];
  /** Who understood the drawing: the site's own reader, or Gemini from a picture of it. */
  by?: 'site' | 'gemini';
  model?: string;
}

const EPS = 0.012;
const T_MIN = 0.07;
const T_MAX = 0.27;
const JOIN = 0.3;
const OPEN_MIN = 0.5;
const OPEN_MAX = 3.6;

// ------------------------------------------------------------------------------------------------ text

const norm = (t: string) => t.replace(/[’′`´]/g, "'").replace(/[”″]/g, '"').replace(/\s+/g, '');

/** One length as printed (22', 11'9", 9.'9"', 6", 3000, 3.2m) → metres. Lenient about stray marks. */
export function parseDim(text: string, imperial: boolean): number | null {
  const t = norm(text);
  let m = t.match(/^(\d+(?:\.\d+)?)\.?'-?(?:(\d+(?:\.\d+)?)["']*)?$/);
  if (m) return (parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 12 : 0)) * 0.3048;
  m = t.match(/^(\d+(?:\.\d+)?)"$/);
  if (m) return (parseFloat(m[1]) / 12) * 0.3048;
  m = t.match(/^(\d+(?:\.\d+)?)(mm|cm|m)$/i);
  if (m) return parseFloat(m[1]) * ({ mm: 0.001, cm: 0.01, m: 1 } as Record<string, number>)[m[2].toLowerCase()];
  if (!imperial && /^\d+(?:\.\d+)?$/.test(t)) {
    const v = parseFloat(t);
    return v >= 100 ? v / 1000 : v > 0.3 ? v : null;
  }
  return null;
}

/** A room size as printed (10'x12') → [a, b] metres. */
export function parseSize(text: string, imperial: boolean): [number, number] | null {
  const parts = norm(text).split(/[x×X*]/);
  if (parts.length !== 2) return null;
  const a = parseDim(parts[0], imperial), b = parseDim(parts[1], imperial);
  return a && b ? [a, b] : null;
}

/** Join text items that sit on one line into a single string. */
function mergeLines(items: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  const used = new Set<number>();
  const along = (t: TextItem) => (Math.abs(t.angle) < 45 || Math.abs(t.angle) > 135 ? 'x' : 'y');
  const order = items.map((_, i) => i).sort((p, q) => {
    const a = items[p], b = items[q];
    return along(a) === 'x' ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y;
  });
  for (const i of order) {
    if (used.has(i)) continue;
    let cur = { ...items[i] };
    used.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of order) {
        if (used.has(j)) continue;
        const n = items[j];
        if (n.angle !== cur.angle) continue;
        const ax = along(cur);
        const perp = ax === 'x' ? Math.abs(n.y - cur.y) : Math.abs(n.x - cur.x);
        if (perp > 0.5 * cur.size) continue;
        const c0 = ax === 'x' ? cur.x : cur.y, c1 = ax === 'x' ? n.x : n.y;
        const gap = Math.abs(c1 - c0) - (cur.width + n.width) / 2;
        if (gap > 0.9 * cur.size || gap < -0.6 * cur.size) continue;
        const first = c0 <= c1 ? cur : n, second = c0 <= c1 ? n : cur;
        const reversed = cur.angle === 180 || cur.angle === -90;
        const str = reversed ? `${second.str} ${first.str}` : `${first.str} ${second.str}`;
        const lo = Math.min(c0 - cur.width / 2, c1 - n.width / 2), hi = Math.max(c0 + cur.width / 2, c1 + n.width / 2);
        cur = { ...cur, str, width: hi - lo, ...(ax === 'x' ? { x: (lo + hi) / 2 } : { y: (lo + hi) / 2 }) };
        used.add(j);
        grew = true;
      }
    }
    out.push(cur);
  }
  return out;
}

/** Join a label printed on two lines (MAIN / ENTRANCE, MASTER / BEDROOM). Sizes and dimensions stay separate. */
function mergeStacked(items: TextItem[], imperial: boolean): TextItem[] {
  const plain = (t: TextItem) => !parseSize(t.str, imperial) && !parseDim(t.str, imperial) && /[a-z]{2,}/i.test(t.str);
  const out: TextItem[] = [];
  const used = new Set<TextItem>();
  for (const a of items) {
    if (used.has(a)) continue;
    let cur = a;
    if (plain(a)) {
      const rad = (a.angle * Math.PI) / 180;
      const nx = -Math.sin(rad), ny = Math.cos(rad); // direction of the next line
      for (const b of items) {
        if (b === a || used.has(b) || b.angle !== a.angle || !plain(b)) continue;
        const dx = b.x - cur.x, dy = b.y - cur.y;
        const down = dx * nx + dy * ny, side = Math.abs(dx * ny - dy * nx);
        if (down < 0.6 * a.size || down > 1.7 * a.size || side > 0.6 * Math.max(a.width, b.width)) continue;
        cur = { ...cur, str: `${cur.str} ${b.str}`, x: (cur.x + b.x) / 2, y: (cur.y + b.y) / 2, width: Math.max(cur.width, b.width) };
        used.add(b);
        break;
      }
    }
    used.add(a);
    out.push(cur);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ geometry helpers

const bboxOf = (pts: Vec2[]): R => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const inside = (r: R, x: number, y: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;
const contains = (outer: R, inner: R, pad = EPS) => inner.x0 >= outer.x0 - pad && inner.y0 >= outer.y0 - pad && inner.x1 <= outer.x1 + pad && inner.y1 <= outer.y1 + pad;
const near = (a: number, b: number, tol = 0.035) => Math.abs(a - b) <= tol;
const area = (r: R) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const isect = (a: R, b: R): R => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function unionFind(n: number) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (p[i] === i ? i : (p[i] = find(p[i])));
  return { find, join: (a: number, b: number) => { p[find(a)] = find(b); } };
}

interface Line { c: number; a: number; b: number }

function mergeCollinear(lines: Line[]): Line[] {
  const sorted = [...lines].sort((p, q) => p.c - q.c);
  const out: Line[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].c - sorted[i].c <= EPS) j++;
    const group = sorted.slice(i, j + 1).sort((p, q) => p.a - q.a);
    const c = group.reduce((s, l) => s + l.c, 0) / group.length;
    let cur = { c, a: group[0].a, b: group[0].b };
    for (const l of group.slice(1)) {
      if (l.a <= cur.b + EPS) cur.b = Math.max(cur.b, l.b);
      else { out.push(cur); cur = { c, a: l.a, b: l.b }; }
    }
    out.push(cur);
    i = j + 1;
  }
  return out;
}

interface Band { c0: number; c1: number; a: number; b: number; inner: [number, number][] }

/** Pair parallel face lines into wall bands. `lines` all run along the same axis. */
function pairLines(lines: Line[]): Band[] {
  const cuts = [...new Set(lines.flatMap((l) => [l.a, l.b]).map((v) => Math.round(v / 0.002) * 0.002))].sort((a, b) => a - b);
  const strips: Band[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const u = cuts[k], v = cuts[k + 1];
    if (v - u < 0.004) continue;
    const mid = (u + v) / 2;
    let present = lines.filter((l) => l.a <= mid && l.b >= mid).map((l) => l.c).sort((a, b) => a - b);
    // A ladder of equally spaced lines is a stair drawn as plain lines, not a row of walls.
    for (let s = 0; s + 3 < present.length; s++) {
      const d = present[s + 1] - present[s];
      if (d < 0.2 || d > 0.36) continue;
      let e = s + 1;
      while (e + 1 < present.length && Math.abs(present[e + 1] - present[e] - d) < d * 0.08) e++;
      if (e - s >= 3) { present = [...present.slice(0, s), ...present.slice(e + 1)]; s--; }
    }
    let i = 0;
    while (i + 1 < present.length) {
      let j = i;
      while (j + 1 < present.length && present[j + 1] - present[i] <= T_MAX + EPS) j++;
      if (j > i && present[j] - present[i] >= T_MIN) {
        strips.push({ c0: present[i], c1: present[j], a: u, b: v, inner: j - i > 1 ? [[u, v]] : [] });
        i = j + 1;
      } else i++;
    }
  }
  strips.sort((p, q) => p.c0 - q.c0 || p.c1 - q.c1 || p.a - q.a);
  const out: Band[] = [];
  for (const s of strips) {
    const last = out[out.length - 1];
    if (last && near(last.c0, s.c0, EPS) && near(last.c1, s.c1, EPS) && s.a <= last.b + 0.006) {
      last.b = Math.max(last.b, s.b);
      for (const iv of s.inner) {
        const li = last.inner[last.inner.length - 1];
        if (li && iv[0] <= li[1] + 0.006) li[1] = Math.max(li[1], iv[1]);
        else last.inner.push(iv);
      }
    } else out.push({ ...s, inner: s.inner.map((iv) => [...iv] as [number, number]) });
  }
  return out.filter((b) => b.b - b.a >= 0.04);
}

// ------------------------------------------------------------------------------------------------ scale

function findScale(texts: TextItem[], ann: Seg[], imperial: boolean): { upm: number; text: string } | null {
  const cands: { upm: number; pts: number; text: string }[] = [];
  for (const t of texts) {
    if (/[x×X*]/.test(t.str)) continue;
    const L = parseDim(t.str, imperial);
    if (!L || L < 0.6) continue;
    const horiz = Math.abs(t.angle) < 20 || Math.abs(Math.abs(t.angle) - 180) < 20;
    const vert = Math.abs(Math.abs(t.angle) - 90) < 20;
    if (!horiz && !vert) continue;
    const u = (p: Vec2) => (horiz ? p[0] : p[1]); // along the dimension line
    const w = (p: Vec2) => (horiz ? p[1] : p[0]); // across it
    const tu = horiz ? t.x : t.y, tw = horiz ? t.y : t.x;
    const par = ann.filter((s) => Math.abs(w(s.a) - w(s.b)) < 0.3 && Math.abs(u(s.a) - u(s.b)) > 0.5 && Math.abs((w(s.a) + w(s.b)) / 2 - tw) <= 1.6 * t.size);
    if (!par.length) continue;
    // candidate levels across the line; keep the one whose connected run around the text is longest
    const levels = [...new Set(par.map((s) => Math.round((w(s.a) + w(s.b)) / 2 / 0.6)))];
    let best: [number, number] | null = null;
    for (const lv of levels) {
      const row = par.filter((s) => Math.round((w(s.a) + w(s.b)) / 2 / 0.6) === lv).map((s) => [Math.min(u(s.a), u(s.b)), Math.max(u(s.a), u(s.b))] as [number, number]).sort((p, q) => p[0] - q[0]);
      const reach = t.width + 3 * t.size;
      let lo = tu - t.width / 2, hi = tu + t.width / 2, grew = true, touched = false;
      while (grew) {
        grew = false;
        for (const [a, b] of row) {
          if (b < lo - reach || a > hi + reach) continue;
          if (a < lo - 1e-6) { lo = a; grew = true; touched = true; }
          if (b > hi + 1e-6) { hi = b; grew = true; touched = true; }
        }
      }
      if (!touched) continue;
      // arrow heads: short strokes hugging the line that reach past its ends
      const lw = lv * 0.6;
      for (const s of ann) {
        if (Math.abs(w(s.a) - lw) > 0.7 * t.size || Math.abs(w(s.b) - lw) > 0.7 * t.size) continue;
        const a = Math.min(u(s.a), u(s.b)), b = Math.max(u(s.a), u(s.b));
        if (b >= lo - 1.5 * t.size && a < lo) lo = Math.min(lo, a);
        if (a <= hi + 1.5 * t.size && b > hi) hi = Math.max(hi, b);
      }
      if (!best || hi - lo > best[1] - best[0]) best = [lo, hi];
    }
    if (!best || best[1] - best[0] < 3 * t.size) continue;
    cands.push({ upm: (best[1] - best[0]) / L, pts: best[1] - best[0], text: t.str });
  }
  if (!cands.length) return null;
  let top: typeof cands = [];
  for (const c of cands) {
    const group = cands.filter((o) => Math.abs(o.upm - c.upm) / c.upm <= 0.015);
    if (group.length > top.length || (group.length === top.length && group.reduce((s, g) => s + g.pts, 0) > top.reduce((s, g) => s + g.pts, 0))) top = group;
  }
  const longest = top.reduce((p, q) => (q.pts > p.pts ? q : p));
  return { upm: top.reduce((s, g) => s + g.upm, 0) / top.length, text: longest.text };
}

/** Fallback when no dimension line is readable: the commonest gap between close parallel lines is a 9" wall. */
function scaleFromWalls(segs: Seg[]): number | null {
  const H: Line[] = [], V: Line[] = [];
  for (const s of segs) {
    const dx = Math.abs(s.a[0] - s.b[0]), dy = Math.abs(s.a[1] - s.b[1]);
    if (dy < 0.05 && dx > 2) H.push({ c: s.a[1], a: Math.min(s.a[0], s.b[0]), b: Math.max(s.a[0], s.b[0]) });
    else if (dx < 0.05 && dy > 2) V.push({ c: s.a[0], a: Math.min(s.a[1], s.b[1]), b: Math.max(s.a[1], s.b[1]) });
  }
  const gaps: number[] = [];
  for (const set of [H, V]) {
    const s = [...set].sort((p, q) => p.c - q.c);
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length && s[j].c - s[i].c < 40; j++) {
        const ov = Math.min(s[i].b, s[j].b) - Math.max(s[i].a, s[j].a);
        const g = s[j].c - s[i].c;
        if (ov > 3 * g && g > 1) gaps.push(g);
      }
  }
  if (gaps.length < 6) return null;
  const hist = new Map<number, number>();
  for (const g of gaps) hist.set(Math.round(g * 2) / 2, (hist.get(Math.round(g * 2) / 2) ?? 0) + 1);
  const mode = [...hist.entries()].sort((p, q) => q[1] - p[1])[0][0];
  return mode / 0.23;
}

// ------------------------------------------------------------------------------------------------ main

const TITLE_RANK: [RegExp, number][] = [[/basement|cellar/i, -1], [/stilt|parking/i, 0], [/ground|\bg\.?g\b|\bg\.?f\b/i, 0], [/first|1st|\bf\.?f\b/i, 1], [/second|2nd|\bs\.?f\b/i, 2], [/third|3rd/i, 3], [/fourth|4th/i, 4], [/terrace|roof/i, 99]];

function floorTitle(text: string): string {
  const t = text.replace(/\s*plan\s*$/i, '').trim();
  if (/^(g\.?g\.?|g\.?f\.?)$/i.test(t)) return 'Ground Floor';
  if (/^(f\.?f\.?)$/i.test(t)) return 'First Floor';
  if (/^(s\.?f\.?)$/i.test(t)) return 'Second Floor';
  return titleCase(t);
}

export function readPlan(prims: Prims): ReadResult {
  const notes: string[] = [];
  const fail = (reason: string): ReadResult => ({ ok: false, reason, unitsPerMetre: 0, imperial: true, scaleSource: 'dimension', floors: [], north: null, notes });
  if (prims.segs.length < 12) return fail('This file has no line drawing in it (it looks like a scan or a photo). Trace it by hand with the wall and room tools.');

  const lines = mergeLines(prims.texts);
  const imperial = lines.some((t) => /\d\s*['’′]/.test(t.str));
  const texts = mergeStacked(lines, imperial);

  // Wall colour = the colour that draws most of the straight linework; anything else is annotation (dimensions, arrows).
  const lenByColor = new Map<string, number>();
  for (const s of prims.segs) lenByColor.set(s.color, (lenByColor.get(s.color) ?? 0) + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]));
  const wallColor = [...lenByColor.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const wallSegs = prims.segs.filter((s) => s.color === wallColor);
  const annSegs = prims.segs.filter((s) => s.color !== wallColor);

  // 1. scale
  const dim = findScale(texts, annSegs.length ? annSegs : prims.segs, imperial);
  let upm = dim?.upm ?? 0;
  let scaleSource: ReadResult['scaleSource'] = 'dimension';
  if (!upm) {
    const guess = scaleFromWalls(wallSegs);
    if (!guess) return fail('No dimension could be read from the drawing, so its scale is unknown. Set the scale by hand (Scale tool), then trace.');
    upm = guess;
    scaleSource = 'wall-thickness';
    notes.push('No dimension line could be read; the scale assumes the commonest wall is 9″ (230 mm). Check it with the Scale tool.');
  }

  // 2. floors: clusters of wall-colour linework
  const pad = 0.45 * upm;
  const boxes = wallSegs.map((s) => ({ x0: Math.min(s.a[0], s.b[0]) - pad, y0: Math.min(s.a[1], s.b[1]) - pad, x1: Math.max(s.a[0], s.b[0]) + pad, y1: Math.max(s.a[1], s.b[1]) + pad }));
  const uf = unionFind(wallSegs.length);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (boxes[i].x0 <= boxes[j].x1 && boxes[j].x0 <= boxes[i].x1 && boxes[i].y0 <= boxes[j].y1 && boxes[j].y0 <= boxes[i].y1) uf.join(i, j);
  const comps = new Map<number, number[]>();
  wallSegs.forEach((_, i) => { const r = uf.find(i); comps.set(r, [...(comps.get(r) ?? []), i]); });
  const clusters = [...comps.values()]
    .map((idx) => ({ idx, box: bboxOf(idx.flatMap((i) => [wallSegs[i].a, wallSegs[i].b])) }))
    .filter((c) => c.box.x1 - c.box.x0 >= 2.5 * upm && c.box.y1 - c.box.y0 >= 2.5 * upm);
  if (!clusters.length) return fail('No floor plan was found in the linework. Trace it by hand with the wall and room tools.');

  // CAD sheets often use only short labels such as GG / GF / FF; accept those as well as full titles.
  const titles = texts.filter((t) => TITLE_RANK.some(([re]) => re.test(t.str)) && (/plan|floor/i.test(t.str) || /^(\s*(g\.?g\.?|g\.?f\.?|f\.?f\.?|s\.?f\.?)\s*)$/i.test(t.str)));
  const titled = clusters.map((c) => {
    let best: TextItem | null = null, bd = Infinity;
    for (const t of titles) {
      if (t.x < c.box.x0 - 1.5 * upm || t.x > c.box.x1 + 1.5 * upm) continue;
      const d = Math.max(c.box.y0 - t.y, t.y - c.box.y1, 0);
      if (d < 4 * upm && d < bd) { bd = d; best = t; }
    }
    const rank = best ? (TITLE_RANK.find(([re]) => re.test(best!.str))?.[1] ?? null) : null;
    return { ...c, title: best ? floorTitle(best.str) : '', rank };
  });
  if (titled.some((c) => c.rank === 99)) notes.push('A terrace / roof plan on the sheet was skipped.');
  const ordered = titled.filter((c) => c.rank !== 99).sort((a, b) => (a.rank ?? 100) - (b.rank ?? 100) || a.box.x0 - b.box.x0);
  if (!ordered.length) return fail('Only a terrace or roof plan was found on this sheet.');

  const floors: ReadFloor[] = [];
  ordered.forEach((c, i) => {
    const below = floors[i - 1]?.stairs.map((st) => bboxOf(st.rects.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[]))) ?? [];
    floors.push(readFloor(prims, c.idx.map((k) => wallSegs[k]), c.box, upm, wallColor, texts, annSegs, imperial, c.title || ['Ground floor', 'First floor', 'Second floor', 'Third floor'][i] || `Floor ${i}`, i, below));
  });

  // north arrow
  let north: Vec2 | null = null;
  const nt = texts.find((t) => /^north$|^n$/i.test(t.str.trim()));
  if (nt) {
    const heads = prims.loops.filter((l) => l.filled && l.color !== wallColor && l.pts.length === 3 && Math.hypot(l.pts[0][0] - nt.x, l.pts[0][1] - nt.y) < 12 * upm * 0.3048);
    let best: { d: number; v: Vec2 } | null = null;
    for (const h of heads) {
      const c: Vec2 = [(h.pts[0][0] + h.pts[1][0] + h.pts[2][0]) / 3, (h.pts[0][1] + h.pts[1][1] + h.pts[2][1]) / 3];
      for (const s of annSegs) {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        if (len < upm * 0.5) continue;
        for (const [headEnd, tail] of [[s.a, s.b], [s.b, s.a]] as [Vec2, Vec2][]) {
          const d = Math.hypot(headEnd[0] - c[0], headEnd[1] - c[1]);
          if (d < upm * 0.25 && (!best || d < best.d)) best = { d, v: [(headEnd[0] - tail[0]) / len, (headEnd[1] - tail[1]) / len] };
        }
      }
    }
    if (best) north = [Math.round(best.v[0] * 1000) / 1000, Math.round(best.v[1] * 1000) / 1000];
  }

  return { ok: true, unitsPerMetre: upm, imperial, scaleSource, scaleText: dim?.text, floors, north, notes };
}

// ------------------------------------------------------------------------------------------------ one floor

function readFloor(prims: Prims, segs: Seg[], box: R, upm: number, wallColor: string, allTexts: TextItem[], annSegs: Seg[], imperial: boolean, title: string, rank: number, belowStairs: R[] = []): ReadFloor {
  const ox = box.x0, oy = box.y0;
  const M = (p: Vec2): Vec2 => [(p[0] - ox) / upm, (p[1] - oy) / upm];
  const W = (box.x1 - box.x0) / upm, D = (box.y1 - box.y0) / upm;
  const here = (p: Vec2, padM = 1.0) => p[0] >= box.x0 - padM * upm && p[0] <= box.x1 + padM * upm && p[1] >= box.y0 - padM * upm && p[1] <= box.y1 + padM * upm;
  const loops = prims.loops.filter((l) => here(l.pts[0], 0.3));
  const loopBox = new Map<number, R>(loops.map((l) => [l.id, bboxOf(l.pts.map(M))]));
  const drop = new Set<number>();

  // 3. columns: filled shapes in the wall colour, merged where their boxes overlap (a square drawn as two triangles)
  let columns: R[] = [];
  for (const l of loops) {
    if (!l.filled || l.fill !== wallColor) continue;
    const b = loopBox.get(l.id)!;
    const hit = columns.find((c) => area(isect(c, b)) > 0.3 * Math.min(area(c), area(b)) || contains(c, b) || contains(b, c));
    if (hit) { hit.x0 = Math.min(hit.x0, b.x0); hit.y0 = Math.min(hit.y0, b.y0); hit.x1 = Math.max(hit.x1, b.x1); hit.y1 = Math.max(hit.y1, b.y1); }
    else columns.push({ ...b });
  }
  columns = columns.filter((c) => { const w = c.x1 - c.x0, d = c.y1 - c.y0; return w >= 0.1 && d >= 0.1 && w <= 0.9 && d <= 0.9 && Math.max(w, d) / Math.min(w, d) <= 3.5; });
  for (const l of loops) { const b = loopBox.get(l.id)!; if (columns.some((c) => contains(c, b, 0.02))) drop.add(l.id); }

  // 4. stairs: stacks of tread rectangles
  const rectLoops = loops.filter((l) => {
    if (drop.has(l.id) || !l.closed || l.filled || l.hasCurve || l.pts.length !== 4 || l.color !== wallColor) return false;
    const p = l.pts.map(M);
    const ortho = p.every((v, i) => { const n = p[(i + 1) % 4]; return Math.abs(v[0] - n[0]) < EPS || Math.abs(v[1] - n[1]) < EPS; });
    const b = loopBox.get(l.id)!, w = b.x1 - b.x0, d = b.y1 - b.y0;
    return ortho && Math.min(w, d) >= 0.18 && Math.min(w, d) <= 2.0 && Math.max(w, d) <= 6;
  });
  const sb = rectLoops.map((l) => loopBox.get(l.id)!);
  const touch = (a: R, b: R) => {
    const oy2 = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), ox2 = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    if ((near(a.x1, b.x0, 0.02) || near(b.x1, a.x0, 0.02)) && oy2 >= 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) return true;
    return (near(a.y1, b.y0, 0.02) || near(b.y1, a.y0, 0.02)) && ox2 >= 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0);
  };
  const suf = unionFind(sb.length);
  for (let i = 0; i < sb.length; i++) for (let j = i + 1; j < sb.length; j++) if (touch(sb[i], sb[j])) suf.join(i, j);
  const sgroups = new Map<number, number[]>();
  sb.forEach((_, i) => { const r = suf.find(i); sgroups.set(r, [...(sgroups.get(r) ?? []), i]); });
  const stairRects: R[][] = [];
  for (const g of sgroups.values()) {
    const treadLike = g.filter((i) => { const m = Math.min(sb[i].x1 - sb[i].x0, sb[i].y1 - sb[i].y0); return m >= 0.2 && m <= 0.42; }).length;
    if (g.length >= 4 && treadLike >= 3) { stairRects.push(g.map((i) => sb[i])); for (const i of g) drop.add(rectLoops[i].id); }
  }

  // 5. walls: pair the face lines
  const H: Line[] = [], V: Line[] = [];
  for (const s of segs) {
    if (drop.has(s.loop)) continue;
    const a = M(s.a), b = M(s.b);
    const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
    if (dy < EPS && dx > 0.03) H.push({ c: (a[1] + b[1]) / 2, a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]) });
    else if (dx < EPS && dy > 0.03) V.push({ c: (a[0] + b[0]) / 2, a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]) });
  }
  interface WR extends R { axis: 'h' | 'v'; windows: [number, number][]; gaps: [number, number][] }
  let rects: WR[] = [
    ...pairLines(mergeCollinear(H)).map((b): WR => ({ x0: b.a, x1: b.b, y0: b.c0, y1: b.c1, axis: 'h', windows: b.inner, gaps: [] })),
    ...pairLines(mergeCollinear(V)).map((b): WR => ({ x0: b.c0, x1: b.c1, y0: b.a, y1: b.b, axis: 'v', windows: b.inner, gaps: [] })),
  ];
  // an end cap paired with a nearby face makes a "wall" shorter than it is thick: drop it where real walls cover it
  const isStubby = (r: WR) => (r.axis === 'h' ? r.x1 - r.x0 < 0.9 * (r.y1 - r.y0) : r.y1 - r.y0 < 0.9 * (r.x1 - r.x0));
  rects = rects.filter((r) => !isStubby(r) || rects.reduce((sum, o) => (o === r || isStubby(o) ? sum : sum + area(isect(o, r))), 0) < 0.3 * area(r));
  // a stub found from both directions is one wall
  rects = rects.filter((r, i) => !rects.some((o, j) => j !== i && contains(o, r) && (area(o) > area(r) + 1e-6 || j < i)));
  const covered = (x: number, y: number) => rects.some((r) => inside(r, x, y, 1e-4));

  // columns sitting at the end of a wall belong to it; a column no wall reaches stays free-standing
  for (const c of columns) {
    if (covered((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2)) continue;
    const h = rects.find((r) => r.axis === 'h' && near(r.y0, c.y0) && near(r.y1, c.y1) && (near(r.x1, c.x0) || near(r.x0, c.x1)));
    const v = rects.find((r) => r.axis === 'v' && near(r.x0, c.x0) && near(r.x1, c.x1) && (near(r.y1, c.y0) || near(r.y0, c.y1)));
    const r = h ?? v;
    if (!r) continue;
    if (r.axis === 'h') { if (near(r.x1, c.x0)) r.x1 = c.x1; else r.x0 = c.x0; }
    else if (near(r.y1, c.y0)) r.y1 = c.y1; else r.y0 = c.y0;
  }
  // L corners: each wall's inner face stops at the other wall, leaving the corner square empty → close it
  for (const h of rects.filter((r) => r.axis === 'h'))
    for (const v of rects.filter((r) => r.axis === 'v')) {
      const touchesBand = near(v.y0, h.y1) || near(v.y1, h.y0);
      if (!touchesBand) continue;
      const cy = (h.y0 + h.y1) / 2;
      if (near(h.x0, v.x1) && !covered((v.x0 + v.x1) / 2, cy)) h.x0 = v.x0;
      else if (near(h.x1, v.x0) && !covered((v.x0 + v.x1) / 2, cy)) h.x1 = v.x1;
    }

  // 6. collinear pieces: tiny gaps are junctions, door-size gaps are openings
  const along = (r: WR): [number, number] => (r.axis === 'h' ? [r.x0, r.x1] : [r.y0, r.y1]);
  const band = (r: WR): [number, number] => (r.axis === 'h' ? [r.y0, r.y1] : [r.x0, r.x1]);
  const merged: WR[] = [];
  for (const axis of ['h', 'v'] as const) {
    const set = rects.filter((r) => r.axis === axis).sort((p, q) => band(p)[0] - band(q)[0] || band(p)[1] - band(q)[1] || along(p)[0] - along(q)[0]);
    const used = new Set<WR>();
    for (const r of set) {
      if (used.has(r)) continue;
      used.add(r);
      const cur: WR = { ...r, windows: [...r.windows], gaps: [] };
      const row = set.filter((o) => !used.has(o) && near(band(o)[0], band(r)[0], 0.03) && near(band(o)[1], band(r)[1], 0.03)).sort((p, q) => along(p)[0] - along(q)[0]);
      for (const n of row) {
        const end = along(cur)[1], start = along(n)[0], gap = start - end;
        if (gap > JOIN) {
          // what is left of the gap once walls crossing it are taken out
          const [b0, b1] = band(cur);
          let free: [number, number][] = [[end, start]];
          for (const o of rects) {
            if (o.axis === axis) continue;
            const [oa0, oa1] = axis === 'h' ? [o.x0, o.x1] : [o.y0, o.y1];
            const [ob0, ob1] = axis === 'h' ? [o.y0, o.y1] : [o.x0, o.x1];
            if (Math.min(ob1, b1) - Math.max(ob0, b0) < 0.5 * (b1 - b0)) continue;
            free = free.flatMap(([f0, f1]): [number, number][] => (oa1 <= f0 + EPS || oa0 >= f1 - EPS ? [[f0, f1]] : [[f0, Math.max(f0, oa0)], [Math.min(f1, oa1), f1]])).filter(([f0, f1]) => f1 - f0 > 0.02);
          }
          const open = free.filter(([f0, f1]) => f1 - f0 > JOIN);
          if (open.length > 1) break;
          if (open.length === 1) {
            const [f0, f1] = open[0];
            // a doorway has a jamb of this wall on at least one side; a span between two crossing walls is a room
            if (f1 - f0 < OPEN_MIN || f1 - f0 > OPEN_MAX || !(near(f0, end, 0.02) || near(f1, start, 0.02))) break;
            cur.gaps.push([f0, f1]);
          }
        }
        if (axis === 'h') cur.x1 = Math.max(cur.x1, n.x1); else cur.y1 = Math.max(cur.y1, n.y1);
        cur.windows.push(...n.windows);
        used.add(n);
      }
      merged.push(cur);
    }
  }
  // a wall that ends inside another wall stops at its face, so no two walls overlap
  for (const v of merged.filter((r) => r.axis === 'v'))
    for (const h of merged.filter((r) => r.axis === 'h')) {
      const hCoversV = h.x0 <= v.x0 + EPS && h.x1 >= v.x1 - EPS && !h.gaps.some(([a, b]) => v.x0 >= a - EPS && v.x1 <= b + EPS);
      if (hCoversV) {
        if (v.y0 >= h.y0 - EPS && v.y0 < h.y1 - EPS && v.y1 > h.y1) v.y0 = h.y1;
        if (v.y1 <= h.y1 + EPS && v.y1 > h.y0 + EPS && v.y0 < h.y0) v.y1 = h.y0;
      }
      // re-test with v as it now stands, so a shared corner square is given up by one wall only
      const vCoversH = v.y0 <= h.y0 + EPS && v.y1 >= h.y1 - EPS && !v.gaps.some(([a, b]) => h.y0 >= a - EPS && h.y1 <= b + EPS);
      if (vCoversH) {
        if (h.x0 >= v.x0 - EPS && h.x0 < v.x1 - EPS && h.x1 > v.x1) h.x0 = v.x1;
        if (h.x1 <= v.x1 + EPS && h.x1 > v.x0 + EPS && h.x0 < v.x0) h.x1 = v.x0;
      }
    }
  const wallRects = merged.filter((r) => along(r)[1] - along(r)[0] >= 0.05);

  const outside = makeOutside(wallRects, W, D);

  const walls: ReadWall[] = wallRects.map((r) => {
    const [a, b] = along(r), [c0, c1] = band(r);
    let ext = false;
    for (const f of [0.2, 0.5, 0.8]) {
      const u = a + (b - a) * f;
      const p1: Vec2 = r.axis === 'h' ? [u, c0 - 0.14] : [c0 - 0.14, u];
      const p2: Vec2 = r.axis === 'h' ? [u, c1 + 0.14] : [c1 + 0.14, u];
      if (outside(p1[0], p1[1]) || outside(p2[0], p2[1])) ext = true;
    }
    return { rect: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }, axis: r.axis, exterior: ext };
  });

  // openings: gaps (doors / open doorways) and stretches with a line down the middle (windows)
  const curves = prims.curves.filter((c) => c.color === wallColor && here(c.p0, 0.3)).map((c) => ({ p0: M(c.p0), p3: M(c.p3) }));
  const texts = allTexts.filter((t) => here([t.x, t.y], 1.2)).map((t) => ({ ...t, x: (t.x - ox) / upm, y: (t.y - oy) / upm, size: t.size / upm, width: t.width / upm }));
  const openings: ReadOpening[] = [];
  wallRects.forEach((r, wi) => {
    const [, ] = along(r);
    const mid = (band(r)[0] + band(r)[1]) / 2, t = band(r)[1] - band(r)[0];
    const pt = (u: number, off = 0): Vec2 => (r.axis === 'h' ? [u, mid + off] : [mid + off, u]);
    for (const [g0, g1] of r.gaps) {
      const width = g1 - g0;
      const j0 = pt(g0), j1 = pt(g1);
      // a swing arc: both ends sit one door-width from the hinge jamb
      const arcs = curves.filter((c) => {
        const cm: Vec2 = [(c.p0[0] + c.p3[0]) / 2, (c.p0[1] + c.p3[1]) / 2];
        return Math.hypot(cm[0] - (j0[0] + j1[0]) / 2, cm[1] - (j0[1] + j1[1]) / 2) < width * 1.3 + t;
      });
      let hinge: 'a' | 'b' | undefined, swing: 1 | -1 | undefined, leaves = 0;
      for (const c of arcs)
        for (const [name, j] of [['a', j0], ['b', j1]] as ['a' | 'b', Vec2][]) {
          const d0 = Math.hypot(c.p0[0] - j[0], c.p0[1] - j[1]), d3 = Math.hypot(c.p3[0] - j[0], c.p3[1] - j[1]);
          const rad = (d0 + d3) / 2;
          if (Math.abs(d0 - d3) > 0.18 * width || rad < 0.4 * width || rad > 1.15 * width + t) continue;
          const off0 = r.axis === 'h' ? c.p0[1] - mid : c.p0[0] - mid, off3 = r.axis === 'h' ? c.p3[1] - mid : c.p3[0] - mid;
          const far = Math.abs(off0) > Math.abs(off3) ? off0 : off3;
          if (Math.abs(far) < 0.15) continue;
          // +1 = the left-hand normal of a→b: +y for a wall running along x, −x for one running along y
          const side: 1 | -1 = r.axis === 'h' ? (far > 0 ? 1 : -1) : far < 0 ? 1 : -1;
          leaves++;
          if (!hinge || rad > 0.7 * width) { hinge = name; swing = side; }
        }
      const label = texts.find((x) => /door|entrance|entry|gate/i.test(x.str) && Math.hypot(x.x - (j0[0] + j1[0]) / 2, x.y - (j0[1] + j1[1]) / 2) < Math.max(1.3, width));
      const ext = walls[wi].exterior;
      if (leaves > 0) {
        openings.push({ wall: wi, from: g0, to: g1, kind: 'door', leaf: leaves >= 2 ? 'double' : 'single', hinge, swing, name: label ? titleCase(label.str) : undefined, drawnLeaf: true });
      } else if (ext || label) {
        // an outside doorway is a door even when the leaf is not drawn; it opens inward
        const a1 = pt((g0 + g1) / 2, t / 2 + 0.2);
        const inward: 1 | -1 = r.axis === 'h' ? (outside(a1[0], a1[1]) ? -1 : 1) : outside(a1[0], a1[1]) ? 1 : -1;
        openings.push({ wall: wi, from: g0, to: g1, kind: 'door', leaf: width >= 1.15 ? 'double' : 'single', hinge: 'a', swing: inward, name: label ? titleCase(label.str) : undefined, drawnLeaf: false });
      } else openings.push({ wall: wi, from: g0, to: g1, kind: 'opening', leaf: 'none', drawnLeaf: false });
    }
    for (const [a, b] of r.windows) if (b - a >= 0.35) openings.push({ wall: wi, from: a, to: b, kind: 'window', leaf: 'double', drawnLeaf: true });
  });

  // 4b. stairs in walking order (bottom → top), from the arrows drawn on them
  const ann = annSegs.filter((s) => here(s.a, 0.5)).map((s) => ({ a: M(s.a), b: M(s.b) }));
  const heads = prims.loops.filter((l) => l.filled && l.color !== wallColor && l.pts.length === 3 && here(l.pts[0], 0.5)).map((l) => l.pts.map(M));
  const mainDoor = openings.filter((o) => o.kind === 'door' && walls[o.wall].exterior).sort((p, q) => q.to - q.from - (p.to - p.from))[0];
  const doorPt: Vec2 | null = mainDoor ? (() => { const w = wallRects[mainDoor.wall]; const u = (mainDoor.from + mainDoor.to) / 2; return w.axis === 'h' ? [u, (w.y0 + w.y1) / 2] : [(w.x0 + w.x1) / 2, u]; })() : null;
  const stairs: ReadStair[] = stairRects.map((rs) => {
    const st = orderStair(rs, ann, heads, doorPt);
    const b = bboxOf(rs.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[]));
    st.well = belowStairs.some((o) => area(isect(o, b)) >= 0.4 * area(b));
    return st;
  });

  // 7. rooms from their labels
  const rooms = readRooms(texts, walls.map((w) => w.rect), stairs, { x0: 0, y0: 0, x1: W, y1: D }, imperial);

  return { title, rank, origin: [ox, oy], width: W, depth: D, walls, openings, rooms, stairs, columns, outside };
}

/** Inside / outside test for a floor: flood the plane from beyond the walls (openings count as closed). */
export function makeOutside(wallRects: R[], W: number, D: number): (x: number, y: number) => boolean {
  const CELL = 0.05, PAD = 0.6;
  const gw = Math.ceil((W + 2 * PAD) / CELL), gh = Math.ceil((D + 2 * PAD) / CELL);
  const solid = new Uint8Array(gw * gh);
  for (const r of wallRects) {
    const i0 = Math.max(0, Math.floor((r.x0 + PAD) / CELL)), i1 = Math.min(gw - 1, Math.ceil((r.x1 + PAD) / CELL) - 1);
    const j0 = Math.max(0, Math.floor((r.y0 + PAD) / CELL)), j1 = Math.min(gh - 1, Math.ceil((r.y1 + PAD) / CELL) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) solid[j * gw + i] = 1;
  }
  const out = new Uint8Array(gw * gh);
  const queue = [0];
  out[0] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % gw, j = (k - i) / gw;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      const nk = nj * gw + ni;
      if (out[nk] || solid[nk]) continue;
      out[nk] = 1;
      queue.push(nk);
    }
  }
  return (x, y) => {
    const i = Math.floor((x + PAD) / CELL), j = Math.floor((y + PAD) / CELL);
    return i < 0 || j < 0 || i >= gw || j >= gh ? true : out[j * gw + i] === 1;
  };
}

// ------------------------------------------------------------------------------------------------ stairs

function orderStair(rects: R[], ann: { a: Vec2; b: Vec2 }[], heads: Vec2[][], doorPt: Vec2 | null): ReadStair {
  const n = rects.length;
  const adj: number[][] = rects.map(() => []);
  const share = (a: R, b: R) => {
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0), ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    if ((near(a.x1, b.x0, 0.02) || near(b.x1, a.x0, 0.02)) && oy >= 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0)) return true;
    return (near(a.y1, b.y0, 0.02) || near(b.y1, a.y0, 0.02)) && ox >= 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0);
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (share(rects[i], rects[j])) { adj[i].push(j); adj[j].push(i); }
  const ends = adj.map((a, i) => (a.length === 1 ? i : -1)).filter((i) => i >= 0);
  const walk = (start: number): number[] => {
    const seen = new Set([start]);
    const path = [start];
    let cur = start;
    for (;;) {
      const next = adj[cur].find((k) => !seen.has(k));
      if (next === undefined) break;
      seen.add(next); path.push(next); cur = next;
    }
    // anything the chain missed (a branch) is appended nearest-first so no tread is lost
    for (let i = 0; i < n; i++) if (!seen.has(i)) path.push(i);
    return path;
  };
  let path = walk(ends[0] ?? 0);

  // arrows: follow each from tail to head and see which way it crosses the chain
  const cx = (r: R): Vec2 => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  const box = bboxOf(rects.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[]));
  const local = ann.filter((s) => inside(box, s.a[0], s.a[1], 1.6) && inside(box, s.b[0], s.b[1], 1.6));
  let vote = 0;
  for (const h of heads) {
    const hc: Vec2 = [(h[0][0] + h[1][0] + h[2][0]) / 3, (h[0][1] + h[1][1] + h[2][1]) / 3];
    if (!inside(box, hc[0], hc[1], 1.6)) continue;
    // stem: the segment whose end meets the arrow head, then back along connected segments
    let end: Vec2 | null = null, seg: { a: Vec2; b: Vec2 } | null = null, bd = 0.35;
    for (const s of local) for (const p of [s.a, s.b]) { const d = Math.hypot(p[0] - hc[0], p[1] - hc[1]); if (d < bd && Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]) > 0.25) { bd = d; end = p; seg = s; } }
    if (!end || !seg) continue;
    const pts: Vec2[] = [hc, end];
    const usedSeg = new Set([seg]);
    let tail: Vec2 = end === seg.a ? seg.b : seg.a;
    pts.push(tail);
    for (;;) {
      const next = local.find((s) => !usedSeg.has(s) && Math.hypot(s.a[0] - s.b[0], s.a[1] - s.b[1]) > 0.25 && (Math.hypot(s.a[0] - tail[0], s.a[1] - tail[1]) < 0.04 || Math.hypot(s.b[0] - tail[0], s.b[1] - tail[1]) < 0.04));
      if (!next) break;
      usedSeg.add(next);
      tail = Math.hypot(next.a[0] - tail[0], next.a[1] - tail[1]) < 0.04 ? next.b : next.a;
      pts.push(tail);
    }
    pts.reverse(); // tail → head
    const visited: number[] = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const steps = Math.max(2, Math.ceil(Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) / 0.04));
      for (let s = 0; s <= steps; s++) {
        const x = pts[k][0] + ((pts[k + 1][0] - pts[k][0]) * s) / steps, y = pts[k][1] + ((pts[k + 1][1] - pts[k][1]) * s) / steps;
        const idx = rects.findIndex((r) => inside(r, x, y));
        if (idx >= 0 && visited[visited.length - 1] !== idx) visited.push(idx);
      }
    }
    if (visited.length >= 2) vote += Math.sign(path.indexOf(visited[visited.length - 1]) - path.indexOf(visited[0]));
    else if (visited.length === 1) {
      // an arrow that only enters the stair: its tail side is the bottom
      const first = path.indexOf(visited[0]);
      vote += first < n / 2 ? 1 : -1;
    }
  }
  let ordered = vote !== 0;
  if (vote < 0) path = path.reverse();
  if (vote === 0 && doorPt) {
    const d0 = Math.hypot(cx(rects[path[0]])[0] - doorPt[0], cx(rects[path[0]])[1] - doorPt[1]);
    const d1 = Math.hypot(cx(rects[path[n - 1]])[0] - doorPt[0], cx(rects[path[n - 1]])[1] - doorPt[1]);
    if (d1 < d0) path = path.reverse();
    ordered = false;
  }

  // treads, landings, and the break symbol (a long piece standing for several treads)
  const seq = path.map((i) => rects[i]);
  const dir = (a: R, b: R): [number, number] => { const p = cx(a), q = cx(b); return Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]) ? [Math.sign(q[0] - p[0]), 0] : [0, Math.sign(q[1] - p[1])]; };
  const dout = seq.map((r, i) => (i + 1 < seq.length ? dir(r, seq[i + 1]) : i > 0 ? dir(seq[i - 1], r) : ([0, -1] as [number, number])));
  const din = seq.map((r, i) => (i > 0 ? dir(seq[i - 1], r) : dout[0]));
  const ext = (r: R, d: [number, number]) => (d[0] !== 0 ? r.x1 - r.x0 : r.y1 - r.y0);
  const typical = median(seq.map((r, i) => ext(r, dout[i])).filter((e) => e >= 0.2 && e <= 0.42)) || 0.28;
  const steps: ReadStep[] = [];
  seq.forEach((r, i) => {
    const straight = din[i][0] === dout[i][0] && din[i][1] === dout[i][1];
    const e = ext(r, dout[i]);
    if (straight && e <= 0.46) steps.push({ rect: r, kind: 'tread' });
    else if (straight && i > 0 && i < seq.length - 1) {
      const k = Math.max(1, Math.round(e / typical));
      for (let s = 0; s < k; s++) {
        const f0 = s / k, f1 = (s + 1) / k;
        const d = dout[i];
        const piece: R = d[0] > 0 ? { ...r, x0: r.x0 + e * f0, x1: r.x0 + e * f1 } : d[0] < 0 ? { ...r, x0: r.x1 - e * f1, x1: r.x1 - e * f0 } : d[1] > 0 ? { ...r, y0: r.y0 + e * f0, y1: r.y0 + e * f1 } : { ...r, y0: r.y1 - e * f1, y1: r.y1 - e * f0 };
        steps.push({ rect: piece, kind: 'tread' });
      }
    } else steps.push({ rect: r, kind: Math.min(r.x1 - r.x0, r.y1 - r.y0) > 0.46 ? 'landing' : 'tread' });
  });
  return { steps, rects, ordered, well: false };
}

// ------------------------------------------------------------------------------------------------ rooms

export function readRooms(texts: (TextItem & { x: number; y: number })[], wallRects: R[], stairs: ReadStair[], bounds: R, imperial: boolean): ReadRoom[] {
  stairs = stairs.filter((st) => !st.well);
  const skip = /plan\b|north|entrance|entry|\bdoor\b|window|scale|drawn|sheet|date/i;
  const sizes = texts.filter((t) => parseSize(t.str, imperial));
  const names = texts.filter((t) => !parseSize(t.str, imperial) && !parseDim(t.str, imperial) && !skip.test(t.str) && /[a-z]{2,}/i.test(t.str) && inside(bounds, t.x, t.y, 0.3));
  const usedNames = new Set<TextItem>();
  const labels: { name: string | null; size: string | null; dims: [number, number] | null; x: number; y: number }[] = [];
  for (const s of sizes) {
    if (!inside(bounds, s.x, s.y, 0.3)) continue;
    // the name is the line just before the size, read in the same direction
    const horiz = Math.abs(s.angle) < 45 || Math.abs(s.angle) > 135;
    let best: (typeof names)[number] | null = null, bd = Infinity;
    for (const nmt of names) {
      if (usedNames.has(nmt) || nmt.angle !== s.angle) continue;
      const along = horiz ? Math.abs(nmt.x - s.x) : Math.abs(nmt.y - s.y);
      const across = horiz ? Math.abs(nmt.y - s.y) : Math.abs(nmt.x - s.x);
      if (along > Math.max(nmt.width, s.width) * 0.9 || across > 2.4 * s.size) continue;
      if (across < bd) { bd = across; best = nmt; }
    }
    if (best) usedNames.add(best);
    labels.push({ name: best ? best.str : null, size: s.str, dims: parseSize(s.str, imperial), x: best ? (best.x + s.x) / 2 : s.x, y: best ? (best.y + s.y) / 2 : s.y });
  }
  for (const nmt of names) if (!usedNames.has(nmt)) labels.push({ name: nmt.str, size: null, dims: null, x: nmt.x, y: nmt.y });

  const ray = (x: number, y: number): R => {
    let x0 = bounds.x0, x1 = bounds.x1, y0 = bounds.y0, y1 = bounds.y1;
    for (const r of wallRects) {
      if (y >= r.y0 - EPS && y <= r.y1 + EPS) { if (r.x1 <= x + EPS) x0 = Math.max(x0, r.x1); else if (r.x0 >= x - EPS) x1 = Math.min(x1, r.x0); }
      if (x >= r.x0 - EPS && x <= r.x1 + EPS) { if (r.y1 <= y + EPS) y0 = Math.max(y0, r.y1); else if (r.y0 >= y - EPS) y1 = Math.min(y1, r.y0); }
    }
    return { x0, y0, x1, y1 };
  };
  const faces = { x: [...new Set(wallRects.flatMap((r) => [r.x0, r.x1]))], y: [...new Set(wallRects.flatMap((r) => [r.y0, r.y1]))] };
  const snap = (v: number, list: number[]) => { let b = v, d = 0.16; for (const f of list) if (Math.abs(f - v) < d) { d = Math.abs(f - v); b = f; } return b; };

  const rooms: ReadRoom[] = [];
  for (const l of labels) {
    if (wallRects.some((r) => inside(r, l.x, l.y))) continue;
    const name = l.name ? titleCase(l.name) : null;
    const type = name ? roomTypeFromName(name) : 'other';
    let rect = ray(l.x, l.y);
    if (type === 'staircase' && stairs.length) {
      // the stair's own strip: the longest straight run and the landings in line with it
      const st = stairs.reduce((p, q) => (q.rects.length > p.rects.length ? q : p));
      const b = bboxOf(st.rects.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[]));
      const vertical = b.y1 - b.y0 >= b.x1 - b.x0;
      const main = st.rects.filter((r) => inside(r, vertical ? l.x : (r.x0 + r.x1) / 2, vertical ? (r.y0 + r.y1) / 2 : l.y, 0.05));
      const mb = main.length ? bboxOf(main.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[])) : b;
      rect = vertical ? { x0: mb.x0, x1: mb.x1, y0: rect.y0, y1: rect.y1 } : { x0: rect.x0, x1: rect.x1, y0: mb.y0, y1: mb.y1 };
    } else if (l.dims) {
      // open on one side (no wall there): keep the printed size, anchored to the wall nearer the label
      const fit = (lo: number, hi: number, p: number, want: [number, number], list: number[]): [number, number] => {
        const span = hi - lo;
        const target = [want[0], want[1]].sort((a, b) => Math.abs(a - span) - Math.abs(b - span))[0];
        if (span <= target * 1.07 + 0.12) return [lo, hi];
        return p - lo <= hi - p ? [lo, snap(lo + target, list)] : [snap(hi - target, list), hi];
      };
      const wx = rect.x1 - rect.x0, wy = rect.y1 - rect.y0;
      // which printed number goes with x: the pairing that fits both spans better
      const [a, b] = l.dims;
      const direct = Math.abs(Math.min(wx, a) - a) + Math.abs(Math.min(wy, b) - b), swapped = Math.abs(Math.min(wx, b) - b) + Math.abs(Math.min(wy, a) - a);
      const [dx, dy] = direct <= swapped ? [a, b] : [b, a];
      const [nx0, nx1] = fit(rect.x0, rect.x1, l.x, [dx, dx], faces.x);
      const [ny0, ny1] = fit(rect.y0, rect.y1, l.y, [dy, dy], faces.y);
      rect = { x0: nx0, x1: nx1, y0: ny0, y1: ny1 };
    }
    if (rect.x1 - rect.x0 < 0.4 || rect.y1 - rect.y0 < 0.4) continue;
    const sized = !name;
    rooms.push({ name: name ?? (area(rect) >= 6 ? 'Lobby' : 'Passage'), type: name ? type : area(rect) >= 6 ? 'lobby' : 'passage', size: l.size ?? undefined, rect, labelled: !sized });
  }

  // a stair with no label still gets its floor area
  if (stairs.length && !rooms.some((r) => r.type === 'staircase')) {
    const st = stairs.reduce((p, q) => (q.rects.length > p.rects.length ? q : p));
    const b = bboxOf(st.rects.flatMap((r) => [[r.x0, r.y0], [r.x1, r.y1]] as Vec2[]));
    rooms.push({ name: 'Staircase', type: 'staircase', rect: b, labelled: false });
  }

  // rooms open to each other overlap after growing: the stair strip comes out of its neighbour, and a smaller
  // space is trimmed back from a bigger one on the side that keeps its label inside
  const cut = (b: R, a: R, keep: Vec2): R => {
    const o = isect(a, b);
    if (o.x1 - o.x0 <= 0.02 || o.y1 - o.y0 <= 0.02) return b;
    const opts: R[] = [{ ...b, x1: a.x0 }, { ...b, x0: a.x1 }, { ...b, y1: a.y0 }, { ...b, y0: a.y1 }].filter((r) => r.x1 - r.x0 > 0.3 && r.y1 - r.y0 > 0.3);
    const good = opts.filter((r) => inside(r, keep[0], keep[1], 0.05)).sort((p, q) => area(q) - area(p));
    return good[0] ?? opts.sort((p, q) => area(q) - area(p))[0] ?? b;
  };
  const centre = (r: R): Vec2 => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  const stair = rooms.find((r) => r.type === 'staircase');
  if (stair) for (const r of rooms) if (r !== stair) r.rect = cut(r.rect, stair.rect, labelPt(labels, r) ?? centre(r.rect));
  const bySize = [...rooms].sort((p, q) => area(q.rect) - area(p.rect));
  for (let i = 0; i < bySize.length; i++)
    for (let j = i + 1; j < bySize.length; j++) {
      const big = bySize[i], small = bySize[j];
      if (big === stair || small === stair) continue;
      if (area(isect(big.rect, small.rect)) > 0.05) small.rect = cut(small.rect, big.rect, labelPt(labels, small) ?? centre(small.rect));
    }
  return rooms.filter((r) => area(r.rect) > 0.3);
}

function labelPt(labels: { name: string | null; size: string | null; x: number; y: number }[], r: ReadRoom): Vec2 | null {
  const l = labels.find((x) => (x.size ?? null) === (r.size ?? null) && (x.name ? titleCase(x.name) === r.name : !r.labelled) && inside(r.rect, x.x, x.y, 0.05));
  return l ? [l.x, l.y] : null;
}

// ------------------------------------------------------------------------------------------------ spec pieces

/** Read walls → spec walls (centre line + thickness), with openings placed along them. */
export function toSpecWalls(floor: ReadFloor, idPrefix: string): { walls: Wall[]; index: Map<number, Wall> } {
  const index = new Map<number, Wall>();
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const walls = floor.walls.map((w, i): Wall => {
    const r = w.rect;
    const t = w.axis === 'h' ? r.y1 - r.y0 : r.x1 - r.x0;
    const wall: Wall = w.axis === 'h'
      ? { id: `${idPrefix}-w${i + 1}`, a: [r4(r.x0), r4((r.y0 + r.y1) / 2)], b: [r4(r.x1), r4((r.y0 + r.y1) / 2)], thickness: r4(t), kind: w.exterior ? 'exterior' : t >= 0.18 ? 'interior' : 'partition' }
      : { id: `${idPrefix}-w${i + 1}`, a: [r4((r.x0 + r.x1) / 2), r4(r.y0)], b: [r4((r.x0 + r.x1) / 2), r4(r.y1)], thickness: r4(t), kind: w.exterior ? 'exterior' : t >= 0.18 ? 'interior' : 'partition' };
    index.set(i, wall);
    return wall;
  });
  return { walls, index };
}

export type { Curve, Loop };
