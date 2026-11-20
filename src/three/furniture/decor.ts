// Decor: framed wall art, areca palm, snake plant, curtains with rod.

import * as THREE from 'three';
import { clamp, lerp, type Kit } from './kit';
import { M, canvasTex, grain, lum, mix, tint } from './materials';
import type { Registry, Spec } from './types';

// ---------------------------------------------------------------------------------------------
// leaves (shared by every plant; tinted per instance)

function finishLeaf(pos: number[], idx: number[], col?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col ?? new Array(pos.length).fill(1), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let _blade: THREE.BufferGeometry | null = null;
/** Palm leaflet: unit length along +Z, unit width along X, folded along the midrib. */
export function bladeLeaf(): THREE.BufferGeometry {
  if (_blade) return _blade;
  const pos = [0, 0, 0, -0.5, 0.05, 0.3, 0, -0.04, 0.32, 0.5, 0.05, 0.3, -0.4, 0.04, 0.68, 0, -0.03, 0.7, 0.4, 0.04, 0.68, 0, 0, 1];
  const idx = [0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4, 2, 3, 6, 2, 6, 5, 4, 5, 7, 5, 6, 7];
  return (_blade = finishLeaf(pos, idx));
}

let _ovate: THREE.BufferGeometry | null = null;
/** Broad leaf / bract: unit length along +Z, gently folded. */
export function ovateLeaf(): THREE.BufferGeometry {
  if (_ovate) return _ovate;
  const pos = [0, 0, 0, -0.36, 0.06, 0.42, 0, -0.03, 0.45, 0.36, 0.06, 0.42, 0, 0.02, 1];
  const idx = [0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4];
  return (_ovate = finishLeaf(pos, idx));
}

let _sword: THREE.BufferGeometry | null = null;
/** Snake-plant leaf: unit height along +Y, unit width, cupped, yellow-green margins baked into vertex colours. */
function swordLeaf(): THREE.BufferGeometry {
  if (_sword) return _sword;
  const rows: [number, number][] = [
    [0, 0.42],
    [0.14, 0.8],
    [0.4, 1],
    [0.68, 0.84],
    [0.88, 0.46],
    [1, 0.02],
  ];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const edge = new THREE.Color('#c8bf5c');
  const mid = new THREE.Color('#36623a');
  const band = new THREE.Color('#5e8a55');
  const across = [-1, -0.72, 0, 0.72, 1];
  rows.forEach(([t, wd], r) => {
    const tw = t * 0.5; // twist
    for (const sx of across) {
      const x = sx * wd * 0.5;
      const z = Math.abs(sx) * 0.12 * wd + t * t * 0.08;
      pos.push(x * Math.cos(tw) + z * Math.sin(tw), t, -x * Math.sin(tw) + z * Math.cos(tw));
      const c = Math.abs(sx) === 1 ? edge : sx === 0 ? (r % 2 ? band : mid) : mid;
      col.push(c.r, c.g, c.b);
    }
    if (r > 0) {
      const n = across.length;
      for (let i = 0; i < n - 1; i++) {
        const a = (r - 1) * n + i;
        const b = r * n + i;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  });
  return (_sword = finishLeaf(pos, idx, col));
}

/** Ceramic pot with a rim and soil. Returns the soil level. */
function pot(k: Kit, color: string, rTop: number, rBot: number, hgt: number, x = 0, z = 0): number {
  const mat = lum(color) < 0.2 ? M.plastic(color, 0.5) : M.ceramic(color);
  k.lathe(
    mat,
    [
      [0, 0],
      [rBot, 0],
      [rBot + 0.004, 0.008],
      [rTop, hgt - 0.02],
      [rTop + 0.006, hgt - 0.012],
      [rTop + 0.006, hgt],
      [rTop - 0.01, hgt],
      [rTop - 0.014, hgt - 0.03],
    ],
    x,
    0,
    z,
    { seg: 24 },
  );
  k.cyl(M.lam('#3a2a1f', 0.95), rTop - 0.013, 0.004, x, hgt - 0.03, z, { seg: 18 });
  return hgt - 0.028;
}

const UP = new THREE.Vector3(0, 1, 0);

function leafMatrix(p: THREE.Vector3, dir: THREE.Vector3, normalHint: THREE.Vector3, len: number, wid: number): THREE.Matrix4 {
  const zA = dir.clone().normalize();
  const xA = new THREE.Vector3().crossVectors(normalHint, zA);
  if (xA.lengthSq() < 1e-6) xA.set(1, 0, 0);
  xA.normalize();
  const yA = new THREE.Vector3().crossVectors(zA, xA).normalize();
  const m = new THREE.Matrix4().makeBasis(xA.multiplyScalar(wid), yA.multiplyScalar(wid), zA.multiplyScalar(len));
  return m.setPosition(p);
}

// ---------------------------------------------------------------------------------------------
// areca palm

function plantTall(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const W = Math.min(w, d);
  const potH = clamp(h * 0.2, 0.14, 0.32);
  const potR = clamp(W * 0.27, 0.06, 0.17);
  const soil = pot(k, color, potR, potR * 0.78, potH);
  const stemM = M.lam('#6f8a45', 0.6);
  const greens = ['#3f7a3a', '#4c8a40', '#356b35', '#5a9647', '#447f3c'].map((c) => new THREE.Color(c));
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const stems: THREE.Vector3[][] = [];
  const reachH = h - soil;
  const n = 11;
  const tmp = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    const inner = f < 4;
    const ang = (f / n) * Math.PI * 2 * 1.618 + k.r(-0.2, 0.2);
    const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const Hf = reachH * (inner ? k.r(0.88, 0.98) : k.r(0.62, 0.84));
    const Rf = (W / 2) * (inner ? k.r(0.35, 0.55) : k.r(0.8, 1.0));
    const base = new THREE.Vector3(out.x * potR * 0.35, soil, out.z * potR * 0.35);
    const P = (t: number) => {
      const yy = Math.sin(t * Math.PI * (inner ? 0.56 : 0.68)) / Math.sin(Math.PI * (inner ? 0.5 : 0.5));
      return new THREE.Vector3(base.x + out.x * Rf * Math.pow(t, 2.3), soil + Hf * yy, base.z + out.z * Rf * Math.pow(t, 2.3));
    };
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 7; i++) pts.push(P(i / 7));
    stems.push(pts);
    const pairs = 13;
    const Lmax = clamp(W * 0.5, 0.1, 0.3);
    for (let i = 0; i < pairs; i++) {
      const t = 0.42 + (0.58 * (i + 0.5)) / pairs;
      const p = P(t);
      const T = tmp.copy(P(Math.min(1, t + 0.02))).sub(P(t - 0.02)).normalize().clone();
      const S = new THREE.Vector3().crossVectors(T, UP).normalize();
      const u = (t - 0.42) / 0.58;
      const len = Lmax * (0.5 + 0.5 * Math.sin(Math.PI * Math.pow(u, 0.75))) * k.r(0.88, 1.08);
      for (const side of [-1, 1]) {
        const dir = S.clone().multiplyScalar(side * 0.85).add(T.clone().multiplyScalar(0.45)).add(new THREE.Vector3(0, -0.3 - 0.3 * u, 0));
        mats.push(leafMatrix(p, dir, UP, len, len * 0.2));
        cols.push(greens[Math.floor(k.rnd() * greens.length)]);
      }
    }
    // terminal leaflet
    const tip = P(1);
    mats.push(leafMatrix(tip, tip.clone().sub(P(0.94)), UP, Lmax * 0.6, Lmax * 0.1));
    cols.push(greens[0]);
  }
  // fit the foliage inside the box (leaflets may reach past the frond tips)
  let mx = 1e-6;
  let mz = 1e-6;
  let my = 1e-6;
  const tip = new THREE.Vector3();
  for (const m of mats) {
    tip.set(0, 0, 1).applyMatrix4(m);
    mx = Math.max(mx, Math.abs(tip.x));
    mz = Math.max(mz, Math.abs(tip.z));
    my = Math.max(my, tip.y - soil);
  }
  const fx = Math.min(1, (w / 2 - 0.004) / mx);
  const fz = Math.min(1, (d / 2 - 0.004) / mz);
  const fy = Math.min(1, (h - soil - 0.004) / my);
  k.at({ at: [0, soil * (1 - fy), 0], scale: [fx, fy, fz] }, () => {
    for (const pts of stems) k.add(stemM, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0045, 4, false));
    k.inst(M.leaf(), bladeLeaf(), mats, cols, 'leaves');
  });
}

// ---------------------------------------------------------------------------------------------
// snake plant

function plantSmall(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const W = Math.min(w, d);
  const potH = clamp(h * 0.3, 0.07, 0.2);
  const potR = clamp(W * 0.34, 0.035, 0.14);
  const soil = pot(k, color, potR, potR * 0.8, potH);
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const n = 13;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const ring = i < 4 ? 0.2 : i < 9 ? 0.55 : 0.8;
    const a = i * 2.39996 + k.r(-0.3, 0.3);
    const br = potR * ring;
    const hgt = (h - soil) * (i < 4 ? k.r(0.86, 0.98) : i < 9 ? k.r(0.66, 0.86) : k.r(0.45, 0.66));
    const wid = clamp(W * 0.2, 0.03, 0.075) * k.r(0.8, 1.1);
    const room = W / 2 - br - wid * 0.62 - 0.012;
    const tilt = Math.min(Math.asin(clamp(room / hgt, 0, 0.5)), ring * k.r(0.16, 0.3));
    // lean outward (about the tangent), face roughly outward, random roll
    e.set(0, -a + Math.PI / 2 + k.r(-0.5, 0.5), 0);
    q.setFromEuler(e);
    const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -tilt);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * br, soil - 0.004, Math.sin(a) * br), lean.multiply(q), new THREE.Vector3(wid, hgt * Math.cos(tilt) * 0.995, wid));
    mats.push(m);
    const c = k.r(0.82, 1.08);
    cols.push(new THREE.Color(c, c, c));
  }
  k.inst(M.leaf('#ffffff', 0.5), swordLeaf(), mats, cols, 'leaves');
}

// ---------------------------------------------------------------------------------------------
// wall art

const ART_ASPECTS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

function artTex(color: string, aspect: number): THREE.Texture | null {
  const W = 512;
  const H = clamp(Math.round(W / aspect), 160, 1024);
  return canvasTex(`art:${color}:${H}`, W, H, null, (ctx, w, h, r) => {
    const paper = '#f1e9da';
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    const u = Math.min(w, h);
    // sun
    ctx.fillStyle = mix(color, '#e9b872', 0.55);
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.36, u * 0.17, 0, 6.283);
    ctx.fill();
    // nested arches
    const ax = w * 0.34;
    const base = h * 0.86;
    const shades = [tint(color, -0.25), color, tint(color, 0.35), tint(color, 0.62)];
    shades.forEach((c, i) => {
      const rad = u * (0.46 - i * 0.095);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(ax - rad, base);
      ctx.lineTo(ax - rad, base - u * 0.1);
      ctx.arc(ax, base - u * 0.1, rad, Math.PI, 0);
      ctx.lineTo(ax + rad, base);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = paper;
    ctx.beginPath();
    const rr = u * (0.46 - 4 * 0.095);
    ctx.moveTo(ax - rr, base);
    ctx.lineTo(ax - rr, base - u * 0.1);
    ctx.arc(ax, base - u * 0.1, rr, Math.PI, 0);
    ctx.lineTo(ax + rr, base);
    ctx.fill();
    // ground band + thin lines
    ctx.fillStyle = mix(color, '#2f3a3a', 0.72);
    ctx.fillRect(0, base, w, h - base);
    ctx.strokeStyle = mix(color, '#2f3a3a', 0.72);
    ctx.lineWidth = Math.max(2, u * 0.008);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.56, h * (0.6 + i * 0.07));
      ctx.lineTo(w * 0.92, h * (0.6 + i * 0.07));
      ctx.stroke();
    }
    grain(ctx, w, h, r, 0.07); // paper
  });
}

function wallArt(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const frame = M.wood('#a47a50', 0.45);
  const fw = clamp(Math.min(w, h) * 0.045, 0.014, 0.034);
  const zb = -d / 2;
  const outer = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  outer.holes.push(new THREE.Path([new THREE.Vector2(-w / 2 + fw, fw), new THREE.Vector2(-w / 2 + fw, h - fw), new THREE.Vector2(w / 2 - fw, h - fw), new THREE.Vector2(w / 2 - fw, fw)]));
  k.extrude(frame, outer, d, { at: [0, 0, zb], bevel: Math.min(0.004, d * 0.15), bevelSeg: 1 });
  // backing, mount board, print
  k.bx(M.lam('#3a332c', 0.9), -w / 2 + fw * 0.5, w / 2 - fw * 0.5, fw * 0.5, h - fw * 0.5, zb + 0.001, zb + d * 0.45, { r: 0 });
  const zm = zb + d * 0.5;
  k.quad(M.lam('#f6f2ea', 0.9), w - 2 * fw + 0.002, h - 2 * fw + 0.002, { at: [0, h / 2, zm] });
  const mb = clamp(Math.min(w, h) * 0.085, 0.02, 0.07);
  const pw = w - 2 * fw - 2 * mb;
  const ph = h - 2 * fw - 2 * mb;
  // the print is painted at a few fixed aspect ratios and cropped to fit, so resizing never repaints textures
  const aspect = pw / ph;
  const bucket = ART_ASPECTS.reduce((a, b) => (Math.abs(Math.log(b / aspect)) < Math.abs(Math.log(a / aspect)) ? b : a));
  const tex = artTex(color, bucket);
  const geo = new THREE.PlaneGeometry(pw, ph);
  const uv = geo.attributes.uv;
  const cu = Math.min(1, aspect / bucket);
  const cv = Math.min(1, bucket / aspect);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * cu, 0.5 + (uv.getY(i) - 0.5) * cv);
  k.add(M.picture(`art:${color}:${bucket}`, tex, color, 0.85), geo, { at: [0, h / 2, zm + 0.0015] });
}

// ---------------------------------------------------------------------------------------------
// curtains

function curtainPanel(x0: number, x1: number, yTop: number, yBot: number, zc: number, folds: number, phase: number, k: Kit): THREE.BufferGeometry {
  const cols = folds * 6;
  const rows = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const amps: number[] = [];
  for (let f = 0; f <= folds; f++) amps.push(k.r(0.8, 1.2));
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const y = lerp(yTop, yBot, v);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const ph = u * folds * Math.PI * 2 + phase;
      const fa = amps[Math.min(folds, Math.floor(u * folds + 0.5))];
      const amp = lerp(0.02, 0.04, Math.pow(v, 0.7)) * fa;
      const z = zc + amp * Math.sin(ph) + 0.006 * v * Math.sin(ph * 0.5 + phase * 3);
      // fabric gathers a little toward the top: the folds fan out below
      const x = lerp(x0, x1, u) + 0.012 * v * Math.sin(ph * 0.5 + 1.3);
      pos.push(x, y, z);
      uv.push(u * (x1 - x0) * 1.6, y);
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      idx.push(a, a + cols + 1, a + cols + 2, a, a + cols + 2, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function curtains(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const metal = lum(color) > 0.6 ? M.metal('#3a3a3c', 0.4, 'rod') : M.brass();
  const fab = M.fabric(color, { double: true });
  const zb = -d / 2;
  const zc = zb + d * 0.56;
  const rodY = h - 0.07;
  const rr = Math.min(0.0125, d * 0.12);
  // rod, finials, brackets
  k.cyl(metal, rr, w - 0.07, 0, rodY, zc, { axis: 'x', seg: 12 });
  for (const sx of [-1, 1]) {
    k.lathe(metal, [[rr, 0], [rr * 1.5, 0.004], [rr * 1.9, 0.014], [rr * 1.5, 0.026], [0, 0.034]], sx * (w / 2 - 0.035), rodY, zc, { seg: 12, rot: [0, 0, sx * -Math.PI / 2] });
  }
  const nb = w > 2.3 ? 3 : 2;
  for (let i = 0; i < nb; i++) {
    const bx = nb === 2 ? (i ? 1 : -1) * (w / 2 - 0.09) : (i - 1) * (w / 2 - 0.09);
    k.cyl(metal, 0.022, 0.006, bx, rodY, zb + 0.003, { axis: 'z', seg: 14 });
    k.rod(metal, [bx, rodY, zb + 0.004], [bx, rodY, zc], rr * 0.7, { seg: 8 });
    k.cyl(metal, rr * 1.35, 0.014, bx, rodY, zc, { axis: 'x', seg: 12 });
  }
  // two panels drawn back to the sides; folds are added as the window gets wider
  const pw = clamp(w * 0.3, Math.min(0.24, w * 0.45), 1.4);
  const folds = Math.max(3, Math.round(pw / 0.082));
  const yTop = Math.min(h - 0.012, rodY + 0.045);
  const yBot = 0.012;
  const xo = w / 2 - 0.045;
  const amp = Math.min(1, (d * 0.42) / 0.05);
  k.at({ at: [0, 0, zc * (1 - amp)], scale: [1, 1, amp] }, () => {
    k.add(fab, curtainPanel(-xo, -xo + pw, yTop, yBot, zc, folds, 0.4, k));
    k.add(fab, curtainPanel(xo - pw, xo, yTop, yBot, zc, folds, 2.1, k));
  });
}

export const decor: Registry = {
  'wall-art': wallArt,
  'plant-tall': plantTall,
  'plant-small': plantSmall,
  curtains,
};
