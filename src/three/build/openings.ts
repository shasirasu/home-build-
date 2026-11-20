// Doors, windows, ventilators: real joinery in every opening. Fixed parts (frames, glass, grilles, sills, chajjas)
// are merged per material for the whole storey; door leaves stay separate groups pivoting on their hinge so they
// can rest ajar and swing open as the walker approaches.

import * as THREE from 'three';
import { Batch, BatchSet } from '../core/batch';
import { orectFromSeg, orectsOverlap, type ORect } from '../core/geo';
import { roomAt, wallPoint, type LevelModel, type OpeningModel } from './model';
import { wallMatrix, type BuildCtx } from './walls';

export interface DoorLeaf {
  om: OpeningModel;
  levelIndex: number;
  pivot: THREE.Group;
  /** pivot.rotation.y = sign × angle */
  sign: number;
  /** hinge in plan */
  hx: number; hy: number;
  /** unit vectors in plan: along the closed leaf from the hinge, and the swing direction */
  cx: number; cy: number;
  sx: number; sy: number;
  width: number;
  thickness: number;
  angle: number;
  /** angle the leaf rests at */
  rest: number;
  /** largest angle it can open to without hitting anything */
  max: number;
  restPref: number;
  target: number;
}

const FRAME_W = 0.055;
const LEAF_T = 0.038;

const TEAK = '#8a5a34';
const TEAK_FRAME = '#74492a';
const FLUSH = '#b08a62';
const WINDOW_WOOD = '#7a4f2d';

/** Footprint of a leaf opened to `angle` (radians), as an oriented rectangle in plan. */
export function leafRect(d: DoorLeaf, angle: number): ORect | null {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = d.cx * c + d.sx * s, dy = d.cy * c + d.sy * s; // along the leaf
  const ex = -d.cx * s + d.sx * c, ey = -d.cy * s + d.sy * c; // leaf normal on the swing side
  const ox = d.hx - ex * (d.thickness / 2), oy = d.hy - ey * (d.thickness / 2);
  return orectFromSeg([ox + dx * 0.03, oy + dy * 0.03], [ox + dx * d.width, oy + dy * d.width], d.thickness);
}

/** Work out how far each leaf can open (walls, stairs, columns, furniture) and where it should rest. */
export function solveDoorAngles(leaves: DoorLeaf[], obstaclesFor: (leaf: DoorLeaf) => ORect[]): void {
  for (const d of leaves) {
    const obs = obstaclesFor(d);
    let max = 0;
    for (let deg = 6; deg <= 90; deg += 6) {
      const r = leafRect(d, (deg * Math.PI) / 180);
      if (!r) break;
      if (obs.some((o) => orectsOverlap(r, o, 0.004))) break;
      max = deg;
    }
    d.max = (max * Math.PI) / 180;
    d.rest = Math.min(d.max, d.restPref);
  }
}

export function buildOpenings(ctx: BuildCtx, lm: LevelModel, finishGroup: THREE.Group, proxies: THREE.Object3D[]): DoorLeaf[] {
  const { mats } = ctx;
  const set = new BatchSet();
  const leaves: DoorLeaf[] = [];
  const glass = mats.glass();
  const trim = mats.trim();
  const granite = mats.finish('granite-black', true);
  const proxyGeo = new THREE.BoxGeometry(1, 1, 1);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const doorsGroup = new THREE.Group();
  doorsGroup.name = 'doors';
  finishGroup.add(doorsGroup);

  for (const wm of lm.walls) {
    const t = wm.rect.ht * 2;
    const base = wallMatrix(wm);
    for (const om of wm.openings) {
      const o = om.opening;
      const W = om.s1 - om.s0;
      const sc = (om.s0 + om.s1) / 2;
      const hh = om.head - om.sill;
      const M = base.clone().multiply(new THREE.Matrix4().makeTranslation(sc, 0, 0));
      const out: 1 | -1 = om.outSide === 0 ? 1 : om.outSide;

      // ---- pick proxy
      const proxy = new THREE.Mesh(proxyGeo, proxyMat);
      proxy.applyMatrix4(new THREE.Matrix4().makeScale(W, hh, t + 0.12).setPosition(0, om.sill + hh / 2, 0).premultiply(M));
      proxy.userData.sel = { type: 'opening', levelId: lm.level.id, openingId: o.id };
      proxy.userData.clipped = true;
      proxy.userData.proxy = true;
      proxy.updateMatrixWorld(true);
      finishGroup.add(proxy);
      proxies.push(proxy);

      const kind = o.kind;
      const style = o.style ?? (kind === 'door' ? 'flush' : kind === 'window' ? 'casement' : kind === 'ventilator' ? 'louvre' : undefined);

      try {
        if (kind === 'door' && o.leaf !== 'sliding') {
          buildDoor(M, om, W, hh, t, style ?? 'flush', out);
        } else if (kind === 'door' && o.leaf === 'sliding') {
          buildSliding(M, om, W, hh, t, out, false);
        } else if (kind === 'window') {
          if (style === 'sliding-alu' || o.leaf === 'sliding') buildSliding(M, om, W, hh, t, out, true);
          else buildCasement(M, om, W, hh, t, out);
        } else if (kind === 'ventilator') {
          buildLouvre(M, om, W, hh, t, out);
        } else if (kind === 'opening' && o.leaf !== 'none' && o.leaf) {
          buildDoor(M, om, W, hh, t, style === 'arch' ? 'flush' : (style ?? 'flush'), out);
        }
        // sun shade over exterior openings that are not under a covered outdoor room
        if (om.outSide !== 0 && (kind === 'window' || kind === 'door' || kind === 'ventilator')) {
          const [ox, oy] = wallPoint(wm, sc, om.outSide * (wm.rect.ht + 0.3));
          const sheltered = !!roomAt(lm, ox, oy);
          if (!sheltered && om.head < wm.height - 0.12) {
            const proj = kind === 'door' ? 0.6 : kind === 'ventilator' ? 0.3 : 0.45;
            const b = set.get(trim);
            b.box(M, 0, om.head + 0.0375, om.outSide * (t / 2 + proj / 2), W + 0.3, 0.075, proj, -1, om.outSide > 0 ? 'z-' : 'z+');
            // a thin drip edge so the slab reads as a chajja, not a block
            b.box(M, 0, om.head - 0.012, om.outSide * (t / 2 + proj - 0.02), W + 0.3, 0.024, 0.04);
          }
        }
      } catch (e) {
        console.warn(`[HouseViewer] opening ${o.id} could not be modelled`, e);
      }
    }
  }

  set.flush(finishGroup, { name: 'joinery', data: { clipped: true } });
  return leaves;

  // ================================================================================================ doors
  function buildDoor(M: THREE.Matrix4, om: OpeningModel, W: number, hh: number, t: number, style: string, out: 1 | -1) {
    const o = om.opening;
    const sw: 1 | -1 = o.swing === 1 || o.swing === -1 ? o.swing : om.outSide !== 0 ? (-om.outSide as 1 | -1) : 1;
    const frameMat = style === 'teak-panel' ? mats.wood(TEAK_FRAME) : style === 'pvc' ? mats.pvc() : style === 'steel' ? mats.solid('#454c52', 0.55, true, 0.4) : mats.wood(TEAK_FRAME);
    const fd = Math.min(t + 0.02, 0.13);
    const zFace = sw * (t / 2 + 0.01);
    const zc = zFace - sw * (fd / 2);
    const fb = set.get(frameMat);
    const fw = Math.min(FRAME_W, W * 0.12);
    fb.box(M, -W / 2 + fw / 2, om.sill + hh / 2, zc, fw, hh, fd);
    fb.box(M, W / 2 - fw / 2, om.sill + hh / 2, zc, fw, hh, fd);
    fb.box(M, 0, om.head - fw / 2, zc, W - 2 * fw, fw, fd);
    if (o.leaf === 'none') return;

    const cw = W - 2 * fw;
    const lh = hh - fw - 0.009;
    const lt = style === 'pvc' ? 0.03 : LEAF_T;
    const zPivot = sw * (t / 2 + 0.004);
    const double = o.leaf === 'double';
    const specs: { dir: 1 | -1; lw: number; px: number }[] = double
      ? [{ dir: 1, lw: cw / 2 - 0.003, px: -cw / 2 + 0.001 }, { dir: -1, lw: cw / 2 - 0.003, px: cw / 2 - 0.001 }]
      : o.hinge === 'b'
        ? [{ dir: -1, lw: cw - 0.004, px: cw / 2 - 0.002 }]
        : [{ dir: 1, lw: cw - 0.004, px: -cw / 2 + 0.002 }];

    const wm = om.wall;
    const root = new THREE.Group();
    root.applyMatrix4(M);
    root.name = `door:${o.id}`;
    doorsGroup.add(root);

    for (const sp of specs) {
      const pivot = new THREE.Group();
      pivot.position.set(sp.px, om.sill + 0.006, zPivot);
      root.add(pivot);
      const ls = new BatchSet();
      const zMid = -sw * (lt / 2);
      const X = (x: number) => sp.dir * x; // leaf-local x from the hinge
      const boxL = (b: Batch, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
        b.box(null, X((x0 + x1) / 2), (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0));

      if (style === 'teak-panel') {
        const wood = ls.get(mats.wood(TEAK));
        const core = lt * 0.62;
        boxL(wood, 0, sp.lw, 0, lh, zMid - core / 2, zMid + core / 2);
        const stile = Math.min(0.1, sp.lw * 0.18), railT = 0.11, railB = 0.2, railM = 0.1;
        // stiles and rails, full thickness
        boxL(wood, 0, stile, 0, lh, zMid - lt / 2, zMid + lt / 2);
        boxL(wood, sp.lw - stile, sp.lw, 0, lh, zMid - lt / 2, zMid + lt / 2);
        boxL(wood, stile, sp.lw - stile, lh - railT, lh, zMid - lt / 2, zMid + lt / 2);
        boxL(wood, stile, sp.lw - stile, 0, railB, zMid - lt / 2, zMid + lt / 2);
        const fieldH = lh - railT - railB;
        const rows = [0.26, 0.44, 0.3];
        const cols = sp.lw > 0.8 ? 2 : 1;
        let y = railB;
        rows.forEach((f, ri) => {
          const ph = fieldH * f - (ri < rows.length - 1 ? railM : 0);
          const fieldW = sp.lw - 2 * stile;
          const colW = (fieldW - (cols - 1) * stile * 0.8) / cols;
          for (let c = 0; c < cols; c++) {
            const x0 = stile + c * (colW + stile * 0.8);
            // raised panel: a bevel step then the field
            boxL(wood, x0 + 0.018, x0 + colW - 0.018, y + 0.018, y + ph - 0.018, zMid - lt * 0.44, zMid + lt * 0.44);
            boxL(wood, x0 + 0.05, x0 + colW - 0.05, y + 0.05, y + ph - 0.05, zMid - lt * 0.54, zMid + lt * 0.54);
            if (c < cols - 1) boxL(wood, x0 + colW, x0 + colW + stile * 0.8, y, y + ph, zMid - lt / 2, zMid + lt / 2);
          }
          if (ri < rows.length - 1) boxL(wood, stile, sp.lw - stile, y + ph, y + ph + railM, zMid - lt / 2, zMid + lt / 2);
          y += ph + railM;
        });
        // brass pull handles on both faces + lock plate
        const brass = ls.get(mats.brass());
        const hxp = sp.lw - stile / 2;
        for (const f of [1, -1]) {
          const zf = zMid + f * (lt / 2);
          brass.rod(null, X(hxp), 0.88, zf + f * 0.05, X(hxp), 1.23, zf + f * 0.05, 0.011, 10);
          brass.rod(null, X(hxp), 0.93, zf, X(hxp), 0.93, zf + f * 0.05, 0.008, 8);
          brass.rod(null, X(hxp), 1.18, zf, X(hxp), 1.18, zf + f * 0.05, 0.008, 8);
          brass.box(null, X(hxp), 0.78, zf + f * 0.002, 0.05, 0.1, 0.004);
        }
      } else if (style === 'pvc') {
        const body = ls.get(mats.pvc());
        boxL(body, 0, sp.lw, 0, lh, zMid - lt / 2, zMid + lt / 2);
        const inset = ls.get(mats.paint('#e2dfd6', true, 0.5));
        const m = Math.min(0.09, sp.lw * 0.14);
        boxL(inset, m, sp.lw - m, 0.16, lh * 0.46, zMid - lt / 2 - 0.003, zMid + lt / 2 + 0.003);
        boxL(inset, m, sp.lw - m, lh * 0.46 + m, lh - m, zMid - lt / 2 - 0.003, zMid + lt / 2 + 0.003);
        const st = ls.get(mats.steel());
        for (const f of [1, -1]) {
          const zf = zMid + f * (lt / 2);
          st.rod(null, X(sp.lw - 0.06), 1.0, zf, X(sp.lw - 0.06), 1.0, zf + f * 0.05, 0.012, 10);
          st.rod(null, X(sp.lw - 0.06), 1.0, zf + f * 0.045, X(sp.lw - 0.16), 1.0, zf + f * 0.045, 0.009, 8);
        }
      } else if (style === 'steel') {
        const body = ls.get(mats.solid('#5a6670', 0.5, true, 0.45));
        boxL(body, 0, sp.lw, 0, lh, zMid - lt / 2, zMid + lt / 2);
        const m = 0.08;
        const ph = (lh - 4 * m) / 3;
        for (let i = 0; i < 3; i++) boxL(body, m, sp.lw - m, m + i * (ph + m), m + i * (ph + m) + ph, zMid - lt / 2 - 0.006, zMid + lt / 2 + 0.006);
        const ms = ls.get(mats.msDark());
        for (const f of [1, -1]) {
          const zf = zMid + f * (lt / 2 + 0.006);
          ms.rod(null, X(sp.lw - 0.07), 0.95, zf + f * 0.04, X(sp.lw - 0.07), 1.15, zf + f * 0.04, 0.009, 8);
          ms.rod(null, X(sp.lw - 0.07), 0.97, zf, X(sp.lw - 0.07), 0.97, zf + f * 0.04, 0.007, 6);
          ms.rod(null, X(sp.lw - 0.07), 1.13, zf, X(sp.lw - 0.07), 1.13, zf + f * 0.04, 0.007, 6);
        }
        // tower bolt on the inside
        ms.box(null, X(sp.lw - 0.1), lh - 0.25, zMid + sw * (lt / 2 + 0.012), 0.03, 0.18, 0.012);
      } else {
        // flush door: veneer leaf, steel lever handle
        const body = ls.get(mats.wood(FLUSH, true, 0.42));
        boxL(body, 0, sp.lw, 0, lh, zMid - lt / 2, zMid + lt / 2);
        const st = ls.get(mats.steel());
        for (const f of [1, -1]) {
          const zf = zMid + f * (lt / 2);
          st.rod(null, X(sp.lw - 0.065), 1.0, zf, X(sp.lw - 0.065), 1.0, zf + f * 0.012, 0.026, 14);
          st.rod(null, X(sp.lw - 0.065), 1.0, zf, X(sp.lw - 0.065), 1.0, zf + f * 0.05, 0.009, 8);
          st.rod(null, X(sp.lw - 0.065), 1.0, zf + f * 0.046, X(sp.lw - 0.19), 1.0, zf + f * 0.046, 0.0085, 8);
        }
      }
      for (const mesh of ls.flush(pivot, { name: 'leaf', data: { clipped: true } })) mesh.matrixAutoUpdate = false;

      // plan data for swing checks and animation
      const [hx, hy] = wallPoint(wm, (om.s0 + om.s1) / 2 + sp.px, zPivot);
      const restPref = style === 'teak-panel' ? 0.96 : style === 'pvc' ? 0.5 : style === 'steel' ? 0.0 : 0.62;
      leaves.push({
        om, levelIndex: lm.index, pivot,
        sign: sp.dir > 0 ? -sw : sw,
        hx, hy,
        cx: wm.rect.ux * sp.dir, cy: wm.rect.uy * sp.dir,
        sx: wm.nx * sw, sy: wm.ny * sw,
        width: sp.lw, thickness: lt,
        angle: 0, rest: 0, max: Math.PI / 2, restPref, target: 0,
      });
    }
    void out;
  }

  // ================================================================================================ casement window
  function buildCasement(M: THREE.Matrix4, om: OpeningModel, W: number, hh: number, t: number, out: 1 | -1) {
    const wood = set.get(mats.wood(WINDOW_WOOD));
    const fw = 0.05;
    const fd = Math.min(0.09, t - 0.02);
    const exterior = om.outSide !== 0;
    const zc = exterior && t > 0.16 ? out * (t / 2 - 0.035 - fd / 2) : 0;
    const y0 = om.sill, y1 = om.head, yc = (y0 + y1) / 2;
    // frame
    wood.box(M, -W / 2 + fw / 2, yc, zc, fw, hh, fd);
    wood.box(M, W / 2 - fw / 2, yc, zc, fw, hh, fd);
    wood.box(M, 0, y1 - fw / 2, zc, W - 2 * fw, fw, fd);
    wood.box(M, 0, y0 + fw / 2, zc, W - 2 * fw, fw, fd);
    const inner = W - 2 * fw;
    const bays = om.opening.leaf === 'single' ? 1 : inner > 1.7 ? 3 : 2;
    const mull = 0.04;
    const bayW = (inner - (bays - 1) * mull) / bays;
    const gl = set.get(glass);
    const sf = 0.042, sd = 0.034;
    for (let i = 0; i < bays; i++) {
      const bx0 = -inner / 2 + i * (bayW + mull);
      const bxc = bx0 + bayW / 2;
      if (i < bays - 1) wood.box(M, bx0 + bayW + mull / 2, yc, zc, mull, hh - 2 * fw, fd);
      // shutter
      const sy0 = y0 + fw + 0.004, sy1 = y1 - fw - 0.004, sh = sy1 - sy0;
      const zs = zc + out * 0.012;
      wood.box(M, bx0 + sf / 2 + 0.003, (sy0 + sy1) / 2, zs, sf, sh, sd);
      wood.box(M, bx0 + bayW - sf / 2 - 0.003, (sy0 + sy1) / 2, zs, sf, sh, sd);
      wood.box(M, bxc, sy1 - sf / 2, zs, bayW - 2 * sf - 0.006, sf, sd);
      wood.box(M, bxc, sy0 + sf / 2, zs, bayW - 2 * sf - 0.006, sf, sd);
      if (sh > 0.9) wood.box(M, bxc, sy0 + sh * 0.66, zs, bayW - 2 * sf - 0.006, 0.026, sd * 0.8);
      gl.box(M, bxc, (sy0 + sy1) / 2, zs, bayW - 2 * sf - 0.006, sh - 2 * sf, 0.006, -1, 'x+x-y+y-');
    }
    // MS grille on the room side of the shutters
    const ms = set.get(mats.msDark());
    const zg = zc - out * (fd / 2 - 0.012);
    const n = Math.max(1, Math.round(inner / 0.125));
    for (let i = 1; i < n; i++) ms.box(M, -inner / 2 + (inner * i) / n, yc, zg, 0.012, hh - 2 * fw, 0.012, -1, 'y+y-');
    const rows = hh > 1.0 ? 3 : 2;
    for (let j = 1; j <= rows; j++) ms.box(M, 0, y0 + fw + ((hh - 2 * fw) * j) / (rows + 1), zg, inner, 0.022, 0.006, -1, 'x+x-');
    sills(M, om, W, t, out, zc - out * (fd / 2), exterior);
  }

  // ================================================================================================ sliding aluminium
  function buildSliding(M: THREE.Matrix4, om: OpeningModel, W: number, hh: number, t: number, out: 1 | -1, isWindow: boolean) {
    const alu = set.get(mats.alu());
    const fw = 0.04;
    const fd = Math.min(0.08, t - 0.02);
    const exterior = om.outSide !== 0;
    const zc = exterior && t > 0.16 ? out * (t / 2 - 0.04 - fd / 2) : 0;
    const y0 = om.sill, y1 = om.head, yc = (y0 + y1) / 2;
    alu.box(M, -W / 2 + fw / 2, yc, zc, fw, hh, fd);
    alu.box(M, W / 2 - fw / 2, yc, zc, fw, hh, fd);
    alu.box(M, 0, y1 - fw / 2, zc, W - 2 * fw, fw, fd);
    alu.box(M, 0, y0 + fw / 2, zc, W - 2 * fw, fw, fd);
    const inner = W - 2 * fw;
    const panels = inner > 2.2 ? 3 : 2;
    const overlap = 0.05;
    const pw = (inner + (panels - 1) * overlap) / panels;
    const gl = set.get(glass);
    const sy0 = y0 + fw + 0.004, sy1 = y1 - fw - 0.004, sh = sy1 - sy0, sf = 0.032;
    for (let i = 0; i < panels; i++) {
      const x0 = -inner / 2 + i * (pw - overlap);
      const xc = x0 + pw / 2;
      const zp = zc + (i % 2 ? -1 : 1) * 0.014;
      alu.box(M, x0 + sf / 2, (sy0 + sy1) / 2, zp, sf, sh, 0.022);
      alu.box(M, x0 + pw - sf / 2, (sy0 + sy1) / 2, zp, sf, sh, 0.022);
      alu.box(M, xc, sy1 - sf / 2, zp, pw - 2 * sf, sf, 0.022);
      alu.box(M, xc, sy0 + sf / 2, zp, pw - 2 * sf, sf, 0.022);
      gl.box(M, xc, (sy0 + sy1) / 2, zp, pw - 2 * sf, sh - 2 * sf, 0.005, -1, 'x+x-y+y-');
      // pull
      alu.box(M, i % 2 ? x0 + sf / 2 : x0 + pw - sf / 2, sy0 + sh * 0.45, zp - out * 0.016, 0.014, 0.12, 0.012);
    }
    if (isWindow) sills(M, om, W, t, out, zc - out * (fd / 2), exterior);
  }

  // ================================================================================================ louvre ventilator
  function buildLouvre(M: THREE.Matrix4, om: OpeningModel, W: number, hh: number, t: number, out: 1 | -1) {
    const fr = set.get(mats.alu());
    const fw = 0.032;
    const fd = Math.min(0.07, t - 0.02);
    const exterior = om.outSide !== 0;
    const zc = exterior && t > 0.16 ? out * (t / 2 - 0.045 - fd / 2) : 0;
    const y0 = om.sill, y1 = om.head, yc = (y0 + y1) / 2;
    fr.box(M, -W / 2 + fw / 2, yc, zc, fw, hh, fd);
    fr.box(M, W / 2 - fw / 2, yc, zc, fw, hh, fd);
    fr.box(M, 0, y1 - fw / 2, zc, W - 2 * fw, fw, fd);
    fr.box(M, 0, y0 + fw / 2, zc, W - 2 * fw, fw, fd);
    const gl = set.get(glass);
    const inner = hh - 2 * fw;
    const n = Math.max(2, Math.round(inner / 0.085));
    const pitch = inner / n;
    for (let i = 0; i < n; i++) {
      const y = y0 + fw + pitch * (i + 0.5);
      const blade = new THREE.Matrix4().makeRotationX(out * -0.7).setPosition(0, y, zc);
      gl.box(M.clone().multiply(blade), 0, 0, 0, W - 2 * fw - 0.004, 0.005, pitch * 1.25);
    }
  }

  // ================================================================================================ sills
  function sills(M: THREE.Matrix4, om: OpeningModel, W: number, t: number, out: 1 | -1, zInnerFrame: number, exterior: boolean) {
    // polished granite sill on the room side, from the frame to a small nosing past the wall face
    const g = set.get(granite);
    const zWall = -out * (t / 2);
    const depth = Math.abs(zWall - zInnerFrame);
    if (depth > 0.01) g.box(M, 0, om.sill + 0.01, (zWall + zInnerFrame) / 2, W - 0.002, 0.02, depth, -1, 'y-');
    g.box(M, 0, om.sill + 0.01, zWall - out * 0.014, W + 0.06, 0.02, 0.028, -1, out > 0 ? 'z+' : 'z-');
    if (exterior) {
      // projecting plaster sill outside
      set.get(trim).box(M, 0, om.sill - 0.03, out * (t / 2 + 0.02), W + 0.12, 0.06, 0.04, -1, out > 0 ? 'z-' : 'z+');
    }
  }
}
