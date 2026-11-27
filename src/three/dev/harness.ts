// Dev harness for the 3D engine (open /engine.html). Mounts HouseViewer with the sample house and furnishing and
// exposes it as window.viewer. Hash parameters set up a view for screenshots / scripts:
//
//   #level=gf|ff|all  cut=1  cutHeight=1.2  structure=1  labels=1  site=0  roof=0  furn=0  sun=10  theme=dark
//   #mode=top | mode=walk&x=..&y=..&yaw=..&pitch=..&wl=gf   (x, y in plan metres; add u=ft to give them in feet;
//                                                            yaw / pitch in degrees, yaw 0 = up the drawing)
//   #cam=x,y,z,tx,ty,tz                                      orbit camera position and target (metres)
//   #sel=item:<uid> | room:<level>:<room> | wall:<level>:<wall> | opening:<level>:<id> | stair:<level>:<id> | column:<id> | beam:<id>
//   #focus=<level>:<room>   edit=1   place=<catalog kind>   hud=0
//   #q=high|low             force the full / lite render pipeline (default: lite only on software WebGL)
//   #spec=odd               a deliberately awkward house (bad walls / openings / items) to check robustness
//   #night=1  lights=0      night: dark sky, moonlight, the outdoor lights of the exterior design switched on;
//                           lights=0 = the main switch off (a dark house under the moon; no effect by day)
//   #ext=<style id>         exterior style from src/data/exterior.ts (modern-contrast, warm-minimal, concrete-timber,
//                           stone-white, brick-steel, graphite, tropical, classic); default = the house's own design
//   #img=1|<zone>[,fit]     a test picture as the finish of a zone (default: feature; 1 = feature, tiled 1.2 m wide)
//   #light=<hex without #>  lightlevel=0.3..1.6  kinds=wall,uplight,...    colour, brightness and kinds of the lights

import { catalogByKind } from '@/data/catalog';
import { SAMPLE_FURNISHING } from '@/data/sampleFurnishing';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import { designOfStyle, resolveExterior } from '@/data/exterior';
import type { ExteriorLightKind, ExteriorZone, HouseSpec, PlacedItem } from '@/types/house';
import type { DisplayOptions, Selection } from '../api';
import { HouseViewer } from '../HouseViewer';
import { ODD_HOUSE, ODD_ITEMS } from './oddHouse';

const el = document.getElementById('app')!;
const params = new URLSearchParams(location.hash.replace(/^#/, ''));
const num = (k: string, d: number) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : d);
const flag = (k: string, d: boolean) => (params.has(k) ? params.get(k) !== '0' && params.get(k) !== 'false' : d);

const display: Partial<DisplayOptions> = {
  level: params.get('level') ?? 'all',
  cutWalls: flag('cut', false),
  cutHeight: num('cutHeight', 1.2),
  structure: flag('structure', false),
  showLabels: flag('labels', false),
  showSite: flag('site', true),
  showRoof: flag('roof', true),
  showFurniture: flag('furn', true),
  sunHour: num('sun', 15),
  night: flag('night', false),
  lightsOn: flag('lights', true),
  theme: params.get('theme') === 'dark' ? 'dark' : 'light',
};
document.body.style.background = display.night ? '#0a0d14' : display.theme === 'dark' ? '#141413' : '#f4f1ea';

const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:10px;bottom:8px;font:11px/1.4 ui-monospace,Menlo,monospace;color:#6b665d;pointer-events:none;white-space:pre';
if (flag('hud', true)) document.body.appendChild(hud);
let statLine = '';
let infoLine = '';
const paint = () => { hud.textContent = [statLine, infoLine].filter(Boolean).join('\n'); };

const q = params.get('q');
if (q === 'high' || q === 'low') HouseViewer.quality = q;
const odd = params.get('spec') === 'odd';
let items: PlacedItem[] = odd ? ODD_ITEMS : SAMPLE_FURNISHING;
const t0 = performance.now();
const viewer = new HouseViewer({
  container: el,
  display,
  onStats: (s) => { statLine = `${s.fps} fps · ${s.drawCalls} calls · ${(s.triangles / 1000).toFixed(1)}k tris`; paint(); },
  onSelect: (s) => { infoLine = s ? `selected ${JSON.stringify(s)}` : ''; paint(); (window as unknown as Record<string, unknown>).__sel = s; console.info('[select]', s); },
  onHover: (s) => { (window as unknown as Record<string, unknown>).__hover = s; },
  onRoomChange: (l, r) => { infoLine = `room ${l ?? '-'} / ${r ?? '-'}`; paint(); },
  onModeChange: (m) => console.info('[mode]', m),
  onItemChange: (it) => {
    (window as unknown as Record<string, unknown>).__changed = it;
    items = items.map((i) => (i.uid === it.uid ? it : i));
    viewer.setItems(items);
    console.info('[item]', it.uid, it.x, it.y, it.rot, it.roomId);
  },
  onPlaceEnd: (it) => {
    console.info('[place]', it);
    (window as unknown as Record<string, unknown>).__placed = it;
    if (it) { items = [...items, it]; viewer.setItems(items); }
  },
});
const t1 = performance.now();

/** A picture to try as a facade finish: a patterned tile drawn on a canvas, as the app would hand over an upload. */
function testPicture(): { url: string; aspect: number } {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9b089';
  g.fillRect(0, 0, W, H);
  // a jali-like lattice so scale, direction and seams are easy to judge
  g.strokeStyle = '#6b4a2b';
  g.lineWidth = 10;
  for (let i = -W; i < 2 * W; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + W, H); g.stroke();
    g.beginPath(); g.moveTo(i + W, 0); g.lineTo(i, H); g.stroke();
  }
  g.fillStyle = '#8d2f1f';
  g.fillRect(0, 0, 40, 40); // marks the top-left corner
  g.strokeStyle = '#3d2a18';
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);
  return { url: c.toDataURL('image/png'), aspect: W / H };
}

/** The sample (or odd) house with the exterior asked for in the hash. */
function houseFromHash(base: HouseSpec): HouseSpec {
  if (!params.has('ext') && !params.has('img') && !params.has('light') && !params.has('lightlevel') && !params.has('kinds')) return base;
  const design = params.has('ext') ? designOfStyle(params.get('ext') ?? undefined) : resolveExterior(base);
  if (params.has('img')) {
    const [zone, how] = (params.get('img') ?? '').split(',');
    const z = (['ground', 'upper', 'feature', 'parapet', 'band', 'plinth', 'boundary'] as ExteriorZone[]).find((k) => k === zone) ?? 'feature';
    design.images = { ...(design.images ?? {}), test: { name: 'Test picture', ...testPicture() } };
    design.zones[z] = { material: 'image', image: 'test', size: 1.2, fit: how === 'fit' ? 'fit' : 'tile' };
  }
  if (params.has('light')) design.lighting.color = `#${params.get('light')}`;
  if (params.has('lightlevel')) design.lighting.brightness = num('lightlevel', 1);
  if (params.has('kinds')) {
    const on = (params.get('kinds') ?? '').split(',');
    design.lighting.kinds = Object.fromEntries(on.filter(Boolean).map((k) => [k, true])) as Partial<Record<ExteriorLightKind, boolean>>;
  }
  return { ...base, exterior: { ...base.exterior, design } };
}

viewer.setHouse(houseFromHash(odd ? ODD_HOUSE : SAMPLE_HOUSE));
const t2 = performance.now();
viewer.setItems(items);
const t3 = performance.now();
const timings = { create: Math.round(t1 - t0), setHouse: Math.round(t2 - t1), setItems: Math.round(t3 - t2) };
console.info('[engine] startup ms', JSON.stringify(timings));

const parseSel = (v: string): Selection | null => {
  const [t, a, b] = v.split(':');
  switch (t) {
    case 'item': return { type: 'item', uid: a };
    case 'room': return { type: 'room', levelId: a, roomId: b };
    case 'wall': return { type: 'wall', levelId: a, wallId: b };
    case 'opening': return { type: 'opening', levelId: a, openingId: b };
    case 'stair': return { type: 'stair', levelId: a, stairId: b };
    case 'column': return { type: 'column', columnId: a };
    case 'beam': return { type: 'beam', beamId: a };
    default: return null;
  }
};

const mode = params.get('mode');
const unit = params.get('u') === 'ft' ? 0.3048 : 1;
if (params.has('cam')) {
  const c = (params.get('cam') ?? '').split(',').map(Number);
  if (c.length === 6 && c.every(Number.isFinite)) viewer.setCamera([c[0], c[1], c[2]], [c[3], c[4], c[5]]);
}
if (mode === 'top') viewer.setMode('top');
if (mode === 'walk') {
  const yaw = (num('yaw', 0) * Math.PI) / 180;
  if (params.has('x') && params.has('y')) viewer.enterWalk({ levelId: params.get('wl') ?? 'gf', x: num('x', 0) * unit, y: num('y', 0) * unit, yaw });
  else viewer.enterWalk();
  if (params.has('pitch')) setTimeout(() => viewer.setWalkLook(params.has('yaw') ? yaw : viewer.getWalkState().yaw, (num('pitch', 0) * Math.PI) / 180), 1000);
}
if (params.has('focus')) {
  const [l, r] = (params.get('focus') ?? '').split(':');
  viewer.focusRoom(l, r);
}
if (params.has('sel')) viewer.select(parseSel(params.get('sel') ?? ''));
if (flag('edit', false)) viewer.setEditing(true);
if (params.has('place')) {
  const c = catalogByKind(params.get('place') ?? '');
  if (c) viewer.beginPlace({ uid: `new-${Date.now()}`, kind: c.kind, levelId: 'gf', x: 0, y: 0, rot: 0, w: c.w, d: c.d, h: c.h, elevation: c.mount === 'wall' ? c.elevation : undefined, color: c.colors[0] });
}

Object.assign(window, { viewer, SAMPLE_HOUSE, SAMPLE_FURNISHING, ODD_HOUSE, ODD_ITEMS, __timings: timings });
