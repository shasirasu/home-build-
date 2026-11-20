// Material library: one instance per viewer. Materials are shared (cached by key) so merged geometry stays at a
// handful of draw calls, and everything is disposed in one place.

import * as THREE from 'three';
import { finishById } from '@/data/finishes';
import type { Finish } from '@/types/house';
import { paintFinish, paintedNamed, toTexture, type NamedTexture } from './textures';

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
