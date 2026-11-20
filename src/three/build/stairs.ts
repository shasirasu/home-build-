// Stairs and railings. Each StairStep block becomes part of a real RCC stair: a sloping waist slab under the
// flights (open underneath), landing slabs, stone treads with a nosing and risers. Handrails follow the rail
// polylines with balusters; level railings come in steel + glass, MS baluster and timber.

import * as THREE from 'three';
import type { Railing, Stair, StairStep, Vec3 } from '@/types/house';
import { BatchSet, type P3 } from '../core/batch';
import { clamp, finite, pointInPoly } from '../core/geo';
import type { MaterialLib } from '../materials';
import { roomAt, type HouseModel, type LevelModel } from './model';
import type { BuildCtx } from './walls';

const TREAD_T = 0.03;
const NOSING = 0.022;
const RISER_T = 0.012;

export interface StepGeom {
  x0: number; y0: number; x1: number; y1: number;
  /** above the level FFL */
  top: number;
  prevTop: number;
  kind: 'tread' | 'landing';
  /** travel direction (unit, axis aligned) or null when unknown */
  dx: number; dy: number;
  /** soffit heights (above FFL) at the front and back edge; equal to `base` when the step is solid to the floor */
  botFront: number; botBack: number;
  solid: boolean;
  /** floor under the step, above FFL */
  base: number;
  /** span of the front edge shared with the previous step, along the edge axis */
  f0: number; f1: number;
}

export interface StairGeom {
  stair: Stair;
  steps: StepGeom[];
  /** vertical thickness of the waist */
  waist: number;
}

function normStep(s: StairStep) {
  return { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) };
}

/** Travel direction from step a to the adjacent step b (axis aligned), with the shared edge span. */
function adjacency(a: ReturnType<typeof normStep>, b: ReturnType<typeof normStep>): { dx: number; dy: number; f0: number; f1: number } | null {
  const tol = 0.03;
  const oy0 = Math.max(a.y0, b.y0), oy1 = Math.min(a.y1, b.y1);
  const ox0 = Math.max(a.x0, b.x0), ox1 = Math.min(a.x1, b.x1);
  if (Math.abs(a.x1 - b.x0) < tol && oy1 - oy0 > 0.05) return { dx: 1, dy: 0, f0: oy0, f1: oy1 };
  if (Math.abs(a.x0 - b.x1) < tol && oy1 - oy0 > 0.05) return { dx: -1, dy: 0, f0: oy0, f1: oy1 };
  if (Math.abs(a.y1 - b.y0) < tol && ox1 - ox0 > 0.05) return { dx: 0, dy: 1, f0: ox0, f1: ox1 };
  if (Math.abs(a.y0 - b.y1) < tol && ox1 - ox0 > 0.05) return { dx: 0, dy: -1, f0: ox0, f1: ox1 };
  const cx = (b.x0 + b.x1 - a.x0 - a.x1) / 2, cy = (b.y0 + b.y1 - a.y0 - a.y1) / 2;
  if (Math.abs(cx) < 1e-4 && Math.abs(cy) < 1e-4) return null;
  return Math.abs(cx) >= Math.abs(cy) ? { dx: Math.sign(cx), dy: 0, f0: b.y0, f1: b.y1 } : { dx: 0, dy: Math.sign(cy), f0: b.x0, f1: b.x1 };
}

/** Resolve a stair's blocks into flights with soffits. Used by the builder, the walk controller and door checks. */
export function stairGeometry(model: HouseModel, lm: LevelModel, stair: Stair): StairGeom {
  const src = (stair.steps ?? []).filter((s) => s && [s.x0, s.y0, s.x1, s.y1, s.top].every(Number.isFinite) && Math.abs(s.x1 - s.x0) > 0.02 && Math.abs(s.y1 - s.y0) > 0.02);
  const riser = clamp(finite(stair.riser, 0.17), 0.05, 0.4);
  const waist = Math.max(0.17, riser + 0.02);
  const steps: StepGeom[] = [];
  src.forEach((s, i) => {
    const n = normStep(s);
    const prev = i > 0 ? normStep(src[i - 1]) : null;
    const next = i < src.length - 1 ? normStep(src[i + 1]) : null;
    let adj = prev ? adjacency(prev, n) : null;
    if (!adj && next) {
      const a = adjacency(n, next);
      // the first step is entered from the side opposite to where the stair carries on
      if (a) adj = a.dx !== 0 ? { dx: a.dx, dy: 0, f0: n.y0, f1: n.y1 } : { dx: 0, dy: a.dy, f0: n.x0, f1: n.x1 };
    }
    const cx = (n.x0 + n.x1) / 2, cy = (n.y0 + n.y1) / 2;
    const room = roomAt(lm, cx, cy);
    let base = room ? room.offset : 0;
    if (!room && lm.index === 0 && !(lm.footprint.length >= 3 && pointInPoly(cx, cy, lm.footprint))) base = -lm.elevation;
    const prevTop = Math.max(base, i > 0 ? src[i - 1].top : s.top - riser);
    const kind = s.kind === 'landing' ? 'landing' : 'tread';
    let botFront = kind === 'landing' ? s.top - waist : prevTop - waist;
    let botBack = s.top - waist;
    let solid = false;
    if (botBack - base < 0.3) { solid = true; botFront = botBack = base; }
    else if (botFront < base) botFront = base;
    steps.push({ ...n, top: s.top, prevTop, kind, dx: adj?.dx ?? 0, dy: adj?.dy ?? 0, botFront, botBack, solid, base, f0: adj?.f0 ?? 0, f1: adj?.f1 ?? 0 });
  });
  return { stair, steps, waist };
}

export function buildStairs(ctx: BuildCtx, lm: LevelModel, rccGroup: THREE.Group, finishGroup: THREE.Group): StairGeom[] {
  const { mats, model } = ctx;
  const out: StairGeom[] = [];
  const elev = lm.elevation;
  const next = model.levels[lm.index + 1];
  for (const stair of lm.level.stairs ?? []) {
    if (!stair) continue;
    const sg = stairGeometry(model, lm, stair);
    out.push(sg);
    if (!sg.steps.length) continue;
    const set = new BatchSet();
    const stone = set.get(mats.finish(stair.finish));
    const single = sg.steps.length === 1;
    const body = set.get(single ? mats.finishFlat(stair.finish, 0.1) : mats.paint('#f3f0ea', false, 0.9));
    const strip = set.get(mats.nosing(stair.finish));

    sg.steps.forEach((st, i) => {
      const yTop = elev + st.top;
      const yBody = yTop - TREAD_T;
      const { x0, x1, y0, y1 } = st;
      const hasDir = st.dx !== 0 || st.dy !== 0;
      // --- stone tread with a nosing over the front edge
      let tx0 = x0, tx1 = x1, ty0 = y0, ty1 = y1;
      if (hasDir && st.kind === 'tread') {
        if (st.dx > 0) tx0 -= NOSING; else if (st.dx < 0) tx1 += NOSING; else if (st.dy > 0) ty0 -= NOSING; else ty1 += NOSING;
      }
      stone.box(null, (tx0 + tx1) / 2, yTop - TREAD_T / 2, (ty0 + ty1) / 2, tx1 - tx0, TREAD_T, ty1 - ty0);
      if (hasDir && st.kind === 'tread' && !single) {
        // anti-skid nosing strip: also what makes each tread read in the plan view
        const w = 0.028, yS = yTop + 0.0012;
        if (st.dx !== 0) {
          const xs = st.dx > 0 ? tx0 + 0.012 + w / 2 : tx1 - 0.012 - w / 2;
          strip.box(null, xs, yS, (ty0 + ty1) / 2, w, 0.0024, ty1 - ty0 - 0.03, -1, 'y-');
        } else {
          const ys = st.dy > 0 ? ty0 + 0.012 + w / 2 : ty1 - 0.012 - w / 2;
          strip.box(null, (tx0 + tx1) / 2, yS, ys, tx1 - tx0 - 0.03, 0.0024, w, -1, 'y-');
        }
      }

      // --- concrete under it: a prism whose underside follows the waist
      const bf = elev + st.botFront, bb = elev + st.botBack;
      if (!hasDir || st.kind === 'landing' || Math.abs(bf - bb) < 1e-5) {
        const yb = Math.min(bf, bb);
        if (yBody - yb > 1e-4) body.box(null, (x0 + x1) / 2, (yb + yBody) / 2, (y0 + y1) / 2, x1 - x0, yBody - yb, y1 - y0, -1, 'y+');
      } else {
        // corners: front-left, front-right, back-right, back-left (in plan), each at a bottom and the body top
        const front: [number, number][] = st.dx > 0 ? [[x0, y0], [x0, y1]] : st.dx < 0 ? [[x1, y1], [x1, y0]] : st.dy > 0 ? [[x1, y0], [x0, y0]] : [[x0, y1], [x1, y1]];
        const back: [number, number][] = st.dx > 0 ? [[x1, y0], [x1, y1]] : st.dx < 0 ? [[x0, y1], [x0, y0]] : st.dy > 0 ? [[x1, y1], [x0, y1]] : [[x0, y0], [x1, y0]];
        const F0b: P3 = [front[0][0], bf, front[0][1]], F1b: P3 = [front[1][0], bf, front[1][1]];
        const B0b: P3 = [back[0][0], bb, back[0][1]], B1b: P3 = [back[1][0], bb, back[1][1]];
        const F0t: P3 = [front[0][0], yBody, front[0][1]], F1t: P3 = [front[1][0], yBody, front[1][1]];
        const B0t: P3 = [back[0][0], yBody, back[0][1]], B1t: P3 = [back[1][0], yBody, back[1][1]];
        const d: P3 = [st.dx, 0, st.dy];
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const out0: P3 = [(front[0][0] + back[0][0]) / 2 - cx, 0, (front[0][1] + back[0][1]) / 2 - cy];
        const out1: P3 = [(front[1][0] + back[1][0]) / 2 - cx, 0, (front[1][1] + back[1][1]) / 2 - cy];
        body.quad(F0b, F1b, F1t, F0t, [-d[0], 0, -d[2]]); // front
        body.quad(B0b, B1b, B1t, B0t, d); // back
        body.quad(F0b, B0b, B0t, F0t, out0);
        body.quad(F1b, B1b, B1t, F1t, out1);
        body.quad(F0b, F1b, B1b, B0b, [0, -1, 0]); // sloping soffit
      }

      // --- riser facing on the front edge
      if (hasDir && i >= 0) {
        const r0 = elev + st.prevTop, r1 = yBody;
        if (r1 - r0 > 0.01) {
          const span0 = st.kind === 'landing' && st.f1 > st.f0 ? st.f0 : (st.dx !== 0 ? y0 : x0);
          const span1 = st.kind === 'landing' && st.f1 > st.f0 ? st.f1 : (st.dx !== 0 ? y1 : x1);
          if (st.dx !== 0) {
            const xf = st.dx > 0 ? x0 - RISER_T / 2 : x1 + RISER_T / 2;
            stone.box(null, xf, (r0 + r1) / 2, (span0 + span1) / 2, RISER_T, r1 - r0, span1 - span0, -1, 'y-');
          } else {
            const yf = st.dy > 0 ? y0 - RISER_T / 2 : y1 + RISER_T / 2;
            stone.box(null, (span0 + span1) / 2, (r0 + r1) / 2, yf, span1 - span0, r1 - r0, RISER_T, -1, 'y-');
          }
        }
      }
    });

    // --- last riser up to the floor above
    const last = sg.steps[sg.steps.length - 1];
    if (next && (last.dx !== 0 || last.dy !== 0)) {
      const rise = next.elevation - (elev + last.top);
      if (rise > 0.03 && rise < 0.3) {
        const r0 = elev + last.top, r1 = next.elevation - 0.001;
        if (last.dx !== 0) {
          const xb = last.dx > 0 ? last.x1 - RISER_T / 2 : last.x0 + RISER_T / 2;
          stone.box(null, xb, (r0 + r1) / 2, (last.y0 + last.y1) / 2, RISER_T, r1 - r0, last.y1 - last.y0, -1, 'y-');
        } else {
          const yb = last.dy > 0 ? last.y1 - RISER_T / 2 : last.y0 + RISER_T / 2;
          stone.box(null, (last.x0 + last.x1) / 2, (r0 + r1) / 2, yb, last.x1 - last.x0, r1 - r0, RISER_T, -1, 'y-');
        }
      }
    }

    const sel = { type: 'stair', levelId: lm.level.id, stairId: stair.id };
    for (const m of set.flush(rccGroup, { name: `stair:${stair.id}`, data: { rcc: 'stair' } })) m.userData.sel = sel;

    // --- handrails
    const rails = new BatchSet();
    for (const line of stair.rails ?? []) buildStairRail(mats, rails, sg, elev, line, clamp(finite(stair.railHeight, 0.9), 0.3, 1.5));
    for (const m of rails.flush(finishGroup, { name: `stair-rail:${stair.id}` })) m.userData.sel = sel;
  }
  return out;
}

function stepAt(sg: StairGeom, x: number, y: number): StepGeom | null {
  let best: StepGeom | null = null;
  for (const s of sg.steps) if (x >= s.x0 - 1e-4 && x <= s.x1 + 1e-4 && y >= s.y0 - 1e-4 && y <= s.y1 + 1e-4 && (!best || s.top > best.top)) best = s;
  return best;
}

function buildStairRail(mats: MaterialLib, set: BatchSet, sg: StairGeom, elev: number, line: Vec3[], railH: number): void {
  const pts = (line ?? []).filter((p) => p && p.every(Number.isFinite));
  if (pts.length < 2) return;
  const steel = set.get(mats.metal('#c5c9cd', false, 0.26));
  const wood = set.get(mats.wood('#6b4226', false, 0.45));
  const INSET = 0.05;
  // shift the whole rail onto the stair so balusters stand on the treads, not on the edge
  let ox = 0, oy = 0;
  {
    const a = pts[0], b = pts[1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const px = -(b[1] - a[1]) / len, py = (b[0] - a[0]) / len;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const l = !!stepAt(sg, mx + px * 0.12, my + py * 0.12), r = !!stepAt(sg, mx - px * 0.12, my - py * 0.12);
    if (l && !r) { ox = px * INSET; oy = py * INSET; } else if (r && !l) { ox = -px * INSET; oy = -py * INSET; }
  }
  const P = pts.map((p) => [p[0] + ox, p[1] + oy, p[2]] as Vec3);
  const top = (p: Vec3): P3 => [p[0], elev + p[2] + railH, p[1]];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const ta = top(a), tb = top(b);
    wood.rod(null, ta[0], ta[1], ta[2], tb[0], tb[1], tb[2], 0.027, 10, true);
    const plan = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (plan < 1e-3) continue;
    const n = Math.max(1, Math.round(plan / 0.13));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const hLine = a[2] + (b[2] - a[2]) * t;
      const st = stepAt(sg, x, y);
      const foot = elev + (st ? Math.min(st.top, hLine + 0.02) : hLine);
      const head = elev + hLine + railH - 0.02;
      const post = (k === 0 && i === 0) || (k === n && i === P.length - 2);
      if (post) steel.box(null, x, (foot + head + 0.04) / 2, y, 0.04, head + 0.04 - foot, 0.04, -1, 'y-');
      else steel.rod(null, x, foot, y, x, head, y, 0.008, 6, false);
    }
  }
}

// ---------------------------------------------------------------------------------------------- level railings

export function buildRailings(ctx: BuildCtx, lm: LevelModel, finishGroup: THREE.Group): void {
  const { mats } = ctx;
  const set = new BatchSet();
  for (const rl of lm.level.railings ?? []) buildRailing(mats, set, lm.elevation, rl);
  set.flush(finishGroup, { name: 'railings', data: { clipped: true } });
}

function buildRailing(mats: MaterialLib, set: BatchSet, elev: number, rl: Railing): void {
  const pts = (rl?.points ?? []).filter((p) => p && p.every(Number.isFinite));
  if (pts.length < 2) return;
  const H = clamp(finite(rl.height, 0.95), 0.2, 2);
  const style = rl.style ?? 'ms-baluster';
  const steel = set.get(mats.steel());
  const glass = set.get(mats.glass());
  const ms = set.get(mats.msDark());
  const wood = set.get(mats.wood('#6b4226'));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-3) continue;
    const ya = elev + a[2], yb = elev + b[2];
    const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const M = new THREE.Matrix4().makeRotationY(ang).setPosition(a[0], 0, a[1]);
    const yAt = (t: number) => ya + (yb - ya) * t;
    if (style === 'ss-glass') {
      const bays = Math.max(1, Math.ceil(len / 1.15));
      for (let k = 0; k <= bays; k++) {
        if (k === 0 && i > 0) continue;
        const t = k / bays;
        steel.box(M, len * t, yAt(t) + (H - 0.02) / 2, 0, 0.04, H - 0.02, 0.04, -1, 'y-');
      }
      for (let k = 0; k < bays; k++) {
        const t0 = k / bays, t1 = (k + 1) / bays;
        const y0 = yAt((t0 + t1) / 2);
        glass.box(M, len * (t0 + t1) / 2, y0 + 0.09 + (H - 0.22) / 2, 0, len / bays - 0.1, H - 0.22, 0.012);
        // patch fittings
        for (const tt of [t0, t1]) for (const hh of [0.22, H - 0.26]) steel.box(M, len * tt + (tt === t0 ? 0.035 : -0.035), y0 + hh, 0, 0.035, 0.04, 0.03);
      }
      steel.rod(null, a[0], ya + H, a[1], b[0], yb + H, b[1], 0.022, 12, true);
    } else if (style === 'wood') {
      const n = Math.max(1, Math.round(len / 0.13));
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 0) continue;
        const t = k / n;
        const post = k === 0 || k === n;
        if (post) wood.box(M, len * t, yAt(t) + (H + 0.04) / 2, 0, 0.085, H + 0.04, 0.085, -1, 'y-');
        else wood.rod(M, len * t, yAt(t) + 0.08, 0, len * t, yAt(t) + H - 0.04, 0, 0.018, 8, false);
      }
      wood.box(M, len / 2, (ya + yb) / 2 + H - 0.025, 0, len, 0.05, 0.07);
      wood.box(M, len / 2, (ya + yb) / 2 + 0.065, 0, len, 0.035, 0.05);
    } else {
      const n = Math.max(1, Math.round(len / 0.11));
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 0) continue;
        const t = k / n;
        const post = k === 0 || k === n;
        const s = post ? 0.03 : 0.012;
        ms.box(M, len * t, yAt(t) + (post ? H / 2 : 0.07 + (H - 0.09) / 2), 0, s, post ? H : H - 0.09, s, -1, 'y-');
      }
      ms.box(M, len / 2, (ya + yb) / 2 + H - 0.008, 0, len, 0.016, 0.045);
      ms.box(M, len / 2, (ya + yb) / 2 + 0.07, 0, len, 0.012, 0.03);
    }
  }
}
