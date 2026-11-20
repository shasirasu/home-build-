// Dining sets: one table with chairs along both long sides. Resizing keeps the chair size and re-spaces them.

import type * as THREE from 'three';
import { roundRectShape, type Kit } from './kit';
import { M, isDark, isWoody, mix, tint } from './materials';
import { vase } from './parts';
import type { Registry, Spec } from './types';

const CHAIR_W = 0.44;
const CHAIR_D = 0.43;
const CHAIR_OUT = 0.36; // how far a tucked-in chair reaches beyond the table edge

/** Dining chair, local front = +Z, back legs rake back by 3 cm. Fits [-0.22, 0.22] × [0, H] × [-0.245, 0.215]. */
function chair(k: Kit, wood: THREE.Material, fab: THREE.Material, H: number) {
  const sw = CHAIR_W;
  const sd = CHAIR_D;
  const seatY = Math.min(0.44, H * 0.5);
  const lx = sw / 2 - 0.028;
  const zf = sd / 2 - 0.03;
  const zb = -sd / 2 + 0.028;
  k.mirrorX(() => {
    k.rod(wood, [lx - 0.008, 0, zf + 0.004], [lx, seatY, zf], 0.013, { rTop: 0.019, seg: 6 });
    k.rod(wood, [lx - 0.006, 0, zb - 0.022], [lx, seatY, zb], 0.014, { rTop: 0.019, seg: 6 });
    k.rod(wood, [lx, seatY - 0.01, zb], [lx - 0.012, H - 0.012, zb - 0.036], 0.019, { rTop: 0.014, seg: 6 });
    k.box(wood, 0.018, 0.05, zf - zb - 0.03, lx, seatY - 0.03, (zf + zb) / 2, { r: 0 });
  });
  k.box(wood, 2 * lx - 0.03, 0.05, 0.018, 0, seatY - 0.03, zf, { r: 0 });
  k.box(wood, 2 * lx - 0.03, 0.05, 0.018, 0, seatY - 0.03, zb, { r: 0 });
  k.soft(fab, sw - 0.012, 0.05, sd - 0.03, 0, seatY + 0.02, 0.008, { r: 0.018, seg: [1, 1, 1], cs: 1, puff: { py: 0.008 } });
  // back: top rail + upholstered pad, following the rake of the posts
  const rake = Math.atan2(0.036, H - seatY);
  const zAt = (y: number) => zb - ((y - seatY) / (H - seatY)) * 0.036;
  k.box(wood, 2 * lx - 0.02, 0.05, 0.02, 0, H - 0.04, zAt(H - 0.04), { r: 0.004, rot: [-rake, 0, 0] });
  const py = seatY + (H - seatY) * 0.52;
  k.soft(fab, 2 * lx - 0.05, (H - seatY) * 0.46, 0.03, 0, py, zAt(py) + 0.012, { r: 0.013, seg: [1, 1, 1], cs: 1, puff: { pz: 0.006 }, rot: [-rake, 0, 0] });
  k.box(wood, 2 * lx - 0.03, 0.03, 0.016, 0, seatY + (H - seatY) * 0.2, zAt(seatY + (H - seatY) * 0.2), { r: 0, rot: [-rake, 0, 0] });
}

function diningSet(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const woody = isWoody(color);
  const wood = woody ? M.wood(color) : M.lam(color, 0.45);
  const chairWood = woody ? M.wood(tint(color, -0.08)) : M.wood(isDark(color) ? '#2f2a26' : '#b8946a');
  const fab = M.fabric(woody ? '#d9cfbd' : isDark(color) ? '#b9b2a4' : mix(color, '#8a8f8a', 0.55));
  const margin = Math.min(0.075, Math.max(0, (w - 1.2) * 0.1));
  const tl = w - 2 * margin;
  const td = Math.max(0.5, d - 2 * CHAIR_OUT);
  const th = Math.min(0.76, h - 0.1);
  const topT = 0.036;
  // table
  k.extrude(wood, roundRectShape(tl, td, 0.02), topT, { at: [0, th - topT, 0], rot: [-Math.PI / 2, 0, 0], bevel: 0.006, bevelSeg: 2, curveSeg: 3, grain: 'x' });
  const leg = 0.068;
  const lx = tl / 2 - 0.05 - leg / 2;
  const lz = td / 2 - 0.05 - leg / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.taper(wood, [leg * 0.66, leg * 0.66], [leg, leg], 0, th - topT, { at: [sx * lx, 0, sz * lz] });
  for (const sz of [-1, 1]) k.box(wood, 2 * lx - leg, 0.075, 0.022, 0, th - topT - 0.04, sz * lz, { r: 0.003 });
  for (const sx of [-1, 1]) k.box(wood, 0.022, 0.075, 2 * lz - leg, sx * lx, th - topT - 0.04, 0, { r: 0.003 });
  // chairs
  const usable = 2 * lx - leg - 0.02;
  const n = Math.max(1, Math.floor(usable / (CHAIR_W + 0.02)));
  const pitch = usable / n;
  const cz = d / 2 - 0.245;
  for (let i = 0; i < n; i++) {
    const x = -usable / 2 + pitch * (i + 0.5);
    k.at({ at: [x, 0, -cz], rot: [0, 0, 0] }, () => chair(k, chairWood, fab, h)); // back row faces +Z (toward the table)
    k.at({ at: [x, 0, cz], rot: [0, Math.PI, 0] }, () => chair(k, chairWood, fab, h));
  }
  // centrepiece: runner + fruit bowl
  const rl = Math.min(tl * 0.72, tl - 0.3);
  if (h - th > 0.1 && rl > 0.3) {
    k.box(M.fabric(woody ? '#6f7f72' : '#8a5a44'), rl, 0.003, Math.min(0.32, td * 0.36), 0, th + 0.0015, 0, { r: 0 });
    const br = Math.min(0.13, td * 0.17);
    vase(k, M.ceramic('#e9e4da'), 0, th + 0.003, 0, 0.065, br, 2);
    const paint = M.paint(0.5);
    const fruit: [number, number, string][] = [
      [-0.04, 0.02, '#d9822b'],
      [0.045, -0.01, '#b8322a'],
      [0.0, -0.05, '#c9b037'],
      [0.01, 0.05, '#7c9a3a'],
    ];
    for (const [fx, fz, c] of fruit) k.sphere(paint, 0.034, fx * (br / 0.13), th + 0.058, fz * (br / 0.13), { seg: 10, color: c });
  }
}

export const dining: Registry = {
  'dining-set-4': diningSet,
  'dining-set-6': diningSet,
};
