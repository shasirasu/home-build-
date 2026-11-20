// Utility: front-load washing machine, utility sink on a granite slab.

import { type Kit, type V3 } from './kit';
import { M, isDark, tint } from './materials';
import { bowl, counterWithHole } from './kitchen';
import type { Registry, Spec } from './types';

function washingMachine(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const dark = isDark(color);
  const shell = M.gloss(color, dark ? 0.35 : 0.05);
  const trim = M.plastic(dark ? '#2a2c30' : '#e3e4e6', 0.35);
  const chrome = M.chrome();
  const proud = 0.03;
  const zf = d / 2 - proud; // front panel plane
  const foot = 0.014;
  // cabinet
  k.rbox(shell, w, h - foot, d - proud, 0, foot + (h - foot) / 2, -proud / 2, { r: 0.012, seg: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(M.rubber(), 0.02, foot + 0.004, sx * (w / 2 - 0.06), (foot + 0.004) / 2, sz * (d / 2 - 0.07) - proud / 2, { seg: 8 });
  // control band
  const cb = Math.min(0.13, h * 0.16);
  const cy = h - cb / 2 - 0.012;
  k.rbox(trim, w - 0.012, cb - 0.01, 0.01, 0, cy, zf + 0.002, { r: 0.0045, seg: 1 });
  // detergent drawer
  const dw = w * 0.3;
  k.rbox(shell, dw, cb - 0.03, 0.008, -w / 2 + 0.03 + dw / 2, cy, zf + 0.006, { r: 0.0038, seg: 1 });
  k.box(M.lam('#1a1b1d', 0.6), dw * 0.5, 0.012, 0.003, -w / 2 + 0.03 + dw / 2, cy - (cb - 0.03) * 0.22, zf + 0.0095, { r: 0 });
  // programme dial
  const dx = w * 0.06;
  k.cyl(chrome, Math.min(0.04, cb * 0.36), 0.008, dx, cy, zf + 0.009, { axis: 'z', seg: 22, bevel: 0.002 });
  k.cyl(M.plastic(dark ? '#3a3c40' : '#f4f4f4', 0.4), Math.min(0.031, cb * 0.28), 0.022, dx, cy, zf + 0.018, { axis: 'z', seg: 22, bevel: 0.005 });
  k.box(M.lam('#1a1b1d', 0.6), 0.004, Math.min(0.022, cb * 0.2), 0.002, dx, cy + 0.008, zf + 0.0295, { r: 0 });
  // display + buttons
  const sx0 = w * 0.3;
  k.rbox(M.smoked(), w * 0.2, cb * 0.34, 0.004, sx0, cy + cb * 0.12, zf + 0.0075, { r: 0.0019, seg: 1 });
  k.box(M.glow('#9fe8ff', 2.2, '#06141a'), w * 0.09, cb * 0.14, 0.001, sx0 - w * 0.03, cy + cb * 0.12, zf + 0.0098, { r: 0 });
  for (let i = 0; i < 4; i++) k.cyl(chrome, 0.007, 0.004, sx0 - w * 0.075 + i * w * 0.05, cy - cb * 0.22, zf + 0.008, { axis: 'z', seg: 10 });
  // porthole door
  const R = Math.min(w * 0.38, (h - cb) * 0.33, 0.25);
  const py = foot + (h - cb - foot) * 0.54;
  k.lathe(
    trim,
    [
      [R * 0.74, 0.0],
      [R, 0.0],
      [R, 0.012],
      [R * 0.95, 0.024],
      [R * 0.8, 0.028],
      [R * 0.74, 0.02],
    ],
    0,
    py,
    zf,
    { seg: 36, rot: [Math.PI / 2, 0, 0] },
  );
  k.lathe(chrome, [[R * 0.7, 0.014], [R * 0.76, 0.021], [R * 0.7, 0.024]], 0, py, zf, { seg: 36, rot: [Math.PI / 2, 0, 0] });
  // drum behind the glass
  k.cyl(M.metal('#5b5e63', 0.4, 'drum'), R * 0.7, 0.004, 0, py, zf - 0.002, { axis: 'z', seg: 28 });
  k.cyl(M.lam('#0f1011', 0.6), R * 0.5, 0.004, 0, py, zf + 0.0005, { axis: 'z', seg: 24 });
  k.torus(M.metal('#7c7f84', 0.35, 'drum'), R * 0.6, 0.004, 0, py, zf + 0.001, { seg: 28, tseg: 5 });
  // bowl glass
  k.lathe(
    M.glass('#3b4750', 0.42),
    [
      [R * 0.72, 0.016],
      [R * 0.6, 0.026],
      [R * 0.3, 0.03],
      [0, 0.03],
    ],
    0,
    py,
    zf,
    { seg: 28, rot: [Math.PI / 2, 0, 0] },
  );
  // door handle
  k.rbox(chrome, R * 0.1, R * 0.4, 0.012, R * 0.88, py, zf + 0.022, { r: 0.005, seg: 1 });
  // kick plate with filter cap
  const ky = foot + 0.05;
  k.box(M.lam(tint(color, dark ? 0.12 : -0.12), 0.5), w - 0.02, 0.003, 0.002, 0, foot + 0.1, zf + 0.0005, { r: 0 });
  k.cyl(trim, 0.03, 0.004, w / 2 - 0.08, ky, zf + 0.002, { axis: 'z', seg: 16 });
}

function utilitySink(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const steel = M.metal(color, 0.34, 'steel');
  const slabT = Math.min(0.04, h * 0.06);
  const stone = M.stone('#1a1b1d', 'granite', 0.22);
  const side = M.stone('#6f7275', 'granite', 0.5);
  // two stone side supports
  const st = Math.min(0.035, w * 0.08);
  k.mirrorX(() => k.bx(side, w / 2 - 0.02 - st, w / 2 - 0.02, 0, h - slabT, -d / 2 + 0.01, d / 2 - 0.05, { r: 0.003 }));
  // slab with the sink dropped in
  const sw = Math.min(w - 2 * st - 0.1, 0.5);
  const sd = Math.min(d - 0.14, 0.4);
  const cz = 0.02;
  counterWithHole(k, stone, w, d, h - slabT, h, -sw / 2, sw / 2, cz - sd / 2, cz + sd / 2);
  const loop: V3[] = [
    [-sw / 2 - 0.006, h + 0.001, cz - sd / 2 - 0.006],
    [sw / 2 + 0.006, h + 0.001, cz - sd / 2 - 0.006],
    [sw / 2 + 0.006, h + 0.001, cz + sd / 2 + 0.006],
    [-sw / 2 - 0.006, h + 0.001, cz + sd / 2 + 0.006],
  ];
  k.pipe(steel, loop, 0.006, { radial: 4, closed: true, fillet: 0.03, scale: [1, 0.3, 1], at: [0, (h + 0.001) * 0.7, 0] });
  const bd = Math.min(0.22, h * 0.3);
  bowl(k, steel, 0, cz, sw, sd, h - 0.002, bd);
  // PVC waste to the wall
  const pvc = M.plastic('#c9cbcd', 0.5);
  k.tube(pvc, [[0, h - bd - 0.004, cz], [0, h - bd - 0.1, cz], [0, h - bd - 0.16, cz - 0.08], [0, h - bd - 0.17, -d / 2 + 0.02]], 0.02, { radial: 8, seg: 12 });
  // bib tap on the wall above the bowl
  const ch = M.chrome();
  const ty = h + 0.16;
  const zb = -d / 2;
  k.cyl(ch, 0.026, 0.006, 0, ty, zb + 0.003, { axis: 'z', seg: 16 });
  k.rod(ch, [0, ty, zb + 0.004], [0, ty, zb + 0.07], 0.012, { seg: 10 });
  k.cyl(ch, 0.016, 0.03, 0, ty + 0.004, zb + 0.07, { seg: 10, bevel: 0.003 });
  k.tube(ch, [[0, ty, zb + 0.07], [0, ty + 0.004, zb + 0.12], [0, ty - 0.02, zb + 0.155], [0, ty - 0.05, zb + 0.16]], 0.0095, { radial: 8, seg: 10 });
  k.rod(ch, [-0.03, ty + 0.03, zb + 0.07], [0.03, ty + 0.03, zb + 0.07], 0.005, { seg: 6 });
  k.rod(ch, [0, ty + 0.018, zb + 0.07], [0, ty + 0.03, zb + 0.07], 0.005, { seg: 6 });
  // bucket and mug underneath
  const blue = M.plastic('#2f6fb0', 0.4);
  const br = Math.min(0.14, (w - 2 * st - 0.12) / 2, d * 0.28);
  const bh = Math.min(0.27, (h - slabT - bd) * 0.62);
  const bx = -w * 0.06;
  const bz = d * 0.08;
  k.lathe(
    blue,
    [
      [0, 0.004],
      [br * 0.78, 0.004],
      [br * 0.8, 0.012],
      [br, bh],
      [br * 1.04, bh],
      [br * 1.04, bh - 0.008],
      [br * 0.97, bh - 0.008],
      [br * 0.77, 0.016],
      [0, 0.016],
    ],
    bx,
    0,
    bz,
    { seg: 20 },
  );
  k.torus(M.metal('#8e9296', 0.4, 'wire'), br * 1.02, 0.003, bx, bh - 0.012, bz, { arc: Math.PI, seg: 14, tseg: 5, rot: [0.5, 0, 0] });
  k.lathe(M.plastic('#d24a3a', 0.4), [[0, 0], [0.04, 0], [0.05, 0.09], [0.046, 0.09], [0.037, 0.006], [0, 0.006]], bx + br * 0.2, bh * 0.52, bz - br * 0.1, { seg: 12, rot: [0.5, 0, 0.3] });
  k.root.userData.overflowTop = 0.2;
}

export const utility: Registry = {
  'washing-machine': washingMachine,
  'utility-sink': utilitySink,
};
