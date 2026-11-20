// Compact SUV (≈ 3.99 × 1.78 × 1.6 m), low-poly but shaped: the body is lofted through cross-sections along the
// length (hood, cabin tub, wheel arches cut into the sills), the glasshouse is a second loft with body-colour roof
// and pillars, wheels have tyres + alloy rims. Front = +Z. Side mirrors are folded so the car stays inside w.

import * as THREE from 'three';
import { boxUV, flipWinding, type Kit, type V3 } from './kit';
import { M } from './materials';
import type { Spec } from './types';

type Table = [number, number][];
const look = (t: Table, s: number): number => {
  if (s <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++)
    if (s <= t[i][0]) {
      const [s0, v0] = t[i - 1];
      const [s1, v1] = t[i];
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  return t[t.length - 1][1];
};

/** Loft with a material per quad. Normals are computed once over the whole skin so shading stays continuous. */
function skin(k: Kit, rings: V3[][], closed: boolean, matOf: (i: number, j: number) => THREE.Material | null, caps?: { start?: THREE.Material; end?: THREE.Material }) {
  const m = rings[0].length;
  const pos: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const cols = closed ? m : m - 1;
  const buckets = new Map<THREE.Material, number[]>();
  const all: number[] = [];
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      const c = (i + 1) * m + ((j + 1) % m);
      const d = (i + 1) * m + j;
      const mat = matOf(i, j);
      all.push(a, b, c, a, c, d);
      if (!mat) continue;
      let list = buckets.get(mat);
      if (!list) buckets.set(mat, (list = []));
      list.push(a, b, c, a, c, d);
    }
  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  full.setIndex(all);
  // orientation: faces must look away from the centroid
  const cen = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) cen.x += pos[i], (cen.y += pos[i + 1]), (cen.z += pos[i + 2]);
  cen.multiplyScalar(3 / pos.length);
  let vote = 0;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let t = 0; t < all.length; t += 3) {
    A.fromArray(pos, all[t] * 3);
    B.fromArray(pos, all[t + 1] * 3);
    C.fromArray(pos, all[t + 2] * 3);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    vote += n.dot(A.add(B).add(C).multiplyScalar(1 / 3).sub(cen));
  }
  const flip = vote < 0;
  if (flip) flipWinding(full);
  full.computeVertexNormals();
  const nor = full.attributes.normal.array as Float32Array;
  for (const [mat, idx] of buckets) {
    // compact to the vertices this bucket uses
    const remap = new Map<number, number>();
    const p2: number[] = [];
    const n2: number[] = [];
    const i2: number[] = [];
    for (const v of idx) {
      let r = remap.get(v);
      if (r === undefined) {
        r = p2.length / 3;
        remap.set(v, r);
        p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        n2.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      }
      i2.push(r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n2, 3));
    g.setIndex(i2);
    if (flip) flipWinding(g);
    k.add(mat, boxUV(g, 'z'));
  }
  full.dispose();
  const cap = (ri: number, mat: THREE.Material, towardPlusZ: boolean) => {
    const ring = rings[ri];
    const p: number[] = [];
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const q of ring) {
      p.push(q[0], q[1], q[2]);
      cx += q[0];
      cy += q[1];
      cz += q[2];
    }
    p.push(cx / m, cy / m, cz / m);
    const idx: number[] = [];
    for (let j = 0; j < m; j++) idx.push(m, j, (j + 1) % m);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getZ(0) > 0 !== towardPlusZ) {
      flipWinding(g);
      g.computeVertexNormals();
    }
    k.add(mat, boxUV(g, 'x'));
  };
  if (caps?.start) cap(0, caps.start, rings[0][0][2] > rings[rings.length - 1][0][2]);
  if (caps?.end) cap(rings.length - 1, caps.end, rings[rings.length - 1][0][2] > rings[0][0][2]);
}

function wheel(k: Kit, x: number, z: number, R: number, tw: number, side: 1 | -1) {
  const rubber = M.rubber();
  const alloy = M.metal('#c3c6ca', 0.28, 'alloy');
  const darkM = M.metal('#2a2b2e', 0.5, 'wheel-dark');
  const rimR = R * 0.64;
  k.at({ at: [x, R, z], rot: [0, 0, (-side * Math.PI) / 2] }, () => {
    // tyre (axis = local Y, +Y = outboard)
    k.lathe(
      rubber,
      [
        [rimR, -tw / 2 + 0.012],
        [R - 0.045, -tw / 2],
        [R - 0.012, -tw / 2 + 0.012],
        [R, -tw / 2 + 0.04],
        [R, tw / 2 - 0.04],
        [R - 0.012, tw / 2 - 0.012],
        [R - 0.045, tw / 2],
        [rimR, tw / 2 - 0.012],
      ],
      0,
      0,
      0,
      { seg: 26 },
    );
    // rim lip + dark dish
    k.lathe(
      alloy,
      [
        [rimR + 0.004, tw / 2 - 0.012],
        [rimR - 0.012, tw / 2 - 0.008],
        [rimR - 0.024, tw / 2 - 0.03],
      ],
      0,
      0,
      0,
      { seg: 26 },
    );
    k.lathe(
      darkM,
      [
        [rimR - 0.024, tw / 2 - 0.03],
        [rimR - 0.04, tw / 2 - 0.075],
        [0, tw / 2 - 0.075],
      ],
      0,
      0,
      0,
      { seg: 20 },
    );
    k.cyl(M.metal('#55585c', 0.45, 'brake-disc'), rimR * 0.62, 0.008, 0, tw / 2 - 0.07, 0, { seg: 18 });
    // five twin spokes
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      k.at({ rot: [0, a, 0] }, () => {
        for (const sg of [-1, 1]) k.box(alloy, rimR - 0.035, 0.016, 0.024, (rimR - 0.035) / 2 + 0.02, tw / 2 - 0.036, sg * 0.022, { r: 0.004, rot: [0, sg * 0.1, 0.06] });
      });
    }
    k.cyl(alloy, 0.045, 0.02, 0, tw / 2 - 0.03, 0, { seg: 14, bevel: 0.004 });
    k.cyl(darkM, 0.02, 0.003, 0, tw / 2 - 0.019, 0, { seg: 10 });
  });
}

export function car(k: Kit, s: Spec) {
  const { w, d, h, color } = s;
  const L = d;
  const sl = L / 3.99;
  const sh = h / 1.6;
  const hwMax = w / 2 - 0.012; // body half width
  const sw = hwMax / 0.886;
  const paint = M.gloss(color, 0.35);
  const clad = M.plastic('#1b1c1d', 0.78);
  const glass = M.smoked('#0c1116');
  const chrome = M.chrome();
  const zOf = (sv: number) => L / 2 - 0.02 - ((sv - 0.02) * (L - 0.04)) / 3.95; // nose and tail sit 2 cm inside the box

  // wheels
  const R = Math.min(0.33 * sh, 0.36 * sl);
  const tw = 0.205 * sw;
  const sF = 0.83;
  const sR = 3.99 - 0.69;
  const Ra = R / sl + 0.075; // arch radius, in s units

  // --- profile tables (s = metres from the nose on a 3.99 m car; heights on a 1.6 m car; widths as fraction of half width)
  const HW: Table = [[0.02, 0.76], [0.14, 0.94], [0.35, 0.985], [0.8, 1], [3.4, 1], [3.7, 0.985], [3.88, 0.95], [3.97, 0.82]];
  const YB: Table = [[0.02, 0.4], [0.08, 0.3], [0.2, 0.225], [0.5, 0.2], [3.6, 0.2], [3.8, 0.25], [3.92, 0.34], [3.97, 0.44]];
  const YS: Table = [[0.02, 0.82], [0.06, 0.9], [0.14, 0.95], [0.3, 0.98], [1.02, 1.03], [2.0, 1.05], [3.3, 1.09], [3.62, 1.1], [3.88, 1.09], [3.97, 1.05]];
  const YT: Table = [[0.02, 0.86], [0.06, 0.935], [0.14, 0.99], [0.3, 1.015], [1.02, 1.08], [2.0, 1.09], [3.62, 1.13], [3.9, 1.14], [3.97, 1.09]];

  const stations: number[] = [0.02, 0.06, 0.14, 0.3, 1.02, 1.45, 1.75, 2.1, 2.45, 2.8, 3.62, 3.75, 3.88, 3.94, 3.97];
  for (const c of [sF, sR]) for (let i = 0; i <= 10; i++) stations.push(c - Ra + (2 * Ra * i) / 10);
  stations.sort((a, b) => a - b);
  const S: number[] = [];
  for (const v of stations) if (v >= 0.02 && v <= 3.97 && (!S.length || v - S[S.length - 1] > 0.035)) S.push(v);

  const archY = (sv: number): number => {
    let y = 0;
    for (const c of [sF, sR]) {
      const dz = (sv - c) * sl;
      const ra = Ra * sl;
      if (Math.abs(dz) < ra) y = Math.max(y, R + Math.sqrt(ra * ra - dz * dz));
    }
    return y;
  };

  // --- lower body
  const lower: V3[][] = S.map((sv) => {
    const hw = look(HW, sv) * hwMax;
    const yb0 = look(YB, sv) * sh;
    const ys = look(YS, sv) * sh;
    const yt = look(YT, sv) * sh;
    const ya = archY(sv);
    const yb = Math.max(yb0, Math.min(ya, ys - 0.2 * sh));
    const inArch = ya > yb0;
    const z = zOf(sv);
    const half: [number, number][] = [
      [0, yb0],
      inArch ? [hw * 0.62, yb] : [hw * 0.8, yb0],
      [hw * 0.955, inArch ? yb : yb + 0.02 * sh],
      [hw * 0.995, yb + (inArch ? 0.05 : 0.12) * sh],
      [hw, yb + (inArch ? 0.085 : 0.2) * sh],
      [hw, yb + 0.2 * sh + (ys - yb - 0.2 * sh) * 0.55],
      [hw * 0.988, ys - 0.045 * sh],
      [hw * 0.955, ys],
      [hw * 0.82, ys + (yt - ys) * 0.55],
      [hw * 0.45, yt - 0.006 * sh],
      [0, yt],
    ];
    const ring: V3[] = half.map(([x, y]): V3 => [x, y, z]);
    for (let i = half.length - 2; i >= 1; i--) ring.push([-half[i][0], half[i][1], z]);
    return ring;
  });
  const mLow = lower[0].length; // 20
  skin(
    k,
    lower,
    true,
    (_i, j) => {
      const jj = j < 10 ? j : mLow - 1 - j; // mirror index
      return jj <= 2 ? clad : paint;
    },
    { start: paint, end: paint },
  );
  // underbody core: closes the wheel-arch tunnels and hides the far side
  k.bx(clad, -hwMax * 0.6, hwMax * 0.6, 0.215 * sh, 0.74 * sh, zOf(3.78), zOf(0.32), { r: 0 });

  // --- glasshouse
  const YR: Table = [[1.02, 1.085], [1.12, 1.175], [1.28, 1.315], [1.5, 1.465], [1.75, 1.553], [2.1, 1.571], [2.45, 1.574], [2.8, 1.569], [3.3, 1.552], [3.62, 1.522], [3.72, 1.42], [3.82, 1.28], [3.9, 1.15]];
  const GW: Table = [[1.02, 0.93], [1.28, 0.865], [1.75, 0.795], [2.45, 0.805], [3.3, 0.795], [3.62, 0.785], [3.9, 0.87]];
  const CROWN: Table = [[1.02, 0.02], [1.75, 0.05], [3.62, 0.05], [3.9, 0.02]];
  const GS = [1.02, 1.12, 1.28, 1.5, 1.75, 2.1, 2.45, 2.8, 3.05, 3.3, 3.62, 3.72, 3.82, 3.9];
  const gRing = (sv: number): V3[] => {
    const hw = look(HW, sv) * hwMax;
    const yb = look(YS, sv) * sh - 0.008;
    const yr = look(YR, sv) * sh;
    const xr = look(GW, sv) * hwMax;
    const ye = Math.max(yb + 0.004, yr - look(CROWN, sv) * sh);
    const z = zOf(sv);
    const half: [number, number][] = [
      [hw * 0.958, yb],
      [(hw * 0.958 + xr) / 2 + 0.012 * sw, (yb + ye) / 2],
      [xr, ye],
      [xr * 0.62, yr - 0.008 * sh],
      [0, yr],
    ];
    const ring: V3[] = half.map(([x, y]): V3 => [x, y, z]);
    for (let i = half.length - 2; i >= 0; i--) ring.push([-half[i][0], half[i][1], z]);
    return ring;
  };
  const gRings = GS.map(gRing);
  skin(k, gRings, false, (i, j) => {
    const mid = (GS[i] + GS[i + 1]) / 2;
    const side = j <= 1 || j >= 6;
    if (mid < 1.75) return glass; // windshield + front quarter
    if (mid < 3.62) return side ? (mid > 3.3 ? paint : glass) : paint; // cabin: glass sides, painted roof, D-pillar
    return side ? paint : glass; // tailgate: painted flanks, rear window
  });
  // A-pillars, roof rails, B-pillar blackout is implicit (dark glass)
  const edge = (sv: number, lift = 0): V3 => {
    const r = gRing(sv)[2];
    return [r[0], r[1] + lift, r[2]];
  };
  k.mirrorX(() => {
    k.tube(paint, [1.04, 1.2, 1.4, 1.6, 1.78].map((v) => edge(v, 0.004)), 0.028 * sw, { radial: 6, seg: 10 });
    // roof rail on three feet
    const rail = [1.95, 2.3, 2.7, 3.1, 3.45].map((v) => edge(v, 0.05 * sh));
    k.tube(clad, rail.map((p): V3 => [p[0] - 0.03 * sw, Math.min(p[1], h - 0.014), p[2]]), 0.013, { radial: 6, seg: 10 });
    for (const v of [1.98, 2.7, 3.42]) {
      const p = edge(v, 0.0);
      k.box(clad, 0.03, 0.05 * sh, 0.09, p[0] - 0.03 * sw, p[1] + 0.022 * sh, p[2], { r: 0.008 });
    }
    // door shut lines + handles
    const yLo = (look(YB, 2) + 0.21) * sh;
    for (const v of [1.36, 2.42, 3.02]) {
      const yHi = look(YS, v) * sh - 0.05 * sh;
      k.box(clad, 0.004, yHi - yLo, 0.007, hwMax + 0.0005, (yLo + yHi) / 2, zOf(v), { r: 0 });
    }
    for (const v of [2.26, 2.9]) k.rbox(paint, 0.022, 0.03 * sh, 0.17 * sl, hwMax * 0.99, look(YS, v) * sh - 0.115 * sh, zOf(v), { r: 0.009, seg: 1 });
    // window-line chrome strip
    k.tube(chrome, [1.45, 2.1, 2.8, 3.3].map((v): V3 => [look(HW, v) * hwMax * 0.962, look(YS, v) * sh - 0.002, zOf(v)]), 0.006, { radial: 4, seg: 8 });
    // folded mirror
    const my = look(YS, 1.5) * sh + 0.075 * sh;
    const mx = gRing(1.52)[1][0];
    k.rbox(paint, 0.05, 0.11 * sh, 0.19 * sl, mx + 0.012, my, zOf(1.56), { r: 0.02, seg: 2 });
    k.box(clad, 0.03, 0.03, 0.05, mx - 0.004, my - 0.05 * sh, zOf(1.47), { r: 0.006 });

    // --- lamps: one piece on the flat nose / tail, one wrapping the chamfered corner
    const corner = (s0: number, s1: number, y: number, hgt: number, thick: number, mat: THREE.Material, off: number, trim = 0) => {
      const x0 = look(HW, s0) * hwMax;
      const x1 = look(HW, s1) * hwMax;
      const z0 = zOf(s0);
      const z1 = zOf(s1);
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      let nx = dz / len;
      let nz = -dx / len;
      if (nx < 0) {
        nx = -nx;
        nz = -nz;
      }
      k.box(mat, len - trim, hgt, thick, (x0 + x1) / 2 + nx * off, y, (z0 + z1) / 2 + nz * off, { r: Math.min(0.008, thick * 0.3), rot: [0, Math.atan2(-dz, dx), 0] });
    };
    const lens = M.glow('#eef4ff', 0.45, '#dfe6ee');
    const yH = 0.8 * sh;
    const xi = hwMax * 0.4;
    const xo = look(HW, 0.02) * hwMax;
    k.box(lens, xo - xi, 0.075 * sh, 0.024, (xi + xo) / 2, yH, zOf(0.02) + 0.002, { r: 0.006 });
    corner(0.02, 0.14, yH + 0.012 * sh, 0.085 * sh, 0.026, lens, 0.002);
    k.box(M.glow('#ffffff', 2.6), xo - xi - 0.02, 0.011, 0.01, (xi + xo) / 2, yH - 0.05 * sh, zOf(0.02) + 0.008, { r: 0.003 });
    corner(0.02, 0.13, yH - 0.045 * sh, 0.011, 0.01, M.glow('#ffffff', 2.6), 0.008, 0.02);
    // fog lamp in the bumper corner
    corner(0.03, 0.13, 0.5 * sh, 0.1 * sh, 0.02, clad, 0.0);
    corner(0.05, 0.11, 0.5 * sh, 0.05 * sh, 0.012, M.glow('#fff3d0', 1.3, '#e8e2d0'), 0.008);
    // tail lamps
    const red = M.glow('#ff2a1a', 1.0, '#8a100b');
    const yTL = 0.985 * sh;
    const xt = look(HW, 3.97) * hwMax;
    k.box(red, xt * 0.42, 0.085 * sh, 0.024, xt * 0.79, yTL, zOf(3.97) - 0.002, { r: 0.006 });
    corner(3.97, 3.86, yTL + 0.01 * sh, 0.1 * sh, 0.026, red, 0.002);
    corner(3.96, 3.9, 0.52 * sh, 0.035 * sh, 0.012, M.glow('#ff3b2a', 0.5, '#5a0a08'), 0.006);
  });

  // --- front fascia
  const zN = zOf(0.02);
  k.box(M.plastic('#0e0f10', 0.5), hwMax * 0.76, 0.1 * sh, 0.016, 0, 0.79 * sh, zN + 0.004, { r: 0.004 });
  for (let i = 0; i < 4; i++) k.box(M.metal('#3a3c40', 0.3, 'grille'), hwMax * 0.72, 0.008, 0.008, 0, (0.757 + i * 0.022) * sh, zN + 0.012, { r: 0.002 });
  k.box(chrome, hwMax * 0.78, 0.012, 0.014, 0, 0.845 * sh, zN + 0.008, { r: 0.004 });
  k.cyl(chrome, 0.04 * sh, 0.01, 0, 0.79 * sh, zN + 0.014, { axis: 'z', seg: 14, bevel: 0.003 });
  k.box(M.plastic('#0e0f10', 0.6), hwMax * 1.0, 0.13 * sh, 0.014, 0, 0.49 * sh, zN + 0.003, { r: 0.006 });
  for (let i = 0; i < 3; i++) k.box(M.metal('#2c2e31', 0.4, 'grille'), hwMax * 0.9, 0.007, 0.006, 0, (0.455 + i * 0.035) * sh, zN + 0.01, { r: 0 });
  k.box(M.metal('#b4b7bb', 0.35, 'skid'), hwMax * 0.7, 0.03 * sh, 0.02, 0, 0.405 * sh, zN + 0.004, { r: 0.006 });
  // number plates (Indian: white, black border)
  k.box(M.lam('#101010', 0.5), 0.5 * sw, 0.125 * sh, 0.006, 0, 0.62 * sh, zN + 0.009, { r: 0.002 });
  k.box(M.lam('#f4f4f1', 0.5), 0.48 * sw, 0.105 * sh, 0.006, 0, 0.62 * sh, zN + 0.011, { r: 0.002 });
  // --- rear
  const zT = zOf(3.97);
  k.box(M.glow('#ff2a1a', 0.7, '#6a0c08'), hwMax * 0.96, 0.02 * sh, 0.012, 0, 0.985 * sh, zT - 0.006, { r: 0.004 });
  k.box(chrome, 0.56 * sw, 0.016 * sh, 0.012, 0, 0.925 * sh, zT - 0.006, { r: 0.004 });
  k.box(M.lam('#101010', 0.5), 0.5 * sw, 0.125 * sh, 0.006, 0, 0.84 * sh, zT - 0.008, { r: 0.002 });
  k.box(M.lam('#f4f4f1', 0.5), 0.48 * sw, 0.105 * sh, 0.006, 0, 0.84 * sh, zT - 0.01, { r: 0.002 });
  k.box(clad, hwMax * 1.5, 0.16 * sh, 0.02, 0, 0.55 * sh, zT - 0.004, { r: 0.008 });
  k.box(M.metal('#b4b7bb', 0.35, 'skid'), hwMax * 0.8, 0.035 * sh, 0.022, 0, 0.47 * sh, zT - 0.006, { r: 0.006 });
  // roof spoiler + stop lamp, shark-fin antenna, rear wiper
  const sp = gRing(3.62);
  k.box(paint, sp[2][0] * 1.9, 0.02 * sh, 0.14 * sl, 0, sp[4][1] - 0.012 * sh, zOf(3.67), { r: 0.008, rot: [0.1, 0, 0] });
  k.box(M.glow('#ff2a1a', 0.8, '#6a0c08'), 0.3 * sw, 0.008, 0.008, 0, sp[4][1] - 0.022 * sh, zOf(3.74), { r: 0 });
  k.taper(clad, [0.04, 0.16 * sl], [0.012, 0.05 * sl], look(YR, 3.3) * sh - 0.004, Math.min(h, look(YR, 3.3) * sh + 0.05 * sh), { at: [0, 0, zOf(3.3)], shift: [0, -0.04 * sl] });

  // --- wheels
  const wx = hwMax - tw / 2 - 0.02;
  for (const sv of [sF, sR]) {
    wheel(k, wx, zOf(sv), R, tw, 1);
    wheel(k, -wx, zOf(sv), R, tw, -1);
  }
}
