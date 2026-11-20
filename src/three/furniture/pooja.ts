// Pooja mandir: teak temple cabinet with turned pillars, a cusped arch, stepped shikhara with a brass kalash,
// hanging bells, small abstract idols, diyas and a marigold garland.

import * as THREE from 'three';
import { type Kit, type V3 } from './kit';
import { M, isWoody, tint } from './materials';
import { knob } from './parts';
import type { Registry, Spec } from './types';

/** Turned pillar: square plinth, vase base, ringed shaft, capital. */
function pillar(k: Kit, mat: THREE.Material, x: number, z: number, y0: number, y1: number, r: number) {
  const H = y1 - y0;
  k.box(mat, r * 2.5, H * 0.07, r * 2.5, x, y0 + H * 0.035, z, { r: 0.003 });
  k.box(mat, r * 2.5, H * 0.06, r * 2.5, x, y1 - H * 0.03, z, { r: 0.003 });
  const p: [number, number][] = [
    [r * 0.9, 0.07],
    [r * 1.25, 0.09],
    [r * 1.3, 0.13],
    [r * 0.8, 0.2],
    [r * 0.95, 0.22],
    [r * 0.95, 0.24],
    [r * 0.74, 0.26],
    [r * 0.7, 0.55],
    [r * 0.82, 0.57],
    [r * 0.82, 0.59],
    [r * 0.66, 0.61],
    [r * 0.62, 0.82],
    [r * 0.95, 0.86],
    [r * 0.95, 0.88],
    [r * 0.7, 0.9],
    [r * 1.2, 0.94],
  ];
  k.lathe(mat, p.map(([rr, t]): [number, number] => [rr, y0 + t * H]), x, 0, z, { seg: 10 });
}

/** Cusped (multifoil) arch fretwork panel: width w, height hgt, opening scalloped along the bottom. */
function archShape(w: number, hgt: number, rise: number): THREE.Shape {
  const sh = new THREE.Shape();
  const half = w / 2;
  sh.moveTo(-half, 0);
  sh.lineTo(-half, hgt);
  sh.lineTo(half, hgt);
  sh.lineTo(half, 0);
  // scallops from right to left, following a pointed arch envelope
  const n = 7;
  const env = (x: number) => rise * (1 - Math.pow(Math.abs(x) / (half * 0.92), 1.7));
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) xs.push(half * 0.92 - (i / n) * half * 1.84);
  sh.lineTo(xs[0], 0);
  for (let i = 0; i < n; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    const ya = Math.max(0, env(xa));
    const yb = Math.max(0, env(xb));
    const xm = (xa + xb) / 2;
    const ym = Math.max(ya, yb) + rise * 0.2;
    sh.quadraticCurveTo(xm, ym, xb, yb);
  }
  sh.lineTo(-half, 0);
  return sh;
}

/** Small abstract seated idol (lathe silhouette) on a lotus base. */
function idol(k: Kit, mat: THREE.Material, x: number, y: number, z: number, hgt: number) {
  const r = hgt * 0.3;
  k.lathe(
    mat,
    [
      [0, 0],
      [r * 1.15, 0],
      [r * 1.25, hgt * 0.04],
      [r * 0.95, hgt * 0.09],
      [r * 1.0, hgt * 0.13],
      [r * 0.92, hgt * 0.3],
      [r * 0.62, hgt * 0.5],
      [r * 0.4, hgt * 0.6],
      [r * 0.3, hgt * 0.63],
      [r * 0.42, hgt * 0.7],
      [r * 0.44, hgt * 0.77],
      [r * 0.32, hgt * 0.84],
      [r * 0.36, hgt * 0.87],
      [r * 0.12, hgt * 0.97],
      [0, hgt],
    ],
    x,
    y,
    z,
    { seg: 10 },
  );
}

function diya(k: Kit, x: number, y: number, z: number, sc = 1) {
  const brass = M.brass();
  k.lathe(
    brass,
    [
      [0, 0],
      [0.022 * sc, 0],
      [0.024 * sc, 0.004 * sc],
      [0.008 * sc, 0.01 * sc],
      [0.007 * sc, 0.03 * sc],
      [0.03 * sc, 0.04 * sc],
      [0.034 * sc, 0.05 * sc],
      [0.03 * sc, 0.05 * sc],
      [0.024 * sc, 0.043 * sc],
      [0, 0.04 * sc],
    ],
    x,
    y,
    z,
    { seg: 10 },
  );
  // flame
  k.lathe(
    M.glow('#ffb347', 3.2, '#fff2c0'),
    [
      [0, 0],
      [0.006 * sc, 0.004 * sc],
      [0.0075 * sc, 0.011 * sc],
      [0.004 * sc, 0.022 * sc],
      [0, 0.032 * sc],
    ],
    x,
    y + 0.046 * sc,
    z,
    { seg: 8 },
  );
}

function mandir(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const woody = isWoody(color);
  const wood = M.body(color);
  const deep = M.body(tint(color, woody ? -0.2 : -0.06));
  const brass = M.brass();
  const zf = d / 2;
  const baseH = Math.min(0.5, h * 0.32);
  const sanctumTop = h * 0.735;
  const corniceH = Math.min(0.055, h * 0.036);
  // --- base cabinet
  k.bx(deep, -w / 2, w / 2, 0, 0.035, -d / 2, zf, { r: 0.004 });
  k.bx(deep, -w / 2 + 0.012, w / 2 - 0.012, 0.035, 0.06, -d / 2, zf - 0.012, { r: 0.004 });
  const bx = w / 2 - 0.028;
  const bz = zf - 0.03;
  k.bx(wood, -bx, bx, 0.06, baseH - 0.03, -d / 2, bz - 0.014, { r: 0.003 });
  k.bx(M.lam('#1b1a19', 0.9), -bx + 0.01, bx - 0.01, 0.07, baseH - 0.036, bz - 0.016, bz - 0.012, { r: 0 });
  // two drawers over two panelled doors
  const zoneH = baseH - 0.03 - 0.06;
  const drH = zoneH * 0.3;
  const half = bx - 0.004;
  for (const sx of [-1, 1]) {
    const xc = (sx * half) / 2;
    const yd = baseH - 0.03 - drH / 2 - 0.002;
    k.box(wood, half - 0.006, drH - 0.006, 0.016, xc, yd, bz - 0.008, { r: 0.003, grain: 'x' });
    k.box(deep, half - 0.07, drH - 0.05, 0.005, xc, yd, bz + 0.001, { r: 0.002, grain: 'x' });
    knob(k, brass, xc, yd, bz + 0.003, 0.0105);
    const dh = zoneH - drH - 0.004;
    const ydr = 0.06 + dh / 2 + 0.002;
    k.box(wood, half - 0.006, dh - 0.004, 0.016, xc, ydr, bz - 0.008, { r: 0.003, grain: 'y' });
    // raised panel with a diamond motif
    k.box(deep, half - 0.075, dh - 0.075, 0.006, xc, ydr, bz + 0.001, { r: 0.003, grain: 'y' });
    const dm = Math.min(half - 0.16, dh - 0.16) * 0.5;
    if (dm > 0.02) k.box(wood, dm, dm, 0.006, xc, ydr, bz + 0.005, { r: 0.002, rot: [0, 0, Math.PI / 4] });
    knob(k, brass, xc - sx * (half / 2 - 0.035), ydr + dh * 0.28, bz + 0.0, 0.009);
  }
  // --- platform
  k.bx(wood, -w / 2, w / 2, baseH - 0.03, baseH, -d / 2, zf, { r: 0.007, grain: 'x' });
  k.bx(deep, -w / 2 + 0.01, w / 2 - 0.01, baseH - 0.042, baseH - 0.03, -d / 2, zf - 0.01, { r: 0.003 });
  // --- sanctum
  const pr = Math.min(0.026, w * 0.03);
  const px = w / 2 - 0.035 - pr;
  const pzF = zf - 0.035 - pr;
  const pzB = -d / 2 + 0.03 + pr;
  for (const sx of [-1, 1]) {
    pillar(k, wood, sx * px, pzF, baseH, sanctumTop, pr);
    k.cyl(wood, pr * 0.8, sanctumTop - baseH, sx * px, (baseH + sanctumTop) / 2, pzB, { seg: 8 });
  }
  // back panel with a brass sun disc
  k.bx(deep, -px, px, baseH, sanctumTop, -d / 2 + 0.008, -d / 2 + 0.024, { r: 0.002 });
  const cyS = baseH + (sanctumTop - baseH) * 0.56;
  // side jali (lattice) panels
  const jz0 = pzB + pr;
  const jz1 = pzF - pr;
  const jy0 = baseH + (sanctumTop - baseH) * 0.08;
  const jy1 = baseH + (sanctumTop - baseH) * 0.86;
  k.mirrorX(() => {
    k.bx(wood, px - 0.007, px + 0.007, jy0, jy0 + 0.022, jz0, jz1, { r: 0.002 });
    k.bx(wood, px - 0.007, px + 0.007, jy1 - 0.022, jy1, jz0, jz1, { r: 0.002 });
    const nL = Math.max(3, Math.round((jy1 - jy0) / 0.075));
    const run = jz1 - jz0;
    for (let i = 0; i < nL; i++) {
      const y = jy0 + 0.022 + ((jy1 - jy0 - 0.044) * (i + 0.5)) / nL;
      const len = Math.hypot(run, (jy1 - jy0 - 0.044) / nL) * 1.02;
      const ang = Math.atan2((jy1 - jy0 - 0.044) / nL, run);
      for (const sg of [-1, 1]) k.box(wood, 0.008, 0.009, len, px, y, (jz0 + jz1) / 2, { r: 0, rot: [sg * ang, 0, 0] });
    }
  });
  // cusped arch between the front pillars
  const aw = 2 * (px - pr * 0.6);
  const ah = (sanctumTop - baseH) * 0.3;
  k.extrude(wood, archShape(aw, ah, ah * 0.72), 0.022, { at: [0, sanctumTop - ah, pzF - 0.011], bevel: 0.003, curveSeg: 6, grain: 'x' });
  // marigold garland under the arch
  const paint = M.paint(0.75);
  const gn = Math.max(9, Math.round(aw / 0.036));
  for (let i = 0; i <= gn; i++) {
    const t = i / gn;
    const gx = -aw * 0.42 + aw * 0.84 * t;
    const gy = sanctumTop - ah * 0.86 - Math.sin(t * Math.PI) * ah * 0.5;
    k.sphere(paint, 0.0135, gx, gy, pzF + 0.004, { seg: 5, color: i % 3 === 1 ? '#f4c20d' : '#f28c1a' });
  }
  // --- cornice
  k.bx(wood, -w / 2 + 0.01, w / 2 - 0.01, sanctumTop, sanctumTop + corniceH * 0.5, -d / 2, zf - 0.01, { r: 0.005, grain: 'x' });
  k.bx(deep, -w / 2, w / 2, sanctumTop + corniceH * 0.5, sanctumTop + corniceH, -d / 2, zf, { r: 0.006, grain: 'x' });
  // --- shikhara: stepped tiers, amalaka, brass kalash
  const sy0 = sanctumTop + corniceH;
  const finial = Math.min(0.13, h * 0.085);
  const tiers = 4;
  const tH = (h - finial - sy0) / tiers;
  let tw = w - 0.12;
  let td = d - 0.08;
  const zShift = 0;
  for (let i = 0; i < tiers; i++) {
    const nw = tw * (i === tiers - 1 ? 0.5 : 0.78);
    const nd = td * (i === tiers - 1 ? 0.5 : 0.78);
    const y = sy0 + i * tH;
    k.at({ at: [0, 0, zShift] }, () => {
      k.box(deep, tw + 0.024, tH * 0.2, td + 0.024, 0, y + tH * 0.1, 0, { r: 0.004, grain: 'x' });
      k.taper(wood, [tw, td], [nw + 0.01, nd + 0.01], y + tH * 0.2, y + tH);
    });
    tw = nw;
    td = nd;
  }
  const fy = h - finial;
  const ar = Math.min(tw, td);
  k.lathe(wood, [[0, 0], [ar * 0.6, 0], [ar * 0.72, finial * 0.1], [ar * 0.6, finial * 0.22], [0, finial * 0.22]], 0, fy, zShift, { seg: 14 });
  k.lathe(
    brass,
    [
      [0, finial * 0.2],
      [finial * 0.2, finial * 0.2],
      [finial * 0.3, finial * 0.34],
      [finial * 0.3, finial * 0.44],
      [finial * 0.12, finial * 0.6],
      [finial * 0.18, finial * 0.66],
      [finial * 0.1, finial * 0.74],
      [finial * 0.05, finial * 0.9],
      [0, finial],
    ],
    0,
    fy,
    zShift,
    { seg: 14 },
  );
  // --- bells hanging from the arch
  for (const sx of [-1, 1]) {
    const bxp = sx * aw * 0.3;
    const top = sanctumTop - ah * 0.2;
    const by = sanctumTop - ah - 0.035;
    k.rod(brass, [bxp, top, pzF - 0.03], [bxp, by + 0.04, pzF - 0.03], 0.002, { seg: 5 });
    k.lathe(brass, [[0.004, 0.04], [0.008, 0.038], [0.014, 0.026], [0.018, 0.008], [0.026, 0], [0.022, 0], [0.014, 0.01], [0, 0.03]], bxp, by, pzF - 0.03, { seg: 12 });
    k.sphere(brass, 0.006, bxp, by - 0.002, pzF - 0.03, { seg: 6 });
  }
  // --- inside: stepped pedestal, idols, halo, diyas, thali
  const stepW = 2 * px - 0.14;
  k.bx(deep, -stepW / 2, stepW / 2, baseH, baseH + 0.035, -d / 2 + 0.024, -d / 2 + 0.024 + d * 0.4, { r: 0.004, grain: 'x' });
  k.bx(wood, -stepW * 0.36, stepW * 0.36, baseH + 0.035, baseH + 0.075, -d / 2 + 0.024, -d / 2 + 0.024 + d * 0.27, { r: 0.004, grain: 'x' });
  const gold = M.metal('#d4a94a', 0.3, 'gold');
  const iz = -d / 2 + 0.024 + d * 0.14;
  const ih = Math.min(0.17, (sanctumTop - baseH) * 0.3);
  idol(k, gold, 0, baseH + 0.075, iz, ih);
  idol(k, brass, -stepW * 0.36, baseH + 0.035, iz + d * 0.12, ih * 0.66);
  idol(k, brass, stepW * 0.36, baseH + 0.035, iz + d * 0.12, ih * 0.66);
  k.torus(brass, ih * 0.5, 0.004, 0, baseH + 0.075 + ih * 0.5, iz - 0.03, { seg: 20, tseg: 5, arc: Math.PI * 1.3, rot: [0, 0, -Math.PI * 0.15] });
  k.cyl(brass, Math.min(0.09, w * 0.11), 0.004, 0, Math.max(cyS, baseH + 0.075 + ih * 0.5), -d / 2 + 0.026, { axis: 'z', seg: 24 });
  const ts = Math.min(1, d / 0.45, w / 0.6);
  diya(k, -px + 0.09 * ts, baseH, pzF - 0.07 * ts, 1.1 * ts);
  diya(k, px - 0.09 * ts, baseH, pzF - 0.07 * ts, 1.1 * ts);
  // thali with flowers and an incense holder
  const tz = pzF - 0.09 * ts;
  k.lathe(brass, [[0, 0], [0.06 * ts, 0], [0.07 * ts, 0.008], [0.066 * ts, 0.008], [0.058 * ts, 0.003], [0, 0.003]], 0, baseH, tz, { seg: 18 });
  const petals: [number, number, string][] = [
    [-0.02, 0.01, '#f28c1a'],
    [0.022, 0.012, '#d81b60'],
    [0.0, -0.02, '#f4c20d'],
    [0.03, -0.018, '#f7f2e6'],
    [-0.03, -0.012, '#d81b60'],
  ];
  for (const [fx, fz, c] of petals) k.sphere(paint, 0.011 * ts, fx * ts, baseH + 0.012, tz + fz * ts, { seg: 6, color: c });
  const loop: V3 = [stepW * 0.2, baseH, pzF - 0.05];
  k.cyl(brass, 0.014, 0.008, loop[0], loop[1] + 0.004, loop[2], { seg: 10 });
  k.rod(M.lam('#5a4636', 0.9), [loop[0], loop[1] + 0.008, loop[2]], [loop[0] + 0.012, loop[1] + 0.12, loop[2] - 0.01], 0.0015, { seg: 4 });
}

export const pooja: Registry = {
  'pooja-mandir': mandir,
};
