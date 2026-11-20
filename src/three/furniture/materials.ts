// Shared, cached materials for the furniture library. Every material is created once per (type + colour + params)
// and reused by every item, so 200 placed items still mean a few dozen materials.
// Tiling textures are drawn on a canvas once (greyscale, multiplied by the material colour) and expect UVs in metres.

import * as THREE from 'three';
import { rng } from './kit';

const cache = new Map<string, THREE.Material>();
const texCache = new Map<string, THREE.Texture | null>();

function get<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// colour helpers

const _c = new THREE.Color();
const _c2 = new THREE.Color();

/** amt > 0 lightens toward white, amt < 0 darkens toward black. */
export function tint(c: THREE.ColorRepresentation, amt: number): string {
  _c.set(c);
  const hsl = { h: 0, s: 0, l: 0 };
  _c.getHSL(hsl);
  const l = amt >= 0 ? hsl.l + (1 - hsl.l) * amt : hsl.l * (1 + amt);
  _c.setHSL(hsl.h, hsl.s * (amt > 0 ? 1 - amt * 0.35 : 1), l);
  return '#' + _c.getHexString();
}
export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number): string {
  _c.set(a);
  _c2.set(b);
  // mix in sRGB so results match what a designer expects from hex values
  const r = (x: number, y: number) => x + (y - x) * t;
  const A = _c.getHexString();
  const B = _c2.getHexString();
  const ch = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const out = [0, 2, 4].map((i) => Math.round(r(ch(A, i), ch(B, i))));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Perceived lightness 0..1 of a hex colour. */
export function lum(c: THREE.ColorRepresentation): number {
  const s = _c.set(c).getHexString();
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isDark = (c: THREE.ColorRepresentation) => lum(c) < 0.32;

// ---------------------------------------------------------------------------------------------
// canvas textures

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;

/** Canvas texture; `metres` = real-world size of one tile [u, v]. Returns null outside a browser. */
export function canvasTex(key: string, w: number, h: number, metres: [number, number] | null, draw: Draw): THREE.Texture | null {
  if (texCache.has(key)) return texCache.get(key)!;
  let tex: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (ctx) {
      draw(ctx, w, h, rng(w * 31 + h * 17 + key.length * 7919));
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      if (metres) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / metres[0], 1 / metres[1]);
      }
      tex.name = key;
    }
  }
  texCache.set(key, tex);
  return tex;
}

/** Speckle a canvas with light / dark grain without reading it back (getImageData is slow on GPU canvases). */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, strength = 0.1) {
  if (typeof document === 'undefined') return;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c2 = cv.getContext('2d');
  if (!c2) return;
  const img = c2.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
    img.data[i + 3] = Math.abs(v - 0.5) * 2 * strength * 255;
  }
  c2.putImageData(img, 0, 0);
  ctx.drawImage(cv, 0, 0);
}

const woodTex = () =>
  canvasTex('wood', 512, 512, [1.1, 0.3], (ctx, W, H, r) => {
    ctx.fillStyle = '#f6f6f6';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) {
      const y = r() * H;
      const t = 6 + r() * 46;
      ctx.fillStyle = `rgba(80,50,25,${0.015 + r() * 0.035})`;
      ctx.fillRect(0, y, W, t);
      ctx.fillRect(0, y - H, W, t);
    }
    for (let i = 0; i < 300; i++) {
      const y0 = r() * H;
      const amp = 1 + r() * 5;
      const k = 1 + Math.floor(r() * 3);
      const ph = r() * 6.283;
      ctx.strokeStyle = `rgba(62,36,16,${0.03 + r() * 0.09})`;
      ctx.lineWidth = 0.6 + r() * 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = y0 + Math.sin((x / W) * Math.PI * 2 * k + ph) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });

const fabricTex = () =>
  canvasTex('fabric', 256, 256, [0.14, 0.14], (ctx, W, H, r) => {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 0 : -13;
        const thread = (x % 4 === 0 ? -8 : 0) + (y % 4 === 2 ? -8 : 0);
        const v = 240 + weave + thread + (r() - 0.5) * 22;
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  });

const brushedTex = () =>
  canvasTex('brushed', 256, 256, [0.3, 0.3], (ctx, W, H, r) => {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 520; i++) {
      const y = r() * H;
      ctx.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${0.1 + r() * 0.25})` : `rgba(0,0,0,${0.012 + r() * 0.035})`;
      ctx.lineWidth = 0.5 + r();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  });

function stoneTex(color: string, kind: 'granite' | 'marble'): THREE.Texture | null {
  return canvasTex(`stone:${kind}:${color}`, 512, 512, kind === 'granite' ? [0.6, 0.6] : [1.2, 1.2], (ctx, W, H, r) => {
    const dark = isDark(color);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    if (kind === 'granite') {
      for (let i = 0; i < 5200; i++) {
        const light = r() > 0.5;
        ctx.fillStyle = light ? `rgba(255,255,255,${dark ? 0.05 + r() * 0.16 : 0.2 + r() * 0.3})` : `rgba(0,0,0,${dark ? 0.2 + r() * 0.3 : 0.04 + r() * 0.1})`;
        const s = 0.6 + r() * 2.2;
        ctx.beginPath();
        ctx.ellipse(r() * W, r() * H, s, s * (0.5 + r() * 0.8), r() * 3.14, 0, 6.283);
        ctx.fill();
      }
      if (dark)
        for (let i = 0; i < 420; i++) {
          ctx.fillStyle = r() > 0.4 ? `rgba(214,178,110,${0.5 + r() * 0.5})` : `rgba(210,215,220,${0.5 + r() * 0.5})`;
          const s = 0.5 + r() * 1.3;
          ctx.fillRect(r() * W, r() * H, s, s);
        }
    } else {
      const vein = dark ? '235,235,230' : '110,112,118';
      for (let i = 0; i < 16; i++) {
        let x = r() * W;
        let y = r() * H;
        let a = r() * 6.283;
        ctx.strokeStyle = `rgba(${vein},${0.1 + r() * 0.22})`;
        ctx.lineWidth = 0.6 + r() * 2.4;
        ctx.shadowColor = `rgba(${vein},0.5)`;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 46; s++) {
          a += (r() - 0.5) * 0.9;
          x += Math.cos(a) * 14;
          y += Math.sin(a) * 14;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${vein},${0.02 + r() * 0.03})`;
        ctx.beginPath();
        ctx.ellipse(r() * W, r() * H, 20 + r() * 70, 10 + r() * 40, r() * 3.14, 0, 6.283);
        ctx.fill();
      }
    }
  });
}

/** Perforated mesh (office-chair back): opaque threads, punched holes, used with alphaTest. */
const meshTex = () =>
  canvasTex('mesh', 64, 64, [0.008, 0.008], (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.3, 0, 6.283);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });

// ---------------------------------------------------------------------------------------------
// materials

type Std = THREE.MeshStandardMaterialParameters;

/** Thin overlays (screens, prints, LEDs, mirror plates) are pulled a hair toward the camera so they never z-fight. */
const DECAL = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } as const;

function std(name: string, key: string, p: Std, ud?: Record<string, unknown>): THREE.MeshStandardMaterial {
  return get(`${name}|${key}`, () => {
    const m = new THREE.MeshStandardMaterial(p);
    m.name = name;
    if (ud) Object.assign(m.userData, ud);
    return m;
  });
}

/** True for colours that read as timber (warm hue, mid lightness): those get a grain, the rest a plain laminate. */
export function isWoody(c: THREE.ColorRepresentation): boolean {
  const hsl = { h: 0, s: 0, l: 0 };
  _c.set(c).getHSL(hsl, THREE.SRGBColorSpace);
  const deg = hsl.h * 360;
  return deg >= 12 && deg <= 52 && hsl.s > 0.14 && hsl.l > 0.14 && hsl.l < 0.72;
}

export const M = {
  /** Cabinet body in the item's colour: timber grain for wood tones, laminate for whites / greys / colours. */
  body(color: string): THREE.Material {
    return isWoody(color) ? M.wood(color) : M.lam(color);
  },
  /** Solid wood / veneer with grain. */
  wood(color: string, rough = 0.52): THREE.Material {
    return std('wood', `${color}|${rough}`, { color: tint(color, 0.05), roughness: rough, metalness: 0, map: woodTex() });
  },
  /** Laminate, acrylic, painted MDF: smooth, no grain. */
  lam(color: string, rough = 0.42): THREE.Material {
    return std('laminate', `${color}|${rough}`, { color, roughness: rough, metalness: 0 });
  },
  fabric(color: string, o: { double?: boolean; rough?: number } = {}): THREE.Material {
    return std('fabric', `${color}|${o.double ? 2 : 1}|${o.rough ?? 0.92}`, {
      color: tint(color, 0.04),
      roughness: o.rough ?? 0.92,
      metalness: 0,
      map: fabricTex(),
      bumpMap: fabricTex(),
      bumpScale: 0.6,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
  },
  leather(color: string): THREE.Material {
    return std('leather', color, { color, roughness: 0.55, metalness: 0 });
  },
  /** Any metal by colour. */
  metal(color: string, rough = 0.3, name = 'metal'): THREE.Material {
    return std(name, `${color}|${rough}`, { color, roughness: rough, metalness: 1 });
  },
  /** Brushed stainless steel. */
  steel(): THREE.Material {
    return std('steel', 'brushed', { color: '#c9ccd0', roughness: 0.34, metalness: 1, map: brushedTex() });
  },
  chrome(): THREE.Material {
    return std('chrome', '', { color: '#eef0f2', roughness: 0.07, metalness: 1 });
  },
  brass(): THREE.Material {
    return std('brass', '', { color: '#c9a25a', roughness: 0.26, metalness: 1 });
  },
  /** Powder-coated black metal. */
  black(): THREE.Material {
    return std('black-metal', '', { color: '#1d1d1f', roughness: 0.48, metalness: 0.55 });
  },
  iron(): THREE.Material {
    return std('cast-iron', '', { color: '#232325', roughness: 0.72, metalness: 0.4 });
  },
  /** Clear / tinted glass: transparent physical material, no transmission pass. */
  glass(color = '#d6e6ea', opacity = 0.26): THREE.Material {
    return get(`glass|${color}|${opacity}`, () => {
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.03,
        metalness: 0,
        transparent: true,
        opacity,
        envMapIntensity: 1.8,
        specularIntensity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      m.name = 'glass';
      m.userData.noCast = true;
      return m;
    });
  },
  /** Opaque black glass: TV screens, oven doors, hob tops, car windows. */
  smoked(color = '#0b0c0e'): THREE.Material {
    return get(`smoked|${color}`, () => {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4, ...DECAL });
      m.name = 'dark-glass';
      return m;
    });
  },
  mirror(): THREE.Material {
    return std('mirror', '', { color: '#f2f5f6', roughness: 0.025, metalness: 1, envMapIntensity: 1.3, emissive: '#93a1a8', emissiveIntensity: 0.14, ...DECAL });
  },
  /** Glossy vitreous china / enamel. */
  ceramic(color = '#f7f7f5'): THREE.Material {
    return get(`ceramic|${color}`, () => {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
      m.name = 'ceramic';
      return m;
    });
  },
  /** Car paint / glossy appliance enamel. */
  gloss(color: string, metal = 0.2): THREE.Material {
    return get(`gloss|${color}|${metal}`, () => {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: metal, clearcoat: 1, clearcoatRoughness: 0.05 });
      m.name = 'paint-gloss';
      return m;
    });
  },
  plastic(color: string, rough = 0.42): THREE.Material {
    return std('plastic', `${color}|${rough}`, { color, roughness: rough, metalness: 0 });
  },
  rubber(): THREE.Material {
    return std('rubber', '', { color: '#151516', roughness: 0.88, metalness: 0 });
  },
  /** Light-emitting face (lamp diffusers, LEDs, flames). */
  glow(color = '#fff1d6', intensity = 1.4, base = '#ffffff'): THREE.Material {
    return std('glow', `${color}|${intensity}|${base}`, { color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0, ...DECAL }, { noCast: true, emissive: true });
  },
  /** Translucent lit shade (linen lampshades): glows softly, double sided. */
  shade(color = '#f1e7d3', glow = 0.45): THREE.Material {
    return std(
      'shade',
      `${color}|${glow}`,
      { color, emissive: '#ffd9a0', emissiveIntensity: glow, roughness: 0.9, metalness: 0, map: fabricTex(), side: THREE.DoubleSide },
      { emissive: true },
    );
  },
  /** One material for many colours: parts pass `color` and it is stored per vertex (books, fruit, idols). */
  paint(rough = 0.7, metal = 0): THREE.Material {
    return std('paint', `${rough}|${metal}`, { color: '#ffffff', roughness: rough, metalness: metal, vertexColors: true });
  },
  /** Granite / marble slab (colour baked into a speckled or veined texture). */
  stone(color: string, kind: 'granite' | 'marble' = 'granite', rough = 0.22): THREE.Material {
    const tex = stoneTex(color, kind);
    return std('stone', `${color}|${kind}|${rough}`, { color: tex ? '#ffffff' : color, roughness: rough, metalness: 0, map: tex });
  },
  /** Leaves and petals: double sided, tinted per instance. */
  leaf(color = '#ffffff', rough = 0.62): THREE.Material {
    return std('foliage', `${color}|${rough}`, { color, roughness: rough, metalness: 0, side: THREE.DoubleSide, vertexColors: true });
  },
  /** Perforated mesh fabric (alpha-tested). */
  mesh(color: string): THREE.Material {
    return std('mesh', color, { color, roughness: 0.8, metalness: 0, map: meshTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  },
  /** Material carrying its own picture (rug pattern, artwork). */
  picture(key: string, tex: THREE.Texture | null, fallback: string, rough = 0.9): THREE.Material {
    return std('print', key, { color: tex ? '#ffffff' : fallback, roughness: rough, metalness: 0, map: tex, ...DECAL });
  },
};

/** Free every cached material and texture (call when the whole viewer is torn down). */
export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  for (const t of texCache.values()) t?.dispose();
  cache.clear();
  texCache.clear();
}
