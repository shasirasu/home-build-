import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { HouseSpec, Level, Opening, Room, Stair, Vec2, Wall } from '@/types/house';
import { bbox, labelPoint, openingEnds, pointInPolygon, projectOnSeg, segDist, wallCorners, wallLength, dist } from '@/lib/geom';
import { fmtDims, fmtLen, type DisplayUnit } from '@/lib/units';
import { newOpeningId, newRoomId, newStairId, newWallId, straightStair } from '@/lib/derive';
import type { Underlay } from './useUnderlay';
import { useStore } from '@/lib/store';

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'opening' | 'stair' | 'calibrate' | 'pan';
export type PlanSel = { kind: 'wall' | 'room' | 'opening' | 'stair'; id: string } | null;

interface Props {
  spec: HouseSpec;
  levelIndex: number;
  underlay: Underlay | null;
  frame: { origin: Vec2; unitsPerMetre: number } | null;
  underlayOpacity: number;
  tool: Tool;
  wallThickness: number;
  unit: DisplayUnit;
  selection: PlanSel;
  onSelect: (s: PlanSel) => void;
  onEdit: (fn: (level: Level) => void) => void;
  onCalibrate: (a: Vec2, b: Vec2) => void;
  onToolDone?: () => void;
}

type View = { s: number; tx: number; ty: number };

const ROOM_TINT = '#efe6d2';

export function PlanCanvas(p: Props) {
  const { spec, levelIndex, underlay, frame, tool, unit, selection } = p;
  const level = spec.levels[levelIndex];
  const below = spec.levels[levelIndex - 1];
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ s: 40, tx: 60, ty: 60 });
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [chain, setChain] = useState<Vec2 | null>(null);
  const [drag, setDrag] = useState<{ type: 'pan' | 'rect' | 'handle' | 'slide'; start: Vec2; client: Vec2; view: View; which?: 'a' | 'b'; id?: string } | null>(null);
  const [calib, setCalib] = useState<Vec2[]>([]);
  const [space, setSpace] = useState(false);
  const snapStep = unit === 'ft' ? 0.0254 : 0.01;
  const dark = useStore((st) => st.theme) === 'dark';

  const upm = frame?.unitsPerMetre ?? 46;
  const origin = frame?.origin ?? [0, 0];
  const ul = underlay ? { x: -origin[0] / upm, y: -origin[1] / upm, w: underlay.width / upm, h: underlay.height / upm } : null;

  // Fit on first render and when the level changes: frame the walls, else the drawing's frame.
  const fit = useCallback(() => {
    const el = svg.current;
    if (!el) return;
    const pts: Vec2[] = level.walls.flatMap((w) => [w.a, w.b]);
    let b = pts.length ? bbox(pts) : ul ? { x0: ul.x, y0: ul.y, x1: ul.x + ul.w, y1: ul.y + ul.h } : { x0: 0, y0: 0, x1: 12, y1: 12 };
    if (!pts.length && frame && ul) b = { x0: -1, y0: -1, x1: Math.min(ul.x + ul.w, 14), y1: Math.min(ul.y + ul.h, 14) };
    const r = el.getBoundingClientRect();
    const pad = 48;
    const s = Math.min((r.width - pad * 2) / Math.max(1, b.x1 - b.x0), (r.height - pad * 2) / Math.max(1, b.y1 - b.y0));
    setView({ s, tx: (r.width - (b.x1 - b.x0) * s) / 2 - b.x0 * s, ty: (r.height - (b.y1 - b.y0) * s) / 2 - b.y0 * s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id, !!ul, frame?.unitsPerMetre]);
  useLayoutEffect(() => { fit(); }, [fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Space') { setSpace(true); e.preventDefault(); }
      if (e.key === 'Escape' || e.key === 'Enter') { setChain(null); setCalib([]); }
      if (e.key === 'f' || e.key === 'F') fit();
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, [fit]);
  useEffect(() => { setChain(null); setCalib([]); }, [tool, levelIndex]);

  const toPlan = (cx: number, cy: number, v = view): Vec2 => {
    const r = svg.current!.getBoundingClientRect();
    return [(cx - r.left - v.tx) / v.s, (cy - r.top - v.ty) / v.s];
  };

  const endpoints = useMemo(() => [...level.walls, ...(below?.walls ?? [])].flatMap((w) => [w.a, w.b]), [level.walls, below?.walls]);
  const snap = (q: Vec2, from?: Vec2 | null, free = false): Vec2 => {
    const tol = 10 / view.s;
    let best: Vec2 | null = null;
    let bd = tol;
    for (const e of endpoints) { const d = dist(e, q); if (d < bd) { bd = d; best = e; } }
    if (best) return [best[0], best[1]];
    let out: Vec2 = [Math.round(q[0] / snapStep) * snapStep, Math.round(q[1] / snapStep) * snapStep];
    if (from && !free) {
      if (Math.abs(out[0] - from[0]) > Math.abs(out[1] - from[1])) out = [out[0], from[1]];
      else out = [from[0], out[1]];
    }
    return out;
  };

  const nearestWall = (q: Vec2): { w: Wall; t: number; d: number } | null => {
    let best: { w: Wall; t: number; d: number } | null = null;
    for (const w of level.walls) {
      const pr = projectOnSeg(q, w.a, w.b);
      if (pr.d <= w.thickness / 2 + 12 / view.s && (!best || pr.d < best.d)) best = { w, t: pr.t, d: pr.d };
    }
    return best;
  };

  const hit = (q: Vec2): PlanSel => {
    for (const o of level.openings) {
      const w = level.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const [e0, e1] = openingEnds(w, o);
      if (segDist(q, e0, e1) < w.thickness / 2 + 4 / view.s) return { kind: 'opening', id: o.id };
    }
    for (const w of level.walls) if (pointInPolygon(q, wallCorners(w))) return { kind: 'wall', id: w.id };
    for (const s of level.stairs) if (s.steps.some((st) => q[0] >= Math.min(st.x0, st.x1) && q[0] <= Math.max(st.x0, st.x1) && q[1] >= Math.min(st.y0, st.y1) && q[1] <= Math.max(st.y0, st.y1))) return { kind: 'stair', id: s.id };
    for (const r of level.rooms) if (pointInPolygon(q, r.polygon)) return { kind: 'room', id: r.id };
    return null;
  };

  const addOpening = (q: Vec2) => {
    const nw = nearestWall(q);
    if (!nw) return;
    const L = wallLength(nw.w);
    const kind = tool === 'door' ? 'door' : tool === 'window' ? 'window' : 'opening';
    const width = Math.min(L - 0.05, kind === 'door' ? (nw.w.kind === 'exterior' ? 1.05 : 0.9) : kind === 'window' ? 1.2 : 0.9);
    if (width < 0.3) return;
    const at = Math.min(Math.max(nw.t * L, width / 2), L - width / 2);
    const o: Opening = kind === 'door'
      ? { id: newOpeningId(), wallId: nw.w.id, kind, at, width, height: 2.1, sill: 0, leaf: 'single', hinge: 'a', swing: 1, style: nw.w.kind === 'exterior' ? 'teak-panel' : 'flush', name: nw.w.kind === 'exterior' ? 'Entrance door' : 'Door' }
      : kind === 'window'
        ? { id: newOpeningId(), wallId: nw.w.id, kind, at, width, height: 1.2, sill: 0.9, leaf: 'double', style: 'casement', name: 'Window' }
        : { id: newOpeningId(), wallId: nw.w.id, kind, at, width, height: 2.1, sill: 0, leaf: 'none', name: 'Opening' };
    p.onEdit((lv) => { lv.openings.push(o); });
    p.onSelect({ kind: 'opening', id: o.id });
  };

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const q = toPlan(e.clientX, e.clientY);
    const client: Vec2 = [e.clientX, e.clientY];
    if (e.button === 1 || tool === 'pan' || space) { setDrag({ type: 'pan', start: q, client, view }); return; }
    if (e.button !== 0) { setChain(null); return; }
    switch (tool) {
      case 'select': {
        // Endpoint handles of a selected wall first, then sliding a selected opening.
        if (selection?.kind === 'wall') {
          const w = level.walls.find((x) => x.id === selection.id);
          if (w) for (const which of ['a', 'b'] as const) if (dist(w[which], q) < 9 / view.s) { setDrag({ type: 'handle', start: q, client, view, which, id: w.id }); return; }
        }
        const h = hit(q);
        p.onSelect(h);
        if (h?.kind === 'opening' && selection?.kind === 'opening' && selection.id === h.id) setDrag({ type: 'slide', start: q, client, view, id: h.id });
        else if (!h) setDrag({ type: 'pan', start: q, client, view });
        return;
      }
      case 'wall': {
        const pt = snap(q, chain, e.shiftKey);
        if (!chain) { setChain(pt); return; }
        if (dist(chain, pt) < 0.05) { setChain(null); return; }
        const w: Wall = { id: newWallId(), a: chain, b: pt, thickness: p.wallThickness, kind: p.wallThickness >= 0.18 ? 'exterior' : 'partition' };
        p.onEdit((lv) => { lv.walls.push(w); });
        setChain(pt);
        return;
      }
      case 'room':
      case 'stair':
        setDrag({ type: 'rect', start: snap(q, null, true), client, view });
        return;
      case 'door':
      case 'window':
      case 'opening':
        addOpening(q);
        return;
      case 'calibrate': {
        const next = [...calib, q];
        if (next.length === 2) {
          const toDrawing = (v: Vec2): Vec2 => [origin[0] + v[0] * upm, origin[1] + v[1] * upm];
          p.onCalibrate(toDrawing(next[0]), toDrawing(next[1]));
          setCalib([]);
        } else setCalib(next);
        return;
      }
    }
  };

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const q = toPlan(e.clientX, e.clientY, drag?.view);
    setCursor(q);
    if (!drag) return;
    if (drag.type === 'pan') {
      setView({ ...drag.view, tx: drag.view.tx + e.clientX - drag.client[0], ty: drag.view.ty + e.clientY - drag.client[1] });
    } else if (drag.type === 'handle' && drag.id && drag.which) {
      const w = level.walls.find((x) => x.id === drag.id);
      const other = w ? (drag.which === 'a' ? w.b : w.a) : null;
      const pt = snap(q, other, e.shiftKey);
      p.onEdit((lv) => { const ww = lv.walls.find((x) => x.id === drag.id); if (ww) ww[drag.which!] = pt; });
    } else if (drag.type === 'slide' && drag.id) {
      p.onEdit((lv) => {
        const o = lv.openings.find((x) => x.id === drag.id);
        const w = o && lv.walls.find((x) => x.id === o.wallId);
        if (!o || !w) return;
        const L = wallLength(w);
        const t = projectOnSeg(q, w.a, w.b).t;
        o.at = Math.round(Math.min(Math.max(t * L, o.width / 2), L - o.width / 2) / snapStep) * snapStep;
      });
    }
  };

  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (drag?.type === 'rect') {
      const end = snap(toPlan(e.clientX, e.clientY), null, true);
      const [x0, x1] = [Math.min(drag.start[0], end[0]), Math.max(drag.start[0], end[0])];
      const [y0, y1] = [Math.min(drag.start[1], end[1]), Math.max(drag.start[1], end[1])];
      if (x1 - x0 > 0.3 && y1 - y0 > 0.3) {
        if (tool === 'room') {
          const n = level.rooms.length + 1;
          const r: Room = { id: newRoomId(), name: `Room ${n}`, type: 'other', polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], floor: 'vitrified-ivory', wallColor: ROOM_TINT, sizeLabel: fmtDims(x1 - x0, y1 - y0, 'ft').replace(/ /g, '') };
          p.onEdit((lv) => { lv.rooms.push(r); });
          p.onSelect({ kind: 'room', id: r.id });
        } else {
          const dx = end[0] - drag.start[0], dy = end[1] - drag.start[1];
          const dir = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 's' : 'n') : dx > 0 ? 'e' : 'w';
          const st = straightStair(newStairId(), x0, y0, x1, y1, level.height, dir);
          p.onEdit((lv) => { lv.stairs.push(st); });
          p.onSelect({ kind: 'stair', id: st.id });
        }
        p.onToolDone?.();
      }
    }
    setDrag(null);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(800, Math.max(4, view.s * k));
    const f = s / view.s;
    setView({ s, tx: mx - (mx - view.tx) * f, ty: my - (my - view.ty) * f });
  };

  // ---------------------------------------------------------------------------------------------- render
  const sel = (kind: string, id: string) => selection?.kind === kind && selection.id === id;
  const ink = 'var(--foreground)';
  const red = 'var(--primary)';
  const fs = (px: number) => px / view.s; // font size in metres for a pixel size

  const wallsById = new Map(level.walls.map((w) => [w.id, w]));
  const preview: Vec2 | null = cursor && (tool === 'wall') ? snap(cursor, chain, false) : null;
  const rectPreview = drag?.type === 'rect' && cursor ? { a: drag.start, b: cursor } : null;
  const openingPreview = cursor && (tool === 'door' || tool === 'window' || tool === 'opening') ? nearestWall(cursor) : null;
  const cursorStyle = drag?.type === 'pan' ? 'grabbing' : tool === 'pan' || space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <svg
      ref={svg}
      className="absolute inset-0 size-full touch-none select-none bg-surface-2"
      style={{ cursor: cursorStyle }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setCursor(null)}
      onWheel={onWheel}
      onDoubleClick={() => setChain(null)}
      onContextMenu={(e) => { e.preventDefault(); setChain(null); }}
      role="application"
      aria-label={`${level.name} plan editor`}
    >
      <defs>
        <pattern id="plan-grid" width={unit === 'ft' ? 0.3048 : 0.5} height={unit === 'ft' ? 0.3048 : 0.5} patternUnits="userSpaceOnUse">
          <path d={`M ${unit === 'ft' ? 0.3048 : 0.5} 0 L 0 0 0 ${unit === 'ft' ? 0.3048 : 0.5}`} fill="none" stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
        <rect x={-200} y={-200} width={400} height={400} fill="url(#plan-grid)" opacity={view.s > 14 ? 1 : 0} />
        {ul && underlay && <image href={underlay.dataUrl} x={ul.x} y={ul.y} width={ul.w} height={ul.h} opacity={p.underlayOpacity} preserveAspectRatio="none" style={{ mixBlendMode: dark ? 'screen' : 'multiply', filter: dark ? 'invert(1) hue-rotate(180deg)' : undefined }} />}

        {/* Level below, dashed, to align upper floors */}
        {below?.walls.map((w) => (
          <polygon key={`b-${w.id}`} points={wallCorners(w).map((v) => v.join(',')).join(' ')} fill="none" stroke={ink} strokeOpacity={0.3} strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}

        {/* Rooms */}
        {level.rooms.map((r) => {
          const lp = labelPoint(r.polygon);
          const b = bbox(r.polygon);
          return (
            <g key={r.id}>
              <polygon points={r.polygon.map((v) => v.join(',')).join(' ')} fill={r.wallColor} fillOpacity={sel('room', r.id) ? 0.55 : 0.32} stroke={sel('room', r.id) ? red : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {view.s > 12 && (
                <text x={lp[0]} y={lp[1]} textAnchor="middle" fontSize={fs(12)} fill={ink} style={{ fontWeight: 600, pointerEvents: 'none' }}>
                  {r.name}
                  <tspan x={lp[0]} dy={fs(14)} fontWeight={400} fill="var(--muted-foreground)">{r.sizeLabel ?? fmtDims(b.x1 - b.x0, b.y1 - b.y0, unit)}</tspan>
                </text>
              )}
            </g>
          );
        })}

        {/* Floor openings (stairwells) */}
        {level.floorOpenings.map((poly, i) => (
          <polygon key={`fo${i}`} points={poly.map((v) => v.join(',')).join(' ')} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}

        {/* Stairs */}
        {level.stairs.map((s) => <StairGlyph key={s.id} s={s} selected={sel('stair', s.id)} />)}

        {/* Walls */}
        {level.walls.map((w) => (
          <polygon key={w.id} points={wallCorners(w).map((v) => v.join(',')).join(' ')} fill={ink} fillOpacity={sel('wall', w.id) ? 0.95 : 0.78} stroke={sel('wall', w.id) ? red : ink} strokeWidth={sel('wall', w.id) ? 2 : 1} vectorEffect="non-scaling-stroke" />
        ))}

        {/* Openings */}
        {level.openings.map((o) => {
          const w = wallsById.get(o.wallId);
          return w ? <OpeningGlyph key={o.id} w={w} o={o} selected={sel('opening', o.id)} /> : null;
        })}

        {/* Structure columns on the ground floor */}
        {levelIndex === 0 && spec.structure.columns.map((c) => <rect key={c.id} x={c.x - c.w / 2} y={c.y - c.d / 2} width={c.w} height={c.d} fill={ink} />)}

        {/* Selected wall: handles + length in drawing red */}
        {selection?.kind === 'wall' && (() => {
          const w = wallsById.get(selection.id);
          if (!w) return null;
          const m: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
          return (
            <g>
              {[w.a, w.b].map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={fs(5)} fill="var(--surface)" stroke={red} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              <text x={m[0]} y={m[1] - w.thickness / 2 - fs(6)} textAnchor="middle" fontSize={fs(12)} fill={red} fontWeight={600} paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={fs(4)}>{fmtLen(wallLength(w), unit)}</text>
            </g>
          );
        })()}

        {/* Tool previews */}
        {chain && preview && (
          <g pointerEvents="none">
            <line x1={chain[0]} y1={chain[1]} x2={preview[0]} y2={preview[1]} stroke={red} strokeWidth={Math.max(2, p.wallThickness * view.s)} strokeOpacity={0.45} vectorEffect="non-scaling-stroke" />
            <text x={(chain[0] + preview[0]) / 2} y={(chain[1] + preview[1]) / 2 - fs(10)} textAnchor="middle" fontSize={fs(12)} fill={red} fontWeight={600} paintOrder="stroke" stroke="var(--surface-2)" strokeWidth={fs(4)}>{fmtLen(dist(chain, preview), unit)}</text>
          </g>
        )}
        {tool === 'wall' && preview && <circle cx={preview[0]} cy={preview[1]} r={fs(4)} fill={red} pointerEvents="none" />}
        {rectPreview && (
          <g pointerEvents="none">
            <rect x={Math.min(rectPreview.a[0], rectPreview.b[0])} y={Math.min(rectPreview.a[1], rectPreview.b[1])} width={Math.abs(rectPreview.b[0] - rectPreview.a[0])} height={Math.abs(rectPreview.b[1] - rectPreview.a[1])} fill={red} fillOpacity={0.1} stroke={red} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
            <text x={(rectPreview.a[0] + rectPreview.b[0]) / 2} y={(rectPreview.a[1] + rectPreview.b[1]) / 2} textAnchor="middle" fontSize={fs(12)} fill={red} fontWeight={600}>{fmtDims(Math.abs(rectPreview.b[0] - rectPreview.a[0]), Math.abs(rectPreview.b[1] - rectPreview.a[1]), unit)}</text>
          </g>
        )}
        {openingPreview && (() => {
          const { w, t } = openingPreview;
          const L = wallLength(w);
          const width = tool === 'window' ? 1.2 : tool === 'door' && w.kind === 'exterior' ? 1.05 : 0.9;
          const at = Math.min(Math.max(t * L, width / 2), L - width / 2);
          const [e0, e1] = openingEnds(w, { at, width } as Opening);
          return <line x1={e0[0]} y1={e0[1]} x2={e1[0]} y2={e1[1]} stroke={red} strokeWidth={Math.max(3, w.thickness * view.s)} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
        })()}
        {tool === 'calibrate' && calib.map((c, i) => (
          <g key={i} pointerEvents="none">
            <circle cx={c[0]} cy={c[1]} r={fs(6)} fill="none" stroke={red} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {cursor && <line x1={c[0]} y1={c[1]} x2={cursor[0]} y2={cursor[1]} stroke={red} strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          </g>
        ))}
      </g>
      {cursor && (
        <text x={10} y={20} fontSize={11} fill="var(--muted-foreground)" className="tnum">{fmtLen(cursor[0], unit)}, {fmtLen(cursor[1], unit)}</text>
      )}
    </svg>
  );
}

function OpeningGlyph({ w, o, selected }: { w: Wall; o: Opening; selected: boolean }) {
  const [e0, e1] = openingEnds(w, o);
  const L = wallLength(w) || 1;
  const u: Vec2 = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const n: Vec2 = [-u[1], u[0]];
  const t = w.thickness / 2;
  const cut = [
    [e0[0] + n[0] * t, e0[1] + n[1] * t], [e1[0] + n[0] * t, e1[1] + n[1] * t],
    [e1[0] - n[0] * t, e1[1] - n[1] * t], [e0[0] - n[0] * t, e0[1] - n[1] * t],
  ].map((v) => v.join(',')).join(' ');
  const stroke = selected ? 'var(--primary)' : 'var(--foreground)';
  const sw = selected ? 2 : 1.2;
  const sgn = o.swing ?? 1;
  const leaf = (h: Vec2, other: Vec2, len: number) => {
    const tip: Vec2 = [h[0] + n[0] * sgn * len, h[1] + n[1] * sgn * len];
    const sweep = (u[0] * (other[0] - h[0]) + u[1] * (other[1] - h[1])) * sgn > 0 ? 0 : 1;
    return (
      <>
        <line x1={h[0]} y1={h[1]} x2={tip[0]} y2={tip[1]} stroke={stroke} strokeWidth={sw * 1.4} vectorEffect="non-scaling-stroke" />
        <path d={`M ${tip[0]} ${tip[1]} A ${len} ${len} 0 0 ${sweep} ${other[0]} ${other[1]}`} fill="none" stroke={stroke} strokeWidth={sw * 0.7} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      </>
    );
  };
  return (
    <g>
      <polygon points={cut} fill="var(--surface-2)" stroke={stroke} strokeWidth={selected ? 2 : 0.6} vectorEffect="non-scaling-stroke" />
      {o.kind === 'window' || o.kind === 'ventilator' ? (
        <>
          <line x1={e0[0] + n[0] * t * 0.3} y1={e0[1] + n[1] * t * 0.3} x2={e1[0] + n[0] * t * 0.3} y2={e1[1] + n[1] * t * 0.3} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
          <line x1={e0[0] - n[0] * t * 0.3} y1={e0[1] - n[1] * t * 0.3} x2={e1[0] - n[0] * t * 0.3} y2={e1[1] - n[1] * t * 0.3} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
        </>
      ) : o.leaf === 'single' ? (
        o.hinge === 'b' ? leaf(e1, e0, o.width) : leaf(e0, e1, o.width)
      ) : o.leaf === 'double' ? (
        <>
          {leaf(e0, [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], o.width / 2)}
          {leaf(e1, [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], o.width / 2)}
        </>
      ) : null}
      {o.assumed && <circle cx={(e0[0] + e1[0]) / 2} cy={(e0[1] + e1[1]) / 2} r={0.06} fill="var(--warning)" />}
    </g>
  );
}

function StairGlyph({ s, selected }: { s: Stair; selected: boolean }) {
  const stroke = selected ? 'var(--primary)' : 'var(--foreground)';
  return (
    <g>
      {s.steps.map((st, i) => (
        <rect key={i} x={Math.min(st.x0, st.x1)} y={Math.min(st.y0, st.y1)} width={Math.abs(st.x1 - st.x0)} height={Math.abs(st.y1 - st.y0)} fill={st.kind === 'landing' ? 'var(--surface-3)' : 'var(--surface)'} fillOpacity={0.85} stroke={stroke} strokeWidth={selected ? 1.6 : 0.8} vectorEffect="non-scaling-stroke" />
      ))}
      {s.steps.length > 1 && (
        <polyline
          points={s.steps.map((st) => `${(st.x0 + st.x1) / 2},${(st.y0 + st.y1) / 2}`).join(' ')}
          fill="none" stroke="var(--primary)" strokeWidth={1.4} markerEnd="" vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
