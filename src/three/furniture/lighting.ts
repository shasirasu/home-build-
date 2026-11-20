// Lighting: ceiling fan (with a separate `rotor` group), LED ceiling light, pendant, floor lamp.
// Ceiling items: the mount is at y = h and everything hangs down to y = 0.

import * as THREE from 'three';
import { type Kit } from './kit';
import { M, isDark, isWoody, lum } from './materials';
import type { Registry, Spec } from './types';

function ceilingFan(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const sweep = Math.min(w, d);
  const R = sweep / 2 - 0.004;
  const woody = isWoody(color);
  const body = woody ? M.gloss('#5a4130', 0.2) : M.gloss(color, 0.15);
  const bladeM = woody ? M.wood(color, 0.4) : M.gloss(color, 0.1);
  const trim = isDark(color) ? M.chrome() : M.brass();
  const mr = Math.min(0.105, sweep * 0.09); // motor radius
  const mh = Math.min(0.115, h * 0.3);
  // ceiling canopy + down-rod
  const ch = Math.min(0.07, h * 0.18);
  k.lathe(
    body,
    [
      [0.014, h - ch],
      [0.03, h - ch + 0.004],
      [0.052, h - ch * 0.5],
      [0.058, h - 0.004],
      [0.054, h],
      [0, h],
    ],
    0,
    0,
    0,
    { seg: 20 },
  );
  k.cyl(trim, 0.0105, h - ch - mh + 0.02, 0, (h - ch + mh) / 2, 0, { seg: 10 });
  k.lathe(body, [[0.04, mh - 0.004], [0.034, mh + 0.016], [0.016, mh + 0.03], [0.0105, mh + 0.032]], 0, 0, 0, { seg: 16 });
  // rotor: motor shell + blades (kept as its own group so the engine can spin it)
  const rot = k.sub('rotor');
  rot.lathe(
    body,
    [
      [0, 0],
      [mr * 0.42, 0.003],
      [mr * 0.78, mh * 0.14],
      [mr * 0.98, mh * 0.36],
      [mr, mh * 0.6],
      [mr * 0.9, mh * 0.82],
      [mr * 0.6, mh * 0.96],
      [mr * 0.36, mh],
      [0, mh],
    ],
    0,
    0,
    0,
    { seg: 28 },
  );
  rot.lathe(trim, [[mr * 0.99, mh * 0.4], [mr * 1.025, mh * 0.44], [mr * 1.025, mh * 0.56], [mr * 0.99, mh * 0.6]], 0, 0, 0, { seg: 28 });
  rot.lathe(trim, [[0, -0.0], [mr * 0.3, 0.001], [mr * 0.36, 0.008], [mr * 0.3, 0.012]], 0, 0, 0, { seg: 16 });
  const by = mh * 0.3;
  const r0 = mr + 0.05; // blade root
  const bw0 = Math.min(0.105, sweep * 0.088);
  const bw1 = Math.min(0.14, sweep * 0.118);
  const blade = new THREE.Shape();
  blade.moveTo(r0, -bw0 * 0.5);
  blade.lineTo(r0 + (R - r0) * 0.55, -bw1 * 0.52);
  blade.lineTo(R - bw1 * 0.42, -bw1 * 0.5);
  blade.quadraticCurveTo(R, -bw1 * 0.48, R, -bw1 * 0.05);
  blade.quadraticCurveTo(R, bw1 * 0.46, R - bw1 * 0.5, bw1 * 0.48);
  blade.lineTo(r0 + (R - r0) * 0.5, bw1 * 0.44);
  blade.lineTo(r0, bw0 * 0.5);
  blade.lineTo(r0, -bw0 * 0.5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    rot.at({ rot: [0, a, 0] }, () => {
      rot.at({ at: [0, by, 0], rot: [0.2, 0, 0] }, () => {
        rot.extrude(bladeM, blade, 0.005, { rot: [-Math.PI / 2, 0, 0], at: [0, -0.0025, 0], bevel: 0.0015, curveSeg: 6, grain: 'x' });
        // blade iron
        rot.box(trim, r0 - mr * 0.7 + 0.075, 0.004, bw0 * 0.42, (mr * 0.7 + r0 + 0.075) / 2, 0.005, 0, { r: 0.001 });
        for (const dx of [0.02, 0.058]) rot.cyl(trim, 0.0045, 0.003, r0 + dx, 0.0085, 0, { seg: 6 });
      });
    });
  }
  k.root.userData.rotor = 'rotor';
}

function ceilingLight(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const body = M.lam(color, 0.5);
  const glow = M.glow('#fff4e2', 1.7);
  if (Math.abs(w - d) < 0.06) {
    const R = Math.min(w, d) / 2;
    k.lathe(
      body,
      [
        [R - 0.03, h * 0.12],
        [R - 0.006, h * 0.08],
        [R, h * 0.2],
        [R, h - 0.004],
        [R - 0.004, h],
        [0, h],
      ],
      0,
      0,
      0,
      { seg: 40 },
    );
    k.lathe(
      glow,
      [
        [0, 0],
        [R * 0.6, h * 0.03],
        [R - 0.03, h * 0.12],
      ],
      0,
      0,
      0,
      { seg: 40 },
    );
  } else {
    k.rbox(body, w, h * 0.86, d, 0, h * 0.57, 0, { r: Math.min(0.012, h * 0.3), seg: 2 });
    k.rbox(glow, w - 0.04, h * 0.2, d - 0.04, 0, h * 0.1, 0, { r: Math.min(0.008, h * 0.09), seg: 1 });
  }
  k.root.userData.lightAt = [0, 0, 0];
}

function shadeMetal(color: string): THREE.Material {
  const l = lum(color);
  if (l > 0.75) return M.lam(color, 0.5);
  if (l < 0.12) return M.metal(color, 0.5, 'shade-metal');
  return M.metal(color, 0.28, 'shade-metal');
}

function pendantLight(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const R = Math.min(w, d) / 2;
  const metal = shadeMetal(color);
  const sh = Math.min(R * 1.15, h * 0.42);
  // canopy + cord
  k.lathe(metal, [[0.008, h - 0.03], [0.045, h - 0.024], [0.05, h - 0.004], [0.046, h], [0, h]], 0, 0, 0, { seg: 18 });
  k.cyl(M.rubber(), 0.003, h - 0.03 - sh - 0.04, 0, (h - 0.03 + sh + 0.04) / 2, 0, { seg: 6 });
  // dome shade: metal outside, warm white inside
  const N = 9;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2) * 0.93;
    outer.push([R * Math.cos(a), sh * Math.pow(Math.sin(a) / Math.sin((Math.PI / 2) * 0.93), 1.15)]);
  }
  for (let i = N; i >= 0; i--) inner.push([Math.max(0.001, outer[i][0] - 0.004), Math.max(0.001, outer[i][1] - (i === 0 ? 0 : 0.004))]);
  k.lathe(metal, [...outer, [0.022, sh + 0.004], [0.02, sh + 0.045], [0, sh + 0.045]], 0, 0, 0, { seg: 30 });
  k.lathe(M.glow('#ffd9a0', 0.9, '#fff3dc'), inner, 0, 0, 0, { seg: 30 });
  k.lathe(metal, [[R - 0.004, 0.001], [R, 0]], 0, 0, 0, { seg: 30 });
  // lamp holder + bulb
  k.cyl(M.brass(), 0.017, sh * 0.2, 0, sh * 0.88, 0, { seg: 10 });
  k.sphere(M.glow('#ffe2b0', 3.2), Math.min(0.033, R * 0.2), 0, sh * 0.62, 0, { seg: 12 });
  k.root.userData.lightAt = [0, sh * 0.5, 0];
}

function floorLamp(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const R = Math.min(w, d) / 2;
  const metal = lum(color) < 0.12 ? M.metal(color, 0.45, 'lamp-metal') : M.metal(color, 0.27, 'lamp-metal');
  const shH = Math.min(0.28, h * 0.19);
  const shR = R - 0.004;
  const shTop = h - 0.004;
  const shBot = shTop - shH;
  // weighted base + stem
  const br = Math.min(0.15, R * 0.75);
  k.lathe(
    metal,
    [
      [0, 0],
      [br, 0],
      [br, 0.012],
      [br - 0.006, 0.018],
      [0.03, 0.026],
      [0.014, 0.05],
      [0.0095, 0.07],
    ],
    0,
    0,
    0,
    { seg: 28 },
  );
  k.cyl(metal, 0.0095, shBot + shH * 0.35 - 0.07, 0, (shBot + shH * 0.35 + 0.07) / 2, 0, { seg: 10 });
  // mid knuckle + pull-chain switch
  k.cyl(metal, 0.014, 0.03, 0, h * 0.52, 0, { seg: 10, bevel: 0.004 });
  // drum shade (slightly tapered), lit from inside
  const shade = M.shade('#f1e7d3', 0.5);
  k.lathe(shade, [[shR, shBot], [shR * 0.9, shTop]], 0, 0, 0, { seg: 36 });
  const ring = (y: number, r: number) => k.torus(metal, r, 0.003, 0, y, 0, { rot: [Math.PI / 2, 0, 0], seg: 36, tseg: 5 });
  ring(shBot, shR);
  ring(shTop, shR * 0.9);
  // spider fitting, lamp holder, bulb
  const sy = shBot + shH * 0.35;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.rod(metal, [0, sy, 0], [Math.cos(a) * shR * 0.96, shBot + shH * 0.12, Math.sin(a) * shR * 0.96], 0.0022, { seg: 5 });
  }
  const br2 = Math.min(0.034, shR * 0.3, shH * 0.2);
  k.cyl(metal, 0.016, Math.min(0.05, shH * 0.2), 0, sy + Math.min(0.02, shH * 0.08), 0, { seg: 10 });
  k.sphere(M.glow('#ffe2b0', 3.0), br2, 0, Math.min(sy + 0.08, shTop - br2 - 0.01), 0, { seg: 12 });
  k.rod(metal, [0.012, sy, 0], [0.012, sy - 0.12, 0], 0.0012, { seg: 4 });
  k.sphere(metal, 0.006, 0.012, sy - 0.125, 0, { seg: 6 });
  k.root.userData.lightAt = [0, Math.min(sy + 0.08, shTop - br2 - 0.01), 0];
}

export const lighting: Registry = {
  'ceiling-fan': ceilingFan,
  'ceiling-light': ceilingLight,
  'pendant-light': pendantLight,
  'floor-lamp': floorLamp,
};
