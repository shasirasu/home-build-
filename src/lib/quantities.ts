import type { HouseSpec, PlacedItem } from '@/types/house';
import { CATALOG, catalogByKind } from '@/data/catalog';
import { finishById } from '@/data/finishes';
import { polygonArea, polygonPerimeter, wallHeight, wallLength, dist } from './geom';

// Quantities and indicative costs from the house spec: what it takes to build the shell, finish it and furnish it.
// Rules of thumb are the usual Indian site figures (stated beside each one). They are estimates for planning,
// not a contractor's bill of quantities. Rates are editable in the app.

export interface Rates {
  cementBag: number; // ₹ per 50 kg bag
  steelKg: number; // ₹ per kg TMT
  brick: number; // ₹ per brick
  sandM3: number; // ₹ per m³
  aggregateM3: number; // ₹ per m³
  paintSqm: number; // ₹ per m² (putty + primer + 2 coats, labour incl.)
}

export const DEFAULT_RATES: Rates = { cementBag: 420, steelKg: 68, brick: 9, sandM3: 2200, aggregateM3: 1900, paintSqm: 160 };

export const RATE_LABELS: Record<keyof Rates, { label: string; unit: string }> = {
  cementBag: { label: 'Cement', unit: 'per bag' },
  steelKg: { label: 'TMT steel', unit: 'per kg' },
  brick: { label: 'Bricks', unit: 'each' },
  sandM3: { label: 'Sand', unit: 'per m³' },
  aggregateM3: { label: 'Aggregate 20 mm', unit: 'per m³' },
  paintSqm: { label: 'Painting', unit: 'per m²' },
};

// Mix and consumption constants
const M20 = { cement: 8.06, sand: 0.42, agg: 0.84 }; // per m³ of M20 (1:1.5:3) concrete
const STEEL_KG_PER_M3 = { slab: 85, beam: 160, column: 190, footing: 70, stair: 95 };
const BRICKS_PER_M3 = 500; // 230 mm walls, 230×110×75 bricks with mortar
const BRICKS_PER_SQM_HALF = 55; // 115 mm partitions
const MORTAR_PER_M3_BRICK = { cement: 1.6, sand: 0.33 }; // 1:6 mortar per m³ brickwork
const PLASTER_CEMENT_PER_SQM = { internal: 0.065, external: 0.12 }; // bags per m² (12 mm 1:6 / 20 mm 1:4)
const PLASTER_SAND_PER_SQM = { internal: 0.014, external: 0.024 };
const TILE_WASTE = 1.07;

export interface RoomRow {
  levelId: string;
  level: string;
  id: string;
  name: string;
  type: string;
  sizeLabel?: string;
  area: number;
  perimeter: number;
  floor: string;
}

export interface ScheduleRow {
  key: string;
  kind: string;
  style: string;
  width: number;
  height: number;
  count: number;
  where: string[];
  assumed: boolean;
}

export interface FinishRow {
  finishId: string;
  name: string;
  area: number;
  units: number; // tiles / planks
  unitLabel: string;
  cost: [number, number];
}

export interface FurnitureRow {
  kind: string;
  name: string;
  category: string;
  count: number;
  unit: [number, number];
  total: [number, number];
}

export interface MaterialRow {
  key: keyof Rates;
  item: string;
  qty: number;
  unit: string;
  amount: number;
  basis: string;
}

export interface Quantities {
  levels: { id: string; name: string; short: string; builtUp: number; carpet: number }[];
  outdoorArea: number;
  rooms: RoomRow[];
  concrete: { slabs: number; beams: number; columns: number; footings: number; stairs: number; total: number; steelKg: number };
  masonry: { fullVolume: number; halfArea: number; bricks: number; wallLength: number };
  plaster: { internal: number; external: number };
  paint: { walls: number; ceilings: number };
  flooring: FinishRow[];
  dado: FinishRow[];
  schedule: ScheduleRow[];
  furniture: FurnitureRow[];
  materials: MaterialRow[];
  totals: { materials: number; finishes: [number, number]; furniture: [number, number]; paint: number };
  counts: { walls: number; doors: number; windows: number; columns: number; beams: number; risers: number; items: number };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function computeQuantities(spec: HouseSpec, items: PlacedItem[], rates: Rates = DEFAULT_RATES): Quantities {
  const levels = spec.levels;
  const rooms: RoomRow[] = [];
  let outdoorArea = 0;

  const levelRows = levels.map((lv) => {
    let carpet = 0;
    for (const r of lv.rooms) {
      const area = polygonArea(r.polygon);
      rooms.push({ levelId: lv.id, level: lv.short, id: r.id, name: r.name, type: r.type, sizeLabel: r.sizeLabel, area, perimeter: polygonPerimeter(r.polygon), floor: r.floor });
      if (r.outdoor) outdoorArea += area;
      else carpet += area;
    }
    return { id: lv.id, name: lv.name, short: lv.short, builtUp: polygonArea(lv.footprint), carpet };
  });

  // Masonry, plaster, openings
  let fullVolume = 0, halfArea = 0, wallLen = 0, internal = 0, external = 0;
  const sched = new Map<string, ScheduleRow>();
  let doors = 0, windows = 0;
  levels.forEach((lv, li) => {
    for (const w of lv.walls) {
      const L = wallLength(w);
      if (L < 0.01) continue;
      const H = wallHeight(levels, li, spec.roof.slab, w);
      const ops = lv.openings.filter((o) => o.wallId === w.id);
      const holes = ops.reduce((s, o) => s + Math.min(o.width, L) * o.height, 0);
      const face = Math.max(0, L * H - holes);
      wallLen += L;
      if (w.thickness >= 0.18) fullVolume += face * w.thickness;
      else halfArea += face;
      if (w.kind === 'exterior') { external += face; internal += face; }
      else internal += face * 2;
    }
    for (const o of lv.openings) {
      if (o.kind === 'door') doors++;
      if (o.kind === 'window' || o.kind === 'ventilator') windows++;
      const style = o.style ?? (o.kind === 'opening' ? 'open' : o.kind);
      const key = `${o.kind}|${style}|${o.width.toFixed(2)}|${o.height.toFixed(2)}`;
      const row = sched.get(key) ?? { key, kind: o.kind, style, width: o.width, height: o.height, count: 0, where: [], assumed: false };
      row.count++;
      row.where.push(`${lv.short} · ${o.name ?? o.kind}`);
      row.assumed = row.assumed || !!o.assumed;
      sched.set(key, row);
    }
  });
  // Parapet masonry
  const roofPerim = polygonPerimeter(spec.roof.outline);
  const parapetArea = roofPerim * spec.roof.parapet.height;
  if (spec.roof.parapet.thickness >= 0.18) fullVolume += parapetArea * spec.roof.parapet.thickness;
  else halfArea += parapetArea;
  external += parapetArea * 2;

  const bricks = Math.ceil(fullVolume * BRICKS_PER_M3 + halfArea * BRICKS_PER_SQM_HALF);
  const brickVolEq = fullVolume + halfArea * 0.115;

  // Concrete
  let slabs = 0;
  for (const lv of levels) {
    if (lv.slab > 0) slabs += Math.max(0, polygonArea(lv.footprint) - lv.floorOpenings.reduce((s, p) => s + polygonArea(p), 0)) * lv.slab;
  }
  slabs += polygonArea(spec.roof.outline) * spec.roof.slab;
  const st = spec.structure;
  let beams = 0;
  for (const b of st.beams) {
    const slabAt = b.kind === 'plinth' ? 0 : b.kind === 'roof' ? spec.roof.slab : (levels.find((l) => Math.abs(l.elevation - b.top) < 0.05)?.slab ?? 0.125);
    beams += dist(b.a, b.b) * b.width * Math.max(0, b.depth - slabAt);
  }
  const colHeight = spec.roof.elevation + st.footing.depth - st.footing.thickness;
  const columns = st.columns.reduce((s, c) => s + c.w * c.d * colHeight, 0);
  const footings = st.columns.length * st.footing.size * st.footing.size * st.footing.thickness;
  let stairs = 0, risers = 0;
  for (const lv of levels)
    for (const s of lv.stairs) {
      for (const p of s.steps) stairs += Math.abs((p.x1 - p.x0) * (p.y1 - p.y0)) * (0.15 + s.riser / 2);
      risers += s.steps.length;
    }
  const concrete = slabs + beams + columns + footings + stairs;
  const steelKg = slabs * STEEL_KG_PER_M3.slab + beams * STEEL_KG_PER_M3.beam + columns * STEEL_KG_PER_M3.column + footings * STEEL_KG_PER_M3.footing + stairs * STEEL_KG_PER_M3.stair;

  // Finishes
  const floorMap = new Map<string, number>();
  const dadoMap = new Map<string, number>();
  let ceilings = 0;
  for (const lv of levels)
    for (const r of lv.rooms) {
      const a = polygonArea(r.polygon);
      floorMap.set(r.floor, (floorMap.get(r.floor) ?? 0) + a);
      if (!r.outdoor) ceilings += a;
      if (r.dado) dadoMap.set(r.dado.finish, (dadoMap.get(r.dado.finish) ?? 0) + polygonPerimeter(r.polygon) * r.dado.height * 0.85);
    }
  const finishRows = (m: Map<string, number>): FinishRow[] =>
    [...m.entries()].map(([id, area]) => {
      const f = finishById(id);
      const unitArea = f.size ? f.size[0] * f.size[1] : 1;
      return {
        finishId: id, name: f.name, area,
        units: Math.ceil((area * TILE_WASTE) / unitArea),
        unitLabel: f.pattern === 'plank' ? 'planks' : f.pattern === 'plain' ? 'm²' : 'tiles',
        cost: [Math.round(area * f.pricePerSqm[0]), Math.round(area * f.pricePerSqm[1])] as [number, number],
      };
    }).sort((a, b) => b.area - a.area);
  const flooring = finishRows(floorMap);
  const dado = finishRows(dadoMap);
  const dadoArea = dado.reduce((s, d) => s + d.area, 0);
  const paintWalls = Math.max(0, internal - dadoArea) + external;

  // Furniture
  const fMap = new Map<string, number>();
  for (const it of items) fMap.set(it.kind, (fMap.get(it.kind) ?? 0) + 1);
  const furniture: FurnitureRow[] = [...fMap.entries()]
    .map(([kind, count]) => {
      const c = catalogByKind(kind);
      const unit: [number, number] = c?.price ?? [0, 0];
      return { kind, name: c?.name ?? kind, category: c?.category ?? 'Other', count, unit, total: [unit[0] * count, unit[1] * count] as [number, number] };
    })
    .sort((a, b) => CATALOG.findIndex((c) => c.kind === a.kind) - CATALOG.findIndex((c) => c.kind === b.kind));

  // Materials bill
  const cementBags = concrete * M20.cement + brickVolEq * MORTAR_PER_M3_BRICK.cement + internal * PLASTER_CEMENT_PER_SQM.internal + external * PLASTER_CEMENT_PER_SQM.external;
  const sand = concrete * M20.sand + brickVolEq * MORTAR_PER_M3_BRICK.sand + internal * PLASTER_SAND_PER_SQM.internal + external * PLASTER_SAND_PER_SQM.external;
  const agg = concrete * M20.agg;
  const paintArea = paintWalls + ceilings;
  const materials: MaterialRow[] = [
    { key: 'cementBag', item: 'Cement (OPC 53)', qty: Math.ceil(cementBags), unit: 'bags', amount: Math.ceil(cementBags) * rates.cementBag, basis: 'M20 concrete 8 bags/m³, 1:6 mortar, plaster' },
    { key: 'steelKg', item: 'TMT steel Fe500', qty: Math.ceil(steelKg / 10) * 10, unit: 'kg', amount: Math.ceil(steelKg / 10) * 10 * rates.steelKg, basis: 'slabs 85, beams 160, columns 190, footings 70 kg/m³' },
    { key: 'brick', item: 'Bricks', qty: Math.ceil(bricks / 100) * 100, unit: 'nos', amount: Math.ceil(bricks / 100) * 100 * rates.brick, basis: '500/m³ for 9" walls, 55/m² for 4½" walls' },
    { key: 'sandM3', item: 'Sand', qty: r2(sand), unit: 'm³', amount: sand * rates.sandM3, basis: 'concrete, mortar and plaster' },
    { key: 'aggregateM3', item: 'Aggregate 20 mm', qty: r2(agg), unit: 'm³', amount: agg * rates.aggregateM3, basis: '0.84 m³ per m³ of M20' },
    { key: 'paintSqm', item: 'Painting (walls + ceilings)', qty: Math.round(paintArea), unit: 'm²', amount: paintArea * rates.paintSqm, basis: 'putty, primer, 2 coats' },
  ];

  const sumRange = (rows: { cost?: [number, number]; total?: [number, number] }[]): [number, number] =>
    rows.reduce<[number, number]>((s, r) => { const c = r.cost ?? r.total ?? [0, 0]; return [s[0] + c[0], s[1] + c[1]]; }, [0, 0]);

  return {
    levels: levelRows,
    outdoorArea,
    rooms,
    concrete: { slabs: r2(slabs), beams: r2(beams), columns: r2(columns), footings: r2(footings), stairs: r2(stairs), total: r2(concrete), steelKg: Math.round(steelKg) },
    masonry: { fullVolume: r2(fullVolume), halfArea: r2(halfArea), bricks, wallLength: r2(wallLen) },
    plaster: { internal: Math.round(internal), external: Math.round(external) },
    paint: { walls: Math.round(paintWalls), ceilings: Math.round(ceilings) },
    flooring,
    dado,
    schedule: [...sched.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.width - a.width),
    furniture,
    materials,
    totals: {
      materials: materials.filter((m) => m.key !== 'paintSqm').reduce((s, m) => s + m.amount, 0),
      paint: paintArea * rates.paintSqm,
      finishes: sumRange([...flooring, ...dado]),
      furniture: sumRange(furniture),
    },
    counts: {
      walls: levels.reduce((s, l) => s + l.walls.length, 0),
      doors, windows,
      columns: st.columns.length, beams: st.beams.length, risers, items: items.length,
    },
  };
}
