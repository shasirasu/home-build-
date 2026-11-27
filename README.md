# Home Build 3D

Give it a 2D house plan; get a 3D house you can walk through, furnish and cost. Like a factory line: the plan becomes
data (`HouseSpec`), and the 3D house is built from that data. A CAD PDF is read by the site itself, in the browser,
and never leaves the machine. Only a plan the site cannot read (a photo, a scan) is sent to Google Gemini, and only to
be understood: the house is always built by the site.

```sh
npm install
npm run dev        # http://127.0.0.1:5180
npm test           # the reader against two plans, a Gemini reading, the sample, the exterior design, quantities, units
npm run build      # static site in dist/ (+ api/understand.ts as a Vercel function for the Gemini fallback)
```

## Pages

| Route | What it is |
| --- | --- |
| `#/` | Intro: the perspective tunnel hero flying from the plan sheets into renders of the house |
| `#/new` | Upload a plan. A CAD-exported PDF is read on the spot and built with one click; a scan or photo is traced by hand |
| `#/studio` | 3D studio: orbit, walk (W A S D + mouse, up the stairs), plan view, storey cutaway, dollhouse, structure view, day / night, rooms, outside design, add furniture, items list, quantities |
| `#/plan` | 2D plan editor over the source drawing: read drawing, scale, walls, rooms, doors, windows, openings, stairs, floors |

## The plan reader (no AI)

A PDF exported from CAD is not a picture: it holds every line, filled shape, curve and text string with exact
coordinates. `src/lib/reader` works on those, the way a person reads a plan:

1. **Scale**: a dimension text (`22'`, `9000`) and the dimension line it sits on give drawing units per metre.
2. **Floors**: groups of linework separated on the sheet, named by their titles (`GROUND FLOOR PLAN`).
3. **Columns**: small filled squares.
4. **Stairs**: stacks of tread rectangles, put in walking order by the arrow drawn on them; the break symbol is split back into treads.
5. **Walls**: pairs of parallel face lines 3″–10″ apart become wall rectangles; corners and junctions are closed.
6. **Openings**: gaps between collinear wall pieces. A swing arc makes it a door and gives hinge and swing side; an outside gap is a door; a centre line across the wall is a window.
7. **Rooms**: each printed name and size, grown to the surrounding wall faces; a space with only a size and no wall to its neighbour joins that room.

`buildSpec.ts` then completes the house: finishes by room type, door types, stair risers, handrails, the stairwell and
its railing on the floor above, entry steps, columns and beams, and (only when the drawing shows no windows) standard
windows marked *assumed*. `src/lib/furnish.ts` furnishes every room by type, against real walls and clear of doorways.

What it needs: a vector PDF (not a scan), walls drawn as two parallel lines running along the sheet's axes, and room
names printed in the rooms. What it does not read: angled or curved walls, hatched or single-line walls, scans and
photos (those are traced by hand over the picture in the plan editor). It has been checked on two drawings: the sample
below and a generated metric plan (`tests/fixtures/metric-plan.pdf`). Always look at the plan before building.

## Gemini, for understanding only (optional)

When the site cannot read a file by itself (a photo, a scan, a PDF with no usable linework), the upload page sends a
picture of the sheet to Google Gemini and asks what is on it: floors, scale, walls, openings, rooms, stair runs.
`src/lib/reader/fromGemini.ts` squares that answer up (straight walls, lines put in line, corners joined, an open
portico left open) and hands it to the same `buildSpec.ts` + `furnish.ts` as any other reading. Gemini never builds
anything.

- Key: `GEMINI_API_KEY` in `.env.local` (git-ignored) for `npm run dev`, or in the host's environment. It is read only
  by `server/understand.ts` (Vite dev middleware / `api/understand.ts` on Vercel) and never reaches the browser.
  Without a key the fallback is off and pictures are traced by hand.
- Models: tried in order `gemini-pro-latest`, `gemini-3.8-flash`, `gemini-3-flash-preview` (set `GEMINI_MODEL` to pin
  one). A free-tier key has no Pro quota, so it lands on Flash.
- Accuracy: names, printed sizes and the scale come out well; wall and door positions from a picture are approximate.
  The upload page says so and opens the plan editor first, with the picture underneath, to correct the draft.
  `tests/gemini.test.ts` runs the adapter on a saved Gemini answer (no network needed).

## Designing the outside

A plan says nothing about how the outside is finished, so the house starts in a modern style and the Outside tab
lets the owner change all of it. `HouseSpec.exterior.design` holds the choices; `src/data/exterior.ts` is the
catalogue and `resolveExterior()` completes any design (missing, partial or odd) so the engine always has one.

- **Styles**: eight starting points (Modern contrast, Warm minimal, Concrete and timber, Stone and white, Brick and
  steel, Graphite, Tropical modern, Classic plaster — the original look).
- **Finishes** per surface: ground storey, upper storeys, a feature wall, parapet, floor bands, plinth, compound wall.
  Fifteen materials (paint, textured and grooved plaster, stacked stone, sandstone, slate, laterite, timber battens and
  boards, brick, board-marked and panel concrete, large tile, metal composite panel, standing-seam metal), each
  painted procedurally at true size; most take any colour.
- **Your own picture** ("mapping") on any surface: a JPG / PNG / WebP is scaled down on the device and saved inside
  the house, then repeated at a size you set or stretched once over each wall (a mural, a printed panel).
- **Details**: where the feature wall goes (entrance bay, whole front, one storey), box frames / hoods / a lintel band
  round the windows, a frame round the upper front, timber or metal fins, glass / rail / solid parapet at the front,
  roof overhang, canopy over the main door, terrace pergola, gate style, metalwork colour.
- **Lights**, seen with *Night* (top bar or the Outside tab): wall up-down lights, ground uplights, a ceiling strip and
  downlights in covered outdoor rooms, a roofline strip, driveway bollards, gate lamps and lit windows, in eight colours
  (2700 K to daylight, amber, blue, green, violet, or any colour) and a brightness. They are placed by rule from the
  house (doors, solid wall runs, the portico, the drive, the gate pillars), so they work for any plan.

*Lights off* (top bar, Outside tab, or **L**) switches every outdoor light off at night to see the house dark (furniture
lamps standing outdoors, like the portico ceiling light, go dark with them); each kind can also be switched off on its own. While walking, **F** hides the furniture and lets you walk through where
it stood (walls, railings, stairs and the gate still stop you).

The front of the house is the side the main door looks out of. In the modern styles the terrace is a light ceramic
tile (terracotta in Classic) and a portico's outside walls take the outside finish. The structure view is always
drawn in daylight. The engine side is in `src/three/build/facade.ts`,
`lights.ts` and `roof.ts`.

## The first sample

`House Plan-Model.pdf` (22' × 36', G+1) is in `public/plans/`. `src/data/sampleHouse.ts` was written by hand from the
PDF's vector geometry and checked room by room; it is the reference the reader is tested against
(`tests/reader.test.ts`: walls within 1.5%, every opening, every room, the 17 stair steps, the stairwell and its
railing, the 12 columns). What a 2D plan doesn't say (heights, windows, beams, footings, the site) is filled with
standard values and marked *assumed* in the app. See the House tab → *How it was built*.

## Structure

| Path | Role |
| --- | --- |
| `src/types/house.ts` | The data model: levels, walls, openings, rooms, stairs, structure, roof, site, placed items |
| `src/lib/reader/` | Plan reader: `extract.ts` (PDF → lines and text), `readPlan.ts` (→ walls, rooms, stairs…), `buildSpec.ts` (→ HouseSpec) |
| `src/lib/reader/fromGemini.ts`, `gemini.ts`, `server/understand.ts` | Gemini fallback for pictures: understanding only |
| `src/lib/furnish.ts` | Automatic furnishing by room type |
| `src/lib/derive.ts` | Completes a hand-traced plan: footprints, roof, stair holes, a generated RCC frame |
| `src/lib/quantities.ts` | Areas, concrete, steel, bricks, plaster, paint, tiles, door/window schedule, furniture totals |
| `src/data/` | Sample house + furnishing, furniture catalogue (sizes, prices), floor/wall finishes, exterior styles / materials / lights (`exterior.ts`) |
| `src/three/` | 3D engine (plain three.js): `HouseViewer` builds the house from the spec; `furniture/` has a procedural model per catalogue item |
| `src/three/api.ts` | Contract between the app and the engine |
| `src/features/studio` | The 3D studio UI (`panels/ExteriorPanel.tsx`: the Outside tab) |
| `src/features/plan` | Plan editor, upload flow, drawing underlay |
| `src/components/ui/perspective-tunnel-hero.tsx` | The intro hero component (framer-motion) |

Dev tools: `node scripts/shot.mjs <url> out.png [w] [h] [waitMs]` (headless Chrome with WebGL),
`node scripts/upload-flow.mjs <plan.pdf> <outDir>` (upload → read → build → screenshots, and lists any request that
leaves the machine: for a CAD PDF there are none), `node scripts/upload-image-flow.mjs <plan.png> <outDir>` (the Gemini path). `node scripts/eval.mjs <url> <expression>` reads state from a page (e.g. `viewer.view.lights.counts`). The engine has a harness at `/engine.html` (`#night=1&lights=0&ext=<style>&img=1` …), the furniture a gallery at
`/furniture.html`.

## Quantities

Estimates from the spec with common Indian site rules (M20 at 8 bags/m³, 500 bricks/m³ for 9″ walls, 1:6 mortar,
steel by element). Rates are editable in the Quantities tab. They are for planning and comparing, not a contractor's
bill of quantities.
