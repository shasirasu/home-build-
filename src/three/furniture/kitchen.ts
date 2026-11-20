// Kitchen: base cabinets + granite counter, sink unit, hob unit, chimney, wall cabinets, refrigerator, microwave,
// RO water purifier. Indian modular-kitchen conventions: 100 mm plinth, 30 mm granite, handle-on-shutter.

import * as THREE from 'three';
import { clamp, roundRectLoop, type Kit, type V3 } from './kit';
import { M, isDark, lum, tint } from './materials';
import { barHandle, lipPull } from './parts';
import type { Registry, Spec } from './types';

const HANDLE = 0.028; // how far handles stand off the shutters; shutters are set back by this under the counter edge

const counterStone = (color: string) => M.stone(isDark(color) ? '#dcd8d0' : '#1a1b1d', 'granite', 0.2);

/** Brushed steel for steel-grey appliances, glossy enamel for black / white / colours. */
function applianceMat(color: string): THREE.Material {
  const l = lum(color);
  return l > 0.5 && l < 0.86 ? M.steel() : M.gloss(color, 0.1);
}

type Module = 'door-l' | 'door-r' | 'drawers';

/** Plinth, carcass, end panels and shutters of a base run. Returns the y of the carcass top and the shutter plane. */
function baseRun(k: Kit, s: Spec, modules: Module[], opts: { top?: boolean } = {}) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const steel = M.steel();
  const plinth = Math.min(0.1, h * 0.12);
  const topT = Math.min(0.03, h * 0.05);
  const zs = d / 2 - HANDLE; // shutter front plane
  const y0 = plinth;
  const y1 = h - topT;
  // plinth (kick board), carcass, end panels
  k.bx(M.lam('#2a2b2d', 0.6), -w / 2 + 0.003, w / 2 - 0.003, 0, plinth + 0.002, -d / 2 + 0.02, zs - 0.07, { r: 0 });
  k.bx(M.lam('#201f1e', 0.9), -w / 2 + 0.004, w / 2 - 0.004, y0, y1, -d / 2 + 0.004, zs - 0.018, { r: 0 });
  k.mirrorX(() => k.bx(body, w / 2 - 0.018, w / 2, y0, y1, -d / 2, zs - 0.0185, { r: 0.002 }));
  if (opts.top !== false) k.bx(counterStone(color), -w / 2, w / 2, y1, h, -d / 2, d / 2, { r: 0.004 });
  // shutters
  const n = modules.length;
  const mw = w / n;
  const zc = zs - 0.009;
  const gap = 0.003;
  for (let i = 0; i < n; i++) {
    const xc = -w / 2 + mw * (i + 0.5);
    const fw = mw - gap;
    const fh = y1 - y0 - gap - 0.004;
    const yc = y0 + gap / 2 + fh / 2;
    const m = modules[i];
    if (m === 'drawers') {
      const hs = [0.2, 0.4, 0.4];
      let y = y0 + gap / 2 + fh;
      for (const f of hs) {
        const dh = fh * f;
        k.box(body, fw, dh - gap, 0.018, xc, y - dh / 2, zc, { r: 0.0025, grain: 'x' });
        barHandle(k, steel, xc, y - Math.min(0.045, dh * 0.3), zs, clamp(fw * 0.42, 0.09, 0.22), false, HANDLE - 0.004, 0.005);
        y -= dh;
      }
    } else {
      k.box(body, fw, fh, 0.018, xc, yc, zc, { r: 0.0025, grain: 'y' });
      const hx = xc + (m === 'door-l' ? 1 : -1) * (fw / 2 - 0.03);
      barHandle(k, steel, hx, y0 + fh - 0.1, zs, 0.13, true, HANDLE - 0.004, 0.005);
    }
  }
  return { y0, y1, zs, plinth, topT };
}

function doorPairs(n: number): Module[] {
  const out: Module[] = [];
  for (let i = 0; i < n; i++) out.push(i % 2 === 0 ? (i === n - 1 ? 'door-r' : 'door-l') : 'door-r');
  return out;
}

function kitchenCounter(k: Kit, s: Spec) {
  const n = Math.max(1, Math.round(s.w / 0.45));
  const mods: Module[] = [];
  let doors = 0;
  for (let i = 0; i < n; i++) {
    if (i % 3 === 0 && n > 1) {
      mods.push('drawers');
      doors = 0;
    } else {
      const last = i === n - 1 || (i + 1) % 3 === 0;
      mods.push(doors % 2 === 0 ? (last ? 'door-r' : 'door-l') : 'door-r');
      doors++;
    }
  }
  if (n === 1) mods[0] = 'door-l';
  baseRun(k, s, mods);
}

/** Pressed-steel bowl with rounded corners, open at the top (seen from inside). */
export function bowl(k: Kit, mat: THREE.Material, cx: number, cz: number, bw: number, bd: number, yTop: number, depth: number) {
  const cr = Math.min(0.05, bw * 0.2, bd * 0.2);
  const ring = (inset: number, y: number, r: number): V3[] => roundRectLoop(bw - 2 * inset, bd - 2 * inset, r, 3).map((p): V3 => [p[0] + cx, y, p[2] + cz]);
  k.loft(mat, [ring(0, yTop, cr), ring(0.004, yTop - depth * 0.55, cr), ring(0.014, yTop - depth + 0.02, cr), ring(0.04, yTop - depth, cr * 0.8)], { inside: true, capEnd: true });
  // waste
  k.cyl(M.chrome(), 0.028, 0.004, cx, yTop - depth + 0.003, cz, { seg: 14 });
  k.cyl(M.lam('#111', 0.5), 0.016, 0.002, cx, yTop - depth + 0.0055, cz, { seg: 10 });
}

/** Stone counter with a rectangular hole (built from four strips). */
export function counterWithHole(k: Kit, mat: THREE.Material, w: number, d: number, y0: number, y1: number, ox0: number, ox1: number, oz0: number, oz1: number) {
  k.bx(mat, -w / 2, w / 2, y0, y1, -d / 2, oz0, { r: 0.002 });
  k.bx(mat, -w / 2, w / 2, y0, y1, oz1, d / 2, { r: 0.002 });
  k.bx(mat, -w / 2, ox0, y0, y1, oz0, oz1, { r: 0 });
  k.bx(mat, ox1, w / 2, y0, y1, oz0, oz1, { r: 0 });
}

function sinkTap(k: Kit, x: number, y: number, z: number, reach: number, height: number) {
  const ch = M.chrome();
  k.cyl(ch, 0.026, 0.012, x, y + 0.006, z, { seg: 14, bevel: 0.003 });
  k.cyl(ch, 0.017, 0.07, x, y + 0.045, z, { seg: 12 });
  // gooseneck
  const top = y + height;
  k.tube(
    ch,
    [
      [x, y + 0.07, z],
      [x, top - 0.07, z],
      [x, top - 0.012, z + reach * 0.22],
      [x, top, z + reach * 0.55],
      [x, top - 0.035, z + reach * 0.92],
      [x, top - 0.1, z + reach],
    ],
    0.011,
    { radial: 8, seg: 22 },
  );
  // spray head
  k.cyl(ch, 0.015, 0.06, x, top - 0.12, z + reach, { seg: 10, bevel: 0.003 });
  // lever
  k.cyl(ch, 0.009, 0.03, x + 0.024, y + 0.058, z, { seg: 8, axis: 'x' });
  k.rod(ch, [x + 0.036, y + 0.058, z], [x + 0.05, y + 0.12, z + 0.012], 0.0055, { seg: 6 });
}

function sinkUnit(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const n = Math.max(1, Math.round(w / 0.5));
  const { y1 } = baseRun(k, s, doorPairs(n), { top: false });
  const stone = counterStone(color);
  const steel = M.steel();
  // sink opening
  const sw = Math.min(w - 0.14, 0.86);
  const sd = Math.min(d - 0.2, 0.44);
  const cz = 0.035;
  counterWithHole(k, stone, w, d, y1, h, -sw / 2, sw / 2, cz - sd / 2, cz + sd / 2);
  // steel rim sitting on the counter
  const rim = 0.014;
  const loop = roundRectLoop(sw + rim, sd + rim, 0.03, 3).map((p): V3 => [p[0], h + 0.0015, p[2] + cz]);
  k.pipe(steel, loop, 0.006, { radial: 4, closed: true, scale: [1, 0.35, 1], at: [0, (h + 0.0015) * 0.65, 0] });
  const two = sw > 0.62;
  const bowlD = 0.2;
  if (two) {
    const bw = (sw - 0.03) / 2;
    k.bx(steel, -0.015, 0.015, h - 0.03, h + 0.001, cz - sd / 2, cz + sd / 2, { r: 0.003 });
    bowl(k, steel, -bw / 2 - 0.015, cz, bw, sd, h - 0.002, bowlD);
    bowl(k, steel, bw / 2 + 0.015, cz, bw, sd, h - 0.002, bowlD);
  } else bowl(k, steel, 0, cz, sw, sd, h - 0.002, bowlD);
  sinkTap(k, 0, h, Math.max(-d / 2 + 0.03, cz - sd / 2 - 0.055), Math.min(0.2, d * 0.34), 0.32);
  // soap dispenser
  k.cyl(M.chrome(), 0.013, 0.05, sw * 0.3, h + 0.025, cz - sd / 2 - 0.055, { seg: 10, bevel: 0.003 });
  k.rod(M.chrome(), [sw * 0.3, h + 0.05, cz - sd / 2 - 0.055], [sw * 0.3, h + 0.062, cz - sd / 2 - 0.02], 0.004, { seg: 6 });
  k.root.userData.overflowTop = 0.32;
}

function burner(k: Kit, x: number, y: number, z: number, sc: number) {
  // drip ring, burner head, cap
  k.lathe(
    M.steel(),
    [
      [0.03 * sc, 0.0],
      [0.074 * sc, 0.0],
      [0.078 * sc, 0.004],
      [0.06 * sc, 0.006],
      [0.03 * sc, 0.003],
    ],
    x,
    y,
    z,
    { seg: 20 },
  );
  k.lathe(
    M.metal('#b9a06a', 0.45, 'brass-burner'),
    [
      [0, 0.002],
      [0.036 * sc, 0.002],
      [0.04 * sc, 0.012],
      [0.036 * sc, 0.02],
      [0, 0.02],
    ],
    x,
    y,
    z,
    { seg: 16 },
  );
  k.cyl(M.iron(), 0.03 * sc, 0.007, x, y + 0.0235, z, { seg: 16, bevel: 0.002 });
  // cast-iron pan support: square frame + four fingers
  const iron = M.iron();
  const a = 0.105 * sc;
  const py = y + 0.02;
  for (const sg of [-1, 1]) {
    k.box(iron, 2 * a, 0.012, 0.011, x, py, z + sg * a, { r: 0.003 });
    k.box(iron, 0.011, 0.012, 2 * a, x + sg * a, py, z, { r: 0.003 });
    k.box(iron, 0.062 * sc, 0.016, 0.009, x + sg * (a - 0.03 * sc), py + 0.01, z, { r: 0, rot: [0, 0, sg * -0.12] });
    k.box(iron, 0.009, 0.016, 0.062 * sc, x, py + 0.01, z + sg * (a - 0.03 * sc), { r: 0, rot: [sg * 0.12, 0, 0] });
    for (const sz of [-1, 1]) k.box(iron, 0.014, 0.02, 0.014, x + sg * a, y + 0.01, z + sz * a, { r: 0 });
  }
}

function hobUnit(k: Kit, s: Spec) {
  const { w, d, h } = s;
  const cols = Math.max(1, Math.round(w / 0.9));
  baseRun(k, s, Array.from({ length: cols }, (): Module => 'drawers'));
  // glass-top hob set into the counter
  const gw = Math.min(w - 0.1, 0.8);
  const gd = Math.min(d - 0.1, 0.5);
  const gz = -0.005;
  k.box(M.smoked('#0c0d0f'), gw, 0.008, gd, 0, h + 0.004, gz, { r: 0.003 });
  k.box(M.steel(), gw + 0.006, 0.006, 0.014, 0, h + 0.003, gz + gd / 2 + 0.004, { r: 0.002 });
  k.box(M.steel(), gw + 0.006, 0.006, 0.01, 0, h + 0.003, gz - gd / 2 - 0.002, { r: 0.002 });
  const y = h + 0.008;
  const bx = gw * 0.31;
  const bs = Math.min(1, gw / 0.78, gd / 0.46);
  burner(k, -bx, y, gz - gd * 0.1, 0.9 * bs);
  burner(k, 0, y, gz - gd * 0.1, 1.08 * bs);
  burner(k, bx, y, gz - gd * 0.1, 0.9 * bs);
  // knobs along the front edge
  for (const i of [-1, 0, 1]) {
    const kx = i * Math.min(0.11, gw * 0.14);
    const kz = gz + gd / 2 - 0.05;
    k.cyl(M.steel(), 0.021, 0.004, kx, y + 0.002, kz, { seg: 16 });
    k.cyl(M.metal('#2a2b2d', 0.4, 'knob'), 0.017, 0.02, kx, y + 0.014, kz, { seg: 16, bevel: 0.004, rTop: 0.015 });
    k.box(M.steel(), 0.003, 0.003, 0.014, kx, y + 0.025, kz - 0.006, { r: 0 });
  }
  k.root.userData.overflowTop = 0.05;
}

function chimney(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = applianceMat(color);
  const dark = M.lam('#161718', 0.5);
  const hood = Math.min(0.06, h * 0.1);
  const zf = d / 2 - 0.002;
  // hood slab
  k.bx(body, -w / 2, w / 2, 0.005, hood, -d / 2, zf, { r: 0.006 });
  // black glass fascia with touch controls
  k.quad(M.smoked(), w - 0.012, hood - 0.016, { at: [0, (hood + 0.005) / 2 + 0.002, zf + 0.0008] });
  const cy = (hood + 0.005) / 2 + 0.002;
  for (let i = -2; i <= 2; i++) {
    if (i === 0) k.box(M.glow('#7fd4ff', 2.4, '#06141a'), 0.034, 0.012, 0.001, 0, cy, zf + 0.0012, { r: 0 });
    else k.cyl(M.glow('#ffffff', 1.6, '#222'), 0.0045, 0.001, i * 0.045 + Math.sign(i) * 0.012, cy, zf + 0.0012, { seg: 8, axis: 'z' });
  }
  // baffle filters + lights underneath
  const fw = (w - 0.2) / 2;
  const fd = d - 0.16;
  for (const sx of [-1, 1]) {
    const fx = sx * (fw / 2 + 0.008);
    k.box(M.metal('#8e9296', 0.4, 'baffle'), fw, 0.005, fd, fx, 0.0035, -0.02, { r: 0.001 });
    const n = Math.max(4, Math.round(fw / 0.035));
    for (let i = 0; i < n; i++) k.box(dark, 0.006, 0.004, fd - 0.04, fx - fw / 2 + (fw / n) * (i + 0.5), 0.002, -0.02, { r: 0 });
    k.cyl(M.glow('#fff3d8', 2.2), 0.022, 0.003, sx * (w / 2 - 0.05), 0.0035, d / 2 - 0.08, { seg: 12 });
  }
  // tapered canopy up to the duct
  const dw = Math.min(0.3, w * 0.36);
  const dd = Math.min(0.26, d * 0.56);
  const neck = Math.min(hood + 0.15, h * 0.34);
  const dz = -d / 2 + dd / 2;
  k.at({ at: [0, 0, -0.001] }, () => k.taper(body, [w - 0.02, d - 0.02], [dw, dd], hood - 0.001, neck, { shift: [0, dz + 0.001] }));
  // telescopic duct cover
  const mid = neck + (h - neck) * 0.5;
  k.bx(body, -dw / 2, dw / 2, neck - 0.002, mid + 0.02, -d / 2, -d / 2 + dd, { r: 0.004 });
  k.bx(body, -dw / 2 + 0.008, dw / 2 - 0.008, mid, h, -d / 2, -d / 2 + dd - 0.008, { r: 0.004 });
  for (let i = 0; i < 4; i++) k.box(dark, dw * 0.5, 0.005, 0.002, 0, h - 0.04 - i * 0.014, -d / 2 + dd - 0.007, { r: 0 });
}

function wallCabinet(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const steel = M.steel();
  const zs = d / 2 - 0.018;
  const y0 = 0.005;
  k.bx(M.lam('#201f1e', 0.9), -w / 2 + 0.004, w / 2 - 0.004, y0 + 0.004, h - 0.004, -d / 2 + 0.004, zs - 0.018, { r: 0 });
  k.mirrorX(() => k.bx(body, w / 2 - 0.018, w / 2, y0, h, -d / 2, zs - 0.0185, { r: 0.002 }));
  k.bx(body, -w / 2 + 0.018, w / 2 - 0.018, h - 0.018, h, -d / 2, zs - 0.0185, { r: 0.002, grain: 'x' });
  k.bx(body, -w / 2 + 0.018, w / 2 - 0.018, y0, y0 + 0.018, -d / 2, zs - 0.0185, { r: 0.002, grain: 'x' });
  // LED strip under the front edge
  k.box(M.glow('#fff1d0', 2.2), w - 0.08, 0.005, 0.012, 0, 0.0025, zs - 0.07, { r: 0 });
  const n = Math.max(1, Math.round(w / 0.6));
  const mw = w / n;
  const gap = 0.003;
  const fh = (h - y0 - gap) / 2;
  for (let i = 0; i < n; i++) {
    const xc = -w / 2 + mw * (i + 0.5);
    const fw = mw - gap;
    const glassBay = n >= 3 && i === Math.floor(n / 2);
    for (let r = 0; r < 2; r++) {
      const yc = y0 + gap / 2 + fh * (r + 0.5);
      if (glassBay) {
        // aluminium frame with frosted glass
        const fr = 0.04;
        const alu = M.metal('#b9bcc0', 0.4, 'aluminium');
        k.box(alu, fw, fr, 0.018, xc, yc + (fh - gap) / 2 - fr / 2, zs - 0.009, { r: 0.002 });
        k.box(alu, fw, fr, 0.018, xc, yc - (fh - gap) / 2 + fr / 2, zs - 0.009, { r: 0.002 });
        for (const sx of [-1, 1]) k.box(alu, fr, fh - gap - 2 * fr, 0.018, xc + sx * (fw / 2 - fr / 2), yc, zs - 0.009, { r: 0.002 });
        k.box(M.glass('#eef3f2', 0.62), fw - 2 * fr, fh - gap - 2 * fr, 0.005, xc, yc, zs - 0.009, { r: 0 });
      } else k.box(body, fw, fh - gap, 0.018, xc, yc, zs - 0.009, { r: 0.0025, grain: 'x' });
    }
    lipPull(k, steel, xc, y0 + 0.012, zs, Math.min(0.3, fw * 0.5));
  }
}

function refrigerator(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const skin = applianceMat(color);
  const steelSkin = lum(color) > 0.5 && lum(color) < 0.86;
  const side = steelSkin ? M.metal(tint(color, -0.18), 0.5, 'fridge-side') : M.gloss(tint(color, isDark(color) ? 0.08 : -0.05), 0.1);
  const dark = M.lam('#141516', 0.6);
  const chrome = M.chrome();
  const proud = 0.036;
  const doorT = 0.06;
  const zb = d / 2 - proud - doorT; // front of the cabinet body
  const foot = 0.03;
  // cabinet
  k.bx(side, -w / 2, w / 2, foot, h - 0.006, -d / 2, zb, { r: 0.008 });
  k.bx(dark, -w / 2 + 0.01, w / 2 - 0.01, foot + 0.005, h - 0.012, zb - 0.002, zb + 0.008, { r: 0 });
  k.bx(dark, -w / 2 + 0.02, w / 2 - 0.02, 0.006, foot + 0.03, zb - 0.06, zb + 0.004, { r: 0.002 });
  for (const sx of [-1, 1]) {
    k.cyl(dark, 0.02, foot, sx * (w / 2 - 0.06), foot / 2, zb - 0.04, { seg: 10 });
    k.cyl(dark, 0.02, foot, sx * (w / 2 - 0.06), foot / 2, -d / 2 + 0.06, { seg: 10 });
  }
  // top hinge cover
  k.bx(M.plastic('#2a2b2d', 0.5), -w / 2 + 0.004, w / 2 - 0.004, h - 0.022, h, zb - 0.06, zb + doorT - 0.004, { r: 0.006 });
  // doors: freezer on top (Indian double-door layout)
  const yBot = foot + 0.045;
  const yTop = h - 0.026;
  const split = yBot + (yTop - yBot) * 0.69;
  const zc = zb + 0.006 + (doorT - 0.006) / 2;
  const door = (y0: number, y1: number) => k.rbox(skin, w - 0.006, y1 - y0, doorT - 0.006, 0, (y0 + y1) / 2, zc, { r: 0.014, seg: 2 });
  door(yBot, split - 0.004);
  door(split + 0.004, yTop);
  const zf = zc + (doorT - 0.006) / 2;
  // kick grille
  k.bx(dark, -w / 2 + 0.012, w / 2 - 0.012, foot, yBot - 0.004, zb, zb + doorT * 0.7, { r: 0.004 });
  for (let i = 0; i < 3; i++) k.box(M.metal('#3a3b3d', 0.5, 'grille'), w - 0.1, 0.004, 0.003, 0, foot + 0.012 + i * 0.011, zb + doorT * 0.7, { r: 0 });
  // handles near the split, on the opening (left) edge
  const hx = -w / 2 + 0.045;
  barHandle(k, chrome, hx, split - 0.03 - Math.min(0.22, (split - yBot) * 0.25), zf, Math.min(0.44, (split - yBot) * 0.5), true, proud - 0.006, 0.008);
  barHandle(k, chrome, hx, split + 0.03 + Math.min(0.11, (yTop - split) * 0.3), zf, Math.min(0.22, (yTop - split) * 0.6), true, proud - 0.006, 0.008);
  // badge + display
  k.box(chrome, 0.07, 0.014, 0.002, w * 0.2, yTop - 0.05, zf + 0.001, { r: 0.001 });
  k.rbox(M.smoked(), 0.11, 0.04, 0.003, w * 0.12, split - 0.09, zf + 0.0008, { r: 0.0014, seg: 1 });
  k.box(M.glow('#7fd4ff', 2.4, '#06141a'), 0.03, 0.012, 0.001, w * 0.12 - 0.022, split - 0.09, zf + 0.0026, { r: 0 });
  k.cyl(M.glow('#ffffff', 1.4, '#222'), 0.004, 0.001, w * 0.12 + 0.03, split - 0.09, zf + 0.0026, { seg: 8, axis: 'z' });
}

function microwave(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const dark = isDark(color);
  const body = dark ? M.gloss(color, 0.1) : M.steel();
  const face = M.plastic(dark ? '#17181a' : '#2a2c2f', 0.35);
  const chrome = M.chrome();
  const proud = 0.026;
  const zf = d / 2 - proud;
  const foot = 0.012;
  k.rbox(body, w, h - foot, d - proud - 0.012, 0, foot + (h - foot) / 2, -proud / 2 - 0.006, { r: 0.008, seg: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(M.rubber(), 0.014, foot, sx * (w / 2 - 0.05), foot / 2, sz * (d / 2 - 0.07) - proud / 2, { seg: 8 });
  // front fascia
  k.box(face, w - 0.008, h - foot - 0.008, 0.012, 0, foot + (h - foot) / 2, zf - 0.006, { r: 0.004 });
  const cw = Math.min(0.13, w * 0.27); // control column
  const dw = w - 0.008 - cw;
  const dx = -w / 2 + 0.004 + dw / 2;
  const yc = foot + (h - foot) / 2;
  const dh = h - foot - 0.03;
  // door glass with a dotted window
  k.quad(M.smoked(), dw - 0.012, dh, { at: [dx, yc, zf + 0.0006] });
  k.quad(M.metal('#3b3d40', 0.35, 'window-mesh'), dw - 0.09, dh - 0.07, { at: [dx - 0.012, yc, zf + 0.0012] });
  barHandle(k, chrome, dx + dw / 2 - 0.03, yc, zf, dh * 0.72, true, proud - 0.006, 0.006);
  // controls
  const cx = w / 2 - 0.004 - cw / 2;
  k.box(M.glow('#8ff0c8', 1.8, '#04140f'), cw - 0.03, 0.03, 0.001, cx, foot + (h - foot) * 0.82, zf + 0.0008, { r: 0 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) k.box(M.plastic('#3a3c40', 0.4), (cw - 0.04) / 2, 0.016, 0.003, cx + (c - 0.5) * ((cw - 0.04) / 2 + 0.006), foot + (h - foot) * (0.66 - r * 0.09), zf + 0.0015, { r: 0.001 });
  k.cyl(chrome, Math.min(0.03, cw * 0.3), 0.016, cx, foot + (h - foot) * 0.22, zf + 0.008, { seg: 18, axis: 'z', bevel: 0.003 });
  k.box(face, 0.004, Math.min(0.03, cw * 0.3) * 1.2, 0.002, cx, foot + (h - foot) * 0.22, zf + 0.0165, { r: 0 });
  // top vents
  for (let i = 0; i < 6; i++) k.box(M.lam('#101112', 0.7), 0.06, 0.001, 0.005, -w * 0.25, h - 0.0004, -d * 0.25 + i * 0.012, { r: 0 });
}

function waterPurifier(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const dark = isDark(color);
  const shell = M.plastic(color, 0.32);
  const accent = M.plastic(dark ? '#2f3237' : '#1f5f7a', 0.3);
  const tapZone = Math.min(0.075, h * 0.16);
  const tankH = (h - tapZone) * 0.44;
  const y1 = tapZone + tankH;
  const zb = -d / 2;
  // back plate against the wall
  k.bx(shell, -w / 2 + 0.01, w / 2 - 0.01, tapZone * 0.4, h - 0.01, zb, zb + 0.02, { r: 0.006 });
  // upper housing
  k.rbox(shell, w, h - y1, d - 0.004, 0, (y1 + h) / 2, 0.002 - 0.002, { r: Math.min(0.03, d * 0.25), seg: 2 });
  // fascia panel + indicators
  const fz = d / 2;
  k.rbox(accent, w * 0.72, (h - y1) * 0.56, 0.006, 0, y1 + (h - y1) * 0.55, fz - 0.003, { r: 0.0029, seg: 1 });
  for (let i = 0; i < 3; i++) k.cyl(M.glow(i === 0 ? '#7dff9a' : i === 1 ? '#7fd4ff' : '#ffb14a', 2.2, '#111'), 0.006, 0.001, (i - 1) * 0.03, y1 + (h - y1) * 0.72, fz + 0.0005, { seg: 8, axis: 'z' });
  k.box(M.chrome(), w * 0.3, 0.012, 0.001, 0, y1 + (h - y1) * 0.42, fz + 0.0005, { r: 0 });
  // transparent storage tank with water
  const tw = w - 0.03;
  const td = d - 0.035;
  k.rbox(M.plastic(tint(color, dark ? 0.2 : -0.08), 0.35), tw + 0.012, 0.016, td + 0.01, 0, tapZone + 0.008, 0.012, { r: 0.006, seg: 1 });
  k.rbox(M.glass('#9fd6ee', 0.34), tw, tankH - 0.012, td, 0, tapZone + 0.014 + (tankH - 0.012) / 2, 0.012, { r: Math.min(0.022, td * 0.2), seg: 2 });
  k.rbox(M.glass('#58b6e6', 0.5), tw - 0.016, (tankH - 0.03) * 0.66, td - 0.016, 0, tapZone + 0.02 + (tankH - 0.03) * 0.33, 0.012, { r: 0.012, seg: 1 });
  // tap
  const ty = tapZone * 0.62;
  k.cyl(shell, 0.014, 0.03, 0, tapZone - 0.012, d / 2 - 0.04, { seg: 10 });
  k.rod(accent, [0, ty, d / 2 - 0.04], [0, ty - 0.006, d / 2 - 0.006], 0.008, { seg: 8 });
  k.cyl(accent, 0.007, tapZone * 0.4, 0, ty - 0.006 - tapZone * 0.2, d / 2 - 0.012, { seg: 8 });
  k.box(accent, 0.03, 0.006, 0.016, 0, ty + 0.014, d / 2 - 0.022, { r: 0.002 });
  // inlet pipe
  k.tube(M.plastic('#e9e9ea', 0.5), [[w * 0.3, tapZone * 0.5, zb + 0.012], [w * 0.31, tapZone * 0.2, zb + 0.01], [w * 0.34, 0.004, zb + 0.008]], 0.004, { radial: 5, seg: 6 });
}

export const kitchen: Registry = {
  'kitchen-counter': kitchenCounter,
  'kitchen-sink-unit': sinkUnit,
  'hob-unit': hobUnit,
  chimney,
  'wall-cabinet': wallCabinet,
  refrigerator,
  microwave,
  'water-purifier': waterPurifier,
};
