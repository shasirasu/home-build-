// The exterior catalogue: facade materials, ready-made styles, and the kinds of outdoor light.
// A style is only a starting point: every part of it can be changed afterwards (src/features/studio/panels/ExteriorPanel).

import type { Cladding, ExteriorDesign, ExteriorLightKind, ExteriorZone, HouseSpec } from '@/types/house';

// ------------------------------------------------------------------------------------------------ materials

export type CladdingGroup = 'Paint and plaster' | 'Stone' | 'Wood' | 'Brick' | 'Concrete' | 'Panels and metal';

export interface CladdingDef {
  id: string;
  name: string;
  group: CladdingGroup;
  /** Colour it comes in (and the tint the engine starts from). */
  color: string;
  /** The owner can pick the colour. */
  tintable: boolean;
  roughness: number;
  metalness?: number;
  /** CSS background that stands in for it in the panel. */
  swatch: (color: string) => string;
}

const lines = (c: string, d: string, deg: number, a: number, b: number) => `repeating-linear-gradient(${deg}deg, ${c} 0 ${a}px, ${d} ${a}px ${b}px)`;
const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)})`;
};

export const CLADDINGS: CladdingDef[] = [
  { id: 'paint', name: 'Smooth paint', group: 'Paint and plaster', color: '#f3f1ec', tintable: true, roughness: 0.92, swatch: (c) => c },
  { id: 'plaster-texture', name: 'Textured plaster', group: 'Paint and plaster', color: '#e9e4d8', tintable: true, roughness: 0.97, swatch: (c) => `radial-gradient(${shade(c, -0.12)} 0.6px, ${c} 0.9px) 0 0 / 4px 4px` },
  { id: 'plaster-groove', name: 'Grooved plaster', group: 'Paint and plaster', color: '#eeebe3', tintable: true, roughness: 0.93, swatch: (c) => lines(c, shade(c, -0.28), 0, 9, 10) },
  { id: 'stone-stack', name: 'Stacked stone', group: 'Stone', color: '#9a958b', tintable: true, roughness: 0.9, swatch: (c) => `${lines('transparent', shade(c, -0.4), 90, 11, 12)}, ${lines(shade(c, 0.1), shade(c, -0.22), 0, 4, 5)}` },
  { id: 'stone-ashlar', name: 'Sandstone blocks', group: 'Stone', color: '#d2bf9c', tintable: true, roughness: 0.88, swatch: (c) => `${lines('transparent', shade(c, -0.3), 90, 15, 16)}, ${lines(c, shade(c, -0.3), 0, 9, 10)}` },
  { id: 'stone-slate', name: 'Dark slate', group: 'Stone', color: '#4b4d50', tintable: true, roughness: 0.72, swatch: (c) => `${lines('transparent', shade(c, -0.45), 90, 19, 20)}, ${lines(shade(c, 0.08), shade(c, -0.45), 0, 9, 10)}` },
  { id: 'laterite', name: 'Laterite', group: 'Stone', color: '#9c5438', tintable: false, roughness: 0.95, swatch: (c) => `${lines('transparent', shade(c, -0.35), 90, 13, 14)}, ${lines(c, shade(c, -0.35), 0, 7, 8)}` },
  { id: 'wood-slat', name: 'Timber battens', group: 'Wood', color: '#9a6238', tintable: true, roughness: 0.62, swatch: (c) => lines(c, shade(c, -0.5), 90, 4, 6) },
  { id: 'wood-board', name: 'Timber boards', group: 'Wood', color: '#a8733f', tintable: true, roughness: 0.6, swatch: (c) => lines(c, shade(c, -0.35), 0, 7, 8) },
  { id: 'brick', name: 'Exposed brick', group: 'Brick', color: '#a5563c', tintable: true, roughness: 0.9, swatch: (c) => `${lines('transparent', '#d8d2c6', 90, 11, 12)}, ${lines(c, '#d8d2c6', 0, 4, 5)}` },
  { id: 'concrete-board', name: 'Board-marked concrete', group: 'Concrete', color: '#a9a7a1', tintable: true, roughness: 0.86, swatch: (c) => lines(c, shade(c, -0.14), 0, 3, 4) },
  { id: 'concrete-panel', name: 'Concrete panels', group: 'Concrete', color: '#b4b2ac', tintable: true, roughness: 0.82, swatch: (c) => `radial-gradient(circle at 4px 4px, ${shade(c, -0.3)} 1px, transparent 1.4px) 0 0 / 12px 12px, ${c}` },
  { id: 'tile-large', name: 'Large-format tile', group: 'Panels and metal', color: '#c9c5bd', tintable: true, roughness: 0.4, swatch: (c) => `${lines('transparent', shade(c, -0.25), 90, 23, 24)}, ${lines(c, shade(c, -0.25), 0, 11, 12)}` },
  { id: 'panel-acp', name: 'Metal composite panel', group: 'Panels and metal', color: '#3b3d41', tintable: true, roughness: 0.38, metalness: 0.5, swatch: (c) => `${lines('transparent', shade(c, -0.5), 90, 17, 18)}, ${lines(shade(c, 0.1), shade(c, -0.5), 0, 17, 18)}` },
  { id: 'metal-seam', name: 'Standing-seam metal', group: 'Panels and metal', color: '#4a4f55', tintable: true, roughness: 0.42, metalness: 0.75, swatch: (c) => lines(c, shade(c, 0.3), 90, 7, 8) },
];

export const CLADDING_GROUPS: CladdingGroup[] = ['Paint and plaster', 'Stone', 'Wood', 'Brick', 'Concrete', 'Panels and metal'];

const BY_ID = new Map(CLADDINGS.map((c) => [c.id, c]));
export const claddingById = (id: string | undefined): CladdingDef => BY_ID.get(id ?? '') ?? CLADDINGS[0];

/** Colours offered for tintable finishes. */
export const FACADE_COLOURS = ['#f6f4ef', '#ece5d6', '#d9d2c2', '#c8b79a', '#b8b5ad', '#8d8f8c', '#5c5f61', '#3b3d41', '#24272b', '#9a6238', '#7a4a2a', '#a5563c', '#6e7f6a', '#51667a'];

// ------------------------------------------------------------------------------------------------ zones

export const ZONES: { id: ExteriorZone; name: string; hint: string }[] = [
  { id: 'ground', name: 'Ground storey', hint: 'Outside walls of the ground floor' },
  { id: 'upper', name: 'Upper storeys', hint: 'Outside walls above the ground floor' },
  { id: 'feature', name: 'Feature wall', hint: 'The part of the front picked under Details' },
  { id: 'parapet', name: 'Parapet', hint: 'The wall around the terrace' },
  { id: 'band', name: 'Floor bands', hint: 'The slab edges between storeys and at the roof' },
  { id: 'plinth', name: 'Plinth', hint: 'The base the house stands on' },
  { id: 'boundary', name: 'Compound wall', hint: 'The wall around the plot' },
];

// ------------------------------------------------------------------------------------------------ lights

export const LIGHT_KINDS: { id: ExteriorLightKind; name: string; hint: string }[] = [
  { id: 'wall', name: 'Wall lights', hint: 'Up-and-down lights beside the doors and along the walls' },
  { id: 'uplight', name: 'Ground uplights', hint: 'Lights in the ground that wash up the front walls' },
  { id: 'soffit', name: 'Ceiling strip', hint: 'An LED line around the ceiling of the portico and sit-outs' },
  { id: 'downlight', name: 'Downlights', hint: 'Recessed spots in the portico ceiling' },
  { id: 'roofline', name: 'Roofline strip', hint: 'An LED line under the parapet coping' },
  { id: 'bollard', name: 'Path bollards', hint: 'Low posts along the driveway' },
  { id: 'gate', name: 'Gate lamps', hint: 'A lamp on each gate pillar' },
  { id: 'windows', name: 'Lit windows', hint: 'The rooms are lit behind the windows at night' },
];

export const LIGHT_COLOURS: { color: string; name: string }[] = [
  { color: '#ffb469', name: 'Warm white, 2700 K' },
  { color: '#ffd0a0', name: 'Soft white, 3000 K' },
  { color: '#fff0de', name: 'Neutral white, 4000 K' },
  { color: '#dce9ff', name: 'Daylight, 6000 K' },
  { color: '#ff9a3c', name: 'Amber' },
  { color: '#6fb6ff', name: 'Blue' },
  { color: '#7fe0a2', name: 'Green' },
  { color: '#e58cff', name: 'Violet' },
];

// ------------------------------------------------------------------------------------------------ styles

export interface ExteriorStyle {
  id: string;
  name: string;
  blurb: string;
  design: ExteriorDesign;
}

const paint = (color: string): Cladding => ({ material: 'paint', color });
const mat = (material: string, color?: string): Cladding => ({ material, color: color ?? claddingById(material).color });
const lights = (on: ExteriorLightKind[], color = '#ffd0a0', brightness = 1) => ({ kinds: Object.fromEntries(on.map((k) => [k, true])) as Partial<Record<ExteriorLightKind, boolean>>, color, brightness });

export const EXTERIOR_STYLES: ExteriorStyle[] = [
  {
    id: 'modern-contrast', name: 'Modern contrast', blurb: 'White box in a charcoal frame, stone base, timber at the entrance',
    design: {
      style: 'modern-contrast',
      zones: { ground: mat('stone-stack', '#8f8b83'), upper: paint('#f4f2ee'), feature: mat('wood-slat', '#9a6238'), parapet: paint('#f4f2ee'), band: paint('#3b3e43'), plinth: mat('stone-slate', '#3f4144'), boundary: mat('plaster-groove', '#e9e6df') },
      feature: 'entrance', windows: 'box', frame: true, fins: 'none', parapet: 'glass', overhang: 0, canopy: true, pergola: false, gate: 'slats', accent: '#3b3e43',
      lighting: lights(['wall', 'uplight', 'soffit', 'downlight', 'roofline', 'gate', 'bollard', 'windows']),
    },
  },
  {
    id: 'warm-minimal', name: 'Warm minimal', blurb: 'Off-white grooved plaster, timber boards across the upper front',
    design: {
      style: 'warm-minimal',
      zones: { ground: mat('plaster-groove', '#efeae0'), upper: mat('plaster-groove', '#efeae0'), feature: mat('wood-board', '#a8733f'), parapet: paint('#efeae0'), band: paint('#efeae0'), plinth: mat('stone-ashlar', '#c9b792'), boundary: mat('plaster-texture', '#e6dfd0') },
      feature: 'front-upper', windows: 'hood', frame: false, fins: 'none', parapet: 'rail', overhang: 0.45, canopy: true, pergola: true, gate: 'slats', accent: '#5a4636',
      lighting: lights(['wall', 'soffit', 'downlight', 'bollard', 'gate', 'windows'], '#ffb469'),
    },
  },
  {
    id: 'concrete-timber', name: 'Concrete and timber', blurb: 'Board-marked concrete with timber fins and black steel',
    design: {
      style: 'concrete-timber',
      zones: { ground: mat('concrete-board'), upper: mat('concrete-panel'), feature: mat('wood-slat', '#8a5630'), parapet: mat('concrete-panel'), band: mat('concrete-board', '#8f8d88'), plinth: mat('concrete-board', '#7c7a75'), boundary: mat('concrete-board') },
      feature: 'front-ground', windows: 'box', frame: false, fins: 'wood', parapet: 'glass', overhang: 0.3, canopy: true, pergola: false, gate: 'sheet', accent: '#1f2124',
      lighting: lights(['uplight', 'soffit', 'downlight', 'roofline', 'gate', 'windows'], '#fff0de'),
    },
  },
  {
    id: 'stone-white', name: 'Stone and white', blurb: 'Sandstone ground storey under a clean white upper storey',
    design: {
      style: 'stone-white',
      zones: { ground: mat('stone-ashlar'), upper: paint('#f7f5f1'), feature: mat('stone-slate'), parapet: paint('#f7f5f1'), band: paint('#f7f5f1'), plinth: mat('stone-ashlar', '#b9a682'), boundary: mat('stone-ashlar') },
      feature: 'entrance', windows: 'box', frame: false, fins: 'none', parapet: 'solid', overhang: 0.6, canopy: true, pergola: false, gate: 'bars', accent: '#3a3c40',
      lighting: lights(['wall', 'uplight', 'soffit', 'bollard', 'gate', 'windows']),
    },
  },
  {
    id: 'brick-steel', name: 'Brick and steel', blurb: 'Exposed brick below, pale plaster above, black steel details',
    design: {
      style: 'brick-steel',
      zones: { ground: mat('brick'), upper: mat('plaster-texture', '#e4e1da'), feature: mat('brick'), parapet: mat('plaster-texture', '#e4e1da'), band: paint('#26282b'), plinth: mat('concrete-board', '#77756f'), boundary: mat('brick') },
      feature: 'entrance', windows: 'box', frame: true, fins: 'metal', parapet: 'rail', overhang: 0, canopy: true, pergola: false, gate: 'bars', accent: '#26282b',
      lighting: lights(['wall', 'soffit', 'downlight', 'gate', 'bollard', 'windows'], '#ffb469'),
    },
  },
  {
    id: 'graphite', name: 'Graphite', blurb: 'Dark panels and seamed metal with a thin white frame',
    design: {
      style: 'graphite',
      zones: { ground: mat('panel-acp', '#34363a'), upper: mat('plaster-texture', '#45484c'), feature: mat('metal-seam', '#2a2d31'), parapet: mat('plaster-texture', '#45484c'), band: paint('#f1efea'), plinth: mat('stone-slate', '#2e3033'), boundary: mat('plaster-groove', '#4a4d51') },
      feature: 'front-upper', windows: 'box', frame: true, fins: 'none', parapet: 'glass', overhang: 0.3, canopy: true, pergola: false, gate: 'sheet', accent: '#f1efea',
      lighting: lights(['uplight', 'soffit', 'downlight', 'roofline', 'bollard', 'gate', 'windows'], '#dce9ff'),
    },
  },
  {
    id: 'tropical', name: 'Tropical modern', blurb: 'Laterite base, white walls, deep overhang and a timber pergola',
    design: {
      style: 'tropical',
      zones: { ground: mat('laterite'), upper: paint('#f5f2ea'), feature: mat('wood-board', '#8f5d33'), parapet: paint('#f5f2ea'), band: paint('#f5f2ea'), plinth: mat('laterite'), boundary: mat('laterite') },
      feature: 'entrance', windows: 'hood', frame: false, fins: 'wood', parapet: 'rail', overhang: 0.6, canopy: true, pergola: true, gate: 'slats', accent: '#4a3a2c',
      lighting: lights(['wall', 'soffit', 'downlight', 'bollard', 'gate', 'windows'], '#ffb469'),
    },
  },
  {
    id: 'classic', name: 'Classic plaster', blurb: 'Painted plaster with lintel bands and moulded columns',
    design: {
      style: 'classic',
      zones: { ground: paint('#ece5d6'), upper: paint('#ece5d6'), feature: paint('#ece5d6'), parapet: paint('#ece5d6'), band: paint('#8a6a4f'), plinth: paint('#6f6a62'), boundary: paint('#ece5d6') },
      feature: 'none', windows: 'band', frame: false, fins: 'none', parapet: 'solid', overhang: 0, canopy: false, pergola: false, gate: 'bars', accent: '#3d3a36',
      lighting: lights(['wall', 'gate', 'windows'], '#ffd0a0'),
    },
  },
];

export const DEFAULT_STYLE = 'modern-contrast';

export const styleById = (id: string | undefined): ExteriorStyle => EXTERIOR_STYLES.find((s) => s.id === id) ?? EXTERIOR_STYLES[0];

/** A fresh copy of a style's design. */
export function designOfStyle(id: string | undefined): ExteriorDesign {
  return structuredClone(styleById(id).design);
}

const ZONE_IDS: ExteriorZone[] = ['ground', 'upper', 'feature', 'parapet', 'band', 'plinth', 'boundary'];
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const colour = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : d);

/**
 * The exterior design a house is drawn with: its own where it has one, completed from the style it names, and the
 * default modern style where it has none. Never throws on odd or partial input.
 */
export function resolveExterior(spec: Pick<HouseSpec, 'exterior'> | null | undefined): ExteriorDesign {
  const own = spec?.exterior?.design as Partial<ExteriorDesign> | undefined;
  const base = designOfStyle(own?.style ?? DEFAULT_STYLE);
  if (!own || typeof own !== 'object') return base;
  const zones = { ...base.zones };
  for (const z of ZONE_IDS) {
    const c = own.zones?.[z];
    if (!c || typeof c.material !== 'string') continue;
    if (c.material === 'image') {
      // a picture that is no longer there falls back to the style's finish
      if (c.image && own.images?.[c.image]?.url) zones[z] = { material: 'image', image: c.image, size: Math.max(0.2, Math.min(30, Number(c.size) || 2.4)), fit: c.fit === 'fit' ? 'fit' : 'tile' };
      continue;
    }
    const def = claddingById(c.material);
    zones[z] = { material: def.id, color: def.tintable ? colour(c.color, def.color) : def.color };
  }
  const kinds: Partial<Record<ExteriorLightKind, boolean>> = {};
  for (const k of LIGHT_KINDS) kinds[k.id] = !!(own.lighting?.kinds ?? base.lighting.kinds)[k.id];
  return {
    style: styleById(own.style).id,
    zones,
    feature: oneOf(own.feature, ['none', 'front', 'front-upper', 'front-ground', 'entrance'] as const, base.feature),
    windows: oneOf(own.windows, ['band', 'box', 'hood', 'none'] as const, base.windows),
    frame: typeof own.frame === 'boolean' ? own.frame : base.frame,
    fins: oneOf(own.fins, ['none', 'wood', 'metal'] as const, base.fins),
    parapet: oneOf(own.parapet, ['solid', 'glass', 'rail'] as const, base.parapet),
    overhang: Number.isFinite(own.overhang) ? Math.max(0, Math.min(1.2, own.overhang as number)) : base.overhang,
    canopy: typeof own.canopy === 'boolean' ? own.canopy : base.canopy,
    pergola: typeof own.pergola === 'boolean' ? own.pergola : base.pergola,
    gate: oneOf(own.gate, ['bars', 'slats', 'sheet'] as const, base.gate),
    accent: colour(own.accent, base.accent),
    lighting: {
      kinds,
      color: colour(own.lighting?.color, base.lighting.color),
      brightness: Number.isFinite(own.lighting?.brightness) ? Math.max(0.3, Math.min(1.6, own.lighting!.brightness)) : base.lighting.brightness,
    },
    images: own.images && typeof own.images === 'object' ? own.images : undefined,
  };
}

/** One line describing a finish, for lists. */
export function claddingLabel(c: Cladding, design: ExteriorDesign): string {
  if (c.material === 'image') return design.images?.[c.image ?? '']?.name ?? 'Your picture';
  return claddingById(c.material).name;
}
