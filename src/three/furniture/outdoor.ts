// Outdoor: jhoola (hanging swing), bougainvillea planter. The car lives in car.ts.

import * as THREE from 'three';
import { clamp, roundRectLoop, type Kit, type V3 } from './kit';
import { M, isWoody, tint } from './materials';
import { ovateLeaf } from './decor';
import { car } from './car';
import type { Registry, Spec } from './types';

// ---------------------------------------------------------------------------------------------
// jhoola

/** Turned spindle between y0 and y1. */
function spindle(k: Kit, mat: THREE.Material, x: number, z: number, y0: number, y1: number, r: number, seg = 6) {
  const H = y1 - y0;
  const p: [number, number][] = [
    [r * 0.55, 0],
    [r * 0.95, 0.12],
    [r * 0.5, 0.22],
    [r, 0.5],
    [r * 0.5, 0.78],
    [r * 0.95, 0.88],
    [r * 0.55, 1],
  ];
  k.lathe(mat, p.map(([rr, t]): [number, number] => [rr, y0 + t * H]), x, 0, z, { seg });
}

/** Brass swing chain from (x, y0, z) straight up to y1: long oval links joined by small rings. */
function chain(k: Kit, mat: THREE.Material, x: number, z: number, y0: number, y1: number) {
  const len = y1 - y0;
  if (len < 0.05) return;
  const pitch = clamp(len / Math.max(1, Math.round(len / 0.28)), 0.08, 0.4);
  const n = Math.max(1, Math.round(len / pitch));
  const p = len / n;
  const ring = 0.017;
  const linkL = p - ring * 1.3;
  for (let i = 0; i < n; i++) {
    const yc = y0 + p * (i + 0.5);
    const loop = roundRectLoop(0.03, linkL, 0.0149, 1).map((q): V3 => [q[0], q[2], 0]);
    k.pipe(mat, loop, 0.0034, { radial: 3, closed: true, at: [x, yc, z], rot: [0, i % 2 ? Math.PI / 2 : 0, 0] });
    if (i < n - 1) k.torus(mat, ring * 0.62, 0.003, x, y0 + p * (i + 1), z, { seg: 5, tseg: 3, rot: [0, i % 2 ? 0 : Math.PI / 2, 0] });
  }
}

function jhoola(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const wood = M.wood(isWoody(color) ? color : '#8a5a34', 0.45);
  const deep = M.wood(tint(isWoody(color) ? color : '#8a5a34', -0.22), 0.45);
  const brass = M.brass();
  const seatTop = Math.min(0.44, h * 0.3);
  const ft = 0.05; // frame thickness
  const fy = seatTop - ft / 2;
  const hx = w / 2 - 0.03;
  const hz = d / 2 - 0.03;
  // seat frame + board
  k.box(wood, w - 0.004, ft, 0.06, 0, fy, hz, { r: 0.008, grain: 'x' });
  k.box(wood, w - 0.004, ft, 0.06, 0, fy, -hz, { r: 0.008, grain: 'x' });
  k.mirrorX(() => k.box(wood, 0.06, ft, d - 0.06, hx, fy, 0, { r: 0.008, grain: 'z' }));
  k.box(deep, w - 0.1, 0.024, d - 0.1, 0, fy + 0.004, 0, { r: 0.003, grain: 'x' });
  // carved apron under the front edge
  const ap = new THREE.Shape();
  const aw = w - 0.2;
  ap.moveTo(-aw / 2, 0);
  ap.lineTo(aw / 2, 0);
  ap.lineTo(aw / 2, -0.03);
  const scal = Math.max(4, Math.round(aw / 0.16));
  for (let i = 0; i < scal; i++) {
    const xa = aw / 2 - (aw / scal) * i;
    const xb = aw / 2 - (aw / scal) * (i + 1);
    ap.quadraticCurveTo((xa + xb) / 2, -0.075, xb, -0.03);
  }
  ap.lineTo(-aw / 2, 0);
  k.extrude(deep, ap, 0.02, { at: [0, fy - ft / 2 + 0.004, hz - 0.01], bevel: 0.003, curveSeg: 5, grain: 'x' });
  // corner posts
  const backTop = seatTop + Math.min(0.44, (h - seatTop) * 0.3);
  const armTop = seatTop + Math.min(0.25, (h - seatTop) * 0.17);
  const pr = 0.024;
  k.mirrorX(() => {
    spindle(k, wood, hx, -hz, seatTop, backTop, pr, 8);
    spindle(k, wood, hx, hz, seatTop, armTop, pr, 8);
    k.sphere(brass, 0.02, hx, backTop + 0.012, -hz, { seg: 6 });
    k.sphere(brass, 0.02, hx, armTop + 0.012, hz, { seg: 6 });
    // arm rail + spindles
    k.box(wood, 0.045, 0.034, d - 0.07, hx, armTop - 0.03, 0, { r: 0.008, grain: 'z' });
    const ns = Math.max(1, Math.round((d - 0.16) / 0.12));
    for (let i = 0; i < ns; i++) spindle(k, deep, hx, -hz + ((2 * hz) / (ns + 1)) * (i + 1), seatTop, armTop - 0.046, 0.014);
  });
  // back: top rail with a shaped crest, spindles
  k.box(wood, w - 0.07, 0.05, 0.036, 0, backTop - 0.04, -hz, { r: 0.008, grain: 'x' });
  const crest = new THREE.Shape();
  const cw = (w - 0.2) / 2;
  crest.moveTo(-cw, 0);
  crest.lineTo(cw, 0);
  crest.quadraticCurveTo(cw * 0.5, 0.012, cw * 0.3, 0.04);
  crest.quadraticCurveTo(0, 0.085, -cw * 0.3, 0.04);
  crest.quadraticCurveTo(-cw * 0.5, 0.012, -cw, 0);
  if (backTop + 0.07 < h) k.extrude(deep, crest, 0.024, { at: [0, backTop - 0.017, -hz - 0.012], bevel: 0.003, curveSeg: 6, grain: 'x' });
  k.box(wood, w - 0.07, 0.03, 0.03, 0, seatTop + 0.09, -hz, { r: 0.006, grain: 'x' });
  const nb = Math.max(3, Math.round((w - 0.16) / 0.105));
  for (let i = 0; i < nb; i++) spindle(k, deep, -hx + ((2 * hx) / (nb + 1)) * (i + 1), -hz, seatTop + 0.105, backTop - 0.065, 0.015);
  // seat pad with piping + two bolsters
  const padC = '#8f2f2a';
  const pad = M.fabric(padC);
  const pw = w - 0.14;
  const pd = d - 0.12;
  k.soft(pad, pw, 0.06, pd, 0, seatTop + 0.03, 0.004, { r: 0.022, seg: [3, 1, 2], puff: { py: 0.01 } });
  const loop = roundRectLoop(pw - 0.012, pd - 0.012, 0.02, 2).map((p): V3 => [p[0], seatTop + 0.054, p[2] + 0.004]);
  k.pipe(M.fabric('#d9b25a'), loop, 0.0045, { radial: 4, closed: true });
  const bolR = Math.min(0.08, d * 0.16);
  k.mirrorX(() => {
    const bxp = pw / 2 - bolR - 0.01;
    k.cyl(M.fabric('#c9963a'), bolR, pd - 0.06, bxp, seatTop + 0.06 + bolR, 0.004, { axis: 'z', seg: 14, bevel: 0.02 });
    for (const sz of [-1, 1]) k.cyl(M.fabric(padC), bolR * 0.42, 0.006, bxp, seatTop + 0.06 + bolR, 0.004 + sz * (pd - 0.06) * 0.5, { axis: 'z', seg: 10 });
  });
  // chains to four ceiling hooks
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const top = sz < 0 ? backTop : armTop;
      const x = sx * hx;
      const z = sz * hz;
      k.torus(brass, 0.014, 0.0035, x, top + 0.043, z, { seg: 6, tseg: 3, rot: [0, Math.PI / 2, 0] });
      chain(k, brass, x, z, top + 0.05, h - 0.045);
      // ceiling plate + hook
      k.cyl(brass, 0.028, 0.008, x, h - 0.004, z, { seg: 10 });
      k.torus(brass, 0.014, 0.0035, x, h - 0.024, z, { seg: 6, tseg: 3 });
    }
}

// ---------------------------------------------------------------------------------------------
// bougainvillea in a fibreglass planter

function plantOutdoor(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const W = Math.min(w, d);
  const ph = clamp(h * 0.4, 0.15, 0.55);
  const top = W * 0.74;
  const bot = W * 0.52;
  const shell = M.plastic(color, 0.55);
  // tapered square planter with a rim, hollow at the top
  k.taper(shell, [bot, bot], [top, top], 0, ph - 0.03);
  k.box(shell, top + 0.02, 0.03, top + 0.02, 0, ph - 0.015, 0, { r: 0.006 });
  k.box(M.lam('#3a2a1f', 0.95), top - 0.03, 0.006, top - 0.03, 0, ph + 0.001, 0, { r: 0 });
  const soil = ph;
  // canopy
  const cy = soil + (h - soil) * 0.56;
  const rx = w / 2 - 0.05;
  const rz = d / 2 - 0.05;
  const ry = (h - soil) * 0.44 - 0.03;
  const bark = M.lam('#5e4632', 0.9);
  const R = (a: number, b: number) => k.r(a, b);
  const pick = (r0: number, r1: number) => {
    // random point in the ellipsoid shell
    const u = R(-1, 1);
    const t = R(0, Math.PI * 2);
    const q = Math.sqrt(1 - u * u);
    const rr = R(r0, r1);
    return new THREE.Vector3(q * Math.cos(t) * rx * rr, cy + u * ry * rr, q * Math.sin(t) * rz * rr);
  };
  // woody stems fanning into the canopy
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R(-0.3, 0.3);
    const end = new THREE.Vector3(Math.cos(a) * rx * R(0.45, 0.8), cy + ry * R(-0.2, 0.7), Math.sin(a) * rz * R(0.45, 0.8));
    const mid = new THREE.Vector3(end.x * 0.25, soil + (end.y - soil) * 0.6, end.z * 0.25);
    k.tube(bark, [[Math.cos(a) * 0.02, soil, Math.sin(a) * 0.02], [mid.x, mid.y, mid.z], [end.x, end.y, end.z]], 0.006, { radial: 4, seg: 6 });
  }
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const greens = ['#3c6e35', '#4a7f3c', '#2f5e30', '#5a8f45'].map((c) => new THREE.Color(c));
  const pinks = ['#c2185b', '#d81b60', '#e23d83', '#b0124f', '#ec6aa0'].map((c) => new THREE.Color(c));
  const up = new THREE.Vector3(0, 1, 0);
  const basis = (p: THREE.Vector3, dir: THREE.Vector3, len: number) => {
    const zA = dir.clone().normalize();
    const xA = new THREE.Vector3().crossVectors(up, zA);
    if (xA.lengthSq() < 1e-5) xA.set(1, 0, 0);
    xA.normalize();
    const yA = new THREE.Vector3().crossVectors(zA, xA);
    return new THREE.Matrix4().makeBasis(xA.multiplyScalar(len), yA.multiplyScalar(len), zA.multiplyScalar(len)).setPosition(p);
  };
  const cen = new THREE.Vector3(0, cy, 0);
  const sc = clamp(W / 0.55, 0.5, 1.6);
  for (let i = 0; i < 300; i++) {
    const p = pick(0.45, 0.98);
    const out = p.clone().sub(cen).normalize();
    const dir = out.add(new THREE.Vector3(R(-0.8, 0.8), R(-0.5, 0.9), R(-0.8, 0.8)));
    mats.push(basis(p, dir, R(0.05, 0.085) * sc));
    cols.push(greens[Math.floor(k.rnd() * greens.length)]);
  }
  // bract clusters near the surface
  for (let c = 0; c < 46; c++) {
    const p = pick(0.86, 1.02);
    const col = pinks[Math.floor(k.rnd() * pinks.length)];
    const out = p.clone().sub(cen).normalize();
    for (let j = 0; j < 5; j++) {
      const dir = out.clone().add(new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).multiplyScalar(0.9));
      mats.push(basis(p.clone().add(new THREE.Vector3(R(-0.02, 0.02), R(-0.02, 0.02), R(-0.02, 0.02))), dir, R(0.038, 0.055) * sc));
      cols.push(col);
    }
  }
  // keep every leaf tip inside the box
  let mx = 1e-6;
  let mz = 1e-6;
  let myTop = 1e-6;
  const tip = new THREE.Vector3();
  for (const m of mats) {
    tip.set(0, 0, 1).applyMatrix4(m);
    mx = Math.max(mx, Math.abs(tip.x));
    mz = Math.max(mz, Math.abs(tip.z));
    myTop = Math.max(myTop, tip.y - soil);
  }
  const mg = 0.012 + 0.03 * sc;
  const fx = Math.min(1, (w / 2 - mg) / mx);
  const fz = Math.min(1, (d / 2 - mg) / mz);
  const fy = Math.min(1, (h - soil - mg) / myTop);
  k.at({ at: [0, soil * (1 - fy), 0], scale: [fx, fy, fz] }, () => k.inst(M.leaf(), ovateLeaf(), mats, cols, 'leaves'));
}

export const outdoor: Registry = {
  jhoola,
  'plant-outdoor': plantOutdoor,
  car,
};
