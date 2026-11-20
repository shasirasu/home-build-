// Procedural textures, painted once on a canvas and cached (per pattern + colours + size).
// Every texture reports the area it covers in metres; builders write UVs in METRES and the texture's `repeat`
// converts them, so tiles and planks are always true size.

import * as THREE from 'three';
import type { Finish } from '@/types/house';
import { hashString, rng } from './core/geo';

export interface Painted {
  canvas: HTMLCanvasElement;
  /** Metres covered by one repeat of the canvas: [along u, along v]. */
  cover: [number, number];
}

const canvasCache = new Map<string, Painted>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // willReadFrequently keeps the canvas on the CPU: these textures are painted once with thousands of small
  // draws plus a per-pixel pass, which is far slower on a GPU-backed canvas (every read is a stall)
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

/** #rgb / #rrggbb → display-space bytes (no colour management: these go straight onto a canvas). */
function hexToRgb(hex: string): [number, number, number] {
  let h = (hex ?? '').trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [200, 200, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour between two hexes (display space), with an optional lightness shift (-1..1). */
function mix(a: string, b: string, t: number, shift = 0): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  const ch = (i: number) => {
    let v = x[i] + (y[i] - x[i]) * t;
    v = shift >= 0 ? v + (255 - v) * shift : v * (1 + shift);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

const shade = (hex: string, s: number) => mix(hex, hex, 0, s);

/** Fine mottling over the whole canvas (tileable because it is per-pixel noise). */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number, _step = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data; // Uint8ClampedArray: writes clamp to 0..255 by themselves
  const k = amount * 2;
  for (let i = 0, n = w * h * 4; i < n; i += 4) {
    const v = (r() - 0.5) * k;
    d[i] += v;
    d[i + 1] += v;
    d[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Run a drawing function at the wrap-around offsets it needs so shapes crossing an edge reappear on the other side.
 * Give the shape's centre and reach to skip the copies that would fall outside the canvas (all 9 otherwise).
 */
function wrapped(ctx: CanvasRenderingContext2D, w: number, h: number, fn: () => void, cx?: number, cy?: number, reach?: number) {
  const xs = [0], ys = [0];
  if (cx === undefined || cy === undefined || reach === undefined) { xs.push(-1, 1); ys.push(-1, 1); }
  else {
    if (cx - reach < 0) xs.push(1);
    if (cx + reach > w) xs.push(-1);
    if (cy - reach < 0) ys.push(1);
    if (cy + reach > h) ys.push(-1);
  }
  for (const ox of xs)
    for (const oy of ys) {
      if (ox === 0 && oy === 0) { fn(); continue; }
      ctx.save();
      ctx.translate(ox * w, oy * h);
      fn();
      ctx.restore();
    }
}

/** Soft, low-frequency blotches (cloudy stone, worn plaster). */
function clouds(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, colour: string, count: number, alpha: number, size: [number, number]) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = size[0] + r() * (size[1] - size[0]);
    const a = alpha * (0.4 + r() * 0.6);
    wrapped(ctx, w, h, () => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, colour);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }, x, y, rad);
  }
  ctx.globalAlpha = 1;
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ------------------------------------------------------------------------------------------------ patterns

function paintTile(f: Finish, seed: number): Painted {
  const [tw, th] = f.size ?? [0.6, 0.6];
  // cover about 2.4 m so several tiles vary in tone before the texture repeats
  const nx = Math.max(2, Math.round(2.4 / tw)), ny = Math.max(2, Math.round(2.4 / th));
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const cw = W / nx, ch = H / ny;
  const grout = Math.max(1.5, Math.min(cw, ch) * 0.012 + 1);
  const glossy = f.roughness < 0.4;
  ctx.fillStyle = f.accent;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x = i * cw, y = j * ch;
      const tone = (r() - 0.5) * (glossy ? 0.035 : 0.07);
      ctx.fillStyle = shade(f.color, tone);
      ctx.fillRect(x + grout / 2, y + grout / 2, cw - grout, ch - grout);
      // soft variation inside the tile
      const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.035)');
      ctx.fillStyle = g;
      ctx.fillRect(x + grout / 2, y + grout / 2, cw - grout, ch - grout);
      if (glossy) {
        // faint veining typical of vitrified tiles
        ctx.strokeStyle = rgba(f.accent, 0.22);
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const x0 = x + r() * cw, y0 = y + r() * ch;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + grout, y + grout, cw - 2 * grout, ch - 2 * grout);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.bezierCurveTo(x0 + (r() - 0.5) * cw, y0 + (r() - 0.5) * ch, x0 + (r() - 0.5) * cw, y0 + (r() - 0.5) * ch, x + r() * cw, y + r() * ch);
          ctx.stroke();
          ctx.restore();
        }
      }
      // bevel: light top/left edge, dark bottom/right
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x + grout / 2, y + grout / 2, cw - grout, 1.2);
      ctx.fillRect(x + grout / 2, y + grout / 2, 1.2, ch - grout);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(x + grout / 2, y + ch - grout / 2 - 1.2, cw - grout, 1.2);
      ctx.fillRect(x + cw - grout / 2 - 1.2, y + grout / 2, 1.2, ch - grout);
    }
  speckle(ctx, W, H, r, glossy ? 2.2 : 5, 1);
  return { canvas: c, cover: [nx * tw, ny * th] };
}

function paintPlank(f: Finish, seed: number): Painted {
  const [pl, pw] = f.size ?? [1.2, 0.18];
  const rows = Math.max(4, Math.round(1.44 / pw));
  const coverU = pl * 2, coverV = rows * pw;
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const rh = H / rows;
  const plankPx = (pl / coverU) * W;
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  for (let j = 0; j < rows; j++) {
    const y = j * rh;
    const offset = ((j * 0.37 + r() * 0.2) % 1) * plankPx;
    for (let k = -1; k < 3; k++) {
      const x = k * plankPx + offset;
      const tone = (r() - 0.5) * 0.16;
      const warm = r();
      const base = mix(f.color, f.accent, 0.12 + warm * 0.3, tone * 0.5);
      const draw = (ox: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + ox, y, plankPx, rh);
        ctx.clip();
        ctx.fillStyle = base;
        ctx.fillRect(x + ox, y, plankPx, rh);
        // grain: long wavy lines
        const lines = 16;
        const rr = rng(seed + j * 131 + k * 17 + 7);
        for (let g = 0; g < lines; g++) {
          const gy = y + (g + rr()) * (rh / lines);
          ctx.strokeStyle = rgba(f.accent, 0.1 + rr() * 0.22);
          ctx.lineWidth = 0.6 + rr() * 1.2;
          ctx.beginPath();
          ctx.moveTo(x + ox, gy);
          const amp = 1.5 + rr() * 3.5;
          for (let s = 0; s <= 8; s++) ctx.lineTo(x + ox + (s / 8) * plankPx, gy + Math.sin(s * 0.9 + rr() * 6) * amp * rr());
          ctx.stroke();
        }
        // a knot now and then
        if (rr() < 0.3) {
          const kx = x + ox + plankPx * (0.2 + rr() * 0.6), ky = y + rh * (0.3 + rr() * 0.4);
          for (let q = 4; q > 0; q--) {
            ctx.strokeStyle = rgba(f.accent, 0.12 + (4 - q) * 0.06);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(kx, ky, q * 5, q * 2.2, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
        // end joint
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(x + ox, y, 1.4, rh);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + ox + 1.4, y, 1, rh);
      };
      draw(0);
    }
    // long joint between rows
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y, W, 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, y + 1.3, W, 1);
  }
  speckle(ctx, W, H, r, 3, 1);
  return { canvas: c, cover: [coverU, coverV] };
}

function paintMarble(f: Finish, seed: number): Painted {
  const [sw, sh] = f.size ?? [1.2, 0.6];
  const nx = Math.max(1, Math.round(2.4 / sw)), ny = Math.max(1, Math.round(2.4 / sh));
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  clouds(ctx, W, H, r, rgba(f.accent, 0.5), 26, 0.22, [90, 260]);
  clouds(ctx, W, H, r, 'rgba(255,255,255,0.7)', 18, 0.25, [80, 220]);
  // veins
  for (let v = 0; v < 13; v++) {
    const pts: [number, number][] = [];
    let x = r() * W, y = r() * H;
    let ang = r() * Math.PI * 2;
    const steps = 7 + Math.floor(r() * 6);
    for (let s = 0; s < steps; s++) {
      pts.push([x, y]);
      ang += (r() - 0.5) * 1.1;
      const l = 50 + r() * 110;
      x += Math.cos(ang) * l;
      y += Math.sin(ang) * l;
    }
    const width = 0.6 + r() * 2.2;
    const alpha = 0.18 + r() * 0.3;
    wrapped(ctx, W, H, () => {
      ctx.strokeStyle = rgba(mixHex(f.accent, '#6f6a62', 0.35), alpha);
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      ctx.stroke();
      // soft halo
      ctx.strokeStyle = rgba(f.accent, alpha * 0.25);
      ctx.lineWidth = width * 6;
      ctx.stroke();
    });
  }
  // slab joints
  ctx.fillStyle = rgba(f.accent, 0.55);
  for (let i = 0; i < nx; i++) ctx.fillRect((i * W) / nx, 0, 1.2, H);
  for (let j = 0; j < ny; j++) ctx.fillRect(0, (j * H) / ny, W, 1.2);
  speckle(ctx, W, H, r, 1.6, 1);
  return { canvas: c, cover: [nx * sw, ny * sh] };
}

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  const ch = (i: number) => Math.max(0, Math.min(255, Math.round(x[i] + (y[i] - x[i]) * t))).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function paintStone(f: Finish, seed: number): Painted {
  const [sw, sh] = f.size ?? [0.6, 0.6];
  const nx = Math.max(1, Math.round(2.4 / sw)), ny = Math.max(1, Math.round(2.4 / sh));
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  const rough = f.roughness > 0.45;
  // per-slab tone
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      ctx.fillStyle = shade(f.color, (r() - 0.5) * (rough ? 0.12 : 0.05));
      ctx.fillRect((i * W) / nx, (j * H) / ny, W / nx, H / ny);
    }
  clouds(ctx, W, H, r, rgba(f.accent, 0.5), rough ? 40 : 14, rough ? 0.2 : 0.1, [40, 160]);
  // crystals / flecks
  const flecks = rough ? 2600 : 5200;
  for (let i = 0; i < flecks; i++) {
    const x = r() * W, y = r() * H, s = 0.5 + r() * (rough ? 1.6 : 1.9);
    const light = r() < (rough ? 0.45 : 0.62);
    ctx.fillStyle = light ? rgba(mixHex(f.accent, '#ffffff', rough ? 0.2 : 0.35), 0.25 + r() * 0.55) : `rgba(0,0,0,${0.12 + r() * 0.25})`;
    ctx.fillRect(x, y, s, s);
  }
  ctx.fillStyle = rough ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.5)';
  for (let i = 0; i < nx; i++) ctx.fillRect((i * W) / nx, 0, rough ? 2.2 : 1.2, H);
  for (let j = 0; j < ny; j++) ctx.fillRect(0, (j * H) / ny, W, rough ? 2.2 : 1.2);
  speckle(ctx, W, H, r, rough ? 5 : 2.5, 1);
  return { canvas: c, cover: [nx * sw, ny * sh] };
}

function paintTerrazzo(f: Finish, seed: number): Painted {
  const W = 1024, H = 1024;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  const chips = [f.accent, mixHex(f.accent, '#ffffff', 0.55), mixHex(f.accent, '#b4633e', 0.55), mixHex(f.accent, '#2f3437', 0.5), mixHex(f.color, '#ffffff', 0.6)];
  for (let i = 0; i < 1500; i++) {
    const x = r() * W, y = r() * H, s = 2.5 + r() * 9;
    const col = chips[Math.floor(r() * chips.length)];
    const n = 4 + Math.floor(r() * 3);
    const a0 = r() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const rad = s * (0.55 + r() * 0.6);
      pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    wrapped(ctx, W, H, () => {
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath();
      pts.forEach((p, k) => (k ? ctx.lineTo(x + p[0], y + p[1]) : ctx.moveTo(x + p[0], y + p[1])));
      ctx.closePath();
      ctx.fill();
    }, x, y, s * 1.2);
  }
  speckle(ctx, W, H, r, 3, 1);
  return { canvas: c, cover: [2.0, 2.0] };
}

function paintPlain(f: Finish, seed: number): Painted {
  const W = 512, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  clouds(ctx, W, H, r, rgba(f.accent, 0.6), 30, 0.18, [30, 140]);
  speckle(ctx, W, H, r, 6, 1);
  return { canvas: c, cover: [2.0, 2.0] };
}

export function paintFinish(f: Finish): Painted {
  const key = `finish|${f.pattern}|${f.color}|${f.accent}|${(f.size ?? []).join('x')}|${f.roughness}`;
  let p = canvasCache.get(key);
  if (p) return p;
  const seed = hashString(key);
  try {
    switch (f.pattern) {
      case 'tile': p = paintTile(f, seed); break;
      case 'plank': p = paintPlank(f, seed); break;
      case 'marble': p = paintMarble(f, seed); break;
      case 'stone': p = paintStone(f, seed); break;
      case 'terrazzo': p = paintTerrazzo(f, seed); break;
      default: p = paintPlain(f, seed);
    }
  } catch (e) {
    console.warn('[HouseViewer] texture paint failed, using flat colour', e);
    const [c, ctx] = makeCanvas(8, 8);
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, 8, 8);
    p = { canvas: c, cover: [1, 1] };
  }
  canvasCache.set(key, p);
  return p;
}

// ------------------------------------------------------------------------------------------------ named textures

export type NamedTexture = 'grass' | 'pavers' | 'teak' | 'concrete' | 'plaster' | 'ground';

function paintNamed(name: NamedTexture, tint?: string): Painted {
  const r = rng(hashString(name + (tint ?? '')));
  if (name === 'grass') {
    const W = 512, H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const base = tint ?? '#7d9a5b';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    clouds(ctx, W, H, r, rgba(mixHex(base, '#3f5a2c', 0.7), 0.7), 46, 0.3, [30, 120]);
    clouds(ctx, W, H, r, rgba(mixHex(base, '#c9cf8a', 0.6), 0.7), 30, 0.22, [30, 110]);
    for (let i = 0; i < 9000; i++) {
      const x = r() * W, y = r() * H;
      ctx.strokeStyle = r() < 0.5 ? `rgba(40,70,25,${0.1 + r() * 0.2})` : `rgba(190,205,130,${0.08 + r() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 3);
      ctx.stroke();
    }
    return { canvas: c, cover: [3, 3] };
  }
  if (name === 'pavers') {
    const W = 512, H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const base = tint ?? '#a9a59c';
    ctx.fillStyle = mixHex(base, '#000000', 0.35);
    ctx.fillRect(0, 0, W, H);
    // herringbone-free simple running bond of 200×100 pavers, 8×8 over 1.6 m × 0.8 m... keep square canvas: 8 cols × 16 rows
    const cols = 8, rows = 16;
    const cw = W / cols, ch = H / rows;
    for (let j = 0; j < rows; j++)
      for (let i = -1; i < cols; i++) {
        const x = i * cw + (j % 2 ? cw / 2 : 0), y = j * ch;
        ctx.fillStyle = mixHex(base, r() < 0.5 ? '#ffffff' : '#5c574f', r() * 0.16);
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        if (x + cw > W) ctx.fillRect(x - W + 1, y + 1, cw - 2, ch - 2);
      }
    speckle(ctx, W, H, r, 7, 1);
    return { canvas: c, cover: [1.6, 1.6] };
  }
  if (name === 'teak') {
    const W = 512, H = 1024;
    const [c, ctx] = makeCanvas(W, H);
    const base = tint ?? '#8a5a34';
    const dark = mixHex(base, '#2a1608', 0.55);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    clouds(ctx, W, H, r, rgba(mixHex(base, '#d9a066', 0.5), 0.6), 14, 0.2, [60, 200]);
    // vertical grain (v runs along the height of the door)
    for (let g = 0; g < 150; g++) {
      const x = r() * W;
      ctx.strokeStyle = rgba(dark, 0.06 + r() * 0.2);
      ctx.lineWidth = 0.6 + r() * 1.6;
      const amp = 2 + r() * 7, ph = r() * 6, fr = 1 + Math.floor(r() * 2);
      wrapped(ctx, W, 1e9, () => {
        ctx.beginPath();
        for (let s = 0; s <= 32; s++) {
          const y = (s / 32) * H;
          const xx = x + Math.sin((s / 32) * Math.PI * 2 * fr + ph) * amp;
          if (s) ctx.lineTo(xx, y); else ctx.moveTo(xx, y);
        }
        ctx.stroke();
      }, x, 5e8, amp + 3);
    }
    speckle(ctx, W, H, r, 3, 1);
    return { canvas: c, cover: [0.5, 1.0] };
  }
  if (name === 'concrete') {
    const W = 512, H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const base = tint ?? '#b9b6ae';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    clouds(ctx, W, H, r, 'rgba(60,58,54,0.6)', 36, 0.16, [30, 150]);
    clouds(ctx, W, H, r, 'rgba(255,255,255,0.7)', 26, 0.16, [30, 130]);
    speckle(ctx, W, H, r, 7, 1);
    return { canvas: c, cover: [2.5, 2.5] };
  }
  if (name === 'ground') {
    const W = 512, H = 512;
    const [c, ctx] = makeCanvas(W, H);
    const base = tint ?? '#d9d4c8';
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    clouds(ctx, W, H, r, 'rgba(120,112,98,0.6)', 30, 0.1, [40, 160]);
    clouds(ctx, W, H, r, 'rgba(255,255,255,0.7)', 24, 0.12, [40, 160]);
    speckle(ctx, W, H, r, 4, 1);
    return { canvas: c, cover: [6, 6] };
  }
  // plaster: almost flat, a little tooth
  const W = 256, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = tint ?? '#ffffff';
  ctx.fillRect(0, 0, W, H);
  clouds(ctx, W, H, r, 'rgba(0,0,0,0.5)', 20, 0.05, [20, 90]);
  speckle(ctx, W, H, r, 4, 1);
  return { canvas: c, cover: [1.5, 1.5] };
}

export function paintedNamed(name: NamedTexture, tint?: string): Painted {
  const key = `named|${name}|${tint ?? ''}`;
  let p = canvasCache.get(key);
  if (!p) {
    try {
      p = paintNamed(name, tint);
    } catch (e) {
      console.warn('[HouseViewer] texture paint failed', e);
      const [c, ctx] = makeCanvas(8, 8);
      ctx.fillStyle = tint ?? '#cccccc';
      ctx.fillRect(0, 0, 8, 8);
      p = { canvas: c, cover: [1, 1] };
    }
    canvasCache.set(key, p);
  }
  return p;
}

/** Wrap a painted canvas as a repeating colour texture whose UVs are metres. */
export function toTexture(p: Painted, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(p.canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.repeat.set(1 / p.cover[0], 1 / p.cover[1]);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Vertical gradient for the scene background. */
export function gradientTexture(top: string, bottom: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Radial alpha falloff (white centre → transparent rim) for the ground disc. */
export function radialAlphaTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#ffffff');
  g.addColorStop(0.62, '#7a7a7a');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
