// House spec: the single data model every part of the app reads.
//
// 2D plan → HouseSpec (data) → 3D house. Like the factory line, the 3D is never hand-modelled per house:
// the engine builds it from this spec, so any plan that can be expressed here becomes a walkable 3D house.
//
// COORDINATES
//   Plan space is in METRES. Origin = back-left outer corner of the building footprint (top-left of the drawing).
//   +x = right on the drawing, +y = DOWN on the drawing (toward the front/entrance of the sample house).
//   3D space: X = plan x, Z = plan y, Y = up. So a camera looking straight down with "up" = -Z sees the drawing
//   exactly as printed. Elevations (Y) are absolute metres above finished ground level (ground = 0).

export type Vec2 = [number, number];
/** [x, y, h]: plan x, plan y, height in metres relative to the level's finished floor (FFL). */
export type Vec3 = [number, number, number];

export type WallKind = 'exterior' | 'interior' | 'partition';

export interface Wall {
  id: string;
  /** Centre-line endpoints. The wall is the rectangle a→b, `thickness` wide, centred on the line. */
  a: Vec2;
  b: Vec2;
  thickness: number;
  kind: WallKind;
  /** Height above the level FFL. Default: level.height - (slab of the level above, or roof slab). */
  height?: number;
}

export type OpeningKind = 'door' | 'window' | 'opening' | 'ventilator';
export type LeafType = 'none' | 'single' | 'double' | 'sliding';
export type OpeningStyle =
  | 'teak-panel' // main door: solid teak, raised panels, brass handle
  | 'flush' // painted flush door
  | 'pvc' // toilet door
  | 'steel' // back / service door
  | 'casement' // hinged glazed window, grille behind
  | 'sliding-alu' // aluminium sliding window
  | 'louvre' // toilet ventilator, glass louvres
  | 'arch'; // open archway, no leaf

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance along the wall from `a` to the CENTRE of the opening (metres). */
  at: number;
  width: number;
  /** Clear height of the opening (metres). */
  height: number;
  /** Bottom of the opening above the level FFL (0 for doors). */
  sill: number;
  leaf: LeafType;
  /** Single leaf: the jamb that carries the hinges, the one nearer wall.a ('a') or wall.b ('b'). */
  hinge?: 'a' | 'b';
  /** Side the leaf swings into. +1 = the left-hand normal of a→b, i.e. n = (-(b.y-a.y), b.x-a.x) normalised. */
  swing?: 1 | -1;
  style?: OpeningStyle;
  name?: string;
  /** True when the source drawing does not show it (e.g. windows): placed by the builder, editable. */
  assumed?: boolean;
}

export type RoomType =
  | 'bedroom'
  | 'kitchen'
  | 'hall'
  | 'living'
  | 'dining'
  | 'toilet'
  | 'pooja'
  | 'utility'
  | 'staircase'
  | 'lobby'
  | 'walkin'
  | 'portico'
  | 'balcony'
  | 'store'
  | 'study'
  | 'passage'
  | 'other';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  /** Clear (inside-face) polygon in plan metres. Rooms on one level never overlap. */
  polygon: Vec2[];
  /** Size as written on the plan, e.g. 11'9"x12'. */
  sizeLabel?: string;
  /** Floor finish id from FINISHES (src/data/finishes.ts). */
  floor: string;
  /** Wall paint colour (hex) for the inside faces of this room. */
  wallColor: string;
  /** Floor offset from the level FFL (e.g. -0.15 for a portico one step down). */
  floorOffset?: number;
  /** Rooms open to the sky or outside the envelope (portico) get no ceiling paint / skirting where there is no wall. */
  outdoor?: boolean;
  /** Toilets etc. get dado tiles up to this height (metres). */
  dado?: { finish: string; height: number };
}

/** One solid block of a stair: a tread or a landing. Its top is `top` metres above the level FFL. */
export interface StairStep {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  top: number;
  kind: 'tread' | 'landing';
}

export interface Stair {
  id: string;
  name: string;
  /** All treads and landings, in walking order from bottom to top. */
  steps: StairStep[];
  riser: number;
  /** Handrails with balusters. Points follow the walking surface; the rail sits `railHeight` above them. */
  rails: Vec3[][];
  railHeight: number;
  finish: string;
}

export interface Railing {
  id: string;
  /** Polyline at the level FFL (h is normally 0). */
  points: Vec3[];
  height: number;
  style: 'ss-glass' | 'ms-baluster' | 'wood';
}

export interface Level {
  id: string;
  name: string;
  /** Short tag, e.g. GF / FF. */
  short: string;
  /** Finished floor level, absolute metres. */
  elevation: number;
  /** Floor-to-floor height (metres). */
  height: number;
  /** Thickness of the RCC slab under this level's floor (0 for a ground floor on fill). */
  slab: number;
  /** Outer outline of this level's floor plate (slab edge), plan metres. */
  footprint: Vec2[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
  /** Holes cut through this level's floor slab (stairwells). */
  floorOpenings: Vec2[][];
  railings: Railing[];
}

export interface Column {
  id: string;
  /** Centre (plan metres). */
  x: number;
  y: number;
  w: number; // along x
  d: number; // along y
  /** Ids of the levels this column passes through (it runs from its footing to the roof slab of the top one). */
  levels: string[];
}

export interface Beam {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Absolute elevation of the beam TOP (it hangs below this). */
  top: number;
  width: number;
  depth: number;
  kind: 'plinth' | 'floor' | 'roof';
}

export interface Structure {
  columns: Column[];
  beams: Beam[];
  footing: { size: number; depth: number; thickness: number };
  plinthHeight: number;
  /** Columns were read from the drawing (not generated): keep them when the plan is rebuilt. */
  fromPlan?: boolean;
}

export interface Roof {
  kind: 'flat';
  /** Absolute elevation of the top of the roof slab (terrace floor). */
  elevation: number;
  slab: number;
  outline: Vec2[];
  parapet: { height: number; thickness: number };
}

export interface Site {
  /** Plot outline, plan metres (can extend to negative coordinates). */
  plot: Vec2[];
  compoundWall?: { height: number; thickness: number; gate: { a: Vec2; b: Vec2 } };
  /** Paved areas (paths, driveway). */
  paving: Vec2[][];
  assumed?: boolean;
}

export interface PlanUnderlay {
  /** URL of the source drawing (PDF or image). */
  url: string;
  kind: 'pdf' | 'image';
  page: number;
  /** Per level: where plan (0,0) sits on the drawing, in drawing units (PDF points / image px), and the scale. */
  frames: Record<string, { origin: Vec2; unitsPerMetre: number }>;
  /** PDF page rotation applied before reading frames (degrees). */
  rotation?: number;
}

// ---------------------------------------------------------------------------------------------
// Exterior design: what the outside is finished in, the modern details added to it, and its lights.
// The catalogue (materials, styles, light types) is in src/data/exterior.ts.

/** How one outside surface is finished. */
export interface Cladding {
  /** id of a facade material in CLADDINGS, or 'image' for the owner's own picture. */
  material: string;
  /** Paint colour / tint, for the materials that take one. */
  color?: string;
  /** material 'image': key of the picture in ExteriorDesign.images. */
  image?: string;
  /** material 'image': metres one copy of the picture covers across (its height follows the picture's shape). */
  size?: number;
  /** material 'image': 'tile' repeats the picture at `size`; 'fit' stretches one copy over each wall. */
  fit?: 'tile' | 'fit';
}

/** The surfaces of the outside that can each take their own finish. */
export type ExteriorZone = 'ground' | 'upper' | 'feature' | 'parapet' | 'band' | 'plinth' | 'boundary';

/** The kinds of outdoor light. Each is placed by rule from the house (see src/three/build/lights.ts). */
export type ExteriorLightKind = 'wall' | 'uplight' | 'soffit' | 'downlight' | 'roofline' | 'bollard' | 'gate' | 'windows';

export interface ExteriorLighting {
  /** Which kinds are installed. */
  kinds: Partial<Record<ExteriorLightKind, boolean>>;
  /** Colour of the light. */
  color: string;
  /** 0.3 (dim) … 1.6 (bright). */
  brightness: number;
}

export interface ExteriorImage {
  /** The picture itself, scaled down, as a data URL: it travels with the project. */
  url: string;
  name: string;
  /** width / height */
  aspect: number;
}

export interface ExteriorDesign {
  /** id of the style in EXTERIOR_STYLES this design started from. */
  style: string;
  zones: Record<ExteriorZone, Cladding>;
  /** Where the feature finish goes: nowhere, the whole front, one storey of the front, or a tall bay at the entrance. */
  feature: 'none' | 'front' | 'front-upper' | 'front-ground' | 'entrance';
  /** Around the windows: a continuous lintel band (traditional), a projecting box frame, a thin hood, or nothing. */
  windows: 'band' | 'box' | 'hood' | 'none';
  /** A deep frame projecting around the front of the upper storey. */
  frame: boolean;
  /** Vertical fins screening the entrance bay of the upper storey. */
  fins: 'none' | 'wood' | 'metal';
  /** The parapet on the front: solid wall, glass, or a steel rail. The other sides stay solid. */
  parapet: 'solid' | 'glass' | 'rail';
  /** Roof slab projecting past the walls, metres (0 = flush). */
  overhang: number;
  /** A thin canopy over the main door, where nothing covers it already. */
  canopy: boolean;
  /** A pergola on the terrace, over the front. */
  pergola: boolean;
  gate: 'bars' | 'slats' | 'sheet';
  /** Colour of the frame, window boxes, hoods, metal fins, canopy and gate. */
  accent: string;
  lighting: ExteriorLighting;
  /** The owner's own pictures used as finishes ("mapping"), by key. */
  images?: Record<string, ExteriorImage>;
}

export interface HouseSpec {
  id: string;
  name: string;
  description?: string;
  /** Unit the source drawing was dimensioned in; the UI shows lengths in it. Data is always metres. */
  displayUnit: 'ft' | 'm';
  /** Direction of true north in plan coordinates (unit vector). */
  north: Vec2;
  levels: Level[];
  structure: Structure;
  roof: Roof;
  /**
   * The outside of the house. `wall` / `band` / `plinth` are the plain colours of the first version; `design` is the
   * full exterior design (facade materials, details, lights). A house without one gets the default modern style.
   */
  exterior: { wall: string; band: string; plinth: string; design?: ExteriorDesign };
  site?: Site;
  underlay?: PlanUnderlay;
  notes?: string[];
}

// ---------------------------------------------------------------------------------------------
// Furniture / fixtures placed in the house (the "design" layer on top of the structure)

export interface PlacedItem {
  uid: string;
  /** Catalog id (src/data/catalog.ts). */
  kind: string;
  levelId: string;
  roomId?: string;
  /** Centre of the footprint, plan metres. */
  x: number;
  y: number;
  /** Rotation about the vertical axis, radians. 0 = the item's FRONT faces +y (plan down / toward the house front).
   *  In three.js: group.rotation.y = rot, and the item's local +Z is its front. */
  rot: number;
  w: number;
  d: number;
  h: number;
  /** Bottom of the item above the level FFL (wall-mounted / ceiling items). Default 0. */
  elevation?: number;
  color?: string;
  locked?: boolean;
}

export interface Finish {
  id: string;
  name: string;
  use: 'floor' | 'wall' | 'both';
  color: string;
  /** Second colour for grout / grain / veining. */
  accent: string;
  pattern: 'tile' | 'plank' | 'stone' | 'plain' | 'marble' | 'terrazzo';
  /** Tile or plank size in metres [along x, along y]. */
  size?: [number, number];
  roughness: number;
  /** Indicative price per square metre, INR (supply + lay). */
  pricePerSqm: [number, number];
}
