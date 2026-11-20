// Bedroom: beds, bedside table, wardrobes, dresser, study desk, desk chair, bookshelf.

import * as THREE from 'three';
import { clamp, type Kit, type V3 } from './kit';
import { M, isDark, isWoody, mix, tint } from './materials';
import { barHandle, books, knob, lipPull, roundLeg, vase } from './parts';
import type { Registry, Spec } from './types';

// ---------------------------------------------------------------------------------------------
// beds

function bed(k: Kit, s: Spec, style: 'queen' | 'king' | 'single') {
  const { w, d, h, color } = s;
  const woody = isWoody(color);
  const king = style === 'king';
  const single = style === 'single';
  const frame = woody ? M.wood(color) : M.fabric(color);
  const hbFab = M.fabric(woody ? mix(color, '#e6dccb', 0.74) : tint(color, 0.06));
  const legWood = M.wood(woody ? tint(color, -0.25) : '#3b2a1e');
  const dark = M.lam('#1d1b1a', 0.85);
  const hbT = king ? 0.11 : 0.085;
  const legH = king ? 0 : single ? 0.16 : 0.14;
  const plinth = king ? 0.05 : 0;
  const railH = king ? 0.31 : 0.2;
  const railTop = Math.min(legH + plinth + railH, h * 0.45);
  const rt = 0.035;
  const zH = -d / 2 + hbT; // front face of the headboard
  const zF = d / 2; // foot end
  const L = zF - zH;

  const panel = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    if (woody) k.bx(frame, x0, x1, y0, y1, z0, z1, { r: 0.006 });
    else k.soft(frame, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, { r: Math.min(0.02, (x1 - x0) * 0.4, (z1 - z0) * 0.4), seg: [1, 1, 1], cs: 1 });
  };

  // --- frame
  if (king) {
    k.bx(dark, -w / 2 + 0.035, w / 2 - 0.035, 0, plinth + 0.01, zH - 0.02, zF - 0.035, { r: 0 });
    const mid = zH + L * 0.5;
    k.mirrorX(() => {
      panel(w / 2 - rt, w / 2, plinth, railTop, zH - 0.012, mid - 0.002);
      panel(w / 2 - rt, w / 2, plinth, railTop, mid + 0.002, zF);
    });
    panel(-w / 2 + rt + 0.002, w / 2 - rt - 0.002, plinth, railTop, zF - rt, zF);
    // pull tab for the hydraulic lift
    k.box(M.leather('#5a3a22'), 0.09, 0.03, 0.004, 0, railTop - 0.07, zF - 0.001, { r: 0.001 });
  } else {
    k.mirrorX(() => panel(w / 2 - rt, w / 2, legH, railTop, zH - 0.012, zF));
    panel(-w / 2 + rt + 0.002, w / 2 - rt - 0.002, legH, railTop, zF - rt, zF);
    k.bx(dark, -w / 2 + rt, w / 2 - rt, railTop - 0.075, railTop - 0.06, zH, zF - rt, { r: 0 });
    for (const sx of [-1, 1]) roundLeg(k, legWood, sx * (w / 2 - 0.05), zF - 0.05, 0, legH + 0.012, 0.026, 0.018);
    if (w > 1.3) roundLeg(k, legWood, 0, zH + L * 0.5, 0, legH + 0.012, 0.022, 0.018);
  }

  // --- mattress
  const mT = single ? 0.16 : 0.2;
  const mw = w - 2 * rt - 0.012;
  const ml = L - rt - 0.014;
  const mBot = railTop - 0.05;
  const mTop = mBot + mT;
  const mz = zH + 0.005 + ml / 2;
  const linen = M.fabric('#f2eee6');
  k.soft(linen, mw, mT, ml, 0, mBot + mT / 2, mz, { r: 0.045, seg: [2, 1, 3], puff: { py: 0.008 }, skip: ['ny'] });

  // --- headboard
  if (single) {
    const hw = M.wood(woody ? color : '#b89468');
    const hm = woody ? hw : frame;
    const pw = 0.05;
    k.mirrorX(() => (woody ? k.bx(hm, w / 2 - pw, w / 2, 0, h, -d / 2, zH, { r: 0.006 }) : panel(w / 2 - pw, w / 2, 0.02, h, -d / 2, zH)));
    if (!woody) for (const sx of [-1, 1]) roundLeg(k, legWood, sx * (w / 2 - pw / 2), -d / 2 + hbT / 2, 0, 0.03, 0.022, 0.018);
    const y0 = railTop - 0.05;
    k.bx(hm, -w / 2 + pw, w / 2 - pw, h - 0.075, h - 0.008, -d / 2 + 0.012, zH - 0.012, { r: 0.006 });
    k.bx(hm, -w / 2 + pw, w / 2 - pw, y0, y0 + 0.06, -d / 2 + 0.012, zH - 0.012, { r: 0.006 });
    if (woody) {
      const span = w - 2 * pw;
      const n = Math.max(3, Math.round(span / 0.105));
      for (let i = 0; i < n; i++) k.box(hm, 0.058, h - 0.075 - y0 - 0.06, 0.016, -span / 2 + (span / n) * (i + 0.5), (y0 + 0.06 + h - 0.075) / 2, -d / 2 + hbT / 2, { r: 0.004 });
    } else k.soft(hbFab, w - 2 * pw - 0.01, h - 0.085 - y0 - 0.06, hbT - 0.03, 0, (y0 + 0.06 + h - 0.075) / 2, -d / 2 + hbT / 2, { r: 0.02, seg: [2, 2, 1], puff: { pz: 0.012 } });
  } else if (king) {
    k.bx(woody ? frame : dark, -w / 2, w / 2, 0, h - 0.004, -d / 2, -d / 2 + 0.035, { r: 0.006 });
    const y0 = Math.min(0.24, h * 0.25);
    const n = Math.max(3, Math.round(w / 0.2));
    const cw = (w - 0.016) / n;
    for (let i = 0; i < n; i++) {
      k.soft(hbFab, cw - 0.003, h - y0 - 0.006, hbT - 0.03, -(w - 0.016) / 2 + cw * (i + 0.5), (y0 + h - 0.006) / 2, -d / 2 + 0.03 + (hbT - 0.03) / 2 - 0.012, {
        r: Math.min(0.032, cw * 0.3),
        seg: [1, 2, 1],
        puff: { pz: 0.012 },
        skip: ['nz', 'ny'],
      });
    }
    if (!woody) k.mirrorX(() => panel(w / 2 - rt, w / 2, plinth, y0 + 0.02, -d / 2, zH));
    else k.bx(frame, -w / 2, w / 2, plinth, y0, -d / 2 + 0.03, zH - 0.004, { r: 0.004 });
  } else {
    const pw = 0.055;
    k.mirrorX(() => (woody ? k.bx(frame, w / 2 - pw, w / 2, 0, h - 0.02, -d / 2, zH, { r: 0.008 }) : panel(w / 2 - pw, w / 2, legH, h - 0.012, -d / 2, zH)));
    if (!woody) for (const sx of [-1, 1]) roundLeg(k, legWood, sx * (w / 2 - 0.05), -d / 2 + hbT / 2, 0, legH + 0.012, 0.026, 0.018);
    if (woody) k.bx(frame, -w / 2 - 0.0, w / 2 + 0.0, h - 0.065, h, -d / 2, zH, { r: 0.008, grain: 'x' });
    else panel(-w / 2 + pw - 0.01, w / 2 - pw + 0.01, h - 0.07, h - 0.004, -d / 2, zH);
    k.bx(woody ? frame : dark, -w / 2 + pw - 0.004, w / 2 - pw + 0.004, legH, h - 0.06, -d / 2 + 0.004, -d / 2 + 0.03, { r: 0.003 });
    // padded panel in three wide channels
    const y0 = railTop - 0.07;
    const y1 = h - (woody ? 0.07 : 0.075);
    const span = w - 2 * pw - 0.008;
    const n = Math.max(2, Math.round(span / 0.5));
    for (let i = 0; i < n; i++)
      k.soft(hbFab, span / n - 0.004, y1 - y0, hbT - 0.034, -span / 2 + (span / n) * (i + 0.5), (y0 + y1) / 2, -d / 2 + 0.03 + (hbT - 0.034) / 2, {
        r: 0.022,
        seg: [2, 2, 1],
        puff: { pz: 0.014 },
        skip: ['nz'],
      });
  }

  // --- bedding
  const accent = woody ? '#8d9a86' : isDark(color) ? '#c2a15a' : '#7f8c99';
  const accent2 = woody ? '#b9744f' : mix(color, '#f0e7d8', 0.5);
  const duvetC = '#e8e2d6';
  const dTop = mTop + 0.03;
  const dz0 = zH + L * 0.4;
  const dz1 = zF - 0.008;
  const dw = w - 0.014;
  k.soft(M.fabric(duvetC), dw, dTop - railTop, dz1 - dz0, 0, (railTop + dTop) / 2, (dz0 + dz1) / 2, { r: 0.055, seg: [3, 1, 3], puff: { py: 0.022 }, skip: ['ny'] });
  // folded-back top edge
  k.soft(M.fabric('#f6f3ec'), dw + 0.004, 0.06, 0.3, 0, dTop + 0.02, dz0 + 0.12, { r: 0.028, seg: [3, 1, 1], puff: { py: 0.008 } });
  // throw across the foot
  const tz = Math.min(0.5, L * 0.26);
  k.soft(M.fabric(accent), w - 0.006, dTop + 0.028 - railTop + 0.01, tz, 0, (railTop - 0.01 + dTop + 0.028) / 2, zF - 0.012 - tz / 2 - 0.05, { r: 0.06, seg: [3, 1, 2], puff: { py: 0.012 }, skip: ['ny'] });
  // pillows (lie flat when the headboard is too low to lean on)
  const white = M.fabric('#f7f5f0');
  const np = single ? 1 : 2;
  const room = h - mTop;
  const pd = Math.min(0.44, L * 0.3);
  const pw2 = Math.max(0.1, single ? Math.min(0.66, mw - 0.12) : Math.min(0.7, mw / 2 - 0.035));
  const lean = room > 0.3 ? 0.42 : 0.08;
  const pT = Math.min(0.16, room * 0.5);
  for (let i = 0; i < np; i++) {
    const x = (i - (np - 1) / 2) * (mw / 2);
    k.at({ at: [x, mTop + pT * 0.4 + (pd / 2) * Math.sin(lean) * 0.75, zH + 0.02 + pd * 0.46], rot: [lean, 0, 0] }, () => k.pillow(white, pw2, pT, pd));
  }
  const cs = Math.min(single ? 0.36 : 0.42, room - 0.012, mw * 0.45);
  if (cs > 0.2) {
    const cushions: [number, number, string][] = single ? [[0.04, 0.1, accent]] : king ? [[-mw * 0.23, 0.22, accent2], [mw * 0.23, -0.2, accent2], [0, 0.04, accent]] : [[-mw * 0.2, 0.18, accent2], [mw * 0.2, -0.16, accent]];
    cushions.forEach(([x, ry, c], i) => {
      const sz = i === 2 ? cs * 0.8 : cs;
      k.at({ at: [x, mTop + sz * 0.47, zH + (i === 2 ? 0.5 : 0.4)], rot: [0, ry, 0] }, () => k.pillow(M.fabric(c), i === 2 ? sz * 1.35 : sz, sz * 0.3, sz, 0, 0, 0, { rot: [1.12, 0, 0] }));
    });
  }
}

// ---------------------------------------------------------------------------------------------
// bedside table

function bedsideTable(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const inner = M.body(tint(color, -0.14));
  const metal = M.brass();
  const legH = Math.min(0.13, h * 0.26);
  const t = 0.016;
  const zf = d / 2 - 0.016;
  const legW = M.wood(isWoody(color) ? tint(color, -0.1) : '#b08a62');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) roundLeg(k, legW, sx * (w / 2 - 0.045), sz * (d / 2 - 0.05), 0, legH + 0.01, 0.02, 0.013);
  k.bx(body, -w / 2, w / 2, h - 0.02, h, -d / 2, d / 2, { r: 0.005, grain: 'x' });
  k.mirrorX(() => k.bx(body, w / 2 - 0.004 - t, w / 2 - 0.004, legH, h - 0.02, -d / 2 + 0.004, zf - 0.004, { r: 0.003 }));
  k.bx(body, -w / 2 + 0.004, w / 2 - 0.004, legH, legH + t, -d / 2 + 0.004, zf - 0.004, { r: 0.003, grain: 'x' });
  k.bx(inner, -w / 2 + 0.01, w / 2 - 0.01, legH + t, h - 0.02, -d / 2 + 0.004, -d / 2 + 0.014, { r: 0 });
  const dh = clamp((h - legH) * 0.36, 0.09, 0.17);
  const dy0 = h - 0.022 - dh;
  // drawer box behind the front (so the niche below has a ceiling)
  k.bx(inner, -w / 2 + 0.01, w / 2 - 0.01, dy0 - 0.004, dy0 + 0.006, -d / 2 + 0.014, zf - 0.02, { r: 0 });
  k.box(body, w - 0.012, dh, 0.018, 0, dy0 + dh / 2, zf - 0.011, { r: 0.003, grain: 'x' });
  knob(k, metal, 0, dy0 + dh / 2, zf - 0.002, 0.009);
  // niche: books
  const paint = M.paint(0.75);
  const ny = legH + t;
  if (dy0 - ny > 0.1) {
    k.box(paint, w * 0.52, 0.026, d * 0.56, -w * 0.06, ny + 0.013, 0.02, { r: 0.002, color: '#27455c', rot: [0, 0.1, 0] });
    k.box(paint, w * 0.46, 0.02, d * 0.5, -w * 0.05, ny + 0.036, 0.02, { r: 0.002, color: '#d9d2c4', rot: [0, -0.08, 0] });
  }
}

// ---------------------------------------------------------------------------------------------
// wardrobes

function wardrobe(k: Kit, s: Spec, mirrored: boolean) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const dark = M.lam('#191817', 0.9);
  const metal = isDark(color) ? M.brass() : M.steel();
  const plinth = Math.min(0.08, h * 0.05);
  const t = 0.018;
  const zf = d / 2 - 0.03;
  const loft = h > 2.35 ? clamp(h - 2.1, 0.3, 0.62) : 0;
  const n = Math.max(1, Math.round(w / 0.5));
  // carcass
  k.bx(dark, -w / 2 + 0.02, w / 2 - 0.02, 0, plinth + 0.004, -d / 2 + 0.02, zf - 0.05, { r: 0 });
  k.mirrorX(() => k.bx(body, w / 2 - t, w / 2, plinth, h, -d / 2, zf, { r: 0.004 }));
  k.bx(body, -w / 2 + t, w / 2 - t, h - t, h, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(body, -w / 2 + t, w / 2 - t, plinth, plinth + t, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(dark, -w / 2 + t - 0.002, w / 2 - t + 0.002, plinth + t - 0.002, h - t + 0.002, -d / 2 + 0.004, zf - 0.026, { r: 0 });
  const zoneW = w - 2 * t;
  const dw = zoneW / n;
  const y0 = plinth + t;
  const y1 = h - t - loft;
  const dh = y1 - y0;
  const mi = mirrored ? (n >= 3 ? Math.floor(n / 2) : n - 1) : -1;
  for (let i = 0; i < n; i++) {
    const xc = -zoneW / 2 + dw * (i + 0.5);
    k.box(body, dw - 0.004, dh - 0.004, 0.018, xc, y0 + dh / 2, zf - 0.011, { r: 0.003, grain: 'y' });
    // handle on the opening edge (pairs open from the middle; an odd last door hinges on the outside)
    const right = n === 1 ? true : i % 2 === 0 && !(i === n - 1 && n % 2 === 1);
    const hx = xc + (right ? 1 : -1) * (dw / 2 - 0.035);
    const hy = clamp(1.02, y0 + 0.2, y1 - 0.2);
    barHandle(k, metal, hx, hy, zf - 0.002, Math.min(0.32, dh * 0.4), true, 0.026, 0.0055);
    if (i === mi) {
      const mw = dw - 0.004 - 0.14;
      const mh = dh - 0.004 - 0.14;
      const mx = xc + (right ? -1 : 1) * 0.022;
      k.box(M.mirror(), mw - 0.044, mh, 0.004, mx, y0 + dh / 2, zf - 0.0006, { r: 0.0015 });
    }
    if (loft) {
      k.box(body, dw - 0.004, loft - 0.004, 0.018, xc, y1 + loft / 2, zf - 0.011, { r: 0.003, grain: 'y' });
      lipPull(k, metal, xc + (right ? 1 : -1) * (dw / 2 - 0.05), y1 + 0.03, zf - 0.004, 0.07);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// dresser

function dresser(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const dark = M.lam('#1b1a19', 0.9);
  const metal = M.brass();
  const bh = Math.min(0.78, h * 0.45);
  const legH = Math.min(0.12, bh * 0.18);
  const zf = d / 2 - 0.02;
  const legW = M.wood(isWoody(color) ? tint(color, -0.12) : '#b08a62');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) roundLeg(k, legW, sx * (w / 2 - 0.05), sz * (d / 2 - 0.055), 0, legH + 0.01, 0.022, 0.014);
  // base
  k.bx(body, -w / 2, w / 2, bh - 0.024, bh, -d / 2, d / 2, { r: 0.005, grain: 'x' });
  k.bx(body, -w / 2 + 0.005, w / 2 - 0.005, legH, bh - 0.024, -d / 2 + 0.004, zf - 0.024, { r: 0.004 });
  k.bx(dark, -w / 2 + 0.012, w / 2 - 0.012, legH + 0.008, bh - 0.03, zf - 0.03, zf - 0.02, { r: 0 });
  const rows = 3;
  const zoneH = bh - 0.024 - legH - 0.006;
  const cols = w > 1.25 ? 2 : 1;
  const cw = (w - 0.012) / cols;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const dh = zoneH / rows;
      const yc = legH + 0.003 + dh * (r + 0.5);
      const xc = -(w - 0.012) / 2 + cw * (c + 0.5);
      k.box(body, cw - 0.005, dh - 0.005, 0.018, xc, yc, zf - 0.011, { r: 0.003, grain: 'x' });
      for (const sx of cw > 0.6 ? [-1, 1] : [0]) knob(k, metal, xc + sx * cw * 0.26, yc, zf - 0.002, 0.0105);
    }
  // mirror: arched, bevelled, in a wood frame
  const mw = Math.min(w * 0.74, 0.8);
  const m0 = bh + 0.035;
  const mH = h - m0 - 0.004;
  const fw = 0.03;
  const arch = (half: number, hgt: number) => {
    const sh = new THREE.Shape();
    const r = Math.min(half, hgt * 0.5);
    sh.moveTo(-half, 0);
    sh.lineTo(half, 0);
    sh.lineTo(half, hgt - r);
    sh.absarc(half - r, hgt - r, r, 0, Math.PI / 2, false);
    if (half - r > 1e-4) sh.lineTo(-(half - r), hgt);
    sh.absarc(-(half - r), hgt - r, r, Math.PI / 2, Math.PI, false);
    sh.lineTo(-half, 0);
    return sh;
  };
  const outer = arch(mw / 2, mH);
  const innerPts = arch(mw / 2 - fw, mH - 2 * fw).getPoints(8).map((p) => new THREE.Vector2(p.x, p.y + fw));
  outer.holes.push(new THREE.Path(innerPts.reverse()));
  const zm = -d / 2 + 0.006;
  k.extrude(body, outer, 0.03, { at: [0, m0, zm], bevel: 0.004, bevelSeg: 1, curveSeg: 8, grain: 'y' });
  const glass = arch(mw / 2 - fw + 0.002, mH - 2 * fw + 0.004);
  k.extrude(M.mirror(), glass, 0.008, { at: [0, m0 + fw - 0.002, zm + 0.012], bevel: 0.004, bevelSeg: 1, curveSeg: 8 });
  k.bx(dark, -mw / 2 + 0.01, mw / 2 - 0.01, m0 + 0.01, m0 + mH * 0.6, zm - 0.004, zm + 0.004, { r: 0 });
  // stand-offs from the base to the mirror
  k.mirrorX(() => k.bx(body, mw / 2 - 0.09, mw / 2 - 0.04, bh, m0 + 0.02, zm, zm + 0.03, { r: 0.004 }));
  // things on top
  const ty = bh;
  k.cyl(M.brass(), Math.min(0.11, w * 0.13), 0.008, -w * 0.24, ty + 0.004, 0.02, { seg: 20, bevel: 0.002 });
  vase(k, M.glass('#e8c9a8', 0.55), -w * 0.27, ty + 0.008, 0.03, 0.11, 0.022, 0);
  vase(k, M.ceramic('#d7b7b0'), -w * 0.2, ty + 0.008, 0.0, 0.075, 0.02, 1);
  k.cyl(M.ceramic('#efe9df'), 0.045, 0.05, w * 0.27, ty + 0.025, 0.03, { seg: 18, bevel: 0.006 });
  k.sphere(M.brass(), 0.008, w * 0.27, ty + 0.055, 0.03, { seg: 8 });
}

// ---------------------------------------------------------------------------------------------
// study desk

function studyDesk(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const top = M.body(color);
  const metal = isDark(color) ? M.metal('#8a8d91', 0.35, 'steel') : M.black();
  const topT = 0.028;
  const ty = h - 0.001;
  k.extrude(top, new THREE.Shape([new THREE.Vector2(-w / 2, -d / 2), new THREE.Vector2(w / 2, -d / 2), new THREE.Vector2(w / 2, d / 2), new THREE.Vector2(-w / 2, d / 2)]), topT, {
    at: [0, ty - topT, 0],
    rot: [-Math.PI / 2, 0, 0],
    bevel: 0.005,
    bevelSeg: 2,
    grain: 'x',
  });
  // two loop frames in square tube
  const tb = 0.028;
  const lx = w / 2 - 0.07;
  const lz = d / 2 - 0.05;
  const fy = ty - topT;
  k.mirrorX(() => {
    k.box(metal, tb, fy, tb, lx, fy / 2, -lz, { r: 0.004 });
    k.box(metal, tb, fy, tb, lx, fy / 2, lz, { r: 0.004 });
    k.box(metal, tb, tb, 2 * lz - tb, lx, fy - tb / 2, 0, { r: 0.004 });
    k.box(metal, tb, tb * 0.8, 2 * lz - tb, lx, 0.09, 0, { r: 0.004 });
  });
  k.box(metal, 2 * lx - tb, tb, tb * 0.7, 0, fy - tb / 2, -lz, { r: 0.003 });
  // hung drawer on the right
  const dwid = Math.min(0.42, w * 0.36);
  const dh = 0.105;
  const dx = lx - tb / 2 - 0.02 - dwid / 2;
  k.bx(top, dx - dwid / 2, dx + dwid / 2, fy - dh, fy, -lz + 0.03, d / 2 - 0.045, { r: 0.004, grain: 'x' });
  k.box(top, dwid + 0.008, dh - 0.006, 0.018, dx, fy - dh / 2 - 0.002, d / 2 - 0.036, { r: 0.003, grain: 'x' });
  lipPull(k, metal, dx, fy - dh / 2, d / 2 - 0.028, 0.11);
  // cable grommet
  k.cyl(M.plastic('#202022', 0.5), 0.028, 0.002, -w / 2 + 0.16, h - 0.001, -d / 2 + 0.09, { seg: 16 });
}

// ---------------------------------------------------------------------------------------------
// desk chair

function deskChair(k: Kit, s: Spec) {
  // modelled at its real footprint; a smaller box squeezes it rather than letting arms and castors poke out
  const fx = Math.min(1, s.w / 0.58);
  const fz = Math.min(1, s.d / 0.58);
  const fy = Math.min(1, s.h / 0.8);
  k.at({ scale: [fx, fy, fz] }, () => deskChairAt(k, { ...s, w: s.w / fx, d: s.d / fz, h: s.h / fy }));
}

function deskChairAt(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const R = Math.min(w, d) / 2 - 0.004;
  const sy = h / 0.98;
  const black = M.plastic('#1e1f21', 0.5);
  const chrome = M.chrome();
  const fab = M.fabric(color);
  // 5-star base with twin castors
  const hubY = 0.085;
  k.cyl(black, 0.045, 0.05, 0, hubY + 0.01, 0, { seg: 14, bevel: 0.008 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    const er = R - 0.035;
    k.at({ rot: [0, -a, 0] }, () => {
      k.loft(
        black,
        [0, 0.33, 0.66, 1].map((t): V3[] => {
          const x = 0.03 + (er - 0.03) * t;
          const y = hubY + 0.014 - 0.03 * t * t;
          const hw = 0.022 - 0.008 * t;
          const hh = 0.02 - 0.007 * t;
          return [
            [x, y - hh, -hw],
            [x, y - hh, hw],
            [x, y + hh * 0.6, hw],
            [x, y + hh, 0],
            [x, y + hh * 0.6, -hw],
          ];
        }),
        { capEnd: true },
      );
      k.cyl(black, 0.008, 0.03, er, 0.058, 0, { seg: 6 });
      for (const sz of [-1, 1]) k.cyl(black, 0.026, 0.018, er, 0.026, sz * 0.014, { seg: 10, axis: 'z' });
    });
  }
  // gas lift
  const seatY = 0.44 * sy;
  k.cyl(black, 0.027, seatY * 0.42, 0, hubY + 0.03 + seatY * 0.21, 0, { seg: 12 });
  k.cyl(chrome, 0.016, seatY - 0.06 - (hubY + 0.03 + seatY * 0.4), 0, (seatY - 0.06 + hubY + 0.03 + seatY * 0.4) / 2, 0, { seg: 12 });
  // mechanism + lever
  k.box(black, 0.2, 0.05, 0.24, 0, seatY - 0.04, 0.0, { r: 0.01 });
  k.rod(black, [0.08, seatY - 0.05, 0.04], [0.24, seatY - 0.055, 0.06], 0.006, { seg: 6 });
  k.cyl(black, 0.012, 0.04, 0.25, seatY - 0.056, 0.062, { seg: 8, axis: 'x', bevel: 0.003 });
  // seat
  const sw = Math.min(0.47, w - 0.12);
  const sd = Math.min(0.45, d - 0.13);
  const sz0 = 0.055;
  k.soft(black, sw - 0.02, 0.03, sd - 0.02, 0, seatY - 0.005, sz0, { r: 0.014, seg: [1, 1, 1] });
  k.soft(fab, sw, 0.065, sd, 0, seatY + 0.035, sz0, { r: 0.03, seg: [2, 1, 2], puff: { py: 0.012 }, skip: ['ny'] });
  // back: tube frame + mesh, curved in plan, reclined
  const bw = Math.min(0.46, w - 0.1);
  const by0 = seatY + 0.16;
  const by1 = Math.max(by0 + 0.2, h - 0.012);
  const zb = sz0 - sd / 2 - 0.005;
  const surf = (x: number, y: number): V3 => {
    const u = x / (bw / 2);
    const v = (y - by0) / (by1 - by0);
    return [x, y, zb + 0.05 * u * u - 0.055 * v + 0.035 * Math.sin(v * Math.PI) * (1 - 0.5 * u * u)];
  };
  const cr = 0.07;
  const loop: V3[] = [];
  const corners: [number, number, number][] = [
    [bw / 2 - cr, by1 - cr, 0],
    [-(bw / 2 - cr), by1 - cr, Math.PI / 2],
    [-(bw / 2 - cr), by0 + cr, Math.PI],
    [bw / 2 - cr, by0 + cr, Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      loop.push(surf(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr));
    }
  // subdivide the long straight runs so the frame follows the curve
  const dense: V3[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    dense.push(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(len / 0.07);
    for (let j = 1; j < n; j++) {
      const t = j / n;
      dense.push(surf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  k.pipe(black, dense, 0.012, { radial: 6, closed: true });
  // mesh surface
  {
    const nx = 8;
    const ny = 9;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        let x = -bw / 2 + (bw * i) / nx;
        let y = by0 + ((by1 - by0) * j) / ny;
        // keep the corner vertices inside the rounded frame
        const ex = Math.abs(x) - (bw / 2 - cr);
        const ey = y > (by0 + by1) / 2 ? y - (by1 - cr) : by0 + cr - y;
        if (ex > 0 && ey > 0) {
          const l = Math.hypot(ex, ey);
          if (l > cr) {
            x = Math.sign(x) * (bw / 2 - cr + (ex / l) * cr);
            y = y > (by0 + by1) / 2 ? by1 - cr + (ey / l) * cr : by0 + cr - (ey / l) * cr;
          }
        }
        const p = surf(x, y);
        pos.push(p[0], p[1], p[2]);
        uv.push(x, y);
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    k.add(M.mesh(isDark(color) ? '#2a2b2e' : tint(color, -0.45)), geo);
  }
  // lumbar bar + spine connecting the back to the mechanism
  const lum = surf(0, by0 + (by1 - by0) * 0.3);
  k.tube(black, [surf(-bw / 2 + 0.02, by0 + (by1 - by0) * 0.3), [0, lum[1], lum[2] - 0.012], surf(bw / 2 - 0.02, by0 + (by1 - by0) * 0.3)], 0.011, { radial: 6, seg: 8 });
  const low = surf(0, by0);
  k.tube(
    black,
    [
      [0, seatY - 0.05, -0.08],
      [0, seatY - 0.045, zb - 0.02],
      [0, by0 - 0.04, low[2] - 0.022],
      [0, lum[1], lum[2] - 0.014],
    ],
    0.019,
    { radial: 6, seg: 12 },
  );
  // arms
  k.mirrorX(() => {
    const ax = Math.min(sw / 2 + 0.018, w / 2 - 0.042);
    k.tube(
      black,
      [
        [sw / 2 - 0.06, seatY - 0.02, sz0 - 0.02],
        [ax, seatY + 0.0, sz0 - 0.02],
        [ax + 0.01, seatY + 0.19 * sy, sz0 - 0.03],
      ],
      0.013,
      { radial: 6, seg: 8 },
    );
    k.soft(black, 0.065, 0.028, 0.25, ax + 0.004, seatY + 0.2 * sy + 0.012, sz0 + 0.0, { r: 0.012, seg: [1, 1, 2] });
  });
}

// ---------------------------------------------------------------------------------------------
// bookshelf

function bookshelf(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const back = M.body(tint(color, isDark(color) ? 0.08 : -0.1));
  const t = 0.02;
  const plinth = Math.min(0.06, h * 0.06);
  const zf = d / 2;
  k.bx(M.lam('#1b1a19', 0.9), -w / 2 + 0.015, w / 2 - 0.015, 0, plinth + 0.004, -d / 2 + 0.01, zf - 0.03, { r: 0 });
  k.mirrorX(() => k.bx(body, w / 2 - t, w / 2, plinth, h, -d / 2, zf, { r: 0.004 }));
  k.bx(body, -w / 2 + t, w / 2 - t, h - t, h, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(body, -w / 2 + t, w / 2 - t, plinth, plinth + t, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(back, -w / 2 + t, w / 2 - t, plinth + t, h - t, -d / 2 + 0.002, -d / 2 + 0.01, { r: 0 });
  const rows = Math.max(2, Math.round((h - plinth) / 0.36));
  const bays = Math.max(1, Math.round(w / 0.85));
  const bw = (w - 2 * t - (bays - 1) * t) / bays;
  const pitch = (h - plinth - t) / rows;
  for (let b = 1; b < bays; b++) {
    const x = -w / 2 + t + b * (bw + t) - t / 2;
    k.bx(body, x - t / 2, x + t / 2, plinth + t, h - t, -d / 2 + 0.01, zf - 0.004, { r: 0.003 });
  }
  for (let r = 1; r < rows; r++) k.bx(body, -w / 2 + t, w / 2 - t, plinth + r * pitch, plinth + r * pitch + t, -d / 2 + 0.01, zf - 0.004, { r: 0.003, grain: 'x' });
  for (let r = 0; r < rows; r++)
    for (let b = 0; b < bays; b++) {
      const x0 = -w / 2 + t + b * (bw + t);
      const y = plinth + r * pitch + t;
      const clear = pitch - t - 0.012;
      if (clear < 0.1) continue;
      const roll = k.rnd();
      if (r === rows - 1 && roll < 0.5) {
        // top shelf: a plant and a few books
        const px = x0 + bw * 0.72;
        const pr = Math.min(0.065, d * 0.26);
        k.lathe(M.ceramic('#e6dfd2'), [[0, 0], [pr * 0.7, 0], [pr, pr * 1.5], [pr * 0.9, pr * 1.5], [pr * 0.8, pr * 1.3], [0, pr * 1.3]], px, y, 0, { seg: 14 });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + k.r(0, 0.5);
          const len = Math.min(clear - pr * 1.5 - 0.01, k.r(0.1, 0.17));
          k.rod(M.lam('#4f7a4a', 0.6), [px + Math.cos(a) * 0.01, y + pr * 1.3, Math.sin(a) * 0.01], [px + Math.cos(a) * pr * 0.9, y + pr * 1.3 + len, Math.sin(a) * pr * 0.9], 0.004, { seg: 5, rTop: 0.012 });
        }
        books(k, x0, x0 + bw * 0.55, y, -d / 2 + 0.012, zf - 0.008, clear, { fill: 0.9, objects: false });
      } else books(k, x0, x0 + bw, y, -d / 2 + 0.012, zf - 0.008, clear, { fill: k.r(0.62, 0.92) });
    }
}

export const bedroom: Registry = {
  'bed-queen': (k, s) => bed(k, s, 'queen'),
  'bed-king': (k, s) => bed(k, s, 'king'),
  'bed-single': (k, s) => bed(k, s, 'single'),
  'bedside-table': bedsideTable,
  'wardrobe-2door': (k, s) => wardrobe(k, s, false),
  'wardrobe-3door': (k, s) => wardrobe(k, s, true),
  dresser,
  'study-desk': studyDesk,
  'desk-chair': deskChair,
  bookshelf,
};
