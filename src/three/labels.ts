// Room labels: name + size as crisp canvas sprites floating above each room.

import * as THREE from 'three';

const texCache = new Map<string, { tex: THREE.CanvasTexture; w: number; h: number }>();

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function labelTexture(name: string, size: string | undefined, dark: boolean) {
  const key = `${name}|${size ?? ''}|${dark ? 'd' : 'l'}`;
  let hit = texCache.get(key);
  if (hit) return hit;
  const S = 4; // supersampling
  const font = '"Inter", "SF Pro Text", "Segoe UI", system-ui, -apple-system, sans-serif';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const nameFont = `600 ${15 * S}px ${font}`;
  const sizeFont = `500 ${11.5 * S}px ${font}`;
  ctx.font = nameFont;
  const wn = ctx.measureText(name).width;
  ctx.font = sizeFont;
  const ws = size ? ctx.measureText(size).width : 0;
  const padX = 11 * S, padY = 7 * S;
  const w = Math.ceil(Math.max(wn, ws) + padX * 2);
  const h = Math.ceil((size ? 34 : 19) * S + padY * 2);
  c.width = w;
  c.height = h;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, S, S, w - 2 * S, h - 2 * S, 8 * S);
  ctx.fillStyle = dark ? 'rgba(24,24,22,0.86)' : 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.lineWidth = S;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(40,36,30,0.16)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = nameFont;
  ctx.fillStyle = dark ? '#f3f1ec' : '#1f1d1a';
  ctx.fillText(name, w / 2, padY + 9.5 * S);
  if (size) {
    ctx.font = sizeFont;
    ctx.fillStyle = dark ? 'rgba(243,241,236,0.66)' : 'rgba(31,29,26,0.62)';
    ctx.fillText(size, w / 2, padY + 26.5 * S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  hit = { tex, w: w / S, h: h / S };
  texCache.set(key, hit);
  return hit;
}

/** A label sprite. World height ≈ 0.42 m for a two-line label; it always faces the camera. */
export function makeLabel(name: string, size: string | undefined, dark: boolean): THREE.Sprite {
  const { tex, w, h } = labelTexture(name || 'Room', size, dark);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: true });
  const s = new THREE.Sprite(mat);
  const k = 0.0105; // metres per CSS pixel of the label
  s.scale.set(w * k, h * k, 1);
  s.renderOrder = 50;
  s.userData.label = true;
  return s;
}

export function disposeLabel(s: THREE.Sprite): void {
  (s.material as THREE.SpriteMaterial).dispose();
}

export function disposeLabelTextures(): void {
  for (const v of texCache.values()) v.tex.dispose();
  texCache.clear();
}
