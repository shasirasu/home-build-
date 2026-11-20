// Small reusable pieces: handles, knobs, legs, books, vases. All face +Z unless noted.

import * as THREE from 'three';
import { fixWinding, type Kit } from './kit';
import { M } from './materials';

/** Bar handle standing `proud` off a front face at z. */
export function barHandle(k: Kit, mat: THREE.Material, x: number, y: number, z: number, len: number, vertical = false, proud = 0.028, r = 0.005) {
  const off = len / 2 - Math.min(0.03, len * 0.2);
  if (vertical) {
    k.cyl(mat, r, len, x, y, z + proud, { seg: 8, bevel: 0.0015 });
    for (const s of [-1, 1]) k.cyl(mat, r * 0.8, proud, x, y + s * off, z + proud / 2, { axis: 'z', seg: 6 });
  } else {
    k.cyl(mat, r, len, x, y, z + proud, { seg: 8, bevel: 0.0015, axis: 'x' });
    for (const s of [-1, 1]) k.cyl(mat, r * 0.8, proud, x + s * off, y, z + proud / 2, { axis: 'z', seg: 6 });
  }
}

/** Round mushroom knob on a front face at z. */
export function knob(k: Kit, mat: THREE.Material, x: number, y: number, z: number, r = 0.014) {
  k.lathe(
    mat,
    [
      [0, 0],
      [r * 0.42, 0],
      [r * 0.36, r * 0.8],
      [r, r * 1.1],
      [r, r * 1.5],
      [r * 0.7, r * 1.9],
      [0, r * 2.0],
    ],
    x,
    y,
    z,
    { seg: 8, rot: [Math.PI / 2, 0, 0] },
  );
}

/** Slim edge / lip pull along x on a front face at z. */
export function lipPull(k: Kit, mat: THREE.Material, x: number, y: number, z: number, len: number, vertical = false) {
  if (vertical) k.box(mat, 0.012, len, 0.016, x, y, z + 0.008, { r: 0.002 });
  else k.box(mat, len, 0.012, 0.016, x, y, z + 0.008, { r: 0.002 });
}

/** Tapered round leg from y0 (floor) up to y1. */
export function roundLeg(k: Kit, mat: THREE.Material, x: number, z: number, y0: number, y1: number, rTop: number, rBot: number, seg = 10) {
  k.cyl(mat, rBot, y1 - y0, x, (y0 + y1) / 2, z, { rTop, seg, bevel: 0.002 });
}

const BOOK_COLORS = ['#7a2e2a', '#1f3b57', '#2f5d50', '#c9a227', '#e8e0d0', '#3b3b3b', '#8c5a3c', '#b65c3a', '#5a4a78', '#d9d2c4', '#27455c', '#a43d3d', '#4f6d7a', '#e3c770', '#6f7f5e', '#c7b8a1'];

/** Vase / bottle silhouette by lathe. */
export function vase(k: Kit, mat: THREE.Material, x: number, y: number, z: number, h: number, r: number, style = 0) {
  const p: [number, number][] =
    style === 0
      ? [
          [0, 0],
          [r * 0.55, 0],
          [r, h * 0.3],
          [r * 0.9, h * 0.55],
          [r * 0.38, h * 0.82],
          [r * 0.45, h],
          [r * 0.36, h],
          [r * 0.3, h * 0.84],
          [0, h * 0.8],
        ]
      : style === 1
        ? [
            [0, 0],
            [r * 0.7, 0],
            [r * 0.85, h * 0.1],
            [r, h * 0.55],
            [r * 0.8, h * 0.9],
            [r * 0.6, h],
            [r * 0.5, h],
            [0, h * 0.92],
          ]
        : [
            [0, 0],
            [r, 0],
            [r, h * 0.04],
            [r * 0.82, h * 0.5],
            [r, h],
            [r * 0.9, h],
            [r * 0.7, h * 0.55],
            [0, h * 0.1],
          ];
  k.lathe(mat, p, x, y, z, { seg: 14 });
}

/**
 * Fill a shelf span with books (upright runs, lying stacks) and the odd object.
 * x0..x1 = clear span, y = shelf top, zBack..zFront = usable depth, hMax = clear height.
 */
export function books(k: Kit, x0: number, x1: number, y: number, zBack: number, zFront: number, hMax: number, o: { fill?: number; objects?: boolean } = {}) {
  const paint = M.paint(0.75);
  const depth = zFront - zBack;
  const fill = o.fill ?? 0.8;
  let x = x0 + 0.01 + k.r(0, 0.03);
  const end = x0 + (x1 - x0) * (fill + k.r(-0.12, 0.12));
  while (x < Math.min(end, x1 - 0.03)) {
    const roll = k.rnd();
    if (roll < 0.66) {
      // upright run
      const n = 2 + Math.floor(k.rnd() * 6);
      const baseH = hMax * k.r(0.62, 0.9);
      for (let i = 0; i < n && x < x1 - 0.03; i++) {
        const t = k.r(0.016, 0.042);
        const bh = Math.min(hMax - 0.01, baseH * k.r(0.86, 1.08));
        const bd = Math.min(depth - 0.02, k.r(0.13, 0.2));
        const col = k.pick(BOOK_COLORS);
        const zc = zFront - 0.015 - bd / 2;
        const wantLean = i === n - 1 && k.rnd() < 0.35 ? -k.r(0.12, 0.22) : 0;
        const lean = wantLean && x + t + bh * Math.sin(-wantLean) * 1.1 < x1 - 0.012 ? wantLean : 0;
        const dx = lean ? (bh / 2) * Math.sin(-lean) : 0;
        k.box(paint, t, bh, bd, x + t / 2 + dx, y + (bh / 2) * Math.cos(lean), zc, { r: 0, color: col, rot: [0, 0, lean] });
        if (k.rnd() < 0.45 && !lean) k.box(paint, t * 0.72, 0.028, 0.002, x + t / 2, y + bh * k.r(0.55, 0.8), zFront - 0.015, { r: 0, color: k.rnd() < 0.5 ? '#e9dfc7' : '#caa64a' });
        x += t + 0.0015 + (lean ? bh * Math.sin(-lean) : 0);
      }
      x += k.r(0.0, 0.03);
    } else if (roll < 0.84) {
      // lying stack
      const n = 2 + Math.floor(k.rnd() * 3);
      const len = Math.min(k.r(0.19, 0.26), x1 - x - 0.02);
      if (len < 0.12) break;
      let yy = y;
      for (let i = 0; i < n; i++) {
        const t = k.r(0.018, 0.04);
        if (yy + t > y + hMax - 0.02) break;
        const bl = len * k.r(0.82, 0.94);
        const bd = Math.min(depth - 0.02, k.r(0.14, 0.19));
        k.box(paint, bl, t, bd, x + len / 2 + k.r(-0.008, 0.008), yy + t / 2, zFront - 0.02 - bd / 2, { r: 0.0015, color: k.pick(BOOK_COLORS), rot: [0, k.r(-0.06, 0.06), 0] });
        yy += t;
      }
      if (o.objects !== false && k.rnd() < 0.5 && yy + 0.09 < y + hMax) k.sphere(M.brass(), 0.03, x + len / 2, yy + 0.03, zFront - 0.02 - depth * 0.35, { seg: 10 });
      x += len + k.r(0.02, 0.05);
    } else if (o.objects !== false) {
      const kind = Math.floor(k.rnd() * 3);
      const hgt = Math.min(hMax - 0.03, k.r(0.14, 0.24));
      const r = Math.min(k.r(0.04, 0.06), depth * 0.3);
      if (x + r * 2 > x1 - 0.02) break;
      const zc = zFront - depth * 0.45;
      if (kind === 0) vase(k, M.ceramic(k.pick(['#e9e4da', '#2f4a57', '#b4633e', '#d9b44a'])), x + r, y, zc, hgt, r, Math.floor(k.rnd() * 2));
      else if (kind === 1) {
        // photo frame leaning back
        const fw = Math.min(0.15, x1 - x - 0.03);
        const fh = Math.min(hMax - 0.04, 0.2);
        k.box(M.wood('#5a3d28'), fw, fh, 0.014, x + fw / 2, y + fh / 2 - 0.002, zc, { r: 0.002, rot: [-0.16, 0, 0] });
        k.box(paint, fw - 0.03, fh - 0.03, 0.004, x + fw / 2, y + fh / 2 - 0.002, zc + 0.007, { r: 0, rot: [-0.16, 0, 0], color: '#d8d3c8' });
      } else {
        // storage box
        const bw = Math.min(0.2, x1 - x - 0.03);
        const bh = Math.min(hMax - 0.05, 0.13);
        k.box(M.fabric('#b9a88f'), bw, bh, Math.min(depth - 0.04, 0.2), x + bw / 2, y + bh / 2, zc - 0.02, { r: 0.006 });
        k.box(M.brass(), 0.05, 0.012, 0.004, x + bw / 2, y + bh * 0.62, zc - 0.02 + Math.min(depth - 0.04, 0.2) / 2, { r: 0.001 });
      }
      x += (kind === 0 ? r * 2 : kind === 1 ? Math.min(0.15, x1 - x - 0.03) : Math.min(0.2, x1 - x - 0.03)) + k.r(0.03, 0.06);
    } else x += 0.05;
  }
}

/** Reeded / fluted panel facing +Z: convex half-round ribs running vertically. Centred on (0,0), back at z = 0. */
export function flutedGeo(w: number, h: number, pitch = 0.02, depth = 0.008): THREE.BufferGeometry {
  const n = Math.max(1, Math.round(w / pitch));
  const p = w / n;
  const arc = 4;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (i + 0.5) * p;
    const base = pos.length / 3;
    for (let a = 0; a <= arc; a++) {
      const t = Math.PI * (1 - a / arc); // 180° → 0°
      const nx = Math.cos(t);
      const nz = Math.sin(t);
      const x = cx + (p / 2) * nx;
      const z = depth * nz;
      for (const y of [-h / 2, h / 2]) {
        pos.push(x, y, z);
        const nn = Math.hypot(nx * depth, nz * (p / 2)) || 1;
        nor.push((nx * depth) / nn, 0, (nz * (p / 2)) / nn);
        uv.push(y, x);
      }
    }
    for (let a = 0; a < arc; a++) {
      const q = base + a * 2;
      idx.push(q, q + 2, q + 3, q, q + 3, q + 1);
    }
    // caps (top and bottom half discs)
    for (const s of [0, 1]) {
      const cb = pos.length / 3;
      const y = s ? h / 2 : -h / 2;
      for (let a = 0; a <= arc; a++) {
        const t = Math.PI * (1 - a / arc);
        pos.push(cx + (p / 2) * Math.cos(t), y, depth * Math.sin(t));
        nor.push(0, s ? 1 : -1, 0);
        uv.push(0, 0);
      }
      for (let a = 1; a < arc; a++) {
        if (s) idx.push(cb, cb + a + 1, cb + a);
        else idx.push(cb, cb + a, cb + a + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  fixWinding(geo);
  return geo;
}
