// Contract between the React app (base) and the 3D engine. The engine lives in src/three/ and is plain three.js
// (no react-three-fiber). React owns all state; the engine renders it and reports user interaction back.
//
// Implementation: src/three/HouseViewer.ts → `export class HouseViewer implements HouseViewerAPI`.
// Furniture models: src/three/furniture/index.ts → `buildItem()` (see FurnitureBuilder below).

import type * as THREE from 'three';
import type { HouseSpec, PlacedItem } from '@/types/house';

export type ViewMode = 'orbit' | 'walk' | 'top';

export type Selection =
  | { type: 'item'; uid: string }
  | { type: 'room'; levelId: string; roomId: string }
  | { type: 'opening'; levelId: string; openingId: string }
  | { type: 'wall'; levelId: string; wallId: string }
  | { type: 'stair'; levelId: string; stairId: string }
  | { type: 'column'; columnId: string }
  | { type: 'beam'; beamId: string };

export interface DisplayOptions {
  /**
   * Which storeys to draw. 'all' = whole house with roof. A level id = that level and every level below it, with
   * everything above hidden (cutaway: the roof / upper slab is removed so you look into the chosen level).
   */
  level: 'all' | string;
  /** Walls cut down to `cutHeight` metres above their level's FFL so you can see into rooms (dollhouse view). */
  cutWalls: boolean;
  cutHeight: number;
  /** Structure view: walls, finishes and furniture turn to faint ghosts; RCC frame (footings, columns, beams,
   *  slabs, stair waist) and brick walls render as an engineering model, colour-coded. */
  structure: boolean;
  showRoof: boolean;
  showFurniture: boolean;
  showLabels: boolean; // room name + size labels floating in each room (sprites), hidden in walk mode
  showSite: boolean; // plot, lawn, compound wall, gate, paving
  /** Hour of day 6..19 for the sun position (shadows); north from spec.north. */
  sunHour: number;
  /**
   * Night: dark sky, moonlight, and the outdoor lights of spec.exterior.design.lighting switched on (with their
   * colour and brightness). `sunHour` is ignored while it is true.
   */
  night: boolean;
  /**
   * Main switch of the outdoor lights (default true). Off: every light of the design is off at night (no glow, no
   * lamps, windows dark too); the fittings themselves stay. Has no effect by day.
   */
  lightsOn: boolean;
  theme: 'light' | 'dark';
}

export interface ViewerEvents {
  onSelect?: (sel: Selection | null) => void;
  onHover?: (sel: Selection | null) => void;
  /** Walk mode: the room the walker is standing in changed. */
  onRoomChange?: (levelId: string | null, roomId: string | null) => void;
  onModeChange?: (mode: ViewMode) => void;
  /** An item was moved / rotated by dragging in the 3D view (only when editing is enabled). */
  onItemChange?: (item: PlacedItem) => void;
  /** A placement started with beginPlace() was dropped (item has final x/y/rot/levelId/roomId) or cancelled (null). */
  onPlaceEnd?: (item: PlacedItem | null) => void;
  /** Frames per second, about once a second (for a small HUD). */
  onStats?: (s: { fps: number; triangles: number; drawCalls: number }) => void;
}

export interface HouseViewerAPI {
  /** Full rebuild of the structure (walls, floors, stairs, roof, site). Keeps the camera where it is. */
  setHouse(spec: HouseSpec): void;
  /** Replace the furniture layer (diffs by uid; rebuild only items whose props changed). */
  setItems(items: PlacedItem[]): void;
  setDisplay(opts: Partial<DisplayOptions>): void;
  getDisplay(): DisplayOptions;

  setMode(mode: ViewMode): void;
  getMode(): ViewMode;
  /** Walk mode starting point (defaults: just inside the main entrance, facing in). */
  enterWalk(start?: { levelId: string; x: number; y: number; yaw?: number }): void;
  exitWalk(): void;

  /** Fly the orbit camera to frame a room / item / whole house (smooth, ~0.8 s). */
  focusRoom(levelId: string, roomId: string): void;
  focusItem(uid: string): void;
  /**
   * Fly the orbit camera to the look-in pose for a storey: raised three-quarter view (~57° above horizontal) framing
   * that level's plate so you look down into its rooms. 'all' = the default exterior pose. setDisplay() does this by
   * itself when `level` / `cutWalls` change; call it to re-frame without changing the display. No-op while walking.
   */
  focusLevel?(levelId: string | 'all'): void;
  resetView(): void;

  select(sel: Selection | null): void;
  /** Allow click-drag of furniture on the floor, R / Shift+R to rotate the selected item 90° / 15°. */
  setEditing(enabled: boolean): void;
  /** Ghost of `item` follows the pointer on the floor of the visible top level; click drops it, R rotates, Esc cancels. */
  beginPlace(item: PlacedItem): void;
  cancelPlace(): void;

  /** PNG data URL of the current frame. */
  screenshot(): string;
  resize(): void;
  dispose(): void;
}

export interface HouseViewerOptions extends ViewerEvents {
  container: HTMLElement;
  display?: Partial<DisplayOptions>;
}

/**
 * Furniture builder (src/three/furniture/index.ts).
 *
 * buildItem returns a THREE.Group for one catalog kind:
 *   - local origin = centre of the footprint at the item's BOTTOM (y = 0),
 *   - local +Z = the item's front, local X = width, local Y = up,
 *   - fits the box [-w/2, w/2] × [0, h] × [-d/2, d/2]  (w, d, h from the PlacedItem, so it scales with edits),
 *   - wall items: the back face sits at z = -d/2 (flush with the wall),
 *   - ceiling items: the top (mount) is at y = h; the engine places the bottom at ceiling - h.
 * `color` is the main body / fabric colour; other materials (metal, glass, wood accents) are the builder's choice.
 * Meshes cast and receive shadows. Share geometries / materials through the cache in the builder.
 */
export type FurnitureBuilder = (spec: { kind: string; w: number; d: number; h: number; color?: string }) => THREE.Group;
