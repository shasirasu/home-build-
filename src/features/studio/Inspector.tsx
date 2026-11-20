import { Copy, Crosshair, Footprints, Lock, RotateCcw, RotateCw, Trash2, Unlock, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { catalogByKind } from '@/data/catalog';
import { FINISHES, PAINTS, finishById } from '@/data/finishes';
import { useProject, useStore } from '@/lib/store';
import { dist, labelPoint, polygonArea, polygonPerimeter, uid, wallHeight, wallLength } from '@/lib/geom';
import { fmtArea, fmtINRRange, fmtLen, fmtSection, parseLen } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Field, SectionTitle, Select, Swatch, TextInput } from '@/components/ui/controls';
import type { Opening, PlacedItem, Room } from '@/types/house';
import { useViewer } from './viewerContext';

function Prop({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium tnum">{v}</span>
    </div>
  );
}

function LenInput({ value, onCommit, label }: { value: number; onCommit: (m: number) => void; label: string }) {
  const unit = useStore((s) => s.unit);
  return (
    <Field label={label}>
      <TextInput
        key={`${value}-${unit}`}
        defaultValue={fmtLen(value, unit).replace(' m', '')}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const m = parseLen(e.target.value, unit);
          if (m && m > 0.01 && Math.abs(m - value) > 1e-4) onCommit(m);
          else e.target.value = fmtLen(value, unit).replace(' m', '');
        }}
      />
    </Field>
  );
}

function Header({ title, sub, badge }: { title: ReactNode; sub?: ReactNode; badge?: ReactNode }) {
  const setSelection = useStore((s) => s.setSelection);
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        {badge}
      </div>
      <Button variant="quiet" size="icon-sm" aria-label="Close" onClick={() => setSelection(null)}><X /></Button>
    </div>
  );
}

const Assumed = () => <span className="mt-1.5 inline-flex rounded bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-warning">Assumed · not drawn on the plan</span>;

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const project = useProject();
  const unit = useStore((s) => s.unit);
  const { updateItems, updateSpec, setSelection, setMode, setDisplay } = useStore.getState();
  const viewer = useViewer();
  if (!selection) return null;
  const spec = project.spec;

  if (selection.type === 'item') {
    const it = project.items.find((i) => i.uid === selection.uid);
    if (!it) return null;
    const c = catalogByKind(it.kind);
    const room = spec.levels.find((l) => l.id === it.levelId)?.rooms.find((r) => r.id === it.roomId);
    const patch = (p: Partial<PlacedItem>) => updateItems((items) => items.map((x) => (x.uid === it.uid ? { ...x, ...p } : x)));
    const rotate = (deg: number) => patch({ rot: Math.round(((it.rot + (deg * Math.PI) / 180) % (2 * Math.PI)) * 10000) / 10000 });
    return (
      <>
        <Header title={c?.name ?? it.kind} sub={`${room?.name ?? 'Outside'} · ${spec.levels.find((l) => l.id === it.levelId)?.name ?? ''}`} />
        <div className="grid gap-3 px-3 py-3">
          {c && <p className="text-[13px] text-muted-foreground">{c.material}</p>}
          <div className="grid grid-cols-3 gap-2">
            <LenInput label="Width" value={it.w} onCommit={(w) => patch({ w })} />
            <LenInput label="Depth" value={it.d} onCommit={(d) => patch({ d })} />
            <LenInput label="Height" value={it.h} onCommit={(h) => patch({ h })} />
          </div>
          {c?.mount === 'wall' && <LenInput label="Height above floor" value={it.elevation ?? 0} onCommit={(elevation) => patch({ elevation })} />}
          {c && c.colors.length > 1 && (
            <div>
              <p className="mb-1.5 text-[13px] text-muted-foreground">Colour</p>
              <div className="flex flex-wrap gap-2">
                {c.colors.map((col) => <Swatch key={col} color={col} title={col} active={(it.color ?? c.colors[0]) === col} onClick={() => patch({ color: col })} />)}
                <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-border-strong" title="Custom colour">
                  <input type="color" value={it.color ?? c.colors[0]} onChange={(e) => patch({ color: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="Custom colour" />
                  <span className="grid size-full place-items-center text-xs text-muted-foreground">+</span>
                </label>
              </div>
            </div>
          )}
          {c && c.price[1] > 0 && <Prop k="Indicative price" v={fmtINRRange(c.price)} />}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => rotate(-90)} disabled={it.locked} title="Rotate 90° left"><RotateCcw /> 90°</Button>
            <Button size="sm" onClick={() => rotate(90)} disabled={it.locked} title="Rotate 90° right"><RotateCw /> 90°</Button>
            <Button size="sm" onClick={() => viewer.current?.focusItem(it.uid)}><Crosshair /> Find</Button>
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            <Button size="sm" onClick={() => { const copy = { ...it, uid: uid('it'), x: it.x + 0.3, y: it.y + 0.3, locked: false }; updateItems((items) => [...items, copy]); setSelection({ type: 'item', uid: copy.uid }); }}><Copy /> Duplicate</Button>
            <Button size="sm" onClick={() => patch({ locked: !it.locked })}>{it.locked ? <><Unlock /> Unlock</> : <><Lock /> Lock</>}</Button>
            <Button size="sm" variant="danger" onClick={() => { updateItems((items) => items.filter((x) => x.uid !== it.uid)); setSelection(null); }}><Trash2 /> Remove</Button>
          </div>
        </div>
      </>
    );
  }

  if (selection.type === 'room') {
    const li = spec.levels.findIndex((l) => l.id === selection.levelId);
    const lv = spec.levels[li];
    const r = lv?.rooms.find((x) => x.id === selection.roomId);
    if (!lv || !r) return null;
    const patchRoom = (fn: (room: Room) => void) => updateSpec((s) => { const rr = s.levels[li].rooms.find((x) => x.id === r.id); if (rr) fn(rr); });
    const floorFinishes = FINISHES.filter((f) => f.use !== 'wall');
    const n = project.items.filter((i) => i.roomId === r.id).length;
    return (
      <>
        <Header title={r.name} sub={`${lv.name} · ${r.sizeLabel ?? 'traced room'}`} />
        <div className="grid gap-3 px-3 py-3">
          <div>
            <Prop k="Floor area" v={fmtArea(polygonArea(r.polygon), unit)} />
            <Prop k="Perimeter" v={fmtLen(polygonPerimeter(r.polygon), unit)} />
            <Prop k="Ceiling height" v={fmtLen(wallHeight(spec.levels, li, spec.roof.slab), unit)} />
            <Prop k="Furniture" v={`${n} item${n === 1 ? '' : 's'}`} />
          </div>
          <Field label="Name"><TextInput key={r.id} defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && patchRoom((x) => { x.name = e.target.value.trim(); })} /></Field>
          <Field label="Floor">
            <Select value={r.floor} onChange={(e) => patchRoom((x) => { x.floor = e.target.value; })}>
              {floorFinishes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <div className="flex gap-1.5">
            {floorFinishes.map((f) => <Swatch key={f.id} color={f.color} title={f.name} active={r.floor === f.id} onClick={() => patchRoom((x) => { x.floor = f.id; })} />)}
          </div>
          <div>
            <p className="mb-1.5 text-[13px] text-muted-foreground">Wall paint</p>
            <div className="flex flex-wrap gap-2">
              {PAINTS.map((p) => <Swatch key={p.id} color={p.hex} title={p.name} active={r.wallColor.toLowerCase() === p.hex} onClick={() => patchRoom((x) => { x.wallColor = p.hex; })} />)}
            </div>
          </div>
          {r.dado && (
            <Field label={`Wall tiles to ${fmtLen(r.dado.height, unit)}`}>
              <Select value={r.dado.finish} onChange={(e) => patchRoom((x) => { if (x.dado) x.dado.finish = e.target.value; })}>
                {FINISHES.filter((f) => f.use !== 'floor').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            <Button size="sm" onClick={() => viewer.current?.focusRoom(lv.id, r.id)}><Crosshair /> Frame</Button>
            {!r.outdoor && (
              <Button size="sm" variant="primary" onClick={() => { const [x, y] = labelPoint(r.polygon); setDisplay({ level: 'all' }); setMode('walk'); requestAnimationFrame(() => viewer.current?.enterWalk({ levelId: lv.id, x, y })); }}>
                <Footprints /> Walk in
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Floor finish: {finishById(r.floor).name}.</p>
        </div>
      </>
    );
  }

  if (selection.type === 'opening') {
    const li = spec.levels.findIndex((l) => l.id === selection.levelId);
    const lv = spec.levels[li];
    const o = lv?.openings.find((x) => x.id === selection.openingId);
    if (!lv || !o) return null;
    const w = lv.walls.find((x) => x.id === o.wallId);
    const patch = (fn: (op: Opening) => void) => updateSpec((s) => { const oo = s.levels[li].openings.find((x) => x.id === o.id); if (oo) fn(oo); });
    const maxW = w ? wallLength(w) : 10;
    return (
      <>
        <Header title={o.name ?? o.kind} sub={`${lv.name} · ${o.kind}${o.style ? ` · ${o.style.replace('-', ' ')}` : ''}`} badge={o.assumed ? <Assumed /> : undefined} />
        <div className="grid gap-3 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <LenInput label="Width" value={o.width} onCommit={(v) => patch((x) => { x.width = Math.min(v, maxW); x.at = Math.min(Math.max(x.at, x.width / 2), maxW - x.width / 2); })} />
            <LenInput label="Height" value={o.height} onCommit={(v) => patch((x) => { x.height = v; })} />
            {o.kind !== 'door' && o.kind !== 'opening' && <LenInput label="Sill" value={o.sill} onCommit={(v) => patch((x) => { x.sill = v; })} />}
            <LenInput label="From wall start" value={o.at - o.width / 2} onCommit={(v) => patch((x) => { x.at = Math.min(Math.max(v + x.width / 2, x.width / 2), maxW - x.width / 2); })} />
          </div>
          <Field label="Type">
            <Select value={o.style ?? ''} onChange={(e) => patch((x) => { x.style = e.target.value as typeof o.style; })}>
              {o.kind === 'door' && ['teak-panel', 'flush', 'pvc', 'steel'].map((s) => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
              {(o.kind === 'window' || o.kind === 'ventilator') && ['casement', 'sliding-alu', 'louvre'].map((s) => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
              {o.kind === 'opening' && ['arch', ''].map((s) => <option key={s} value={s}>{s || 'square opening'}</option>)}
            </Select>
          </Field>
          {(o.assumed || o.kind === 'window' || o.kind === 'ventilator') && (
            <div className="border-t border-border pt-3">
              <Button size="sm" variant="danger" onClick={() => { updateSpec((s) => { s.levels[li].openings = s.levels[li].openings.filter((x) => x.id !== o.id); }); setSelection(null); }}><Trash2 /> Remove {o.kind}</Button>
            </div>
          )}
        </div>
      </>
    );
  }

  if (selection.type === 'wall') {
    const li = spec.levels.findIndex((l) => l.id === selection.levelId);
    const w = spec.levels[li]?.walls.find((x) => x.id === selection.wallId);
    if (!w) return null;
    const ops = spec.levels[li].openings.filter((o) => o.wallId === w.id);
    return (
      <>
        <Header title={`${w.kind[0].toUpperCase()}${w.kind.slice(1)} wall`} sub={spec.levels[li].name} />
        <div className="px-3 py-3">
          <Prop k="Length" v={fmtLen(wallLength(w), unit)} />
          <Prop k="Thickness" v={`${fmtLen(w.thickness, unit)} (${Math.round(w.thickness * 1000)} mm)`} />
          <Prop k="Height" v={fmtLen(wallHeight(spec.levels, li, spec.roof.slab, w), unit)} />
          <Prop k="Openings" v={ops.length ? ops.map((o) => o.name ?? o.kind).join(', ') : 'none'} />
          <p className="mt-3 text-xs text-muted-foreground">{w.thickness >= 0.18 ? 'Brick masonry 230 mm (9″), cement plaster both sides.' : 'Half-brick partition 115 mm (4½″).'} Change walls in the plan editor.</p>
          <Button size="sm" className="mt-3" onClick={() => (location.hash = `#/plan?level=${spec.levels[li].id}`)}>Open in plan</Button>
        </div>
      </>
    );
  }

  if (selection.type === 'stair') {
    const lv = spec.levels.find((l) => l.id === selection.levelId);
    const st = lv?.stairs.find((s) => s.id === selection.stairId);
    if (!lv || !st) return null;
    const treads = st.steps.filter((s) => s.kind === 'tread');
    const top = Math.max(...st.steps.map((s) => s.top));
    return (
      <>
        <Header title={st.name} sub={lv.name} />
        <div className="px-3 py-3">
          <Prop k="Risers" v={`${Math.round((top + st.riser) / st.riser)} × ${Math.round(st.riser * 1000)} mm`} />
          <Prop k="Treads" v={treads.length} />
          <Prop k="Landings" v={st.steps.length - treads.length} />
          <Prop k="Total rise" v={fmtLen(top + st.riser, unit)} />
          <Prop k="Finish" v={finishById(st.finish).name} />
          <Prop k="Handrail" v={st.rails.length ? `${Math.round(st.railHeight * 1000)} mm high` : 'none'} />
        </div>
      </>
    );
  }

  if (selection.type === 'column') {
    const c = spec.structure.columns.find((x) => x.id === selection.columnId);
    if (!c) return null;
    return (
      <>
        <Header title="RCC column" sub="Structure" />
        <div className="px-3 py-3">
          <Prop k="Section" v={fmtSection(c.w, c.d, unit)} />
          <Prop k="Height" v={fmtLen(spec.roof.elevation + spec.structure.footing.depth - spec.structure.footing.thickness, unit)} />
          <Prop k="Footing" v={`${fmtLen(spec.structure.footing.size, unit)} sq, ${Math.round(spec.structure.footing.thickness * 1000)} mm thick`} />
          <Prop k="Floors" v={c.levels.map((id) => spec.levels.find((l) => l.id === id)?.short ?? id).join(' + ')} />
          <p className="mt-3 text-xs text-muted-foreground">Column positions come from the plan; sizes of footings are assumed.</p>
        </div>
      </>
    );
  }

  if (selection.type === 'beam') {
    const b = spec.structure.beams.find((x) => x.id === selection.beamId);
    if (!b) return null;
    return (
      <>
        <Header title={`${b.kind[0].toUpperCase()}${b.kind.slice(1)} beam`} sub="Structure" badge={<Assumed />} />
        <div className="px-3 py-3">
          <Prop k="Span" v={fmtLen(dist(b.a, b.b), unit)} />
          <Prop k="Section" v={fmtSection(b.width, b.depth, unit)} />
          <Prop k="Top at" v={`+${fmtLen(b.top, unit)}`} />
        </div>
      </>
    );
  }
  return null;
}
