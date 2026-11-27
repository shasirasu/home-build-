// Material library: one instance per viewer. Materials are shared (cached by key) so merged geometry stays at a
// handful of draw calls, and everything is disposed in one place.

import * as THREE from 'three';
import { claddingById } from '@/data/exterior';
import { finishById } from '@/data/finishes';
import type { Cladding, ExteriorImage, Finish } from '@/types/house';
import { glowTexture, paintCladding, paintFinish, paintedNamed, toTexture, type GlowKind, type NamedTexture } from './textures';

/** Colours of the engineering (structure) view. */
export const RCC = {
  footing: '#5f6f82',
  column: '#c8553a',
  beam: '#2e86a6',
  plinthBeam: '#4a67b0',
  slab: '#bdb8ad',
  stair: '#d59a2f',
  brick: '#b5654a',
} as const;

export const ACCENT = '#2f7df6';

/** How strongly each kind of light picture is drawn at brightness 1 (tuned on screen against the night sky). */
const GLOW = { updown: 0.62, up: 0.6, pool: 0.4, wash: 0.5, halo: 0.75 } as const;

/** Dark anodised / powder-coated metal of the modern details when no accent colour is given. */
export const DARK_METAL = '#2b2d31';

export class MaterialLib {
  anisotropy = 4;
  private cache = new Map<string, THREE.Material>();
  private textures = new Map<string, THREE.Texture>();
  private clippable = new Set<THREE.Material>();
  /** The single horizontal cut plane (keeps everything BELOW y = constant). */
  readonly cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
  private clipOn = false;
  private planes = [this.cutPlane];

  private remember<T extends THREE.Material>(key: string, make: () => T, clip: boolean): T {
    const k = key + (clip ? '|c' : '');
    let m = this.cache.get(k) as T | undefined;
    if (!m) {
      m = make();
      m.name = k;
      if (clip) {
        this.clippable.add(m);
        m.clipShadows = true;
        m.clippingPlanes = this.clipOn ? this.planes : null;
      }
      this.cache.set(k, m);
    }
    return m;
  }

  private texture(key: string, make: () => THREE.Texture): THREE.Texture {
    let t = this.textures.get(key);
    if (!t) { t = make(); this.textures.set(key, t); }
    return t;
  }

  finishTexture(f: Finish): THREE.Texture {
    return this.texture(`finish|${f.id}|${f.color}|${f.accent}|${f.pattern}|${(f.size ?? []).join('x')}`, () => toTexture(paintFinish(f), this.anisotropy));
  }

  namedTexture(name: NamedTexture, tint?: string): THREE.Texture {
    return this.texture(`named|${name}|${tint ?? ''}`, () => toTexture(paintedNamed(name, tint), this.anisotropy));
  }

  /** Flat paint (walls, plaster). */
  paint(color: string, clip = true, roughness = 0.93): THREE.MeshStandardMaterial {
    const c = safeColor(color, '#f1ede4');
    return this.remember(`paint|${c}|${roughness}`, () => new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0, envMapIntensity: 0.55 }), clip);
  }

  /** A floor / wall finish from FINISHES with its procedural texture (UVs in metres). */
  finish(id: string, clip = false): THREE.MeshStandardMaterial {
    const f = finishById(id);
    // dark polished stone would turn grey under the bright ceiling of the environment map: damp its reflections
    const c = new THREE.Color(f.color);
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const env = (f.roughness < 0.4 ? 0.42 : 0.5) * Math.min(1, 0.3 + lum * 1.4);
    return this.remember(`finish|${f.id}`, () => new THREE.MeshStandardMaterial({
      map: this.finishTexture(f), color: '#ffffff', roughness: f.roughness, metalness: 0, envMapIntensity: env,
    }), clip);
  }

  /** Plain colour derived from a finish (skirting, risers). */
  finishFlat(id: string, darken = 0.12, clip = false): THREE.MeshStandardMaterial {
    const f = finishById(id);
    const col = '#' + new THREE.Color(f.color).lerp(new THREE.Color(f.accent), 0.35).multiplyScalar(1 - darken).getHexString();
    return this.remember(`finflat|${f.id}|${darken}`, () => new THREE.MeshStandardMaterial({ color: col, roughness: Math.min(0.9, f.roughness + 0.1), metalness: 0, envMapIntensity: 0.5 }), clip);
  }

  /** Contrasting strip for stair nosings: lighter on dark stone, darker on light stone. */
  nosing(id: string): THREE.MeshStandardMaterial {
    const f = finishById(id);
    const c = new THREE.Color(f.color);
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const col = '#' + c.lerp(new THREE.Color(lum < 0.2 ? '#b9b6ae' : '#3a3936'), 0.55).getHexString();
    return this.remember(`nosing|${f.id}`, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, metalness: 0, envMapIntensity: 0.4 }), false);
  }

  glass(clip = true): THREE.MeshStandardMaterial {
    return this.remember('glass', () => new THREE.MeshStandardMaterial({
      color: '#a9c7d1', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide,
    }), clip);
  }

  wood(tint: string, clip = true, roughness = 0.5): THREE.MeshStandardMaterial {
    return this.remember(`wood|${tint}`, () => new THREE.MeshStandardMaterial({ map: this.namedTexture('teak', tint), roughness, metalness: 0, envMapIntensity: 0.6 }), clip);
  }

  metal(color: string, clip = true, roughness = 0.3, metalness = 1): THREE.MeshStandardMaterial {
    return this.remember(`metal|${color}|${roughness}|${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1.0 }), clip);
  }

  solid(color: string, roughness = 0.8, clip = false, metalness = 0): THREE.MeshStandardMaterial {
    const c = safeColor(color, '#cccccc');
    return this.remember(`solid|${c}|${roughness}|${metalness}`, () => new THREE.MeshStandardMaterial({ color: c, roughness, metalness, envMapIntensity: 0.6 }), clip);
  }

  textured(name: NamedTexture, tint: string | undefined, roughness: number, clip = false): THREE.MeshStandardMaterial {
    return this.remember(`tex|${name}|${tint ?? ''}|${roughness}`, () => new THREE.MeshStandardMaterial({ map: this.namedTexture(name, tint), roughness, metalness: 0, envMapIntensity: 0.45 }), clip);
  }

  // ---- named helpers -------------------------------------------------------------------------------------
  /** Ceiling / soffit white. A little self-illumination stands in for light bounced up off the floor. */
  ceiling() {
    return this.remember('ceiling', () => new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.96, metalness: 0, envMapIntensity: 0.6, emissive: '#fff8ea', emissiveIntensity: 0.3 }), false);
  }
  /** How much the ceilings light themselves: 0.3 by day; turned down at night, when nothing bounces up off the floor. */
  setCeilingGlow(level: number): void {
    this.ceiling().emissiveIntensity = Math.max(0, level);
  }
  cap() { return this.remember('cap', () => new THREE.MeshStandardMaterial({ color: '#3d3a36', roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }), false); }
  reveal() { return this.paint('#f4f1ea', true); }
  trim() { return this.paint('#f7f4ee', true, 0.85); }
  brass() { return this.metal('#b8935a', true, 0.28); }
  steel() { return this.metal('#c5c9cd', true, 0.26); }
  msDark() { return this.metal('#2c2e31', true, 0.55, 0.55); }
  alu() { return this.metal('#7c7770', true, 0.42, 0.85); }
  pvc() { return this.paint('#f0eee8', true, 0.45); }
  emissive(color: string) {
    return this.remember(`emissive|${color}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.6 }), false);
  }

  // ---- the outside ------------------------------------------------------------------------------------------
  /** Called when a texture that loads late (the owner's picture) is ready, so the view can redraw. */
  onChange: (() => void) | null = null;

  /**
   * A facade finish: paint, one of the painted claddings, or the owner's own picture. UVs are metres (u along the
   * wall, v up it), except for a picture set to 'fit' (`material.userData.fit`), which takes 0..1 over the wall.
   */
  cladding(c: Cladding | undefined, images?: Record<string, ExteriorImage>, clip = true): THREE.MeshStandardMaterial {
    if (c?.material === 'image') {
      const img = images?.[c.image ?? ''];
      if (!img?.url) return this.paint('#f3f1ec', clip);
      const fit = c.fit === 'fit';
      const size = Math.max(0.2, Math.min(30, Number(c.size) || 2.4));
      const key = `image|${c.image}|${fit ? 'fit' : size.toFixed(2)}`;
      const m = this.remember(key, () => new THREE.MeshStandardMaterial({
        map: this.texture(key, () => {
          const t = new THREE.TextureLoader().load(img.url, () => this.onChange?.(), undefined, () => console.warn('[HouseViewer] the picture for a facade finish could not be read'));
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = this.anisotropy;
          const aspect = Number.isFinite(img.aspect) && img.aspect > 0.05 ? img.aspect : 1;
          if (!fit) t.repeat.set(1 / size, aspect / size);
          return t;
        }),
        color: '#ffffff', roughness: 0.82, metalness: 0, envMapIntensity: 0.4,
      }), clip);
      m.userData.fit = fit;
      return m;
    }
    const def = claddingById(c?.material);
    const color = def.tintable ? safeColor(c?.color, def.color) : def.color;
    if (def.id === 'paint') return this.paint(color, clip, def.roughness);
    const painted = paintCladding(def.id, color);
    if (!painted) return this.paint(color, clip, def.roughness);
    const key = `clad|${def.id}|${color}`;
    return this.remember(key, () => new THREE.MeshStandardMaterial({
      map: this.texture(key, () => toTexture(painted, this.anisotropy)),
      color: '#ffffff', roughness: def.roughness, metalness: def.metalness ?? 0, envMapIntensity: def.metalness ? 0.9 : 0.45,
    }), clip);
  }

  // ---- outdoor lights ---------------------------------------------------------------------------------------
  // Every one of these comes in two copies: one that the dollhouse cut slices with the walls it sits on (`clip`),
  // one that it leaves alone (the site: gate lamps, bollards).
  private lightColor = new THREE.Color('#ffd0a0');
  private lightLevel = 0;

  /** The glowing part of a fitting: off-white by day, lit at night. */
  lamp(clip = false): THREE.MeshStandardMaterial {
    return this.remember('lamp', () => new THREE.MeshStandardMaterial({ color: '#f1eee6', emissive: this.lightColor.clone(), emissiveIntensity: 0, roughness: 0.5, metalness: 0, envMapIntensity: 0.4 }), clip);
  }

  /** Light landing on a wall or the ground: an additive picture, tinted by the colour of the lamps. */
  glow(kind: GlowKind, clip = false): THREE.MeshBasicMaterial {
    return this.remember(`glow|${kind}`, () => new THREE.MeshBasicMaterial({
      map: this.texture(`glow|${kind}`, () => glowTexture(kind)), color: '#000000', transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }), clip);
  }

  /** A room seen from outside at night, lit or dark (drawn just behind the glass, facing out only). */
  windowGlow(clip = true): THREE.MeshBasicMaterial {
    return this.remember('window-glow', () => new THREE.MeshBasicMaterial({ map: this.texture('glow|window', () => glowTexture('window')), color: '#000000', toneMapped: false, fog: false, side: THREE.FrontSide }), clip);
  }

  /** The soft bloom around every lamp (one point per lamp). */
  halo(clip = false): THREE.PointsMaterial {
    return this.remember('halo', () => new THREE.PointsMaterial({
      map: this.texture('glow|halo', () => glowTexture('halo')), color: '#000000', size: 0.9, sizeAttenuation: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    }), clip);
  }

  /**
   * Switch the outdoor lights: `level` 0 = off … about 1 = on at the chosen brightness. `rooms` = the rooms behind
   * the windows are lit too (otherwise the windows are dark).
   */
  setLighting(color: string, level: number, rooms = true): void {
    this.lightColor.set(safeColor(color, '#ffd0a0'));
    this.lightLevel = Math.max(0, level);
    const c = this.lightColor, lv = this.lightLevel;
    const gain: Record<GlowKind, number> = { updown: GLOW.updown, up: GLOW.up, pool: GLOW.pool, wash: GLOW.wash, halo: GLOW.halo, window: 0 };
    for (const clip of [false, true]) {
      const lamp = this.lamp(clip);
      lamp.emissive.copy(c);
      lamp.emissiveIntensity = lv > 0 ? 0.9 + lv * 0.9 : 0;
      for (const k of ['updown', 'up', 'pool', 'wash'] as const) this.glow(k, clip).color.copy(c).multiplyScalar(gain[k] * lv);
      this.halo(clip).color.copy(c).multiplyScalar(gain.halo * Math.min(1.3, lv));
    }
    // lit rooms: the colour of the lamps, a touch whiter. They sit behind tinted glass, which greys them, so they
    // are drawn richer than they should look; and they do not get brighter than a curtain can.
    if (lv > 0 && rooms) this.windowGlow().color.copy(c).lerp(new THREE.Color('#ffe6c4'), 0.25).multiplyScalar(Math.min(1.35, 0.8 + lv * 0.45));
    else this.windowGlow().color.set('#0c1017');
  }

  get lightsOn() { return this.lightLevel > 0; }

  // ---- structure view --------------------------------------------------------------------------------------
  rcc(kind: keyof typeof RCC, clip = false): THREE.MeshStandardMaterial {
    return this.remember(`rcc|${kind}`, () => new THREE.MeshStandardMaterial({ color: RCC[kind], roughness: 0.82, metalness: 0, envMapIntensity: 0.4 }), clip);
  }

  ghost(): THREE.MeshStandardMaterial {
    return this.remember('ghost', () => new THREE.MeshStandardMaterial({
      color: RCC.brick, roughness: 1, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.2,
    }), true);
  }

  // ---- clipping --------------------------------------------------------------------------------------------
  /** Enable / move / disable the dollhouse cut. `y` = absolute height of the cut. */
  setCut(on: boolean, y = 0): void {
    this.cutPlane.constant = y;
    if (on === this.clipOn) return;
    this.clipOn = on;
    for (const m of this.clippable) {
      m.clippingPlanes = on ? this.planes : null;
      m.needsUpdate = true;
    }
  }

  get cutOn() { return this.clipOn; }

  setAnisotropy(a: number): void {
    this.anisotropy = a;
    for (const t of this.textures.values()) { t.anisotropy = a; t.needsUpdate = true; }
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.cache.clear();
    this.textures.clear();
    this.clippable.clear();
  }
}

export function safeColor(c: string | undefined, fallback: string): string {
  if (typeof c !== 'string') return fallback;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim().toLowerCase() : fallback;
}
