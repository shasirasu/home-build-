// Automatic furnishing: a sensible first layout for every room, from its type and its walls.
//
// Rule-based, like a planner's first pass: big pieces go against the longest clear wall, nothing blocks a doorway,
// tall pieces stay off windows, and every placement is checked against what is already there. A piece that does
// not fit is left out rather than forced in. The result is ordinary PlacedItems the user can move or remove.

import type { HouseSpec, Level, PlacedItem, Room, Vec2 } from '@/types/house';
import { catalogByKind } from '@/data/catalog';

interface R { x0: number; y0: number; x1: number; y1: number }
type Side = 'n' | 's' | 'w' | 'e';
interface Block { a: number; b: number; kind: 'door' | 'window'; sill: number }
interface SideInfo { side: Side; face: number; lo: number; hi: number; walls: [number, number][]; blocks: Block[] }
interface Ctx { level: Level; room: Room; rect: R; sides: Record<Side, SideInfo>; taken: R[]; keepOut: R[]; out: PlacedItem[]; seq: () => string }

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
const hit = (a: R, b: R, pad = 0) => a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.y0 < b.y1 - pad && b.y0 < a.y1 - pad;
const ROT: Record<Side, number> = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' };

function wallRect(w: Level['walls'][number]): R & { axis: 'h' | 'v' } {
  const t = w.thickness / 2;
  const h = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
  return h
    ? { axis: 'h', x0: Math.min(w.a[0], w.b[0]), x1: Math.max(w.a[0], w.b[0]), y0: w.a[1] - t, y1: w.a[1] + t }
    : { axis: 'v', x0: w.a[0] - t, x1: w.a[0] + t, y0: Math.min(w.a[1], w.b[1]), y1: Math.max(w.a[1], w.b[1]) };
}

function sidesOf(level: Level, rect: R): Record<Side, SideInfo> {
  const mk = (side: Side): SideInfo => {
    const vertical = side === 'w' || side === 'e';
    const face = side === 'n' ? rect.y0 : side === 's' ? rect.y1 : side === 'w' ? rect.x0 : rect.x1;
    const lo = vertical ? rect.y0 : rect.x0, hi = vertical ? rect.y1 : rect.x1;
    const info: SideInfo = { side, face, lo, hi, walls: [], blocks: [] };
    for (const w of level.walls) {
      const r = wallRect(w);
      if ((r.axis === 'v') !== vertical) continue;
      const touching = side === 'n' ? near(r.y1, face) : side === 's' ? near(r.y0, face) : side === 'w' ? near(r.x1, face) : near(r.x0, face);
      if (!touching) continue;
      const a = Math.max(lo, vertical ? r.y0 : r.x0), b = Math.min(hi, vertical ? r.y1 : r.x1);
      if (b - a < 0.1) continue;
      info.walls.push([a, b]);
      const start = vertical ? Math.min(w.a[1], w.b[1]) : Math.min(w.a[0], w.b[0]);
      for (const o of level.openings) {
        if (o.wallId !== w.id) continue;
        const oa = start + o.at - o.width / 2, ob = start + o.at + o.width / 2;
        if (ob < lo || oa > hi) continue;
        info.blocks.push({ a: oa, b: ob, kind: o.kind === 'window' || o.kind === 'ventilator' ? 'window' : 'door', sill: o.sill });
      }
    }
    info.walls.sort((p, q) => p[0] - q[0]);
    return info;
  };
  return { n: mk('n'), s: mk('s'), w: mk('w'), e: mk('e') };
}

/** Clear stretches of wall on one side for a piece `h` tall and `d` deep. */
function freeOn(ctx: Ctx, side: Side, h: number, d: number, wallOnly = false): [number, number][] {
  const s = ctx.sides[side];
  let free: [number, number][] = s.walls.map(([a, b]) => [a + 0.04, b - 0.04] as [number, number]);
  const cut = (a: number, b: number) => { free = free.flatMap(([p, q]): [number, number][] => (b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]])).filter(([p, q]) => q - p > 0.08); };
  for (const b of s.blocks) if (b.kind === 'door' || h > b.sill - 0.02) cut(b.a - 0.12, b.b + 0.12);
  // what already stands against this wall, and doorways whose clear zone reaches it
  const vertical = side === 'w' || side === 'e';
  const band: R = side === 'n' ? { x0: s.lo, x1: s.hi, y0: s.face, y1: s.face + d } : side === 's' ? { x0: s.lo, x1: s.hi, y0: s.face - d, y1: s.face } : side === 'w' ? { x0: s.face, x1: s.face + d, y0: s.lo, y1: s.hi } : { x0: s.face - d, x1: s.face, y0: s.lo, y1: s.hi };
  if (!wallOnly) for (const t of [...ctx.taken, ...ctx.keepOut]) if (hit(t, band, 0.01)) cut((vertical ? t.y0 : t.x0) - 0.03, (vertical ? t.y1 : t.x1) + 0.03);
  return free;
}

function footprint(side: Side, s: SideInfo, u0: number, w: number, d: number): R {
  return side === 'n' ? { x0: u0, x1: u0 + w, y0: s.face, y1: s.face + d } : side === 's' ? { x0: u0, x1: u0 + w, y0: s.face - d, y1: s.face } : side === 'w' ? { x0: s.face, x1: s.face + d, y0: u0, y1: u0 + w } : { x0: s.face - d, x1: s.face, y0: u0, y1: u0 + w };
}

interface Opts { w?: number; align?: 'centre' | 'start' | 'end'; near?: number; color?: string; ghost?: boolean; h?: number; elevation?: number; minW?: number }

/** Put a piece with its back to a wall. Returns the item (already recorded) or null when it does not fit. */
function against(ctx: Ctx, side: Side, kind: string, o: Opts = {}): PlacedItem | null {
  const c = catalogByKind(kind);
  if (!c) return null;
  const mounted = c.mount === 'wall';
  let w = o.w ?? c.w;
  const d = c.d, h = o.h ?? c.h;
  const elev = mounted ? (o.elevation ?? c.elevation ?? 0) : 0;
  // a wall-hung piece only needs wall behind it at its own height; a floor piece needs the floor clear too
  // a wall-hung piece needs clear wall (no doorway; no window unless it hangs below the sill), not clear floor
  const free = freeOn(ctx, side, mounted ? elev + h : h, mounted ? 0.02 : d, mounted).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
  let pick = free.find(([a, b]) => b - a >= w && (o.near === undefined || (o.near >= a && o.near <= b)));
  pick ??= free.find(([a, b]) => b - a >= w);
  if (!pick && o.minW && c.stretch) { pick = free.find(([a, b]) => b - a >= o.minW!); if (pick) w = pick[1] - pick[0]; }
  if (!pick) return null;
  const [a, b] = pick;
  let u0 = o.near !== undefined ? Math.min(Math.max(o.near - w / 2, a), b - w) : o.align === 'start' ? a : o.align === 'end' ? b - w : (a + b - w) / 2;
  u0 = Math.max(a, Math.min(b - w, u0));
  const s = ctx.sides[side];
  const fp = footprint(side, s, u0, w, d);
  if (!mounted && !o.ghost && (ctx.taken.some((t) => hit(t, fp, 0.02)) || ctx.keepOut.some((t) => hit(t, fp, 0.02)))) return null;
  if (!mounted && !o.ghost) ctx.taken.push(fp);
  const item: PlacedItem = {
    uid: ctx.seq(), kind, levelId: ctx.level.id, roomId: ctx.room.id,
    x: r4((fp.x0 + fp.x1) / 2), y: r4((fp.y0 + fp.y1) / 2), rot: r4(ROT[side]), w: r4(w), d, h,
    elevation: mounted ? elev : undefined, color: o.color ?? c.colors[0],
  };
  ctx.out.push(item);
  return item;
}

/** Put a free-standing piece at a point (centre of its footprint). */
function at(ctx: Ctx, kind: string, p: Vec2, rot = 0, o: { color?: string; solid?: boolean } = {}): PlacedItem | null {
  const c = catalogByKind(kind);
  if (!c) return null;
  const quarter = Math.abs(Math.round(rot / (Math.PI / 2))) % 2 === 1;
  const w = quarter ? c.d : c.w, d = quarter ? c.w : c.d;
  const fp: R = { x0: p[0] - w / 2, x1: p[0] + w / 2, y0: p[1] - d / 2, y1: p[1] + d / 2 };
  const solid = o.solid ?? (c.mount === 'floor' && c.kind !== 'rug');
  if (solid) {
    if (fp.x0 < ctx.rect.x0 + 0.05 || fp.x1 > ctx.rect.x1 - 0.05 || fp.y0 < ctx.rect.y0 + 0.05 || fp.y1 > ctx.rect.y1 - 0.05) return null;
    if (ctx.taken.some((t) => hit(t, fp, 0.02)) || ctx.keepOut.some((t) => hit(t, fp, 0.02))) return null;
    ctx.taken.push(fp);
  }
  const item: PlacedItem = { uid: ctx.seq(), kind, levelId: ctx.level.id, roomId: ctx.room.id, x: r4(p[0]), y: r4(p[1]), rot: r4(rot), w: c.w, d: c.d, h: c.h, color: o.color ?? c.colors[0] };
  ctx.out.push(item);
  return item;
}

/** The biggest plain rectangle inside a room outline (an L-shaped room is furnished in its main part). */
export function mainRect(poly: Vec2[]): R {
  const xs = [...new Set(poly.map((p) => p[0]))].sort((a, b) => a - b), ys = [...new Set(poly.map((p) => p[1]))].sort((a, b) => a - b);
  if (poly.length <= 4) return { x0: xs[0], x1: xs[xs.length - 1], y0: ys[0], y1: ys[ys.length - 1] };
  const insidePoly = (x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  let best: R = { x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1] }, area = 0;
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) for (let c = 0; c < ys.length; c++) for (let d = c + 1; d < ys.length; d++) {
    let ok = true;
    for (let i = a; i < b && ok; i++) for (let j = c; j < d && ok; j++) ok = insidePoly((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
    const ar = (xs[b] - xs[a]) * (ys[d] - ys[c]);
    if (ok && ar > area) { area = ar; best = { x0: xs[a], x1: xs[b], y0: ys[c], y1: ys[d] }; }
  }
  return best;
}

/** First spot near `target` where a free-standing piece fits (tries both orientations when `turn` is set). */
function fitNear(ctx: Ctx, kind: string, target: Vec2, rot = 0, turn = false): PlacedItem | null {
  const spots: Vec2[] = [];
  for (let x = ctx.rect.x0 + 0.3; x <= ctx.rect.x1 - 0.3; x += 0.25) for (let y = ctx.rect.y0 + 0.3; y <= ctx.rect.y1 - 0.3; y += 0.25) spots.push([x, y]);
  spots.sort((p, q) => Math.hypot(p[0] - target[0], p[1] - target[1]) - Math.hypot(q[0] - target[0], q[1] - target[1]));
  for (const p of [target, ...spots]) for (const r of turn ? [rot, rot + Math.PI / 2] : [rot]) { const it = at(ctx, kind, p, r); if (it) return it; }
  return null;
}

const centre = (r: R): Vec2 => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
const inward = (side: Side): Vec2 => (side === 'n' ? [0, 1] : side === 's' ? [0, -1] : side === 'w' ? [1, 0] : [-1, 0]);
const sideLen = (ctx: Ctx, s: Side) => ctx.sides[s].hi - ctx.sides[s].lo;
const depthFrom = (ctx: Ctx, s: Side) => (s === 'n' || s === 's' ? ctx.rect.y1 - ctx.rect.y0 : ctx.rect.x1 - ctx.rect.x0);
const hasDoor = (ctx: Ctx, s: Side) => ctx.sides[s].blocks.some((b) => b.kind === 'door');
/** Sides ordered best-first for a big piece: no doorway, then the longest clear stretch for this height/depth. */
function bestSides(ctx: Ctx, h: number, d: number, need: number): Side[] {
  return (['n', 's', 'w', 'e'] as Side[])
    .map((s) => ({ s, len: Math.max(0, ...freeOn(ctx, s, h, d).map(([a, b]) => b - a)), door: hasDoor(ctx, s) }))
    .filter((x) => x.len >= need)
    .sort((p, q) => Number(p.door) - Number(q.door) || q.len - p.len)
    .map((x) => x.s);
}

const BED_COLORS = ['#8a6a4f', '#6b7a6a', '#c8b49a', '#3f3a36'];

function furnishRoom(ctx: Ctx, nth: number) {
  const { room, rect } = ctx;
  const W = rect.x1 - rect.x0, D = rect.y1 - rect.y0, A = W * D;
  const mid = centre(rect);
  switch (room.type) {
    case 'bedroom': {
      const kind = Math.min(W, D) >= 2.9 ? 'bed-queen' : 'bed-single';
      const c = catalogByKind(kind)!;
      const side = bestSides(ctx, c.h, c.d, c.w).find((s) => depthFrom(ctx, s) >= c.d + 0.6);
      if (side) {
        const bed = against(ctx, side, kind, { color: BED_COLORS[nth % BED_COLORS.length] });
        if (bed) {
          const along = side === 'n' || side === 's' ? bed.x : bed.y;
          for (const sgn of [-1, 1]) { const p = along + sgn * (c.w / 2 + 0.3); if (!against(ctx, side, 'bedside-table', { near: p })) against(ctx, side, 'bedside-table', { near: p, w: 0.4 }); }
        }
      }
      for (const s of bestSides(ctx, 2.1, 0.6, 1.0)) if (against(ctx, s, 'wardrobe-3door', { align: 'start' }) || against(ctx, s, 'wardrobe-2door', { align: 'start' })) break;
      if (A >= 11) {
        const s = bestSides(ctx, 0.75, 0.6, 1.2)[0];
        const desk = s && against(ctx, s, 'study-desk');
        if (desk && s) { const n = inward(s); at(ctx, 'desk-chair', [desk.x + n[0] * 0.75, desk.y + n[1] * 0.75], ROT[OPPOSITE[s]]); }
      }
      at(ctx, 'ceiling-fan', mid);
      break;
    }
    case 'kitchen': {
      const s = bestSides(ctx, 0.9, 0.6, 1.9)[0] ?? bestSides(ctx, 0.9, 0.6, 1.0)[0];
      if (s) {
        const run = freeOn(ctx, s, 0.9, 0.6).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
        const L = Math.min(run[1] - run[0], 3.6);
        const rest = L - 1.9;
        const filler = rest >= 0.9 ? rest / 3 : 0, between = rest >= 0.9 ? rest / 3 : Math.max(0, rest);
        let u = run[0];
        const piece = (kind: string, w: number) => { if (w < 0.25) return null; const it = against(ctx, s, kind, { w, near: u + w / 2 }); u += w; return it; };
        if (L >= 1.9) {
          piece('kitchen-counter', filler);
          const hob = piece('hob-unit', 0.9);
          piece('kitchen-counter', between);
          piece('kitchen-sink-unit', 1.0);
          piece('kitchen-counter', filler);
          if (hob) against(ctx, s, 'chimney', { near: s === 'n' || s === 's' ? hob.x : hob.y });
        } else {
          piece('hob-unit', 0.9);
          if (L >= 1.25) piece('kitchen-counter', L - 0.9);
        }
      }
      for (const f of bestSides(ctx, 1.75, 0.72, 0.75)) if (against(ctx, f, 'refrigerator', { align: 'end' })) break;
      at(ctx, 'ceiling-light', mid);
      break;
    }
    case 'hall':
    case 'living': {
      const sofaKind = Math.max(W, D) >= 3.4 ? 'sofa-3seat' : 'sofa-2seat';
      const sc = catalogByKind(sofaKind)!;
      // the dining set goes by the kitchen first, so the seating arranges itself around it
      const kitchen = ctx.level.rooms.find((r) => r.type === 'kitchen');
      const kc = kitchen ? centre(mainRect(kitchen.polygon)) : null;
      let dining: PlacedItem | null = null;
      if (A >= 17 && kc) dining = fitNear(ctx, 'dining-set-4', [Math.min(Math.max(kc[0], rect.x0 + 1.3), rect.x1 - 1.3), Math.min(Math.max(kc[1], rect.y0 + 1.3), rect.y1 - 1.3)], 0, true);
      const side = bestSides(ctx, sc.h, sc.d, sc.w).find((s) => depthFrom(ctx, s) >= 2.6);
      let seat: Vec2 | null = null;
      if (side) {
        const n = inward(side), opp = OPPOSITE[side];
        const stretch = freeOn(ctx, side, sc.h, sc.d).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
        const along = (stretch[0] + stretch[1]) / 2;
        const depth = depthFrom(ctx, side);
        const tvOpposite = depth <= 5.2 && freeOn(ctx, opp, 0.48, 0.42).some(([a, b]) => b - a >= 1.8 && along >= a + 0.9 && along <= b - 0.9);
        if (tvOpposite) {
          // sofa on the wall, TV facing it across the room
          const sofa = against(ctx, side, sofaKind);
          if (sofa) {
            seat = [sofa.x + n[0] * 1.15, sofa.y + n[1] * 1.15];
            const tv = against(ctx, opp, 'tv-unit', { near: along });
            if (tv) against(ctx, opp, 'tv', { near: opp === 'n' || opp === 's' ? tv.x : tv.y });
          }
        } else {
          // no wall opposite (an open side): TV on this wall, sofa standing in the room facing it. The pair is placed
          // together: slide along the wall and close the viewing distance until the sofa's spot is clear.
          const tc = catalogByKind('tv-unit')!;
          const horizontal = side === 'n' || side === 's';
          const face = ctx.sides[side].face;
          const spot = (u: number, q: number): Vec2 => (horizontal ? [u, face + n[1] * q] : [face + n[0] * q, u]);
          const wallRun = freeOn(ctx, side, tc.h, tc.d).filter(([a, b]) => b - a >= tc.w).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
          let found: { u: number; gap: number } | null = null;
          if (wallRun) {
            const lo = wallRun[0] + tc.w / 2, hi = wallRun[1] - tc.w / 2, m0 = (lo + hi) / 2;
            const us: number[] = [];
            for (let u = lo; u <= hi + 1e-6; u += 0.2) us.push(u);
            us.push(m0);
            us.sort((p, q) => Math.abs(p - m0) - Math.abs(q - m0));
            search: for (let gap = Math.min(2.4, depth - sc.d - tc.d - 0.75); gap >= 1.3; gap -= 0.15)
              for (const u of us) {
                const c = spot(u, tc.d + gap + sc.d / 2);
                const fp: R = horizontal ? { x0: c[0] - sc.w / 2, x1: c[0] + sc.w / 2, y0: c[1] - sc.d / 2, y1: c[1] + sc.d / 2 } : { x0: c[0] - sc.d / 2, x1: c[0] + sc.d / 2, y0: c[1] - sc.w / 2, y1: c[1] + sc.w / 2 };
                const insideRoom = fp.x0 >= rect.x0 + 0.05 && fp.x1 <= rect.x1 - 0.05 && fp.y0 >= rect.y0 + 0.05 && fp.y1 <= rect.y1 - 0.05;
                if (insideRoom && !ctx.taken.some((t) => hit(t, fp, 0.02)) && !ctx.keepOut.some((t) => hit(t, fp, 0.02))) { found = { u, gap }; break search; }
              }
          }
          if (found) {
            const tv = against(ctx, side, 'tv-unit', { near: found.u });
            if (tv) {
              against(ctx, side, 'tv', { near: found.u });
              if (at(ctx, sofaKind, spot(found.u, tc.d + found.gap + sc.d / 2), ROT[opp])) seat = spot(found.u, tc.d + found.gap / 2);
            }
          } else {
            const sofa = against(ctx, side, sofaKind);
            if (sofa) seat = [sofa.x + n[0] * 1.15, sofa.y + n[1] * 1.15];
          }
        }
        if (seat) {
          at(ctx, 'rug', seat, ROT[side], { solid: false });
          at(ctx, 'coffee-table', seat, ROT[side]);
          at(ctx, 'ceiling-fan', seat);
        }
      }
      if (!seat) at(ctx, 'ceiling-fan', mid);
      // no kitchen on this floor: dining in the part of the room away from the seating
      if (A >= 17 && !dining) {
        const ref = seat ?? mid;
        const far: Vec2 = W >= D ? [ref[0] < mid[0] ? rect.x0 + W * 0.78 : rect.x0 + W * 0.22, mid[1]] : [mid[0], ref[1] < mid[1] ? rect.y0 + D * 0.78 : rect.y0 + D * 0.22];
        dining = fitNear(ctx, 'dining-set-4', far, 0, true);
      }
      if (dining) at(ctx, 'pendant-light', [dining.x, dining.y]);
      for (const s of bestSides(ctx, 1.45, 0.5, 0.5)) if (against(ctx, s, 'plant-tall', { align: 'end' })) break;
      break;
    }
    case 'dining':
      if (at(ctx, 'dining-set-4', mid)) at(ctx, 'pendant-light', mid); else at(ctx, 'ceiling-light', mid);
      break;
    case 'toilet': {
      // WC on the short wall away from the door, basin and shower on the long walls
      const short: Side[] = W <= D ? ['n', 's'] : ['w', 'e'];
      const long: Side[] = W <= D ? ['w', 'e'] : ['n', 's'];
      const wcSide = short.find((s) => !hasDoor(ctx, s)) ?? long.find((s) => !hasDoor(ctx, s));
      if (wcSide) against(ctx, wcSide, 'wc');
      for (const s of [...long, ...short]) { const b = against(ctx, s, 'washbasin', { align: 'end' }) ?? against(ctx, s, 'washbasin'); if (b) { against(ctx, s, 'mirror', { near: s === 'n' || s === 's' ? b.x : b.y }); break; } }
      for (const s of [...long].reverse()) if (against(ctx, s, 'shower')) { against(ctx, s, 'geyser', { align: 'start' }); break; }
      at(ctx, 'ceiling-light', mid);
      break;
    }
    case 'pooja': {
      const door = (['n', 's', 'w', 'e'] as Side[]).find((s) => hasDoor(ctx, s));
      const pref = door ? [OPPOSITE[door], ...bestSides(ctx, 1.55, 0.45, 0.6)] : bestSides(ctx, 1.55, 0.45, 0.6);
      for (const s of pref) if (against(ctx, s, 'pooja-mandir')) break;
      at(ctx, 'ceiling-light', mid);
      break;
    }
    case 'utility':
      for (const s of bestSides(ctx, 0.85, 0.6, 0.6)) if (against(ctx, s, 'washing-machine', { align: 'end' })) { against(ctx, s, 'utility-sink', { align: 'start' }); break; }
      at(ctx, 'ceiling-light', mid);
      break;
    case 'walkin':
      for (const s of bestSides(ctx, 2.1, 0.6, 1.0)) if (against(ctx, s, 'wardrobe-3door', { align: 'start' }) || against(ctx, s, 'wardrobe-2door', { align: 'start' })) break;
      at(ctx, 'ceiling-light', mid);
      break;
    case 'lobby': {
      const s = bestSides(ctx, 0.85, 0.88, 1.5)[0];
      const sofa = s && against(ctx, s, 'sofa-2seat', { color: '#36506b' });
      if (sofa && s) against(ctx, s, 'side-table', { near: (s === 'n' || s === 's' ? sofa.x : sofa.y) + 1.1 });
      for (const p of bestSides(ctx, 1.45, 0.5, 0.5)) if (against(ctx, p, 'plant-tall', { align: 'start' })) break;
      at(ctx, 'ceiling-light', mid);
      break;
    }
    case 'study': {
      const s = bestSides(ctx, 0.75, 0.6, 1.2)[0];
      const desk = s && against(ctx, s, 'study-desk');
      if (desk && s) { const n = inward(s); at(ctx, 'desk-chair', [desk.x + n[0] * 0.75, desk.y + n[1] * 0.75], ROT[OPPOSITE[s]]); }
      for (const b of bestSides(ctx, 1.8, 0.32, 0.8)) if (against(ctx, b, 'bookshelf', { align: 'start' })) break;
      at(ctx, 'ceiling-fan', mid);
      break;
    }
    case 'portico':
    case 'balcony': {
      const long = W >= D;
      at(ctx, 'plant-outdoor', long ? [rect.x0 + 0.55, mid[1]] : [mid[0], rect.y0 + 0.55]);
      at(ctx, 'plant-outdoor', long ? [rect.x1 - 0.55, mid[1]] : [mid[0], rect.y1 - 0.55]);
      break;
    }
    case 'passage':
    case 'store':
    case 'other':
      at(ctx, 'ceiling-light', mid);
      break;
    default:
      break;
  }
}

/** Furnish every room of the house. Deterministic: the same plan always gives the same layout. */
export function autoFurnish(spec: HouseSpec): PlacedItem[] {
  const out: PlacedItem[] = [];
  let n = 0;
  const seq = () => `a${String(++n).padStart(3, '0')}`;
  let bedrooms = 0;
  for (const level of spec.levels) {
    // stairs are obstacles, with 0.75 m of standing room at the foot of each flight (not for a doorstep or two)
    const stairBlocks: R[] = level.stairs.flatMap((st) => st.steps.map((s) => ({ x0: Math.min(s.x0, s.x1) - 0.05, x1: Math.max(s.x0, s.x1) + 0.05, y0: Math.min(s.y0, s.y1) - 0.05, y1: Math.max(s.y0, s.y1) + 0.05 })));
    const first = level.stairs.filter((st) => st.steps.length >= 4).map((st) => st.steps[0]).map((s) => ({ x0: Math.min(s.x0, s.x1) - 0.75, x1: Math.max(s.x0, s.x1) + 0.75, y0: Math.min(s.y0, s.y1) - 0.75, y1: Math.max(s.y0, s.y1) + 0.75 }));
    const holes: R[] = level.floorOpenings.map((p) => ({ x0: Math.min(...p.map((v) => v[0])), x1: Math.max(...p.map((v) => v[0])), y0: Math.min(...p.map((v) => v[1])), y1: Math.max(...p.map((v) => v[1])) }));
    for (const room of level.rooms) {
      if (room.type === 'staircase') continue;
      const rect = mainRect(room.polygon);
      if (rect.x1 - rect.x0 < 0.8 || rect.y1 - rect.y0 < 0.8) continue;
      const sides = sidesOf(level, rect);
      // clear floor at the foot of a stair and round a stairwell, but only inside this room
      const clip = (k: R): R => ({ x0: Math.max(k.x0, rect.x0), y0: Math.max(k.y0, rect.y0), x1: Math.min(k.x1, rect.x1), y1: Math.min(k.y1, rect.y1) });
      // (`first` is each bottom step grown by 0.75 m: shrink it back to test whether the step itself is in this room)
      const stairClear = first.filter((k) => hit({ x0: k.x0 + 0.7, x1: k.x1 - 0.7, y0: k.y0 + 0.7, y1: k.y1 - 0.7 }, rect, -0.06));
      const wellClear = holes.filter((h) => hit(h, rect, 0.02)).map((h) => ({ x0: h.x0 - 0.3, x1: h.x1 + 0.3, y0: h.y0 - 0.3, y1: h.y1 + 0.3 }));
      const keepOut: R[] = [...stairClear, ...wellClear].map(clip).filter((k) => k.x1 - k.x0 > 0.05 && k.y1 - k.y0 > 0.05);
      // clear floor in front of every doorway (less in a very small room, so it can still hold its fittings)
      const small = room.type === 'toilet' || room.type === 'pooja' || room.type === 'utility' || room.type === 'walkin';
      for (const s of Object.values(sides))
        for (const b of s.blocks) {
          if (b.kind !== 'door') continue;
          const across = s.side === 'n' || s.side === 's' ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
          const reach = Math.max(0.45, Math.min(small ? 0.7 : 1.0, across - 0.62));
          const depth = Math.min(reach, Math.max(0.6, b.b - b.a));
          keepOut.push(s.side === 'n' ? { x0: b.a, x1: b.b, y0: s.face, y1: s.face + depth } : s.side === 's' ? { x0: b.a, x1: b.b, y0: s.face - depth, y1: s.face } : s.side === 'w' ? { x0: s.face, x1: s.face + depth, y0: b.a, y1: b.b } : { x0: s.face - depth, x1: s.face, y0: b.a, y1: b.b });
        }
      const ctx: Ctx = { level, room, rect, sides, taken: [...stairBlocks.filter((b) => hit(b, rect))], keepOut, out, seq };
      furnishRoom(ctx, room.type === 'bedroom' ? bedrooms++ : 0);
    }
  }
  return out;
}
