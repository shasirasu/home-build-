// HouseViewer: the 3D engine behind the app. Plain three.js; React owns the state and calls this API.
//
//   new HouseViewer({ container, display, onSelect, … })
//     .setHouse(spec)   → builds walls / openings / floors / stairs / roof / structure / site from the spec
//     .setItems(items)  → furniture layer, diffed by uid
//     .setDisplay(...)  → level cutaway, dollhouse cut, structure view, labels, site, sun, theme
//     .setMode('orbit' | 'top' | 'walk'), enterWalk(), focusRoom(), select(), setEditing(), beginPlace() …
//
// Rendering is on demand: a frame is drawn only when something changed, the controls moved or the walker moved.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { HouseSpec, PlacedItem } from '@/types/house';
import type { DisplayOptions, HouseViewerAPI, HouseViewerOptions, Selection, ViewMode, ViewerEvents } from './api';
import { buildHouse, disposeHouse, doorObstacles, type HouseView, type LevelView } from './build/house';
import { hasFloorAt, roomAt, type LevelModel, type RoomModel } from './build/model';
import { solveDoorAngles } from './build/openings';
import { buildCutCaps } from './build/walls';
import { disposeGeometries } from './core/batch';
import { clamp, easeInOut, finite, orectLocal, pointInPoly, type ORect } from './core/geo';
import { EYE, WalkControls, WalkWorld } from './controls/walk';
import { ItemLayer, bakeItem, buildRaw, itemBottom, mountOf, type ItemEntry } from './items';
import { disposeLabel, disposeLabelTextures, makeLabel } from './labels';
import { MaterialLib } from './materials';
import { Highlight, Picker, collectTargets, sameSelection } from './picking';
import { gradientTexture, radialAlphaTexture } from './textures';

const DEFAULT_DISPLAY: DisplayOptions = {
  level: 'all', cutWalls: false, cutHeight: 1.2, structure: false, showRoof: true, showFurniture: true, showLabels: false, showSite: true, sunHour: 15, theme: 'light',
};

const THEME = {
  light: { top: '#f8f6f1', bottom: '#ece7dd', ground: '#e3ded3', accent: '#c8301f' },
  dark: { top: '#1a1a19', bottom: '#111110', ground: '#262624', accent: '#ef4f3b' },
} as const;

export type RenderQuality = 'auto' | 'high' | 'low';

/** True when WebGL is running on a software rasteriser (headless Chrome / SwiftShader, llvmpipe, no GPU). */
function softwareGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

const FOV_ORBIT = 34;
const FOV_WALK = 72;
const FLY_MS = 800;
const OUTLINE_LAYER = 5;

interface Fly {
  t0: number;
  dur: number;
  p0: THREE.Vector3; p1: THREE.Vector3;
  q0: THREE.Quaternion; q1: THREE.Quaternion;
  f0: number; f1: number;
  /** orbit target at the end (orbit flights look at an interpolated target instead of slerping) */
  t0v?: THREE.Vector3; t1v?: THREE.Vector3;
  done?: () => void;
}

interface DragState {
  entry: ItemEntry;
  item: PlacedItem;
  planeY: number;
  offX: number; offY: number;
  startedInside: boolean;
  moved: boolean;
}

interface PlaceState {
  item: PlacedItem;
  ghost: THREE.Group;
  mats: THREE.Material[];
  owned: THREE.BufferGeometry[];
  valid: boolean;
}

export class HouseViewer implements HouseViewerAPI {
  /**
   * Render quality for viewers created after this is set. 'auto' = full quality on a GPU, a lighter pipeline (no
   * MSAA, smaller environment and shadow maps, pixel ratio 1) on software WebGL so headless screenshots and
   * GPU-less machines stay responsive. Set to 'high' / 'low' to force either.
   */
  static quality: RenderQuality = 'auto';
  /** True when this viewer runs the lighter pipeline. */
  readonly lite: boolean;
  private container: HTMLElement;
  private events: ViewerEvents;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private topCam: THREE.OrthographicCamera;
  private activeCam: THREE.Camera;
  private orbit: OrbitControls;
  private topCtl: OrbitControls;
  private walk: WalkControls;
  private mats = new MaterialLib();
  private view: HouseView | null = null;
  private world: WalkWorld | null = null;
  private items = new ItemLayer();
  private display: DisplayOptions;
  private mode: ViewMode = 'orbit';
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ground: THREE.Mesh;
  private groundMat: THREE.MeshBasicMaterial;
  private shadowMat!: THREE.ShadowMaterial;
  private shadowCatcher!: THREE.Mesh;
  private envTex: THREE.Texture | null = null;
  private bgTex: THREE.Texture | null = null;
  private alphaTex: THREE.Texture;
  private picker = new Picker();
  private selHighlight: Highlight;
  private hoverHighlight: Highlight;
  private selection: Selection | null = null;
  private hover: Selection | null = null;
  private editing = false;
  private drag: DragState | null = null;
  private place: PlaceState | null = null;
  private fly: Fly | null = null;
  private raf = 0;
  private needsRender = true;
  private shadowsDirty = true;
  private last = 0;
  private frames = 0;
  private statsAt = 0;
  private disposed = false;
  private pointer = new THREE.Vector2(2, 2);
  private pointerInside = false;
  private hoverDirty = false;
  private down: { x: number; y: number; t: number; button: number } | null = null;
  private savedOrbit: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private walkRoom: string | null = null;
  private walkLevel: string | null = null;
  private exposure = 1;
  private resizeObs: ResizeObserver | null = null;
  private firstHouse = true;
  private maskMat: THREE.MeshBasicMaterial;
  private outlineMat: THREE.MeshBasicMaterial;
  private cutKey = '';
  private labelTheme = '';
  private size = new THREE.Vector2(1, 1);

  constructor(opts: HouseViewerOptions) {
    this.container = opts.container;
    this.events = opts;
    this.display = { ...DEFAULT_DISPLAY, ...(opts.display ?? {}) };

    const lite = (this.lite = HouseViewer.quality === 'low' || (HouseViewer.quality === 'auto' && softwareGL()));
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: false, stencil: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(this.pixelRatio());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = true;
    // built-in materials only: skip the synchronous link-status check so first use of a program does not stall
    renderer.debug.checkShaderErrors = false;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.outline = 'none';
    renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(renderer.domElement);
    this.mats.anisotropy = lite ? 2 : Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // ---- cameras
    this.camera = new THREE.PerspectiveCamera(FOV_ORBIT, 1, 0.1, 600);
    this.camera.position.set(14, 10, 18);
    this.topCam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.topCam.up.set(0, 0, -1);
    this.topCam.position.set(0, 100, 0);
    this.topCam.lookAt(0, 0, 0);
    this.activeCam = this.camera;

    // ---- lights + environment
    this.hemi = new THREE.HemisphereLight('#ffffff', '#c9c2b4', 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.028;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun, this.sun.target);
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      // a small cube is plenty for soft reflections; the lite pipeline uses an even smaller one
      this.envTex = pmrem.fromScene(room, 0.04, 0.1, 100, { size: lite ? 64 : 128 }).texture;
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.5;
      room.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
      pmrem.dispose();
    } catch (e) {
      console.warn('[HouseViewer] environment map unavailable', e);
    }

    // ---- ground: an unlit tint that fades into the background, plus a shadow catcher (no horizon line)
    this.alphaTex = radialAlphaTexture();
    this.groundMat = new THREE.MeshBasicMaterial({ color: THEME.light.ground, transparent: true, alphaMap: this.alphaTex, toneMapped: false });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1, 72), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.006;
    this.ground.renderOrder = -10;
    this.ground.userData.ground = true;
    this.scene.add(this.ground);
    this.shadowMat = new THREE.ShadowMaterial({ color: '#2a2622', opacity: 0.26, depthWrite: false });
    this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.y = -0.003;
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = -9;
    this.shadowCatcher.userData.noPick = true;
    this.scene.add(this.shadowCatcher);

    this.scene.add(this.items.group);
    this.selHighlight = new Highlight(THEME.light.accent, 0.2, 0.95);
    this.hoverHighlight = new Highlight(THEME.light.accent, 0.1, 0.5);
    this.scene.add(this.selHighlight.group, this.hoverHighlight.group);
    this.maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp, side: THREE.DoubleSide });
    this.outlineMat = new THREE.MeshBasicMaterial({ color: THEME.light.accent, depthWrite: false, depthTest: false, toneMapped: false, stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, side: THREE.DoubleSide });

    // ---- input (registered before the controls so an item drag can claim the gesture first)
    const el = renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('dblclick', this.onDblClick);
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);

    this.orbit = new OrbitControls(this.camera, el);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.09;
    this.orbit.screenSpacePanning = true;
    this.orbit.zoomToCursor = true;
    this.orbit.rotateSpeed = 0.7;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.035;
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 120;
    this.orbit.addEventListener('change', this.onControlsChange);
    this.orbit.addEventListener('start', () => { this.autoPosed = false; });

    this.topCtl = new OrbitControls(this.topCam, el);
    this.topCtl.enableRotate = false;
    this.topCtl.enableDamping = true;
    this.topCtl.dampingFactor = 0.12;
    this.topCtl.screenSpacePanning = true;
    this.topCtl.zoomToCursor = true;
    this.topCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.topCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.topCtl.minZoom = 0.3;
    this.topCtl.maxZoom = 14;
    this.topCtl.enabled = false;
    this.topCtl.addEventListener('change', this.onControlsChange);

    this.walk = new WalkControls(this.camera, el);

    this.applyTheme();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(this.container);
    }
    this.last = performance.now();
    this.statsAt = this.last;
    this.raf = requestAnimationFrame(this.tick);
  }

  // =================================================================================================== API

  setHouse(spec: HouseSpec): void {
    if (this.disposed) return;
    let next: HouseView | null = null;
    try {
      next = buildHouse(spec, this.mats);
    } catch (e) {
      console.warn('[HouseViewer] could not build the house', e);
    }
    if (this.view) { this.clearLabels(this.view); disposeHouse(this.view); }
    this.view = next;
    this.cutKey = '';
    this.labelTheme = '';
    if (!next) { this.world = null; this.walk.world = null; this.invalidate(true); return; }
    this.scene.add(next.root);
    this.world = new WalkWorld(next);
    this.walk.world = this.world;
    this.items.setModel(next.model);
    this.world.setItems(this.items.entries.values());
    this.solveDoors(true);

    // scene scale: ground disc, controls limits, shadow frustum
    const m = next.model;
    const R = Math.max(8, m.radius);
    const sb = m.siteBox;
    const siteR = Math.hypot(sb.x1 - sb.x0, sb.y1 - sb.y0) / 2;
    this.ground.scale.setScalar(Math.max(60, siteR * 3.2));
    this.ground.position.set(m.centre[0], -0.006, m.centre[1]);
    this.shadowCatcher.scale.setScalar(Math.max(80, siteR * 4));
    this.shadowCatcher.position.set(m.centre[0], -0.003, m.centre[1]);
    this.orbit.maxDistance = R * 7 + 20;
    this.orbit.minDistance = 1.2;

    this.applyDisplay();
    if (this.firstHouse) {
      this.firstHouse = false;
      // exterior pose first (it also fixes the compass direction the look-in pose keeps)
      this.flyAuto(this.defaultPose(), true);
      if (!(this.display.level === 'all' && !this.display.cutWalls)) this.flyAuto(this.autoPoseFor(this.display), true);
      this.frameTop();
    }
    if (this.mode === 'walk') {
      const g = this.world.floorAt(this.walk.x, this.walk.y, this.walk.ground + 0.3);
      this.walk.ground = g;
    }
    this.selHighlight.show(this.view, this.selection, this.display.structure, this.visibleTopY());
    this.hoverHighlight.clear();
    this.hover = null;
    this.invalidate(true);
  }

  setItems(items: PlacedItem[]): void {
    if (this.disposed) return;
    const changed = this.items.set(items ?? []);
    if (!changed) return;
    this.world?.setItems(this.items.entries.values());
    this.applyItemVisibility();
    this.solveDoors(false);
    this.invalidate(true);
  }

  setDisplay(opts: Partial<DisplayOptions>): void {
    if (this.disposed || !opts) return;
    const prev = this.display;
    const next = { ...prev, ...opts };
    next.cutHeight = clamp(finite(next.cutHeight, 1.2), 0.2, 4);
    next.sunHour = clamp(finite(next.sunHour, 15), 5, 20);
    this.display = next;
    if (prev.theme !== next.theme) this.applyTheme();
    this.applyDisplay();
    // a cutaway is for looking INTO the rooms: re-frame when the storey or the cut changes (never mid-gesture)
    if ((prev.level !== next.level || prev.cutWalls !== next.cutWalls) && this.mode === 'orbit' && this.view && !this.firstHouse && !this.down && !this.drag) {
      this.flyAuto(this.autoPoseFor(next));
    }
    this.invalidate(true);
  }

  getDisplay(): DisplayOptions {
    return { ...this.display };
  }

  setMode(mode: ViewMode): void {
    if (this.disposed || mode === this.mode) return;
    if (mode === 'walk') { this.enterWalk(); return; }
    this.cancelDrag();
    const from = this.mode;
    if (from === 'orbit') this.saveOrbit();
    if (from === 'walk') { this.walk.enabled = false; this.walk.unlock(); this.exposure = 1; }
    if (from === 'top') {
      // carry on from where the plan view was looking
      const t = this.topCtl.target;
      const h = this.topHeightFor(this.topCam);
      this.camera.position.set(t.x, h, t.z + 0.01);
      this.camera.fov = FOV_ORBIT;
      this.camera.updateProjectionMatrix();
      this.camera.up.set(0, 1, 0);
      this.camera.quaternion.copy(this.topCam.quaternion);
      this.orbit.target.set(t.x, 0, t.z);
      this.topCtl.enabled = false;
      this.activeCam = this.camera;
    }
    this.mode = mode;
    this.orbit.enabled = false;
    this.applyDisplay();
    if (mode === 'orbit') {
      if (this.savedOrbit) this.flyOrbit(this.savedOrbit.pos, this.savedOrbit.target, () => { this.orbit.enabled = true; });
      else this.flyAuto(this.autoPoseFor(this.display));
    } else {
      // plan view: rise above the house looking straight down with screen-up = -Z, then swap to the ortho camera
      this.frameTop();
      const t = this.topCtl.target.clone();
      const h = this.topHeightFor(this.topCam);
      const q = this.topCam.quaternion.clone();
      this.startFly({ p1: new THREE.Vector3(t.x, h, t.z), q1: q, f1: FOV_ORBIT, done: () => {
        this.activeCam = this.topCam;
        this.topCtl.enabled = true;
        this.topCtl.update();
        this.invalidate();
      } });
    }
    this.events.onModeChange?.(mode);
    this.invalidate(true);
  }

  getMode(): ViewMode {
    return this.mode;
  }

  enterWalk(start?: { levelId: string; x: number; y: number; yaw?: number }): void {
    if (this.disposed) return;
    this.cancelDrag();
    const from = this.mode;
    if (from === 'orbit') this.saveOrbit();
    if (from === 'top') {
      const t = this.topCtl.target;
      this.camera.position.set(t.x, this.topHeightFor(this.topCam), t.z);
      this.camera.quaternion.copy(this.topCam.quaternion);
      this.camera.fov = FOV_ORBIT;
      this.camera.updateProjectionMatrix();
      this.topCtl.enabled = false;
      this.activeCam = this.camera;
    }
    this.orbit.enabled = false;
    this.walk.enabled = false;
    const pose = this.walkStart(start);
    this.walk.setPose(pose);
    const p1 = new THREE.Vector3(), q1 = new THREE.Quaternion();
    this.walk.cameraPose(p1, q1);
    const changed = this.mode !== 'walk';
    this.mode = 'walk';
    this.applyDisplay();
    this.startFly({ p1, q1, f1: FOV_WALK, done: () => {
      this.walk.enabled = true;
      this.walk.setPose({ x: this.walk.x, y: this.walk.y, ground: this.walk.ground, yaw: this.walk.yaw, pitch: this.walk.pitch });
      this.reportRoom(true);
    } });
    if (changed) this.events.onModeChange?.('walk');
    this.invalidate(true);
  }

  exitWalk(): void {
    if (this.mode === 'walk') this.setMode('orbit');
  }

  focusRoom(levelId: string, roomId: string): void {
    const lm = this.view?.model.levelById.get(levelId);
    const rm = lm?.rooms.find((r) => r.room.id === roomId);
    if (!lm || !rm) return;
    const w = rm.box.x1 - rm.box.x0, d = rm.box.y1 - rm.box.y0;
    if (this.mode === 'walk') {
      this.enterWalk({ levelId, x: rm.anchor[0], y: rm.anchor[1], yaw: this.walk.yaw });
      return;
    }
    if (this.mode === 'top') {
      this.flyTop(rm.anchor[0], rm.anchor[1], Math.max(w, d) * 1.5 + 1.5);
      return;
    }
    this.focusOrbit(new THREE.Vector3(rm.anchor[0], rm.floorY + 0.9, rm.anchor[1]), Math.hypot(w, d) / 2 + 0.6, 0.72);
  }

  focusItem(uid: string): void {
    const e = this.items.entries.get(uid);
    if (!e) return;
    const it = e.item;
    if (this.mode === 'top') { this.flyTop(it.x, it.y, Math.max(it.w, it.d) * 3 + 2.5); return; }
    if (this.mode === 'walk') return;
    this.focusOrbit(new THREE.Vector3(it.x, e.bottom + it.h / 2, it.y), Math.max(0.9, Math.hypot(it.w, it.d, it.h) / 2 + 0.5), 0.95);
  }

  focusLevel(levelId: string | 'all'): void {
    const v = this.view;
    if (this.disposed || !v || this.mode === 'walk') return;
    const i = levelId === 'all' ? -1 : v.levels.findIndex((l) => l.lm.level.id === levelId);
    if (this.mode === 'top') {
      const lm = i >= 0 ? v.levels[i].lm : null;
      const b = lm && lm.footprint.length ? lm.footprint : null;
      if (b) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of b) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        this.flyTop((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) + 3);
      } else this.flyTop(v.model.centre[0], v.model.centre[1], Math.max(v.model.box.x1 - v.model.box.x0, v.model.box.y1 - v.model.box.y0) + 4);
      return;
    }
    this.flyAuto(i < 0 ? this.defaultPose() : this.levelPose(i, this.display.cutWalls));
  }

  resetView(): void {
    if (this.mode === 'walk') { this.setMode('orbit'); this.savedOrbit = null; }
    if (this.mode === 'top') {
      const m = this.view?.model;
      if (m) this.flyTop(m.centre[0], m.centre[1], Math.max(m.box.x1 - m.box.x0, m.box.y1 - m.box.y0) + 4);
      return;
    }
    this.flyAuto(this.autoPoseFor(this.display));
  }

  select(sel: Selection | null): void {
    if (sameSelection(sel, this.selection)) return;
    this.selection = sel;
    this.selHighlight.show(this.view, sel, this.display.structure, this.visibleTopY());
    this.invalidate();
  }

  setEditing(enabled: boolean): void {
    this.editing = !!enabled;
    if (!enabled) this.cancelDrag();
  }

  beginPlace(item: PlacedItem): void {
    if (this.disposed || !item) return;
    this.endPlace(false);
    const raw = buildRaw(item);
    const { group, owned } = bakeItem(raw);
    const made: THREE.Material[] = [];
    const cache = new Map<THREE.Material, THREE.Material>();
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      const ghost = (src: THREE.Material) => {
        let g = cache.get(src);
        if (!g) {
          g = src.clone();
          g.transparent = true;
          g.opacity = Math.min(0.62, (src.opacity ?? 1) * 0.62);
          g.depthWrite = false;
          cache.set(src, g);
          made.push(g);
        }
        return g;
      };
      m.material = Array.isArray(m.material) ? m.material.map(ghost) : ghost(m.material);
      m.renderOrder = 30;
    });
    group.userData.noPick = true;
    group.visible = false;
    this.scene.add(group);
    this.place = { item: { ...item }, ghost: group, mats: made, owned, valid: false };
    this.walk.suspendLook = true;
    this.renderer.domElement.style.cursor = 'crosshair';
    if (this.pointerInside) this.updatePlace();
    this.invalidate();
  }

  cancelPlace(): void {
    this.endPlace(false);
  }

  screenshot(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.renderer.getDrawingBufferSize(this.size);
    const aspect = w / h;
    const changed = Math.abs(aspect - this.camera.aspect) > 1e-3;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.fitTopFrustum();
    // still on an automatic pose (the user has not moved the camera): keep the house fitted to the new shape
    if (changed && this.autoPosed && this.mode === 'orbit' && !this.fly && this.view) this.flyAuto(this.autoPoseFor(this.display), true);
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('dblclick', this.onDblClick);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.endPlace(false, true);
    this.orbit.dispose();
    this.topCtl.dispose();
    this.walk.dispose();
    if (this.view) { this.clearLabels(this.view); disposeHouse(this.view); this.view = null; }
    this.items.dispose();
    this.selHighlight.dispose();
    this.hoverHighlight.dispose();
    this.maskMat.dispose();
    this.outlineMat.dispose();
    this.ground.geometry.dispose();
    this.groundMat.dispose();
    this.shadowCatcher.geometry.dispose();
    this.shadowMat.dispose();
    this.alphaTex.dispose();
    this.bgTex?.dispose();
    this.envTex?.dispose();
    this.mats.dispose();
    disposeLabelTextures();
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
    this.renderer.dispose();
    // give the GL context back straight away (browsers only allow a handful per page)
    try { this.renderer.forceContextLoss(); } catch { /* already lost */ }
    el.remove();
  }

  // ------------------------------------------------------------------------------------- extras (dev / app)

  /** Orbit camera pose (not part of the contract; used by the dev harness and for saved views). */
  setCamera(pos: [number, number, number], target: [number, number, number]): void {
    if (this.mode !== 'orbit') return;
    this.fly = null;
    this.autoPosed = false;
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.orbit.target.set(target[0], target[1], target[2]);
    this.camera.lookAt(this.orbit.target);
    this.orbit.enabled = true;
    this.orbit.update();
    this.invalidate();
  }

  getCamera(): { pos: [number, number, number]; target: [number, number, number] } {
    const p = this.camera.position, t = this.orbit.target;
    return { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  }

  /** Walker state: plan position, height of the floor underfoot, eye height above it, heading. */
  getWalkState(): { x: number; y: number; ground: number; eye: number; yaw: number; pitch: number; levelId: string | null; roomId: string | null } {
    return { x: this.walk.x, y: this.walk.y, ground: this.walk.ground, eye: this.walk.eye, yaw: this.walk.yaw, pitch: this.walk.pitch, levelId: this.walkLevel, roomId: this.walkRoom };
  }

  /** Look direction in walk mode (radians). yaw 0 = toward plan -y (up the drawing), positive turns left. */
  setWalkLook(yaw: number, pitch = 0): void {
    this.walk.setPose({ x: this.walk.x, y: this.walk.y, ground: this.walk.ground, yaw, pitch });
    this.invalidate();
  }

  /**
   * Screen position (CSS pixels from the container's top-left) of a 3D point: x = plan x, y = height, z = plan y.
   * Useful for anchoring HTML to the scene; `visible` is false when the point is behind the camera.
   */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.activeCam);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z > -1 && v.z < 1 };
  }

  /** Dev / test aid: run the walker along plan waypoints without rendering (see WalkControls.simulate). */
  debugWalk(points: [number, number][], secondsPerLeg?: number): ReturnType<WalkControls['simulate']> {
    const r = this.walk.simulate(points, secondsPerLeg);
    this.reportRoom(false);
    this.invalidate();
    return r;
  }

  private pixelRatio(): number {
    return this.lite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  }

  // =================================================================================================== frame

  private invalidate(shadows = false): void {
    this.needsRender = true;
    if (shadows) this.shadowsDirty = true;
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = clamp((time - this.last) / 1000, 0, 0.1);
    this.last = time;
    this.frames++;
    if (this.fly) this.stepFly(time);
    else if (this.mode === 'walk') {
      if (this.walk.update(dt)) this.needsRender = true;
      this.walkExtras(dt);
    } else if (this.mode === 'top') this.topCtl.update();
    else this.orbit.update();
    if (this.hoverDirty) { this.hoverDirty = false; this.updateHover(); }
    if (this.needsRender) this.render();
    if (time - this.statsAt >= 1000) {
      const info = this.renderer.info.render;
      this.events.onStats?.({ fps: Math.round((this.frames * 1000) / (time - this.statsAt)), triangles: info.triangles, drawCalls: info.calls });
      this.frames = 0;
      this.statsAt = time;
    }
  };

  private render(): void {
    this.needsRender = false;
    const r = this.renderer;
    const cam = this.activeCam;
    if (cam === this.camera) {
      // keep the depth range tight around what is in view
      const d = this.mode === 'walk' && !this.fly ? 0 : this.camera.position.distanceTo(this.orbit.target);
      const near = this.mode === 'walk' ? (this.fly ? 0.08 : 0.05) : clamp(d * 0.02, 0.08, 1.5);
      if (Math.abs(near - this.camera.near) > 1e-4) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    }
    if (this.shadowsDirty) { this.shadowsDirty = false; r.shadowMap.needsUpdate = true; }
    r.toneMappingExposure = this.exposure;
    r.info.autoReset = false;
    r.info.reset();
    r.render(this.scene, cam);
    this.renderOutlines(cam);
  }

  /** Outline the selected / hovered item: stencil its silhouette, then draw it shifted by a few pixels around. */
  private renderOutlines(cam: THREE.Camera): void {
    const targets: { obj: THREE.Object3D; px: number; alpha: number }[] = [];
    const selEntry = this.selection?.type === 'item' ? this.items.entries.get(this.selection.uid) : undefined;
    const hovEntry = this.hover?.type === 'item' ? this.items.entries.get(this.hover.uid) : undefined;
    if (selEntry && selEntry.obj.visible) targets.push({ obj: selEntry.obj, px: 2.2, alpha: 1 });
    if (hovEntry && hovEntry !== selEntry && hovEntry.obj.visible) targets.push({ obj: hovEntry.obj, px: 1.4, alpha: 0.75 });
    if (!targets.length) return;
    const r = this.renderer;
    const scene = this.scene;
    const bg = scene.background;
    const prevMask = cam.layers.mask;
    const prevAuto = r.autoClear;
    const pc = cam as THREE.PerspectiveCamera;
    const W = this.size.x, H = this.size.y;
    const pr = r.getPixelRatio();
    scene.background = null;
    r.autoClear = false;
    cam.layers.set(OUTLINE_LAYER);
    try {
      for (const t of targets) {
        t.obj.traverse((o) => o.layers.enable(OUTLINE_LAYER));
        r.clearStencil();
        scene.overrideMaterial = this.maskMat;
        r.render(scene, cam);
        scene.overrideMaterial = this.outlineMat;
        this.outlineMat.opacity = t.alpha;
        this.outlineMat.transparent = t.alpha < 1;
        const rad = t.px * pr;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          pc.setViewOffset(W, H, Math.cos(a) * rad, Math.sin(a) * rad, W, H);
          r.render(scene, cam);
        }
        pc.clearViewOffset();
        t.obj.traverse((o) => o.layers.disable(OUTLINE_LAYER));
      }
    } finally {
      scene.overrideMaterial = null;
      scene.background = bg;
      cam.layers.mask = prevMask;
      r.autoClear = prevAuto;
    }
  }

  // =================================================================================================== display

  /** Display as actually drawn: walking always shows the whole closed house. */
  private effective(): DisplayOptions {
    if (this.mode !== 'walk') return this.display;
    return { ...this.display, level: 'all', cutWalls: false, showRoof: true };
  }

  private topIndex(d: DisplayOptions): number {
    const levels = this.view?.levels ?? [];
    if (d.level === 'all') return levels.length - 1;
    const i = levels.findIndex((l) => l.lm.level.id === d.level);
    return i < 0 ? levels.length - 1 : i;
  }

  /** Absolute height above which nothing of the house is drawn (for highlight boxes). */
  private visibleTopY(): number {
    const v = this.view;
    if (!v || !v.levels.length) return Infinity;
    const d = this.effective();
    const ti = this.topIndex(d);
    const lv = v.levels[ti];
    if (d.cutWalls) return lv.lm.elevation + d.cutHeight;
    return ti === v.levels.length - 1 ? Infinity : lv.lm.ceilingY;
  }

  private applyDisplay(): void {
    const v = this.view;
    const d = this.effective();
    this.updateSun(d);
    if (!v) return;
    const ti = this.topIndex(d);
    const cut = d.cutWalls && v.levels.length > 0;
    const roofOn = d.level === 'all' && d.showRoof && !cut;
    const st = d.structure;
    const ghost = this.mats.ghost();

    const restyle = (walls: THREE.Group, rcc: THREE.Group) => {
      for (const o of walls.children) {
        const m = o as THREE.Mesh;
        if (!m.isMesh) continue;
        m.material = st ? ghost : (m.userData.baseMaterial as THREE.Material);
        m.castShadow = !st;
        m.renderOrder = st ? 5 : 0;
      }
      for (const o of rcc.children) {
        const m = o as THREE.Mesh;
        if (!m.isMesh) continue;
        const kind = m.userData.rcc as 'slab' | 'stair' | undefined;
        m.material = st && kind ? this.mats.rcc(kind) : (m.userData.baseMaterial as THREE.Material);
      }
    };

    v.levels.forEach((lv, i) => {
      lv.group.visible = i <= ti;
      lv.finish.visible = !st;
      lv.struct.visible = st;
      restyle(lv.walls, lv.rcc);
      lv.labels.visible = d.showLabels && this.mode !== 'walk' && (d.level === 'all' || i === ti);
    });
    this.labelXray = !(d.level === 'all' && roofOn && !st);
    v.roof.group.visible = roofOn;
    v.roof.finish.visible = !st;
    v.roof.struct.visible = st;
    restyle(v.roof.walls, v.roof.rcc);
    v.site.visible = d.showSite && !st;

    // ground: solid normally, a faint sectioned sheet in the structure view so footings read below grade
    this.groundMat.opacity = st ? 0.34 : 1;
    this.groundMat.depthWrite = !st;
    this.ground.renderOrder = st ? 8 : -10;
    this.shadowCatcher.visible = !st;

    // dollhouse cut
    const top = v.levels[ti];
    if (cut && top) {
      this.mats.setCut(true, top.lm.elevation + d.cutHeight);
      const key = `${top.lm.level.id}|${d.cutHeight}|${st ? 's' : 'n'}`;
      if (key !== this.cutKey) {
        this.cutKey = key;
        for (const lv of v.levels) { disposeGeometries(lv.caps); lv.caps.clear(); }
        const cols = (st ? v.structure.levelColumns[ti] : v.structure.freeColumns[ti]) ?? [];
        if (!st) buildCutCaps(v.ctx, top.lm, d.cutHeight, top.caps, cols);
      }
      v.levels.forEach((lv, i) => { lv.caps.visible = i === ti && !st; });
    } else {
      this.mats.setCut(false);
      for (const lv of v.levels) lv.caps.visible = false;
    }

    this.ensureLabels();
    this.applyItemVisibility();
    this.selHighlight.show(v, this.selection, st, this.visibleTopY());
    this.hoverHighlight.show(v, this.hover, st, this.visibleTopY());
  }

  private applyItemVisibility(): void {
    const d = this.effective();
    const ti = this.topIndex(d);
    const show = d.showFurniture && !d.structure;
    // dollhouse cut: whatever hangs entirely above the cut (fans, ceiling lights, wall cabinets) goes with the walls
    const cutY = d.cutWalls && this.view?.levels[ti] ? this.view.levels[ti].lm.elevation + d.cutHeight : Infinity;
    for (const e of this.items.entries.values()) {
      e.obj.visible = show && (!this.view || e.levelIndex <= ti) && !(e.levelIndex === ti && e.bottom >= cutY - 0.05);
    }
  }

  private applyTheme(): void {
    const t = THEME[this.display.theme === 'dark' ? 'dark' : 'light'];
    this.bgTex?.dispose();
    this.bgTex = gradientTexture(t.top, t.bottom);
    this.scene.background = this.bgTex;
    this.groundMat.color.set(t.ground);
    this.selHighlight.setColor(t.accent);
    this.hoverHighlight.setColor(t.accent);
    this.outlineMat.color.set(t.accent);
    this.invalidate();
  }

  private clearLabels(v: HouseView): void {
    for (const lv of v.levels) {
      for (const c of [...lv.labels.children]) { disposeLabel(c as THREE.Sprite); c.removeFromParent(); }
    }
  }

  private ensureLabels(): void {
    const v = this.view;
    if (!v || !this.display.showLabels) return;
    const theme = this.display.theme;
    if (this.labelTheme === theme) { this.applyLabelDepth(); return; }
    this.labelTheme = theme;
    this.clearLabels(v);
    for (const lv of v.levels) {
      for (const rm of lv.lm.rooms) {
        const s = makeLabel(rm.room.name, rm.room.sizeLabel, theme === 'dark');
        s.position.set(rm.anchor[0], rm.floorY + 1.2, rm.anchor[1]);
        lv.labels.add(s);
      }
    }
    this.applyLabelDepth();
  }

  private labelXray = true;

  /** Labels float over everything in cutaway / structure views, but are hidden by walls in the closed house. */
  private applyLabelDepth(): void {
    const v = this.view;
    if (!v) return;
    for (const lv of v.levels) {
      for (const c of lv.labels.children) {
        const m = (c as THREE.Sprite).material as THREE.SpriteMaterial;
        if (m.depthTest === this.labelXray) { m.depthTest = !this.labelXray; m.needsUpdate = true; }
      }
    }
  }

  private updateSun(d: DisplayOptions): void {
    const m = this.view?.model;
    const north = m?.spec.north;
    let nx = finite(north?.[0], 0), ny = finite(north?.[1], -1);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    // plan axes: east = north turned clockwise on the drawing, south = -north
    const ex = -ny, ey = nx, sx = -nx, sy = -ny;
    const t = clamp((d.sunHour - 6) / 13, 0, 1);
    const az = Math.PI * t;
    const hx = ex * Math.cos(az) + sx * Math.sin(az), hy = ey * Math.cos(az) + sy * Math.sin(az);
    const elev = THREE.MathUtils.degToRad(Math.max(7, 68 * Math.sin(Math.PI * t)));
    const dir = new THREE.Vector3(hx * Math.cos(elev), Math.sin(elev), hy * Math.cos(elev)).normalize();
    const cx = m ? m.centre[0] : 0, cy = m ? m.centre[1] : 0;
    const topY = m ? m.topY : 6;
    const b = m?.box;
    const R = b ? Math.hypot((b.x1 - b.x0) / 2 + 3.5, (b.y1 - b.y0) / 2 + 3.5, topY / 2 + 1) : 14;
    this.sun.target.position.set(cx, topY / 2 - 0.5, cy);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, R + 30);
    const cam = this.sun.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.near = 1; cam.far = 2 * R + 60;
    cam.updateProjectionMatrix();
    // warmer and softer toward sunrise / sunset
    const low = 1 - Math.sin(Math.PI * t);
    this.sun.color.set('#fff3dc').lerp(new THREE.Color('#ffc48a'), low * 0.8);
    this.sun.intensity = 2.7 - low * 1.1;
    // without the environment map (lite pipeline) the hemisphere light carries all of the ambient
    this.hemi.intensity = (0.9 - low * 0.15) * (this.envTex ? 1 : 2.1);
    // plan view: keep the cast shadows as a hint of height, not a dark blanket over the rooms
    this.sun.shadow.intensity = this.mode === 'top' ? 0.42 : 1;
    this.shadowMat.opacity = this.mode === 'top' ? 0.14 : 0.26;
    this.sun.target.updateMatrixWorld();
    this.sunDir.copy(dir);
  }

  private sunDir = new THREE.Vector3(0.4, 0.8, -0.4);

  // =================================================================================================== doors

  private itemObstacles(levelIndex: number): ORect[] {
    const lm = this.view?.levels[levelIndex]?.lm;
    const out: ORect[] = [];
    if (!lm) return out;
    for (const e of this.items.entries.values()) {
      if (e.levelIndex !== levelIndex || e.item.h < 0.05) continue;
      if (e.bottom > lm.elevation + 1.95 || e.bottom + e.item.h < lm.elevation + 0.04) continue;
      out.push(e.rect);
    }
    return out;
  }

  private solveDoors(reset: boolean): void {
    const v = this.view;
    if (!v) return;
    const byLevel = new Map<number, ORect[]>();
    solveDoorAngles(v.doors, (leaf) => {
      let items = byLevel.get(leaf.levelIndex);
      if (!items) { items = this.itemObstacles(leaf.levelIndex); byLevel.set(leaf.levelIndex, items); }
      return [...doorObstacles(v, leaf), ...items];
    });
    for (const d of v.doors) {
      if (reset || this.mode !== 'walk') { d.angle = d.rest; d.target = d.rest; }
      d.angle = Math.min(d.angle, d.max);
      d.pivot.rotation.y = d.sign * d.angle;
      d.pivot.updateMatrixWorld(true);
    }
  }

  // =================================================================================================== camera

  /**
   * Camera pose that fits a box (plan bounds + height range) into the current viewport from direction `dir`
   * (unit vector from the box toward the camera), centred on screen with `margin` of the frame left free.
   */
  private fitPose(box: { x0: number; y0: number; x1: number; y1: number; lo: number; hi: number }, dir: THREE.Vector3, margin = 0.08): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV_ORBIT / 2)), tanH = tanV * (w / h);
    const k = 1 - clamp(margin, 0, 0.45) * 2;
    const d = dir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const corners: THREE.Vector3[] = [];
    for (const x of [box.x0, box.x1]) for (const y of [box.lo, box.hi]) for (const z of [box.y0, box.y1]) corners.push(new THREE.Vector3(x, y, z));
    const target = new THREE.Vector3((box.x0 + box.x1) / 2, (box.lo + box.hi) / 2, (box.y0 + box.y1) / 2);
    const v = new THREE.Vector3();
    let D = 10;
    for (let iter = 0; iter < 4; iter++) {
      D = 0.5;
      for (const c of corners) {
        v.subVectors(c, target);
        const along = v.dot(d);
        D = Math.max(D, along + Math.abs(v.dot(right)) / (tanH * k), along + Math.abs(v.dot(up)) / (tanV * k));
      }
      // centre what is actually seen (perspective makes the near side larger)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        v.subVectors(c, target);
        const z = Math.max(0.2, D - v.dot(d));
        const sx = v.dot(right) / (z * tanH), sy = v.dot(up) / (z * tanV);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
      if (Math.abs(ox) < 0.004 && Math.abs(oy) < 0.004) break;
      target.addScaledVector(right, ox * tanH * D).addScaledVector(up, oy * tanV * D);
    }
    D = clamp(D, 2, this.orbit.maxDistance);
    return { pos: target.clone().addScaledVector(d, D), target };
  }

  /** Exterior three-quarter view of the entrance front, from the side the sun is on, fitted to the house. */
  private defaultPose(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const m = this.view?.model;
    if (!m) return { pos: new THREE.Vector3(14, 10, 18), target: new THREE.Vector3(0, 1.5, 0) };
    const f = this.view?.front ?? [0, 1];
    const rx = -f[1], ry = f[0];
    const side = this.sunDir.x * rx + this.sunDir.z * ry >= 0 ? 1 : -1;
    const a = side * 0.62;
    const dx = f[0] * Math.cos(a) + rx * Math.sin(a), dy = f[1] * Math.cos(a) + ry * Math.sin(a);
    const el = 0.3;
    const dir = new THREE.Vector3(dx * Math.cos(el), Math.sin(el), dy * Math.cos(el));
    return this.fitPose({ ...m.box, lo: 0, hi: m.topY }, dir, 0.1);
  }

  /** Raised look-in pose for one storey: keeps the current compass direction, tilts to ~57° and frames its plate. */
  private levelPose(index: number, cut: boolean): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const v = this.view;
    const lv = v?.levels[clamp(index, 0, (v?.levels.length ?? 1) - 1)];
    if (!v || !lv) return this.defaultPose();
    const lm = lv.lm;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (pts: [number, number][]) => { for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } };
    grow(lm.footprint);
    for (const r of lm.rooms) grow(r.poly);
    for (const w of lm.walls) grow([w.wall.a, w.wall.b]);
    if (!Number.isFinite(x0)) return this.defaultPose();
    const hi = lm.elevation + (cut ? this.display.cutHeight : Math.max(0.5, lm.ceilingY - lm.elevation));
    // direction: where the camera is now, or the default front quarter when it is almost overhead
    const off = this.camera.position.clone().sub(this.orbit.target);
    let az = Math.atan2(off.x, off.z);
    if (Math.hypot(off.x, off.z) < 0.5) { const d = this.defaultPose(); const o = d.pos.sub(d.target); az = Math.atan2(o.x, o.z); }
    const el = THREE.MathUtils.degToRad(57);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    return this.fitPose({ x0, y0, x1, y1, lo: lm.elevation, hi }, dir, 0.09);
  }

  /** The automatic pose that suits what is displayed: exterior for the closed house, look-in for a cutaway. */
  private autoPoseFor(d: DisplayOptions): { pos: THREE.Vector3; target: THREE.Vector3 } {
    if (!this.view || (d.level === 'all' && !d.cutWalls)) return this.defaultPose();
    return this.levelPose(this.topIndex(d), d.cutWalls);
  }

  private flyAuto(pose: { pos: THREE.Vector3; target: THREE.Vector3 }, instant = false): void {
    this.savedOrbit = null;
    if (instant) {
      this.fly = null;
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(pose.pos);
      this.orbit.target.copy(pose.target);
      this.camera.lookAt(pose.target);
      this.orbit.enabled = this.mode === 'orbit';
      this.orbit.update();
      this.autoPosed = true;
      this.invalidate();
      return;
    }
    this.flyOrbit(pose.pos, pose.target, () => { this.autoPosed = true; });
  }

  private autoPosed = false;

  private saveOrbit(): void {
    this.savedOrbit = { pos: this.camera.position.clone(), target: this.orbit.target.clone() };
  }

  private startFly(o: { p1: THREE.Vector3; q1: THREE.Quaternion; f1: number; t1v?: THREE.Vector3; done?: () => void; dur?: number }): void {
    this.fly = {
      t0: performance.now(), dur: o.dur ?? FLY_MS,
      p0: this.camera.position.clone(), p1: o.p1,
      q0: this.camera.quaternion.clone(), q1: o.q1,
      f0: this.camera.fov, f1: o.f1,
      t0v: o.t1v ? this.orbit.target.clone() : undefined, t1v: o.t1v,
      done: o.done,
    };
    this.invalidate();
  }

  private flyOrbit(pos: THREE.Vector3, target: THREE.Vector3, done?: () => void): void {
    this.orbit.enabled = false;
    const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    this.startFly({ p1: pos.clone(), q1: new THREE.Quaternion().setFromRotationMatrix(m), f1: FOV_ORBIT, t1v: target.clone(), done: () => {
      this.orbit.target.copy(target);
      this.camera.up.set(0, 1, 0);
      this.camera.position.copy(pos);
      this.camera.lookAt(target);
      this.orbit.enabled = true;
      this.orbit.update();
      done?.();
    } });
  }

  private focusOrbit(target: THREE.Vector3, radius: number, tilt: number): void {
    if (this.mode !== 'orbit') return;
    this.autoPosed = false;
    const off = this.camera.position.clone().sub(this.orbit.target);
    const az = Math.atan2(off.x, off.z);
    const half = THREE.MathUtils.degToRad(FOV_ORBIT / 2);
    const dist = clamp((radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * this.camera.aspect)))) * 1.05, 2.2, this.orbit.maxDistance);
    const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.sin(tilt), Math.cos(tilt), Math.cos(az) * Math.sin(tilt)).multiplyScalar(dist));
    this.flyOrbit(pos, target);
  }

  private stepFly(now: number): void {
    const f = this.fly;
    if (!f) return;
    const k = clamp((now - f.t0) / f.dur, 0, 1);
    const e = easeInOut(k);
    this.camera.position.lerpVectors(f.p0, f.p1, e);
    if (f.t0v && f.t1v) {
      const t = f.t0v.clone().lerp(f.t1v, e);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(t);
    } else this.camera.quaternion.slerpQuaternions(f.q0, f.q1, e);
    const fov = f.f0 + (f.f1 - f.f0) * e;
    if (Math.abs(fov - this.camera.fov) > 1e-3) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.updateMatrixWorld();
    this.needsRender = true;
    if (k >= 1) {
      this.fly = null;
      f.done?.();
      this.needsRender = true;
    }
  }

  private cancelFly(): void {
    const f = this.fly;
    if (!f) return;
    // jump to the end state so modes never stay half-switched
    f.t0 = -1e9;
    this.stepFly(performance.now());
  }

  // ---- plan (top) view

  private fitTopFrustum(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const span = this.topSpan;
    const aspect = w / h;
    const halfH = aspect >= 1 ? span / 2 : span / 2 / aspect;
    this.topCam.left = -halfH * aspect;
    this.topCam.right = halfH * aspect;
    this.topCam.top = halfH;
    this.topCam.bottom = -halfH;
    this.topCam.updateProjectionMatrix();
  }

  private topSpan = 20;

  /** Reset the plan camera to frame the building (plus a margin), screen-up = plan up. */
  private frameTop(): void {
    const m = this.view?.model;
    const cx = m ? m.centre[0] : 0, cy = m ? m.centre[1] : 0;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    const bw = m ? m.box.x1 - m.box.x0 + 3 : 20, bh = m ? m.box.y1 - m.box.y0 + 3 : 20;
    // span is the shorter screen side in metres
    const aspect = w / h;
    this.topSpan = aspect >= 1 ? Math.max(bh, bw / aspect) : Math.max(bw, bh * aspect);
    this.topCam.zoom = 1;
    this.fitTopFrustum();
    const y = (m ? m.topY : 8) + 60;
    this.topCam.position.set(cx, y, cy);
    this.topCam.up.set(0, 0, -1);
    this.topCam.lookAt(cx, 0, cy);
    this.topCam.far = y + 40;
    this.topCam.updateProjectionMatrix();
    this.topCtl.target.set(cx, 0, cy);
    this.topCtl.update();
  }

  /** Height at which the perspective camera sees the same ground area as the plan camera. */
  private topHeightFor(cam: THREE.OrthographicCamera): number {
    const visH = (cam.top - cam.bottom) / cam.zoom;
    return visH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV_ORBIT / 2));
  }

  private flyTop(x: number, y: number, span: number): void {
    const from = { x: this.topCtl.target.x, z: this.topCtl.target.z, zoom: this.topCam.zoom };
    const aspect = this.camera.aspect || 1;
    const visShort = aspect >= 1 ? this.topCam.top - this.topCam.bottom : this.topCam.right - this.topCam.left;
    const to = { x, z: y, zoom: clamp(visShort / span, this.topCtl.minZoom, this.topCtl.maxZoom) };
    const t0 = performance.now();
    const step = () => {
      if (this.disposed || this.mode !== 'top') return;
      const k = clamp((performance.now() - t0) / FLY_MS, 0, 1), e = easeInOut(k);
      const tx = from.x + (to.x - from.x) * e, tz = from.z + (to.z - from.z) * e;
      this.topCtl.target.set(tx, 0, tz);
      this.topCam.position.set(tx, this.topCam.position.y, tz);
      this.topCam.zoom = from.zoom + (to.zoom - from.zoom) * e;
      this.topCam.updateProjectionMatrix();
      this.invalidate();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  // ---- walk

  private walkStart(start?: { levelId: string; x: number; y: number; yaw?: number }): { x: number; y: number; ground: number; yaw: number; pitch: number } {
    const v = this.view;
    const w = this.world;
    if (!v || !w || !v.levels.length) return { x: finite(start?.x, 0), y: finite(start?.y, 0), ground: 0, yaw: finite(start?.yaw, 0), pitch: 0 };
    const standOn = (lm: LevelModel, x: number, y: number) => {
      let g = -Infinity;
      for (const s of w.surfaces(x, y)) if (s <= lm.topY - 0.05 && s > g) g = s;
      return g === -Infinity ? 0 : g;
    };
    if (start && Number.isFinite(start.x) && Number.isFinite(start.y)) {
      const lm = v.model.levelById.get(start.levelId) ?? v.levels[0].lm;
      let yaw = start.yaw;
      if (yaw === undefined || !Number.isFinite(yaw)) {
        // face the long way into the room
        const rm = roomAt(lm, start.x, start.y);
        yaw = rm && rm.box.x1 - rm.box.x0 > rm.box.y1 - rm.box.y0 ? Math.PI / 2 : 0;
      }
      return { x: start.x, y: start.y, ground: standOn(lm, start.x, start.y), yaw, pitch: 0 };
    }
    const door = v.mainDoor;
    if (door) {
      // on the portico in front of the entrance, facing in
      const wm = door.wall;
      const out = door.outSide !== 0 ? door.outSide : 1;
      const sc = (door.s0 + door.s1) / 2;
      const ox = wm.nx * out, oy = wm.ny * out;
      const bx = wm.rect.ax + wm.rect.ux * sc, by = wm.rect.ay + wm.rect.uy * sc;
      let dist = wm.rect.ht + 1.25;
      const outside = out > 0 ? door.roomPlus : door.roomMinus;
      if (outside) {
        // stay on the porch slab if there is one
        for (let dd = dist; dd > wm.rect.ht + 0.45; dd -= 0.1) { dist = dd; if (pointInPoly(bx + ox * dd, by + oy * dd, outside.poly)) break; }
      }
      const x = bx + ox * dist, y = by + oy * dist;
      // yaw 0 looks toward plan -y; heading (hx, hy) = (-sin yaw, -cos yaw)
      const yaw = Math.atan2(ox, oy);
      return { x, y, ground: standOn(wm.level, x, y), yaw, pitch: 0 };
    }
    const lm = v.levels[0].lm;
    const rm = lm.rooms[0];
    const x = rm ? rm.anchor[0] : v.model.centre[0], y = rm ? rm.anchor[1] : v.model.centre[1];
    return { x, y, ground: standOn(lm, x, y), yaw: 0, pitch: 0 };
  }

  private walkExtras(dt: number): void {
    const v = this.view;
    if (!v) return;
    // doors swing open as the walker comes near and fall back to rest behind them
    let moving = false;
    for (const d of v.doors) {
      const lm = v.levels[d.levelIndex]?.lm;
      if (!lm) continue;
      const mx = d.hx + d.cx * d.width * 0.5, my = d.hy + d.cy * d.width * 0.5;
      const near = Math.abs(this.walk.ground - lm.elevation) < 1.2 && Math.hypot(this.walk.x - mx, this.walk.y - my) < 1.9;
      d.target = near ? Math.max(d.rest, d.max) : d.rest;
      const diff = d.target - d.angle;
      if (Math.abs(diff) > 1e-3) {
        d.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.8 * dt);
        d.pivot.rotation.y = d.sign * d.angle;
        moving = true;
      }
    }
    if (moving) this.invalidate(true);
    this.reportRoom(false);
    // eyes adapt a little indoors
    const target = this.walkIndoors ? 1.22 : 1.0;
    if (Math.abs(target - this.exposure) > 0.004) { this.exposure += (target - this.exposure) * (1 - Math.exp(-2.5 * dt)); this.needsRender = true; }
  }

  private walkIndoors = false;

  private reportRoom(force: boolean): void {
    const v = this.view;
    if (!v) return;
    let lm: LevelModel | null = v.levels[0]?.lm ?? null;
    for (const l of v.levels) if (l.lm.elevation <= this.walk.ground + 0.3) lm = l.lm;
    let rm: RoomModel | null = null;
    if (lm) {
      // below the lowest floor (out in the yard) only count rooms at about the walker's height
      const r = roomAt(lm, this.walk.x, this.walk.y);
      if (r && this.walk.ground >= r.floorY - 0.4) rm = r;
    }
    const levelId = rm ? lm!.level.id : lm && hasFloorAt(lm, this.walk.x, this.walk.y) ? lm.level.id : null;
    const roomId = rm ? rm.room.id : null;
    this.walkIndoors = !!rm && !rm.room.outdoor;
    if (force || levelId !== this.walkLevel || roomId !== this.walkRoom) {
      this.walkLevel = levelId;
      this.walkRoom = roomId;
      this.events.onRoomChange?.(levelId, roomId);
    }
  }

  // =================================================================================================== input

  private onControlsChange = (): void => {
    if (this.mode === 'orbit' && !this.fly) {
      // keep the pivot inside the scene and above ground
      const m = this.view?.model;
      const t = this.orbit.target;
      if (m) {
        const R = m.radius * 2.5 + 10;
        const ny = clamp(t.y, 0, m.topY + 3);
        const nx = clamp(t.x, m.centre[0] - R, m.centre[0] + R), nz = clamp(t.z, m.centre[1] - R, m.centre[1] + R);
        if (ny !== t.y || nx !== t.x || nz !== t.z) {
          this.camera.position.x += nx - t.x; this.camera.position.y += ny - t.y; this.camera.position.z += nz - t.z;
          t.set(nx, ny, nz);
        }
      }
      if (this.camera.position.y < 0.25) this.camera.position.y = 0.25;
    }
    this.needsRender = true;
  };

  private setPointer(e: PointerEvent | MouseEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
  }

  private pickTargets(): THREE.Object3D[] {
    const v = this.view;
    const out: THREE.Object3D[] = [];
    if (v) {
      collectTargets([v.root], out);
    }
    collectTargets([this.items.group], out);
    return out;
  }

  private cutY(): number | null {
    return this.mats.cutOn ? this.mats.cutPlane.constant : null;
  }

  private pickAt(): ReturnType<Picker['pick']> {
    const st = this.effective().structure;
    return this.picker.pick(this.pointer, this.activeCam, this.pickTargets(), this.cutY(), (sel, hit) => {
      // ghosted walls do not block picking the frame behind them
      if (st && hit.object.userData.role === 'wall') return false;
      if (hit.object.userData.ground && !sel) return true;
      return true;
    });
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.setPointer(e);
    this.pointerInside = true;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
    if (this.fly && this.mode !== 'walk') this.cancelFly();
    if (this.place || e.button !== 0 || this.mode === 'walk' || !this.editing) return;
    const hit = this.pickAt();
    if (!hit || hit.sel?.type !== 'item') return;
    const entry = this.items.entries.get(hit.sel.uid);
    if (!entry || entry.item.locked) return;
    // claim the gesture: the camera stays put while the item is dragged
    this.orbit.enabled = false;
    this.topCtl.enabled = false;
    const lm = this.view?.levels[entry.levelIndex]?.lm;
    const inside = !!lm && (hasFloorAt(lm, entry.item.x, entry.item.y) || !!roomAt(lm, entry.item.x, entry.item.y));
    this.drag = { entry, item: { ...entry.item }, planeY: hit.point.y, offX: entry.item.x - hit.point.x, offY: entry.item.y - hit.point.z, startedInside: inside, moved: false };
    if (!sameSelection(this.selection, hit.sel)) { this.select(hit.sel); this.events.onSelect?.(hit.sel); }
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.setPointer(e);
    this.pointerInside = true;
    if (this.place) { this.updatePlace(); return; }
    if (this.drag) { this.updateDrag(); return; }
    if (e.buttons === 0 && !(this.mode === 'walk' && this.walk.locked)) this.hoverDirty = true;
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
    if (this.hover) { this.hover = null; this.hoverHighlight.clear(); this.events.onHover?.(null); this.invalidate(); }
    this.renderer.domElement.style.cursor = this.place ? 'crosshair' : '';
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.setPointer(e);
    const down = this.down;
    this.down = null;
    if (this.drag) { this.endDrag(); return; }
    if (!down || e.type === 'pointercancel') return;
    const click = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && down.button === 0 && performance.now() - down.t < 600;
    if (!click) return;
    if (this.place) { this.updatePlace(); this.endPlace(true); return; }
    if (this.mode === 'walk') return; // a click in walk mode captures the pointer
    const hit = this.pickAt();
    const sel = hit?.sel ?? null;
    if (!sameSelection(sel, this.selection)) {
      this.select(sel);
      this.events.onSelect?.(sel);
    }
  };

  private onDblClick = (e: MouseEvent): void => {
    if (this.mode === 'walk' || this.place) return;
    this.setPointer(e);
    const hit = this.pickAt();
    if (!hit?.sel) return;
    if (hit.sel.type === 'room') this.focusRoom(hit.sel.levelId, hit.sel.roomId);
    else if (hit.sel.type === 'item') {
      // focus the room the item stands in when the floor was not reachable under the pointer
      const en = this.items.entries.get(hit.sel.uid);
      const lm = en ? this.view?.levels[en.levelIndex]?.lm : null;
      const rm = en && lm ? roomAt(lm, en.item.x, en.item.y) : null;
      if (rm && lm) this.focusRoom(lm.level.id, rm.room.id); else this.focusItem(hit.sel.uid);
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onWheel = (): void => {
    if (this.fly && this.mode !== 'walk') this.cancelFly();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.place) {
      if (e.key === 'Escape') { e.preventDefault(); this.endPlace(false); }
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.place.item.rot = normAngle(this.place.item.rot + (e.shiftKey ? Math.PI / 12 : Math.PI / 2));
        this.placeRotated = true;
        this.updatePlace();
      }
      return;
    }
    if (this.editing && this.mode !== 'walk' && (e.key === 'r' || e.key === 'R') && this.selection?.type === 'item') {
      const en = this.items.entries.get(this.selection.uid);
      if (!en || en.item.locked) return;
      e.preventDefault();
      const item = { ...en.item, rot: Math.round(normAngle(en.item.rot + (e.shiftKey ? Math.PI / 12 : Math.PI / 2)) * 10000) / 10000 };
      this.commitItem(en, item);
    }
  };

  private placeRotated = false;

  private updateHover(): void {
    if (this.drag || this.place || !this.pointerInside || this.fly) return;
    if (this.mode === 'walk') {
      // walking is for looking around: no hover tint following the pointer
      if (this.hover) { this.hover = null; this.hoverHighlight.clear(); this.events.onHover?.(null); this.invalidate(); }
      this.renderer.domElement.style.cursor = '';
      return;
    }
    const hit = this.pickAt();
    const sel = hit?.sel ?? null;
    this.renderer.domElement.style.cursor = sel ? 'pointer' : '';
    if (sameSelection(sel, this.hover)) return;
    this.hover = sel;
    this.hoverHighlight.show(this.view, sameSelection(sel, this.selection) ? null : sel, this.effective().structure, this.visibleTopY());
    this.events.onHover?.(sel);
    this.invalidate();
  }

  // =================================================================================================== editing

  /** Snap a wall-mounted item's back to the nearest wall face of a level. */
  private snapToWall(lm: LevelModel, x: number, y: number, item: PlacedItem, reach: number): { x: number; y: number; rot: number } | null {
    let best: { x: number; y: number; rot: number } | null = null;
    let bestD = reach;
    for (const wm of lm.walls) {
      const [s, q] = orectLocal(wm.rect, x, y);
      if (s < -0.2 || s > wm.rect.len + 0.2) continue;
      const side = q >= 0 ? 1 : -1;
      const dq = Math.abs(Math.abs(q) - wm.rect.ht - item.d / 2);
      if (Math.abs(q) > wm.rect.ht + reach + item.d || dq >= bestD) continue;
      const half = Math.min(item.w / 2, wm.rect.len / 2);
      const sc = clamp(s, half, wm.rect.len - half);
      const off = side * (wm.rect.ht + item.d / 2 + 0.002);
      const nx = wm.nx * side, ny = wm.ny * side;
      bestD = dq;
      best = { x: wm.rect.ax + wm.rect.ux * sc + wm.nx * off, y: wm.rect.ay + wm.rect.uy * sc + wm.ny * off, rot: Math.atan2(nx, ny) };
    }
    return best;
  }

  private updateDrag(): void {
    const d = this.drag;
    const v = this.view;
    if (!d) return;
    const p = this.picker.planePoint(this.pointer, this.activeCam, d.planeY);
    if (!p) return;
    const lm = v?.levels[d.entry.levelIndex]?.lm ?? null;
    let x = Math.round((p.x + d.offX) / 0.05) * 0.05, y = Math.round((p.z + d.offY) / 0.05) * 0.05;
    let rot = d.item.rot;
    if (lm) {
      if (d.entry.mount === 'wall') {
        const s = this.snapToWall(lm, x, y, d.item, 0.6);
        if (s) { x = s.x; y = s.y; rot = s.rot; }
      }
      const inside = hasFloorAt(lm, x, y) || !!roomAt(lm, x, y);
      if (d.startedInside && !inside) return; // stays inside the house
    }
    x = Math.round(x * 10000) / 10000; y = Math.round(y * 10000) / 10000; rot = Math.round(rot * 10000) / 10000;
    if (x === d.item.x && y === d.item.y && rot === d.item.rot) return;
    const room = lm ? roomAt(lm, x, y) : null;
    d.item = { ...d.item, x, y, rot, roomId: room ? room.room.id : undefined };
    d.moved = true;
    const bottom = itemBottom(v?.model ?? null, d.item, lm);
    d.entry.obj.position.set(x, bottom, y);
    d.entry.obj.rotation.y = rot;
    d.entry.obj.updateMatrixWorld(true);
    this.invalidate(true);
  }

  private endDrag(): void {
    const d = this.drag;
    this.drag = null;
    this.restoreControls();
    if (!d) return;
    if (d.moved) this.commitItem(d.entry, d.item);
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.items.pose(d.entry);
    this.restoreControls();
    this.invalidate(true);
  }

  private restoreControls(): void {
    if (this.fly) return;
    this.orbit.enabled = this.mode === 'orbit';
    this.topCtl.enabled = this.mode === 'top';
  }

  /** Apply an edited item locally (so the view is right before React echoes it back) and report it. */
  private commitItem(entry: ItemEntry, item: PlacedItem): void {
    entry.item = item;
    this.items.pose(entry);
    this.world?.setItems(this.items.entries.values());
    this.solveDoors(false);
    this.invalidate(true);
    this.events.onItemChange?.(item);
  }

  private updatePlace(): void {
    const pl = this.place;
    const v = this.view;
    if (!pl) return;
    const d = this.effective();
    let lm: LevelModel | null = null;
    let px = 0, py = 0;
    let found = false;
    if (v && v.levels.length) {
      if (d.level === 'all') {
        // whole house shown: take the first floor surface under the pointer
        const floors: THREE.Object3D[] = [];
        for (const lv of v.levels) if (lv.group.visible) floors.push(...lv.floors);
        this.picker.raycaster.setFromCamera(this.pointer, this.activeCam);
        const hits = this.picker.raycaster.intersectObjects(floors, false);
        if (hits.length) {
          const rm = hits[0].object.userData.room as RoomModel;
          lm = rm.level; px = hits[0].point.x; py = hits[0].point.z; found = true;
        }
      }
      if (!found) {
        lm = d.level === 'all' ? v.levels[0].lm : v.levels[this.topIndex(d)].lm;
        const p = this.picker.planePoint(this.pointer, this.activeCam, lm.elevation);
        if (p) { px = p.x; py = p.z; found = true; }
      }
    } else {
      const p = this.picker.planePoint(this.pointer, this.activeCam, 0);
      if (p) { px = p.x; py = p.z; found = true; }
    }
    if (!found) { pl.ghost.visible = false; pl.valid = false; this.invalidate(); return; }
    let x = Math.round(px / 0.05) * 0.05, y = Math.round(py / 0.05) * 0.05;
    let rot = pl.item.rot;
    const mount = mountOf(pl.item.kind);
    if (lm && mount === 'wall') {
      const s = this.snapToWall(lm, x, y, pl.item, 0.7);
      if (s) { x = s.x; y = s.y; if (!this.placeRotated) rot = s.rot; else rot = s.rot; }
    }
    const room = lm ? roomAt(lm, x, y) : null;
    pl.item = {
      ...pl.item,
      x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, rot: Math.round(rot * 10000) / 10000,
      levelId: lm ? lm.level.id : pl.item.levelId, roomId: room ? room.room.id : undefined,
    };
    const bottom = itemBottom(v?.model ?? null, pl.item, lm);
    pl.ghost.position.set(pl.item.x, bottom, pl.item.y);
    pl.ghost.rotation.set(0, pl.item.rot, 0);
    pl.ghost.visible = true;
    pl.valid = true;
    this.invalidate();
  }

  private endPlace(drop: boolean, silent = false): void {
    const pl = this.place;
    if (!pl) return;
    this.place = null;
    this.placeRotated = false;
    pl.ghost.removeFromParent();
    for (const m of pl.mats) m.dispose();
    for (const g of pl.owned) g.dispose();
    this.walk.suspendLook = false;
    this.renderer.domElement.style.cursor = '';
    this.invalidate();
    if (!silent) this.events.onPlaceEnd?.(drop && pl.valid ? pl.item : null);
  }
}

function normAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}
