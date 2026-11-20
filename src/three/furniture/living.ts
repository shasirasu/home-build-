// Living room: sofas, armchair, coffee table, TV unit, TV, rug, side table, shoe rack.

import * as THREE from 'three';
import { clamp, roundRectLoop, roundRectShape, type Kit, type V3 } from './kit';
import { M, canvasTex, grain, isDark, mix, tint } from './materials';
import { books, flutedGeo, lipPull, roundLeg, vase } from './parts';
import type { Registry, Spec } from './types';

// ---------------------------------------------------------------------------------------------
// sofas

function sofa(k: Kit, s: Spec, armchair: boolean) {
  const { w, d, h, color } = s;
  const fab = M.fabric(color);
  const piping = M.fabric(tint(color, -0.24));
  const wood = M.wood(armchair ? '#8a5a2b' : '#4e3523');
  const legH = armchair ? 0.17 : 0.11;
  const armW = clamp(armchair ? 0.125 : 0.17, 0.07, w * 0.2);
  const seatTop = Math.min(0.44, h * 0.52);
  const deckY = legH + (seatTop - legH) * 0.42;
  const cushH = seatTop - deckY;
  const armTop = Math.min(armchair ? 0.6 : 0.63, h * 0.74);
  const backT = Math.min(0.19, d * 0.22);
  const innerW = w - 2 * armW - 0.016;
  const n = Math.max(1, Math.round(innerW / 0.62));
  const cw = innerW / n;
  const zBF = -d / 2 + backT + 0.004; // front face of the back frame

  // base frame
  k.soft(fab, w - 0.03, deckY - legH, d - 0.04, 0, (legH + deckY) / 2, -0.004, { r: 0.022, seg: [1, 1, 1], skip: ['ny'] });
  k.box(M.lam('#1c1a18', 0.9), w - 0.08, 0.012, d - 0.09, 0, legH + 0.004, 0, { r: 0 });
  // arms
  k.mirrorX(() => {
    k.soft(fab, armW, armTop - legH, d - 0.012, w / 2 - armW / 2 - 0.008, (legH + armTop) / 2, 0, {
      r: Math.min(0.055, armW * 0.42),
      seg: [1, 2, 2],
      puff: { py: 0.01, px: 0.007 },
      skip: ['ny'],
    });
  });
  // back frame
  const backTop = h - 0.085;
  k.soft(fab, innerW + 0.05, backTop - legH, backT, 0, (legH + backTop) / 2, -d / 2 + backT / 2 + 0.004, { r: Math.min(0.05, backT * 0.4), seg: [2, 2, 1], skip: ['ny'] });

  // seat cushions
  const zFront = d / 2 - 0.012;
  const cd = zFront - zBF;
  const rS = Math.min(0.045, cushH * 0.4);
  const eS = rS * 0.293;
  for (let i = 0; i < n; i++) {
    const x = -innerW / 2 + cw * (i + 0.5);
    const cwi = cw - 0.007;
    k.soft(fab, cwi, cushH, cd, x, deckY + cushH / 2, (zBF + zFront) / 2, { r: rS, seg: [2, 1, 2], puff: { py: 0.022, pz: 0.006 }, skip: ['ny'] });
    const loop = roundRectLoop(cwi - 2 * eS + 0.004, cd - 2 * eS + 0.004, rS * 0.8, 2).map((p): V3 => [p[0] + x, seatTop - eS + 0.003, p[2] + (zBF + zFront) / 2]);
    k.pipe(piping, loop, 0.0048, { radial: 4, closed: true });
  }
  // back cushions (lean back against the frame)
  const lean = 0.17;
  const bt = Math.min(0.15, d * 0.18);
  const L = (h - seatTop + 0.012 - bt * Math.sin(lean) - 0.024) / Math.cos(lean);
  const rB = Math.min(0.05, bt * 0.42);
  const eB = rB * 0.293;
  for (let i = 0; i < n; i++) {
    const x = -innerW / 2 + cw * (i + 0.5);
    const cwi = cw - 0.009;
    const cy = seatTop - 0.012 + (L / 2) * Math.cos(lean) + (bt / 2) * Math.sin(lean);
    const cz = zBF + (L / 2) * Math.sin(lean) + (bt / 2) * Math.cos(lean) - 0.004;
    k.at({ at: [x, cy, cz], rot: [-lean, 0, 0] }, () => {
      k.soft(fab, cwi, L, bt, 0, 0, 0, { r: rB, seg: [2, 2, 1], puff: { pz: 0.028, py: 0.008 }, skip: ['ny'] });
      const loop = roundRectLoop(cwi - 2 * eB + 0.004, L - 2 * eB + 0.004, rB * 0.8, 2).map((p): V3 => [p[0], p[2], bt / 2 - eB + 0.003]);
      k.pipe(piping, loop, 0.0048, { radial: 4, closed: true });
    });
  }
  // throw pillows
  const accents = [mix(color, '#efe6d6', 0.72), isDark(color) ? '#c9a24a' : mix(color, '#7a3b2e', 0.75), mix(color, '#2f4858', 0.6)];
  const ps = Math.min(0.4, cw * 0.72, (h - seatTop) * 0.98);
  const zP = zBF + bt + L * Math.sin(lean) * 0.5 + 0.075;
  const pil = (x: number, ry: number, ci: number, sz = ps) =>
    k.at({ at: [x, Math.min(seatTop + sz * 0.49 + 0.012, h - sz * 0.5 - 0.004), zP], rot: [0, ry, 0] }, () => k.pillow(M.fabric(accents[ci]), sz, sz * 0.3, sz, 0, 0, 0, { rot: [1.28, 0, 0] }));
  if (armchair) pil(0, 0.05, 0, Math.min(0.38, innerW * 0.7));
  else {
    pil(-innerW / 2 + ps * 0.56, 0.32, 0);
    pil(innerW / 2 - ps * 0.56, -0.3, 1);
    if (n >= 3) pil(-innerW / 2 + ps * 1.3, 0.12, 2, ps * 0.84);
  }
  // legs
  const lx = w / 2 - 0.075;
  const lz = d / 2 - 0.075;
  const xs = w > 2.5 ? [-lx, 0, lx] : [-lx, lx];
  for (const x of xs)
    for (const z of [-lz, lz]) {
      if (armchair) k.rod(wood, [x + Math.sign(x) * 0.022, 0.004, z + Math.sign(z) * 0.022], [x, legH + 0.02, z], 0.014, { rTop: 0.023, seg: 10 });
      else roundLeg(k, wood, x, z, 0, legH + 0.012, 0.027, 0.019);
    }
}

// ---------------------------------------------------------------------------------------------
// coffee table

function coffeeTable(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const wood = M.body(color);
  const topT = Math.min(0.034, h * 0.12);
  const leg = Math.min(0.046, w * 0.1, d * 0.14);
  const ix = w / 2 - Math.min(0.05, w * 0.08) - leg / 2;
  const iz = d / 2 - Math.min(0.045, d * 0.1) - leg / 2;
  // top with rounded corners
  k.extrude(wood, roundRectShape(w, d, 0.028), topT, { at: [0, h - topT, 0], rot: [-Math.PI / 2, 0, 0], bevel: 0.005, bevelSeg: 2, curveSeg: 4, grain: 'x' });
  // legs + apron
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(wood, leg, h - topT, leg, sx * ix, (h - topT) / 2, sz * iz, { r: 0.006 });
  const ay = h - topT - 0.03;
  for (const sz of [-1, 1]) k.box(wood, 2 * ix - leg, 0.05, 0.02, 0, ay, sz * iz, { r: 0.003 });
  for (const sx of [-1, 1]) k.box(wood, 0.02, 0.05, 2 * iz - leg, sx * ix, ay, 0, { r: 0.003 });
  // slatted lower shelf
  const sy = Math.min(0.13, h * 0.32);
  for (const sx of [-1, 1]) k.box(wood, 0.022, 0.035, 2 * iz - leg, sx * ix, sy - 0.02, 0, { r: 0.003 });
  const span = 2 * iz + leg - 0.02;
  const ns = Math.max(3, Math.round(span / 0.062));
  const sw = span / ns;
  for (let i = 0; i < ns; i++) k.box(wood, 2 * ix + leg - 0.012, 0.014, sw - 0.014, 0, sy + 0.005, -span / 2 + sw * (i + 0.5), { r: 0.003, grain: 'x' });
  // a couple of magazines and a bowl on the shelf
  const paint = M.paint(0.75);
  const mx = -w * 0.2;
  const ml = Math.min(0.3, w * 0.3);
  const mdp = Math.min(0.22, d * 0.4);
  k.box(paint, ml, 0.012, mdp, mx, sy + 0.018, 0.01, { r: 0.002, color: '#2f4858', rot: [0, 0.08, 0] });
  k.box(paint, ml * 0.9, 0.01, mdp * 0.9, mx + 0.01, sy + 0.029, 0, { r: 0.002, color: '#e3dccd', rot: [0, -0.12, 0] });
  if (w > 0.8) vase(k, M.ceramic('#d9d2c4'), w * 0.22, sy + 0.012, 0, 0.07, Math.min(0.11, d * 0.2), 2);
}

// ---------------------------------------------------------------------------------------------
// TV unit

function tvUnit(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const dark = M.lam(tint(color, isDark(color) ? 0.12 : -0.72), 0.75);
  const metal = M.black();
  const legH = Math.min(0.11, h * 0.24);
  const t = 0.02;
  const y0 = legH;
  const zf = d / 2;
  // carcass
  k.bx(body, -w / 2, w / 2, h - t, h, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(body, -w / 2, w / 2, y0, y0 + t, -d / 2, zf - 0.004, { r: 0.003, grain: 'x' });
  k.bx(body, -w / 2, -w / 2 + t, y0 + t, h - t, -d / 2, zf - 0.004, { r: 0.003 });
  k.bx(body, w / 2 - t, w / 2, y0 + t, h - t, -d / 2, zf - 0.004, { r: 0.003 });
  k.bx(dark, -w / 2 + t, w / 2 - t, y0 + t, h - t, -d / 2 + 0.004, -d / 2 + 0.014, { r: 0 });
  const n = Math.max(2, Math.round(w / 0.6));
  const mw = (w - 2 * t) / n;
  const ih = h - 2 * t - y0;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + t + i * mw;
    const xc = x0 + mw / 2;
    if (i > 0) k.bx(body, x0 - t / 2, x0 + t / 2, y0 + t, h - t, -d / 2 + 0.014, zf - 0.006, { r: 0.002 });
    if (i % 2 === 1) {
      // open bay: shelf, set-top box, books
      const shelfY = y0 + t + ih * 0.5;
      k.bx(body, x0 + t / 2, x0 + mw - t / 2, shelfY - 0.008, shelfY + 0.008, -d / 2 + 0.014, zf - 0.03, { r: 0.002, grain: 'x' });
      k.box(M.plastic('#17181a', 0.35), Math.min(0.3, mw * 0.6), 0.04, Math.min(0.2, d * 0.55), xc - mw * 0.08, shelfY + 0.028, 0, { r: 0.004 });
      k.box(M.glow('#58c3ff', 2.5, '#0a1a22'), 0.012, 0.004, 0.002, xc - mw * 0.08 + Math.min(0.3, mw * 0.6) / 2 - 0.03, shelfY + 0.026, Math.min(0.2, d * 0.55) / 2 + 0.001, { r: 0 });
      books(k, x0 + t, x0 + mw - t, y0 + t, -d / 2 + 0.02, zf - 0.03, ih * 0.5 - 0.02, { fill: 0.7 });
    } else {
      // fluted drawer front
      const fw = mw - 0.006 - (i === 0 || i === n - 1 ? 0 : 0);
      const fh = ih - 0.006;
      const yc = y0 + t + ih / 2;
      k.box(body, fw - 0.004, fh, 0.014, xc, yc, zf - 0.024, { r: 0.002 });
      k.add(body, flutedGeo(fw - 0.004, fh - 0.03, 0.019, 0.007), { at: [xc, yc - 0.012, zf - 0.017] });
      k.box(body, fw - 0.004, 0.026, 0.008, xc, yc + fh / 2 - 0.013, zf - 0.014, { r: 0.002, grain: 'x' });
      lipPull(k, M.brass(), xc, yc + fh / 2 - 0.006, zf - 0.017, Math.min(0.16, fw * 0.4));
    }
  }
  // metal legs
  const lx = w / 2 - 0.09;
  const lz = d / 2 - 0.07;
  const xs = w > 1.5 ? [-lx, 0, lx] : [-lx, lx];
  for (const x of xs) for (const z of [-lz, lz]) k.rod(metal, [x + Math.sign(x) * 0.014, 0.002, z + Math.sign(z) * 0.012], [x, y0, z], 0.008, { rTop: 0.014, seg: 8 });
}

// ---------------------------------------------------------------------------------------------
// TV (wall)

function tv(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.plastic(color, 0.38);
  const zf = d / 2;
  const pt = Math.min(0.022, d * 0.45);
  k.box(body, w - 0.004, h - 0.004, pt, 0, h / 2, zf - pt / 2 - 0.001, { r: 0.003 });
  // slim metal edge frame
  const edge = M.metal('#4a4c50', 0.35, 'tv-frame');
  for (const sy of [0.002, h - 0.002]) k.box(edge, w, 0.004, pt + 0.002, 0, sy, zf - pt / 2 - 0.001, { r: 0.001 });
  for (const sx of [-1, 1]) k.box(edge, 0.004, h, pt + 0.002, sx * (w / 2 - 0.002), h / 2, zf - pt / 2 - 0.001, { r: 0.001 });
  // screen with thin bezel and a slightly deeper chin
  const bz = 0.007;
  const chin = 0.016;
  k.quad(M.smoked('#07080a'), w - 2 * bz, h - bz - chin, { at: [0, chin + (h - bz - chin) / 2, zf - 0.0004] });
  k.box(M.metal('#8d9196', 0.3), Math.min(0.05, w * 0.05), 0.004, 0.001, 0, chin * 0.5 + 0.002, zf - 0.0004, { r: 0 });
  k.box(M.glow('#ff4a3a', 2.2, '#2a0a08'), 0.004, 0.003, 0.001, w / 2 - 0.03, chin * 0.5 + 0.002, zf - 0.0004, { r: 0 });
  // rear housing + bracket
  const rb = d - pt;
  if (rb > 0.006) {
    k.box(body, w * 0.62, h * 0.56, rb * 0.72, 0, h * 0.44, zf - pt - rb * 0.36, { r: 0.006 });
    k.box(M.black(), Math.min(0.42, w * 0.34), Math.min(0.24, h * 0.34), rb, 0, h * 0.5, -d / 2 + rb / 2, { r: 0.002 });
  }
}

// ---------------------------------------------------------------------------------------------
// rug

function rugTex(color: string): THREE.Texture | null {
  return canvasTex(`rug:${color}`, 256, 256, [0.44, 0.44], (ctx, W, H, r) => {
    const light = tint(color, 0.62);
    const deep = tint(color, -0.42);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    const diamond = (cx: number, cy: number, rx: number, ry: number) => {
      ctx.beginPath();
      ctx.moveTo(cx - rx, cy);
      ctx.lineTo(cx, cy - ry);
      ctx.lineTo(cx + rx, cy);
      ctx.lineTo(cx, cy + ry);
      ctx.closePath();
    };
    ctx.lineJoin = 'miter';
    for (const [ox, oy] of [
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
      [W / 2, H / 2],
    ]) {
      ctx.strokeStyle = light;
      ctx.lineWidth = 7;
      diamond(ox, oy, W * 0.47, H * 0.47);
      ctx.stroke();
      ctx.strokeStyle = deep;
      ctx.lineWidth = 4;
      diamond(ox, oy, W * 0.33, H * 0.33);
      ctx.stroke();
      ctx.fillStyle = light;
      diamond(ox, oy, W * 0.1, H * 0.1);
      ctx.fill();
      ctx.fillStyle = deep;
      diamond(ox, oy, W * 0.04, H * 0.04);
      ctx.fill();
    }
    grain(ctx, W, H, r, 0.13); // wool
  });
}

const fringeTex = () =>
  canvasTex('fringe', 64, 32, [0.026, 1], (ctx, W, H, r) => {
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) {
      ctx.fillStyle = `rgb(${225 + r() * 20},${214 + r() * 20},${190 + r() * 20})`;
      ctx.fillRect(x + 1, 0, 4.5, H);
    }
  });

function rug(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const alongX = w >= d;
  const L = alongX ? w : d; // fringe on the two ends of the long side
  const S = alongX ? d : w;
  const fr = Math.min(0.04, L * 0.04);
  const bl = L - 2 * fr;
  const border = M.fabric(tint(color, -0.38), { rough: 1 });
  const cream = M.picture(`rug-line:${color}`, null, tint(color, 0.66), 1);
  const field = M.picture(`rug:${color}`, rugTex(color), color, 0.98);
  const fringe = (() => {
    const tex = fringeTex();
    const key = 'rug-fringe';
    const m = M.picture(key, tex, '#e6dcc4', 1) as THREE.MeshStandardMaterial;
    m.alphaTest = 0.5;
    m.side = THREE.DoubleSide;
    m.name = 'fringe';
    m.userData.noCast = true;
    return m;
  })();
  const b1 = Math.min(0.075, S * 0.09);
  k.at({ rot: [0, alongX ? 0 : Math.PI / 2, 0] }, () => {
    const st = Math.min(0.002, h * 0.2); // step between the woven layers
    k.box(border, bl, h - 2 * st, S, 0, (h - 2 * st) / 2, 0, { r: (h - 2 * st) * 0.45 });
    k.quad(cream, bl - 2 * b1, S - 2 * b1, { at: [0, h - st, 0], rot: [-Math.PI / 2, 0, 0] });
    k.quad(field, bl - 2 * b1 - 0.03, S - 2 * b1 - 0.03, { at: [0, h, 0], rot: [-Math.PI / 2, 0, 0] });
    // fringe strips: u runs along the edge
    for (const sx of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(S - 0.01, fr);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (S - 0.01), uv.getY(i));
      k.add(fringe, geo, { at: [sx * (bl / 2 + fr / 2 - 0.002), h * 0.35, 0], rot: [-Math.PI / 2, 0, (sx * Math.PI) / 2] });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// side table

function sideTable(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const R = Math.min(w, d) / 2;
  const dark = isDark(color);
  const metal = dark ? M.brass() : M.black();
  const topT = 0.022;
  k.lathe(
    M.stone(color, 'marble', 0.18),
    [
      [0, h - topT],
      [R - 0.006, h - topT],
      [R, h - topT + 0.006],
      [R, h - 0.004],
      [R - 0.004, h],
      [0, h],
    ],
    0,
    0,
    0,
    { seg: 36 },
  );
  k.cyl(metal, R * 0.62, 0.008, 0, h - topT - 0.004, 0, { seg: 24 });
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 6;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    k.rod(metal, [c * (R - 0.02), 0, sn * (R - 0.02)], [c * R * 0.5, h - topT - 0.006, sn * R * 0.5], 0.0075, { seg: 8 });
    k.cyl(metal, 0.012, 0.004, c * (R - 0.02), 0.002, sn * (R - 0.02), { seg: 8 });
  }
  // brace ring at a third of the height
  const by = h * 0.3;
  const br = R * 0.5 + (R - 0.02 - R * 0.5) * (1 - by / (h - topT));
  k.torus(metal, br, 0.005, 0, by, 0, { rot: [Math.PI / 2, 0, 0], seg: 28, tseg: 5 });
}

// ---------------------------------------------------------------------------------------------
// shoe rack

function shoeRack(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.body(color);
  const dark = M.lam('#1b1a19', 0.8);
  const metal = isDark(color) ? M.brass() : M.black();
  const legH = Math.min(0.09, h * 0.12);
  const t = 0.018;
  const zf = d / 2;
  // carcass
  k.bx(body, -w / 2, w / 2, h - 0.022, h, -d / 2, zf, { r: 0.004, grain: 'x' });
  k.bx(body, -w / 2 + 0.004, -w / 2 + 0.004 + t, legH, h - 0.022, -d / 2, zf - 0.022, { r: 0.003 });
  k.bx(body, w / 2 - 0.004 - t, w / 2 - 0.004, legH, h - 0.022, -d / 2, zf - 0.022, { r: 0.003 });
  k.bx(dark, -w / 2 + 0.01, w / 2 - 0.01, legH, h - 0.022, -d / 2 + 0.002, zf - 0.03, { r: 0 });
  const cols = Math.max(1, Math.round(w / 0.75));
  const rows = Math.max(1, Math.round((h - legH) / 0.41));
  const cw = (w - 0.008 - 2 * t) / cols;
  const rh = (h - 0.022 - legH) / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const xc = -w / 2 + 0.004 + t + cw * (c + 0.5);
      const yc = legH + rh * (r + 0.5);
      const fw = cw - 0.005;
      const fh = rh - 0.005;
      k.box(body, fw, fh, 0.018, xc, yc, zf - 0.015, { r: 0.003, grain: 'x' });
      // finger pull: recessed slot with a metal lip
      k.box(dark, fw * 0.36, 0.018, 0.004, xc, yc + fh / 2 - 0.03, zf - 0.0065, { r: 0 });
      k.box(metal, fw * 0.36 + 0.012, 0.005, 0.008, xc, yc + fh / 2 - 0.019, zf - 0.004, { r: 0.001 });
      // vent slots
      for (let v = 0; v < 3; v++) k.box(dark, fw * 0.24, 0.005, 0.003, xc, yc - fh / 2 + 0.05 + v * 0.016, zf - 0.006, { r: 0 });
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(body, 0.035, legH, 0.035, sx * (w / 2 - 0.045), legH / 2, sz * (d / 2 - 0.045), { r: 0.004 });
}

export const living: Registry = {
  'sofa-3seat': (k, s) => sofa(k, s, false),
  'sofa-2seat': (k, s) => sofa(k, s, false),
  armchair: (k, s) => sofa(k, s, true),
  'coffee-table': coffeeTable,
  'tv-unit': tvUnit,
  tv,
  rug,
  'side-table': sideTable,
  'shoe-rack': shoeRack,
};
