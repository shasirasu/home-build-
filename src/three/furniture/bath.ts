// Bathroom: wall-hung WC, washbasin with vanity, backlit mirror, rain shower set, glass partition, geyser, towel rail.

import * as THREE from 'three';
import { clamp, roundRectShape, type Kit, type V3 } from './kit';
import { M, isDark, isWoody, lum, tint } from './materials';
import { barHandle } from './parts';
import type { Registry, Spec } from './types';

/** Sanitary fittings in the catalogue colour: chrome for steel grey, otherwise that metal (black, brass). */
function fittingMetal(color: string): THREE.Material {
  const c = new THREE.Color(color);
  const grey = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 0.08;
  if (grey && lum(color) > 0.55) return M.chrome();
  return M.metal(color, isDark(color) ? 0.32 : 0.2, 'fitting');
}

// ---------------------------------------------------------------------------------------------
// WC

/** D-shaped outline: squarish toward the wall (z0), egg-shaped toward the front (z1). */
function wcRing(a: number, z0: number, z1: number, y: number, n = 22): V3[] {
  const zc = z0 + (z1 - z0) * 0.4;
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    if (s >= 0) out.push([a * c, y, zc + (z1 - zc) * s]);
    else out.push([a * Math.sign(c) * Math.pow(Math.abs(c), 0.42), y, zc - (zc - z0) * Math.pow(-s, 0.42)]);
  }
  return out;
}

function wc(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const china = M.ceramic(color);
  const a = w / 2 - 0.006;
  const zb = -d / 2;
  const zf = d / 2 - 0.006;
  const L = zf - zb;
  const rimY = Math.min(0.39, h * 0.5);
  const y0 = Math.min(0.1, rimY * 0.28);
  const H = rimY - y0;
  // pan: hangs off the wall, sweeping back underneath
  k.loft(
    china,
    [
      wcRing(a * 0.5, zb, zb + L * 0.42, y0),
      wcRing(a * 0.68, zb, zb + L * 0.58, y0 + H * 0.12),
      wcRing(a * 0.88, zb, zb + L * 0.8, y0 + H * 0.42),
      wcRing(a * 0.97, zb, zb + L * 0.95, y0 + H * 0.74),
      wcRing(a, zb, zf, y0 + H * 0.93),
      wcRing(a * 0.99, zb, zf - 0.003, rimY),
    ],
    { capStart: true, capEnd: true },
  );
  // seat and lid (closed), each a separate slab so the shadow gaps read
  const hz = zb + 0.075; // seat starts in front of the hinge
  k.loft(china, [wcRing(a * 0.985, hz, zf - 0.004, rimY + 0.003), wcRing(a * 0.985, hz, zf - 0.004, rimY + 0.016)], { capStart: true, capEnd: true });
  k.loft(
    china,
    [
      wcRing(a * 0.995, hz - 0.004, zf - 0.001, rimY + 0.019),
      wcRing(a * 0.995, hz - 0.004, zf - 0.001, rimY + 0.03),
      wcRing(a * 0.965, hz + 0.002, zf - 0.008, rimY + 0.04),
      wcRing(a * 0.8, hz + 0.03, zf - 0.05, rimY + 0.045),
    ],
    { capStart: true, capEnd: true },
  );
  // hinges
  const ch = M.chrome();
  for (const sx of [-1, 1]) k.cyl(ch, 0.011, 0.04, sx * a * 0.42, rimY + 0.02, hz - 0.018, { axis: 'x', seg: 10, bevel: 0.003 });
  // dual flush plate on the wall
  const pw = Math.min(0.25, w * 0.66);
  const ph = Math.min(0.16, h - rimY - 0.11);
  const py = h - ph / 2 - 0.006;
  if (ph > 0.06) {
    k.rbox(M.metal('#dfe1e3', 0.28, 'flush-plate'), pw, ph, 0.012, 0, py, zb + 0.006, { r: 0.0058, seg: 2 });
    k.rbox(ch, pw * 0.5, ph * 0.56, 0.006, -pw * 0.19, py, zb + 0.0135, { r: 0.0029, seg: 1 });
    k.rbox(ch, pw * 0.25, ph * 0.56, 0.006, pw * 0.25, py, zb + 0.0135, { r: 0.0029, seg: 1 });
  }
}

// ---------------------------------------------------------------------------------------------
// washbasin with vanity

function pillarTap(k: Kit, mat: THREE.Material, x: number, y: number, z: number, height: number, reach: number) {
  k.cyl(mat, 0.026, 0.01, x, y + 0.005, z, { seg: 14, bevel: 0.003 });
  k.cyl(mat, 0.019, height, x, y + height / 2, z, { seg: 14, bevel: 0.004 });
  k.rod(mat, [x, y + height - 0.03, z], [x, y + height - 0.05, z + reach], 0.0105, { seg: 8 });
  k.cyl(mat, 0.0125, 0.012, x, y + height - 0.054, z + reach - 0.006, { seg: 8 });
  // lever
  k.cyl(mat, 0.014, 0.014, x, y + height + 0.007, z, { seg: 10, bevel: 0.003 });
  k.rod(mat, [x, y + height + 0.01, z], [x, y + height + 0.022, z + 0.075], 0.006, { seg: 6 });
}

function washbasin(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const dark = M.lam('#1b1a19', 0.9);
  const metal = isDark(color) ? M.brass() : M.black();
  const basinH = Math.min(0.13, h * 0.16);
  const ct = h - basinH; // counter top
  const legH = Math.min(0.16, ct * 0.24);
  const zs = d / 2 - 0.028;
  // legs
  const legW = M.wood(isWoody(color) ? tint(color, -0.12) : '#b08a62');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(legW, 0.014, legH + 0.01, sx * (w / 2 - 0.05), (legH + 0.01) / 2, sz * (d / 2 - 0.06) - 0.012, { rTop: 0.021, seg: 10 });
  // carcass with a drawer and an open towel shelf
  const t = 0.018;
  k.mirrorX(() => k.bx(body, w / 2 - 0.004 - t, w / 2 - 0.004, legH, ct - 0.02, -d / 2, zs - 0.018, { r: 0.003 }));
  k.bx(body, -w / 2 + 0.004 + t, w / 2 - 0.004 - t, legH, legH + t, -d / 2, zs - 0.018, { r: 0.003, grain: 'x' });
  k.bx(body, -w / 2 + 0.004 + t, w / 2 - 0.004 - t, legH + t, ct - 0.02, -d / 2 + 0.002, -d / 2 + 0.012, { r: 0 });
  const dh = Math.min(0.22, (ct - legH) * 0.42);
  const dy0 = ct - 0.022 - dh;
  k.bx(dark, -w / 2 + 0.01, w / 2 - 0.01, dy0, ct - 0.02, -d / 2 + 0.012, zs - 0.02, { r: 0 });
  k.box(body, w - 0.012, dh - 0.004, 0.018, 0, dy0 + dh / 2, zs - 0.009, { r: 0.003, grain: 'x' });
  barHandle(k, metal, 0, dy0 + dh / 2 + dh * 0.18, zs, Math.min(0.2, w * 0.36), false, 0.024, 0.005);
  // towels on the shelf
  const ty = legH + t;
  if (dy0 - ty > 0.1) {
    const tw = Math.min(0.24, w * 0.4);
    const cols = ['#e8e2d6', '#9fb1ae', '#e8e2d6'];
    for (let i = 0; i < 3; i++) {
      if (ty + 0.04 * (i + 1) > dy0 - 0.02) break;
      k.soft(M.fabric(cols[i]), tw, 0.04, Math.min(0.3, d * 0.62), -w * 0.14, ty + 0.02 + i * 0.04, -0.03, { r: 0.016, seg: [1, 1, 1], cs: 1 });
    }
    k.cyl(M.fabric('#d9cfbd'), 0.045, Math.min(0.26, d * 0.56), w * 0.2, ty + 0.045, -0.03, { axis: 'z', seg: 12, bevel: 0.012 });
  }
  // counter
  k.bx(M.stone('#eeebe5', 'marble', 0.2), -w / 2, w / 2, ct - 0.02, ct, -d / 2, d / 2, { r: 0.004 });
  // counter-top basin
  const R = Math.max(0.03, Math.min(0.2, w / 2 - 0.07, (d - 0.11) / 2));
  const bz = d / 2 - 0.022 - R;
  const bh = basinH - 0.004;
  k.lathe(
    M.ceramic('#f7f7f5'),
    [
      [R * 0.45, 0],
      [R * 0.6, 0.004],
      [R * 0.9, bh * 0.55],
      [R, bh - 0.004],
      [R - 0.004, bh],
      [R - 0.012, bh],
      [R - 0.016, bh - 0.006],
      [R * 0.82, bh * 0.5],
      [R * 0.4, 0.022],
      [0.03, 0.016],
      [0, 0.016],
    ],
    0,
    ct,
    bz,
    { seg: 32 },
  );
  k.cyl(M.chrome(), 0.022, 0.004, 0, ct + 0.019, bz, { seg: 14 });
  pillarTap(k, M.chrome(), 0, ct, Math.max(-d / 2 + 0.03, bz - R - 0.04), bh + 0.11, R * 0.72 + 0.04);
  k.root.userData.overflowTop = 0.13;
}

// ---------------------------------------------------------------------------------------------
// mirror (backlit)

function mirror(k: Kit, s: Spec) {
  const { w, d, h } = s;
  const zb = -d / 2;
  const r = Math.min(0.02, w * 0.05, h * 0.05);
  const plateT = Math.min(0.008, d * 0.3);
  // light box behind (the halo)
  const inset = Math.min(0.035, w * 0.08);
  k.bx(M.glow('#fff0d2', 1.6), -w / 2 + inset, w / 2 - inset, inset, h - inset, zb, d / 2 - plateT, { r: 0.002 });
  // bevelled plate
  k.extrude(M.mirror(), roundRectShape(w, h, r), plateT, { at: [0, h / 2, d / 2 - plateT], bevel: Math.min(0.003, plateT * 0.4), bevelSeg: 1, curveSeg: 5 });
  // frosted lit band on the face
  const b0 = Math.min(0.045, w * 0.1);
  const bw = 0.012;
  const band = roundRectShape(w - 2 * b0, h - 2 * b0, Math.max(0.004, r - 0.006));
  band.holes.push(new THREE.Path(roundRectShape(w - 2 * b0 - 2 * bw, h - 2 * b0 - 2 * bw, Math.max(0.002, r - 0.012)).getPoints(5).reverse()));
  k.extrude(M.glow('#fff4e0', 1.9), band, 0.0006, { at: [0, h / 2, d / 2 - 0.0002], curveSeg: 5 });
}

// ---------------------------------------------------------------------------------------------
// rain shower set

function shower(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const metal = fittingMetal(color);
  const zb = -d / 2;
  const zr = zb + 0.042; // riser centre line
  // diverter mixer
  const my = Math.min(0.17, h * 0.16);
  k.cyl(metal, Math.min(0.075, w * 0.3), 0.01, 0, my, zb + 0.005, { axis: 'z', seg: 24, bevel: 0.003 });
  k.cyl(metal, 0.032, 0.05, 0, my, zb + 0.035, { axis: 'z', seg: 16, bevel: 0.004 });
  k.rod(metal, [0, my, zb + 0.055], [0.05, my - 0.035, zb + 0.07], 0.0075, { seg: 8 });
  k.cyl(metal, 0.012, 0.03, -0.045, my - 0.035, zb + 0.022, { axis: 'z', seg: 10, bevel: 0.003 });
  // riser and arm
  const R = Math.max(0.03, Math.min(0.1, w / 2 - 0.02, d / 2 - 0.06));
  const zh = d / 2 - R - 0.004;
  const topY = h - 0.02;
  k.pipe(
    metal,
    [
      [0, my + 0.02, zr],
      [0, topY, zr],
      [0, topY, zh],
    ],
    0.011,
    { radial: 10, fillet: 0.06, cornerSeg: 5 },
  );
  // wall bracket for the riser
  const by = h * 0.74;
  k.rod(metal, [0, by, zb], [0, by, zr], 0.008, { seg: 8 });
  k.cyl(metal, 0.022, 0.006, 0, by, zb + 0.003, { axis: 'z', seg: 14 });
  k.cyl(metal, 0.016, 0.03, 0, by, zr, { seg: 10, bevel: 0.003 });
  // overhead rain shower
  k.sphere(metal, 0.015, 0, topY - 0.022, zh, { seg: 10 });
  k.cyl(metal, 0.009, 0.03, 0, topY - 0.02, zh, { seg: 8 });
  k.lathe(
    metal,
    [
      [0, -0.012],
      [R - 0.003, -0.012],
      [R, -0.009],
      [R, -0.003],
      [R - 0.02, 0.0],
      [0.02, 0.006],
      [0, 0.006],
    ],
    0,
    topY - 0.04,
    zh,
    { seg: 32 },
  );
  k.cyl(M.rubber(), R - 0.012, 0.002, 0, topY - 0.053, zh, { seg: 28 });
  // hand shower on a slider + hose
  const hy = Math.min(0.62, h * 0.48);
  const hx = Math.min(0.05, w / 2 - 0.05);
  k.box(metal, 0.03, 0.045, 0.03, 0, hy, zr, { r: 0.006 });
  k.rod(metal, [0, hy, zr], [hx, hy, zr + 0.03], 0.008, { seg: 8 });
  const hBot = Math.max(hy - 0.2, hy * 0.45);
  k.rod(metal, [hx, hBot, zr + 0.055], [hx, hy + 0.03, zr + 0.03], 0.0085, { seg: 8, rTop: 0.01 });
  k.cyl(metal, 0.036, 0.018, hx, hy + 0.055, zr + 0.043, { axis: 'z', seg: 16, bevel: 0.004, rot: [-0.5, 0, 0] });
  k.tube(
    M.metal('#b9bcc0', 0.35, 'hose'),
    [
      [0.02, Math.max(0.03, my - 0.03), zb + 0.03],
      [0.035, 0.025, zr + 0.01],
      [Math.min(0.12, w / 2 - 0.02), Math.min(0.07, h * 0.06), zr + 0.03],
      [Math.min(0.11, w / 2 - 0.03), Math.max(hy - 0.33, hBot * 0.6), zr + 0.05],
      [hx, hBot, zr + 0.055],
    ],
    0.006,
    { radial: 6, seg: 22 },
  );
}

// ---------------------------------------------------------------------------------------------
// glass partition

function glassPartition(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const steel = M.steel();
  const gt = Math.min(0.01, d * 0.3);
  const y0 = 0.012;
  // toughened glass, polished edges a little denser, etched privacy band
  k.box(M.glass(color, 0.2), w - 0.004, h - y0, gt, 0, (h + y0) / 2, 0, { r: 0.0015 });
  const edge = M.glass(tint(color, -0.3), 0.5);
  k.box(edge, w - 0.002, 0.003, gt + 0.001, 0, h - 0.0015, 0, { r: 0 });
  for (const sx of [-1, 1]) k.box(edge, 0.003, h - y0, gt + 0.001, sx * (w / 2 - 0.0015), (h + y0) / 2, 0, { r: 0 });
  const bandH = Math.min(0.5, h * 0.25);
  k.box(M.glass('#f4f8f8', 0.42), w - 0.006, bandH, gt + 0.0012, 0, Math.min(1.15, h * 0.56), 0, { r: 0 });
  // floor channel + clamps
  k.box(steel, w, 0.022, Math.min(d, 0.03), 0, 0.011, 0, { r: 0.003 });
  const cl = Math.min(0.05, w * 0.2);
  for (const sx of [-1, 1])
    for (const cy of [Math.min(0.3, h * 0.15), h - Math.min(0.3, h * 0.15)]) {
      k.box(steel, cl, cl, Math.min(d, 0.036), sx * (w / 2 - cl / 2), cy, 0, { r: 0.006 });
      k.cyl(M.chrome(), 0.006, Math.min(d, 0.04), sx * (w / 2 - cl / 2), cy, 0, { axis: 'z', seg: 8 });
    }
}

// ---------------------------------------------------------------------------------------------
// geyser

function geyser(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const R = Math.min(w, d) / 2 - 0.012;
  const cz = -d / 2 + R + 0.002;
  const y0 = Math.min(0.07, h * 0.14);
  const shell = M.gloss(color, 0.05);
  const dome = Math.min(0.1, (h - y0) * 0.22);
  // capsule tank: quarter-ellipse domes top and bottom
  const prof: [number, number][] = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    prof.push([R * Math.sin(a), y0 + dome * (1 - Math.cos(a))]);
  }
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * (Math.PI / 2);
    prof.push([R * Math.sin(a), h - dome * (1 - Math.cos(a))]);
  }
  k.lathe(shell, prof, 0, 0, cz, { seg: 32 });
  // accent band + control fascia
  const band = M.plastic('#2e6f8e', 0.35);
  k.lathe(band, [[R + 0.0015, y0 + dome + 0.01], [R + 0.003, y0 + dome + 0.02], [R + 0.003, y0 + dome + 0.05], [R + 0.0015, y0 + dome + 0.06]], 0, 0, cz, { seg: 32 });
  const fy = y0 + dome + (h - 2 * dome - y0) * 0.36 + 0.03;
  k.cyl(M.plastic('#22252a', 0.3), R * 0.36, 0.03, 0, fy, cz + R - 0.012, { axis: 'z', seg: 24, bevel: 0.006 });
  k.cyl(M.chrome(), 0.024, 0.014, 0, fy - 0.008, cz + R + 0.004, { axis: 'z', seg: 18, bevel: 0.004 });
  k.box(M.plastic('#22252a', 0.3), 0.004, 0.018, 0.002, 0, fy - 0.002, cz + R + 0.0115, { r: 0 });
  k.cyl(M.glow('#ff5a3c', 2.4, '#300'), 0.005, 0.002, -R * 0.2, fy + R * 0.2, cz + R + 0.0035, { axis: 'z', seg: 8 });
  k.cyl(M.glow('#6dff8a', 2.0, '#030'), 0.005, 0.002, R * 0.2, fy + R * 0.2, cz + R + 0.0035, { axis: 'z', seg: 8 });
  k.box(M.chrome(), R * 0.5, 0.012, 0.002, 0, h - dome - 0.05, cz + R + 0.0006, { r: 0 });
  // inlet / outlet stubs with braided hoses, drain cock
  const ch = M.chrome();
  for (const sx of [-1, 1]) {
    const px = sx * R * 0.38;
    k.cyl(ch, 0.011, y0 * 0.75, px, y0 * 0.72, cz, { seg: 10 });
    k.cyl(ch, 0.016, 0.014, px, y0 * 0.42, cz, { seg: 6 });
    k.tube(M.metal('#b9bcc0', 0.4, 'hose'), [[px, y0 * 0.36, cz], [px, y0 * 0.12, cz - R * 0.3], [px * 1.05, 0.011, -d / 2 + 0.012]], 0.007, { radial: 6, seg: 8 });
    k.box(M.plastic(sx < 0 ? '#2e6fd0' : '#d0402e', 0.4), 0.026, 0.004, 0.026, px, y0 * 0.9, cz, { r: 0 });
  }
  // wall bracket
  k.box(M.metal('#8e9296', 0.5, 'bracket'), R * 1.1, 0.03, 0.012, 0, h - dome - 0.02, -d / 2 + 0.006, { r: 0.002 });
}

// ---------------------------------------------------------------------------------------------
// towel rail

function towelRail(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const metal = fittingMetal(color);
  const zb = -d / 2;
  const r = clamp(Math.min(h, d) * 0.1, 0.008, 0.012);
  const y = h * 0.52;
  const zr = d / 2 - r - 0.004;
  const px = w / 2 - Math.min(0.045, w * 0.1);
  const fr = Math.min(0.028, h * 0.45);
  k.cyl(metal, r, w - 0.012, 0, y, zr, { axis: 'x', seg: 12, bevel: 0.003 });
  for (const sx of [-1, 1]) {
    k.cyl(metal, fr, 0.008, sx * px, y, zb + 0.004, { axis: 'z', seg: 18, bevel: 0.002 });
    k.cyl(metal, fr * 0.55, 0.014, sx * px, y, zb + 0.014, { axis: 'z', seg: 12 });
    k.rod(metal, [sx * px, y, zb + 0.016], [sx * px, y, zr], r * 0.85, { seg: 10 });
    k.sphere(metal, r * 1.25, sx * px, y, zr, { seg: 10 });
  }
  // second bar behind, a little lower, when there is depth for it
  if (d > 0.085 && h > 0.09) k.cyl(metal, r * 0.8, 2 * px, 0, y - Math.min(0.035, h * 0.3), zb + (zr - zb) * 0.5, { axis: 'x', seg: 10 });
}

export const bath: Registry = {
  wc,
  washbasin,
  mirror,
  shower,
  'glass-partition': glassPartition,
  geyser,
  'towel-rail': towelRail,
};
