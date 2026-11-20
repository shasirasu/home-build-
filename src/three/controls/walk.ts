// First-person walk: a 2D circle sliding along wall pieces / furniture / railings, standing on the highest
// reachable surface (room floors, stair treads, upper slabs), ducking under low slabs and beams.
// The walker's logic uses the true surface height (`ground`); the camera follows it with a smooth ease (`feet`).

import * as THREE from 'three';
import type { Vec2 } from '@/types/house';
import { clamp, distToORect, orectFromSeg, pointInPoly, pushCircleOutOfORect, type ORect } from '../core/geo';
import type { HouseView } from '../build/house';
import { hasFloorAt, inFloorOpening, roomAt, type HouseModel } from '../build/model';
import type { ItemEntry } from '../items';

export const EYE = 1.6;
export const RADIUS = 0.25;
const STEP_UP = 0.25;
const MAX_DROP = 1.0;
const MIN_CLEAR = 1.0;
const HEAD_GAP = 0.11;
/** Furniture is skirted more closely than walls, so tight layouts stay walkable. */
const ITEM_RADIUS = 0.11;

interface Collider {
  rect: ORect;
  y0: number;
  y1: number;
}

interface StepBlock {
  x0: number; y0: number; x1: number; y1: number;
  top: number;
  under: number;
  rect: ORect;
}

interface Soffit {
  rect: ORect;
  bottom: number;
}

export class WalkWorld {
  private statics: Collider[] = [];
  private items: Collider[] = [];
  private steps: StepBlock[] = [];
  private beams: Soffit[] = [];
  private model: HouseModel;

  constructor(view: HouseView) {
    const model = (this.model = view.model);
    for (const lv of view.levels) {
      const lm = lv.lm;
      for (const wm of lm.walls)
        for (const p of wm.pieces)
          this.statics.push({ rect: { ...wm.rect, ax: wm.rect.ax + wm.rect.ux * p.s0, ay: wm.rect.ay + wm.rect.uy * p.s0, len: p.s1 - p.s0 }, y0: lm.elevation + p.h0, y1: lm.elevation + p.h1 });
      for (const rl of lm.level.railings ?? []) {
        const pts = (rl?.points ?? []).filter((p) => p && p.every(Number.isFinite));
        for (let i = 0; i < pts.length - 1; i++) {
          const r = orectFromSeg([pts[i][0], pts[i][1]], [pts[i + 1][0], pts[i + 1][1]], 0.06);
          if (r) this.statics.push({ rect: r, y0: lm.elevation + Math.min(pts[i][2], pts[i + 1][2]), y1: lm.elevation + Math.max(pts[i][2], pts[i + 1][2]) + (rl.height || 0.95) });
        }
      }
      for (const sg of lv.stairs) {
        for (const s of sg.steps) {
          const rect = orectFromSeg([s.x0, (s.y0 + s.y1) / 2], [s.x1, (s.y0 + s.y1) / 2], s.y1 - s.y0);
          if (rect) this.steps.push({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, top: lm.elevation + s.top, under: lm.elevation + (s.solid ? s.base : Math.min(s.botFront, s.botBack)), rect });
        }
        const rh = sg.stair.railHeight || 0.9;
        for (const line of sg.stair.rails ?? []) {
          const pts = (line ?? []).filter((p) => p && p.every(Number.isFinite));
          for (let i = 0; i < pts.length - 1; i++) {
            // long sloping rails are split so each piece only blocks walkers near its own height
            const plan = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
            const n = Math.max(1, Math.ceil(plan / 0.6));
            for (let k = 0; k < n; k++) {
              const t0 = k / n, t1 = (k + 1) / n;
              const a: Vec2 = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t0, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t0];
              const b: Vec2 = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t1, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t1];
              const h0 = pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t0, h1 = pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t1;
              const r = orectFromSeg(a, b, 0.06);
              if (r) this.statics.push({ rect: r, y0: lm.elevation + Math.min(h0, h1) - 0.05, y1: lm.elevation + Math.max(h0, h1) + rh });
            }
          }
        }
      }
      for (const c of view.structure.freeColumns[lm.index] ?? []) {
        const r = orectFromSeg([c.x - c.w / 2, c.y], [c.x + c.w / 2, c.y], c.d);
        if (r) this.statics.push({ rect: r, y0: lm.elevation - 1, y1: lm.ceilingY });
      }
    }
    for (const br of view.structure.beamRects) this.beams.push({ rect: br.rect, bottom: br.bottom });
    for (const [ax, ay, bx, by, t, h] of view.siteBuild.wallRuns) {
      const r = orectFromSeg([ax, ay], [bx, by], t);
      if (r) this.statics.push({ rect: r, y0: 0, y1: h });
    }
    void model;
  }

  setItems(entries: Iterable<ItemEntry>): void {
    this.items = [];
    for (const e of entries) {
      if (e.mount === 'ceiling' && e.item.h < 1.2) continue;
      if (e.item.h < 0.05) continue;
      this.items.push({ rect: e.rect, y0: e.bottom, y1: e.bottom + e.item.h });
    }
  }

  /** Every walkable surface height under a plan point. */
  surfaces(x: number, y: number, out: number[] = []): number[] {
    out.length = 0;
    out.push(0);
    const m = this.model;
    for (const lm of m.levels) {
      const open = inFloorOpening(lm, x, y);
      const room = open ? null : roomAt(lm, x, y);
      if (room) out.push(room.floorY);
      else if (!open && hasFloorAt(lm, x, y)) out.push(lm.elevation);
    }
    for (const s of this.steps) if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) out.push(s.top);
    if (m.roofOutline.length >= 3 && pointInPoly(x, y, m.roofOutline)) out.push(m.roofTop);
    return out;
  }

  /** Highest surface the walker standing at `ground` can step onto here. */
  floorAt(x: number, y: number, ground: number): number {
    let best = -Infinity;
    for (const s of this.surfaces(x, y, tmpSurf)) if (s <= ground + STEP_UP + 1e-4 && s > best) best = s;
    return best === -Infinity ? 0 : best;
  }

  /** Lowest thing overhead within `radius` of the point (slab / roof soffits, beams, stair undersides). */
  ceilingAt(x: number, y: number, ground: number, radius: number): number {
    let c = Infinity;
    const m = this.model;
    const limit = ground + STEP_UP + 0.05;
    const probe = (px: number, py: number) => {
      for (const lm of m.levels) {
        const b = lm.elevation - lm.slab;
        if (b <= limit || b >= c || lm.onGrade) continue;
        if (hasFloorAt(lm, px, py)) c = b;
      }
      if (m.roofSoffit > limit && m.roofSoffit < c && m.roofOutline.length >= 3 && pointInPoly(px, py, m.roofOutline)) c = m.roofSoffit;
    };
    probe(x, y);
    if (radius > 0.01) for (let k = 0; k < 6; k++) probe(x + Math.cos((k * Math.PI) / 3) * radius, y + Math.sin((k * Math.PI) / 3) * radius);
    for (const b of this.beams) if (b.bottom > limit && b.bottom < c && distToORect(b.rect, x, y) <= radius) c = b.bottom;
    // a stair block overhead counts only when there is room to walk beneath it; lower ones are solid obstacles
    for (const s of this.steps) if (s.top > limit && s.under >= ground + MIN_CLEAR && s.under < c && distToORect(s.rect, x, y) <= radius) c = s.under;
    return c;
  }

  /** Push the walker's circle out of everything solid at its height. */
  resolve(x: number, y: number, ground: number): [number, number] {
    // the body reaches from just above step height to head height, but never into a slab the walker is under or
    // about to duck under (coming down a stair, the head is above the next floor until the walker stoops)
    const lo = ground + STEP_UP + 0.06;
    const hi = Math.max(lo + 0.3, Math.min(ground + 1.7, this.ceilingAt(x, y, ground, RADIUS + 0.1) - 0.06));
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const hit = (c: Collider, r: number) => {
        if (c.y1 <= lo || c.y0 >= hi) return;
        const p = pushCircleOutOfORect(c.rect, x, y, r);
        if (p) { x = p[0]; y = p[1]; moved = true; }
      };
      for (const c of this.statics) hit(c, RADIUS);
      for (const c of this.items) hit(c, ITEM_RADIUS);
      // stair blocks too high to step on and too low to walk under
      for (const s of this.steps) {
        if (s.top <= ground + STEP_UP + 1e-3 || s.under >= ground + MIN_CLEAR) continue;
        const p = pushCircleOutOfORect(s.rect, x, y, 0.07);
        if (p) { x = p[0]; y = p[1]; moved = true; }
      }
      if (!moved) break;
    }
    return [x, y];
  }
}

const tmpSurf: number[] = [];

export interface WalkPose {
  x: number;
  y: number;
  ground: number;
  yaw: number;
  pitch: number;
}

export class WalkControls {
  enabled = false;
  x = 0;
  y = 0;
  /** true surface height under the walker */
  ground = 0;
  /** eased height the camera stands on */
  feet = 0;
  eye = EYE;
  yaw = 0;
  pitch = 0;
  locked = false;
  /** set by the viewer while a placement / drag is using the pointer */
  suspendLook = false;
  private vx = 0;
  private vy = 0;
  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private dirty = true;
  world: WalkWorld | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement) {
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onLock);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onLock);
    this.unlock();
  }

  setPose(p: WalkPose): void {
    this.x = p.x; this.y = p.y; this.ground = this.feet = p.ground; this.yaw = p.yaw; this.pitch = p.pitch;
    this.vx = this.vy = 0;
    this.eye = EYE;
    if (this.world) {
      const [nx, ny] = this.world.resolve(this.x, this.y, this.ground);
      this.x = nx; this.y = ny;
      const c = this.world.ceilingAt(this.x, this.y, this.ground, 0.15);
      this.eye = clamp(c - this.ground - HEAD_GAP, 0.6, EYE);
    }
    this.dirty = true;
  }

  /** Where the camera would be for the current state (used by the fly-in). */
  cameraPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    pos.set(this.x, this.feet + this.eye, this.y);
    quat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  unlock(): void {
    if (document.pointerLockElement === this.dom) document.exitPointerLock?.();
  }

  private typing(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled || this.typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'].includes(k)) {
      this.keys.add(k);
      if (k.startsWith('Arrow')) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.dragging = false;
  };

  private onLock = () => {
    this.locked = document.pointerLockElement === this.dom;
    this.dirty = true;
  };

  private onDown = (e: PointerEvent) => {
    if (!this.enabled || this.suspendLook || e.button !== 0) return;
    this.dragging = true;
    this.lastX = this.downX = e.clientX;
    this.lastY = this.downY = e.clientY;
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled || this.suspendLook) return;
    if (this.locked) {
      this.look(e.movementX, e.movementY, 0.0022);
    } else if (this.dragging) {
      this.look(-(e.clientX - this.lastX), -(e.clientY - this.lastY), 0.0045);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    if (!this.enabled || this.suspendLook || this.locked) return;
    // a click (no drag) captures the pointer for mouse-look
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 4 && e.pointerType === 'mouse') {
      try {
        const p = this.dom.requestPointerLock?.() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch { /* pointer lock unavailable: drag-to-look keeps working */ }
    }
  };

  private look(dx: number, dy: number, k: number): void {
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.45, 1.45);
    this.dirty = true;
  }

  /** Advance the walker. Returns true when the camera changed. */
  update(dt: number): boolean {
    if (!this.enabled) return false;
    const w = this.world;
    const K = this.keys;
    let f = 0, s = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
    if (K.has('KeyD')) s += 1;
    if (K.has('KeyA')) s -= 1;
    // arrow left/right turn (keyboard-only walking), Q/E as well
    let turn = 0;
    if (K.has('ArrowLeft') || K.has('KeyQ')) turn += 1;
    if (K.has('ArrowRight') || K.has('KeyE')) turn -= 1;
    if (turn) { this.yaw += turn * 1.9 * dt; this.dirty = true; }
    const run = K.has('ShiftLeft') || K.has('ShiftRight');
    const ducking = this.eye < EYE - 0.12;
    const speed = (run ? 4.2 : 2.1) * (ducking ? 0.55 : 1);
    const len = Math.hypot(f, s) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) in (x, plan y)
    const wx = ((-sin * f + cos * s) / len) * speed, wy = ((-cos * f - sin * s) / len) * speed;
    return this.advance(dt, wx, wy);
  }

  /** Move with a wished velocity (plan m/s), then settle height and head clearance. */
  private advance(dt: number, wx: number, wy: number): boolean {
    const w = this.world;
    const k = 1 - Math.exp(-(wx || wy ? 10 : 14) * dt);
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;
    if (Math.abs(this.vx) < 1e-3 && Math.abs(this.vy) < 1e-3) this.vx = this.vy = 0;

    let moved = false;
    if (w && (this.vx || this.vy)) {
      const dist = Math.hypot(this.vx, this.vy) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.06));
      for (let i = 0; i < n; i++) {
        const tx = this.x + (this.vx * dt) / n, ty = this.y + (this.vy * dt) / n;
        if (this.tryMove(w, tx, ty) || this.tryMove(w, tx, this.y) || this.tryMove(w, this.x, ty)) moved = true;
        else { this.vx *= 0.5; this.vy *= 0.5; break; }
      }
    } else if (!w && (this.vx || this.vy)) {
      this.x += this.vx * dt; this.y += this.vy * dt; moved = true;
    }

    // vertical easing + head clearance
    let changed = moved || this.dirty;
    const df = this.ground - this.feet;
    if (Math.abs(df) > 5e-4) {
      this.feet += df * (1 - Math.exp(-(df > 0 ? 15 : 11) * dt));
      changed = true;
    } else this.feet = this.ground;
    let eyeTarget = EYE, hard = Infinity;
    if (w) {
      // look a little ahead so the duck starts before the beam, and hard-limit by what is right overhead
      const sp = Math.hypot(this.vx, this.vy);
      const ax = sp > 0.05 ? this.x + (this.vx / sp) * 0.4 : this.x, ay = sp > 0.05 ? this.y + (this.vy / sp) * 0.4 : this.y;
      const ahead = Math.min(w.ceilingAt(ax, ay, this.ground, 0.12), w.ceilingAt(this.x, this.y, this.ground, 0.2));
      eyeTarget = clamp(ahead - this.ground - HEAD_GAP - 0.03, 0.55, EYE);
      hard = w.ceilingAt(this.x, this.y, this.ground, 0.16) - HEAD_GAP;
    }
    const de = eyeTarget - this.eye;
    if (Math.abs(de) > 5e-4) {
      this.eye += de * (1 - Math.exp(-(de < 0 ? 16 : 7) * dt));
      changed = true;
    } else this.eye = eyeTarget;
    const camY = Math.min(this.feet + this.eye, hard);
    this.camY = camY;
    if (changed) {
      this.camera.position.set(this.x, camY, this.y);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.updateMatrixWorld();
    }
    this.dirty = false;
    return changed;
  }

  private camY = 0;

  /**
   * Dev / test aid: walk toward each waypoint in turn with the real movement code (no rendering) and report how
   * each leg went: where the walker ended, the floor height there, and the tightest head clearance on the way.
   */
  simulate(points: Vec2[], secondsPerLeg = 14): { reached: boolean; x: number; y: number; ground: number; eye: number; minEye: number; minHeadroom: number }[] {
    const out: { reached: boolean; x: number; y: number; ground: number; eye: number; minEye: number; minHeadroom: number }[] = [];
    const was = this.enabled;
    this.enabled = true;
    const dt = 1 / 60;
    for (const [tx, ty] of points) {
      let reached = false, minEye = Infinity, minHead = Infinity;
      for (let i = 0; i < secondsPerLeg * 60; i++) {
        const dx = tx - this.x, dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.12) { reached = true; break; }
        const sp = this.eye < EYE - 0.12 ? 1.2 : 2.1;
        this.yaw = Math.atan2(-dx, -dy);
        this.advance(dt, (dx / d) * sp, (dy / d) * sp);
        minEye = Math.min(minEye, this.camY - this.feet);
        if (this.world) minHead = Math.min(minHead, this.world.ceilingAt(this.x, this.y, this.ground, 0.05) - this.camY);
      }
      // let the height settle before reporting
      for (let i = 0; i < 40; i++) this.advance(dt, 0, 0);
      out.push({ reached, x: +this.x.toFixed(3), y: +this.y.toFixed(3), ground: +this.ground.toFixed(3), eye: +this.eye.toFixed(3), minEye: +minEye.toFixed(3), minHeadroom: +minHead.toFixed(3) });
    }
    this.enabled = was;
    this.dirty = true;
    return out;
  }

  private tryMove(w: WalkWorld, tx: number, ty: number): boolean {
    if (tx === this.x && ty === this.y) return false;
    const [nx, ny] = w.resolve(tx, ty, this.ground);
    if (Math.hypot(nx - this.x, ny - this.y) < 1e-5) return false;
    const g = w.floorAt(nx, ny, this.ground);
    if (g < this.ground - MAX_DROP) return false;
    if (w.ceilingAt(nx, ny, g, 0.1) - g < MIN_CLEAR) return false;
    this.x = nx; this.y = ny; this.ground = g;
    return true;
  }
}
