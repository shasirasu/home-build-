// The site's own plan reader: a vector PDF in, a furnished house out. No AI, no server: everything runs in the
// browser on the drawing's own lines and text.
//
//   extract.ts    PDF page  → lines, shapes, curves, text (pdf.js operator list)
//   readPlan.ts   those     → scale, floors, walls, openings, rooms, stairs, columns
//   buildSpec.ts  that      → a complete HouseSpec (finishes, door types, stair heights, railings, windows, frame)
//   ../furnish.ts HouseSpec → furniture for every room

import type { HouseSpec, PlacedItem } from '@/types/house';
import { withPdfPage } from '../pdf';
import { autoFurnish } from '../furnish';
import { deriveSpec } from '../derive';
import { extractPrims } from './extract';
import { readPlan, type ReadResult } from './readPlan';
import { specFromPlan, type PlanSource } from './buildSpec';

export type { ReadResult } from './readPlan';

/** Read one page of a PDF plan. `result.ok` is false (with a reason) for scans, photos and sheets with no plan. */
export async function readPdfPlan(src: string | ArrayBuffer, page: number): Promise<ReadResult> {
  try {
    return await withPdfPage(src, page, async (p, ops) => readPlan(await extractPrims(p as never, ops as never)));
  } catch (e) {
    return { ok: false, reason: `This PDF could not be read (${e instanceof Error ? e.message : 'unknown error'}).`, unitsPerMetre: 0, imperial: true, scaleSource: 'dimension', floors: [], north: null, notes: [] };
  }
}

/** A reading → the house and its furniture. */
export function houseFromReading(result: ReadResult, name: string, source: PlanSource): { spec: HouseSpec; items: PlacedItem[] } {
  let spec = specFromPlan(result, name, source);
  // no columns on the drawing: generate a frame (columns at wall ends, beams along the 9" walls)
  if (!spec.structure.fromPlan) spec = deriveSpec(spec);
  return { spec, items: autoFurnish(spec) };
}

/** One line per floor, for showing the user what was read. */
export function describeReading(r: ReadResult): { title: string; detail: string }[] {
  return r.floors.map((f) => {
    const doors = f.openings.filter((o) => o.kind === 'door').length, gaps = f.openings.filter((o) => o.kind === 'opening').length;
    const steps = f.stairs.filter((s) => !s.well).reduce((n, s) => n + s.steps.length, 0);
    const parts = [`${f.walls.length} walls`, `${doors} doors`, ...(gaps ? [`${gaps} open doorways`] : []), `${f.rooms.filter((x) => x.labelled).length} rooms`, ...(steps ? [`stair of ${steps} steps`] : []), ...(f.columns.length ? [`${f.columns.length} columns`] : [])];
    return { title: f.title, detail: parts.join(' · ') };
  });
}
