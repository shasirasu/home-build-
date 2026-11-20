import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, BrickWall, DoorClosed, DoorOpen, Footprints, Hand, Layers, Maximize, MousePointer2, Plus, Redo2, Ruler, ScanLine, Square, Trash2, Undo2, AppWindow } from 'lucide-react';
import type { Level, Opening, Room, RoomType, Vec2 } from '@/types/house';
import { SAMPLE_ID, useProject, useStore } from '@/lib/store';
import { parseRoute } from './planRoute';
import { useUnderlay } from './useUnderlay';
import { PlanCanvas, type PlanSel, type Tool } from './PlanCanvas';
import { Wordmark } from '@/components/Wordmark';
import { Button } from '@/components/ui/button';
import { Field, Kbd, Range, SectionTitle, Segmented, Select, TextInput } from '@/components/ui/controls';
import { FINISHES, PAINTS } from '@/data/finishes';
import { deriveSpec, emptyLevel, DEFAULTS } from '@/lib/derive';
import { bbox, dist, polygonArea, wallLength } from '@/lib/geom';
import { fmtArea, fmtLen, parseLen } from '@/lib/units';
import { cn } from '@/lib/utils';
import { go } from '@/lib/router';
import { houseFromReading, readPdfPlan } from '@/lib/reader';
import { getBlob } from '@/lib/blobStore';
import { ROOM_TYPES, TYPE_DEFAULTS } from '@/lib/roomDefaults';

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Hand; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointer2, hint: 'Click to select. Drag a wall end or a door to move it.' },
  { id: 'wall', label: 'Wall', key: 'W', icon: BrickWall, hint: 'Click to start, click each corner. Shift draws at any angle. Enter or right-click ends.' },
  { id: 'room', label: 'Room', key: 'R', icon: Square, hint: 'Drag a rectangle over the inside of a room.' },
  { id: 'door', label: 'Door', key: 'D', icon: DoorClosed, hint: 'Click on a wall to put a door there.' },
  { id: 'window', label: 'Window', key: 'N', icon: AppWindow, hint: 'Click on a wall to put a window there.' },
  { id: 'opening', label: 'Opening', key: 'O', icon: DoorOpen, hint: 'Click on a wall for an open doorway with no door.' },
  { id: 'stair', label: 'Stair', key: 'S', icon: Footprints, hint: 'Drag along the stair in the direction it goes up.' },
  { id: 'calibrate', label: 'Scale', key: 'C', icon: Ruler, hint: 'Click both ends of a known dimension on the drawing, then type its length.' },
  { id: 'pan', label: 'Pan', key: 'H', icon: Hand, hint: 'Drag to move around. Scroll to zoom. Space + drag works with any tool.' },
];

export default function PlanEditor() {
  const project = useProject();
  const unit = useStore((s) => s.unit);
  const updateSpec = useStore((s) => s.updateSpec);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const spec = project.spec;
  const [levelIndex, setLevelIndex] = useState(() => Math.max(0, spec.levels.findIndex((l) => l.id === parseRoute().level)));
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<PlanSel>(null);
  const [thickness, setThickness] = useState(DEFAULTS.wall9);
  const [opacity, setOpacity] = useState(0.55);
  const [pendingCal, setPendingCal] = useState<[Vec2, Vec2] | null>(null);
  const [calText, setCalText] = useState('');
  const [tracing, setTracing] = useState<string | null>(null);
  const { underlay, loading, error } = useUnderlay(project);
  const level = spec.levels[Math.min(levelIndex, spec.levels.length - 1)];
  const li = spec.levels.indexOf(level);
  const frame = spec.underlay?.frames[level.id] ?? null;

  const editLevel = (fn: (lv: Level) => void) => updateSpec((s) => fn(s.levels[li]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t && !e.metaKey && !e.ctrlKey) setTool(t.id);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const removeSel = () => {
    if (!sel) return;
    editLevel((lv) => {
      if (sel.kind === 'wall') { lv.walls = lv.walls.filter((w) => w.id !== sel.id); lv.openings = lv.openings.filter((o) => o.wallId !== sel.id); }
      if (sel.kind === 'room') lv.rooms = lv.rooms.filter((r) => r.id !== sel.id);
      if (sel.kind === 'opening') lv.openings = lv.openings.filter((o) => o.id !== sel.id);
      if (sel.kind === 'stair') lv.stairs = lv.stairs.filter((s) => s.id !== sel.id);
    });
    setSel(null);
  };

  const applyCalibration = () => {
    if (!pendingCal) return;
    const L = parseLen(calText, unit);
    if (!L || L <= 0) return;
    const [a, b] = pendingCal;
    const upm = dist(a, b) / L;
    updateSpec((s) => {
      const u = s.underlay ?? { url: '', kind: 'pdf', page: 1, frames: {} };
      const lv = s.levels[li];
      const keepOrigin = lv.walls.length > 0 && u.frames[lv.id];
      u.frames[lv.id] = { origin: keepOrigin ? u.frames[lv.id].origin : [a[0], a[1]], unitsPerMetre: upm };
      s.underlay = u;
    });
    setPendingCal(null);
    setCalText('');
    setTool('wall');
  };

  const addLevel = () => {
    updateSpec((s) => {
      const below = s.levels[s.levels.length - 1];
      const lv = emptyLevel(s.levels.length, below);
      // Start the new floor with the outer walls of the one below.
      lv.walls = below.walls.filter((w) => w.kind === 'exterior').map((w) => ({ ...w, id: `${w.id}-${lv.id}` }));
      s.levels.push(lv);
      if (s.underlay?.frames[below.id]) s.underlay.frames[lv.id] = { ...s.underlay.frames[below.id] };
    });
    setLevelIndex(spec.levels.length);
  };

  const build = () => {
    if (project.id !== SAMPLE_ID) useStore.getState().setSpec(deriveSpec(spec));
    useStore.getState().setDisplay({ level: 'all', cutWalls: false });
    go('#/studio');
  };

  // Read the plan straight from the PDF's own linework (no AI): walls, doors, rooms, stairs, scale.
  const canRead = spec.underlay?.kind === 'pdf';
  const runRead = async () => {
    if (spec.levels.some((l) => l.walls.length) && !confirm('Read the drawing again? The plan and its furniture are replaced by a fresh reading; changes made by hand are lost (Undo brings them back).')) return;
    setTracing('Reading the drawing…');
    try {
      const page = spec.underlay?.page ?? 1;
      let src: string | ArrayBuffer | null = spec.underlay?.url || null;
      if (project.sourceKey) { const blob = await getBlob(project.sourceKey); src = blob ? await blob.arrayBuffer() : null; }
      if (!src) throw new Error('The drawing is no longer stored in this browser. Upload it again from New plan.');
      const res = await readPdfPlan(src, page);
      if (!res.ok) throw new Error(res.reason);
      const built = houseFromReading(res, project.name, { kind: 'pdf', page, url: spec.underlay?.url });
      const st = useStore.getState();
      st.setSpec({ ...built.spec, id: spec.id });
      st.updateItems(() => built.items, { history: false });
      setLevelIndex(0);
      setSel(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'The drawing could not be read.');
    } finally {
      setTracing(null);
    }
  };

  const stats = useMemo(() => {
    const area = level.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
    return `${level.walls.length} walls · ${level.openings.length} openings · ${level.rooms.length} rooms · ${fmtArea(area, unit)}`;
  }, [level, unit]);

  const hint = TOOLS.find((t) => t.id === tool)?.hint;
  const needsCal = !!underlay && !frame;

  return (
    <div className="flex h-[100svh] flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 [scrollbar-width:none] [&>*]:shrink-0">
        <Wordmark compact />
        <div className="mr-2 hidden min-w-0 sm:block">
          <p className="truncate text-[13px] font-semibold leading-tight">{project.name}</p>
          <p className="text-xs text-muted-foreground">Plan · {stats}</p>
        </div>
        <div className="mx-auto flex items-center gap-1.5">
          <Segmented label="Floor" value={level.id} onChange={(id) => { setLevelIndex(spec.levels.findIndex((l) => l.id === id)); setSel(null); }} options={spec.levels.map((l) => ({ value: l.id, label: l.short, title: l.name }))} />
          <Button size="sm" variant="quiet" onClick={addLevel} title="Add a floor on top"><Plus /> Floor</Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="quiet" size="icon" onClick={undo} aria-label="Undo" title="Undo (⌘Z)"><Undo2 /></Button>
          <Button variant="quiet" size="icon" onClick={redo} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 /></Button>
          {canRead && (
            <Button size="sm" onClick={runRead} disabled={!!tracing} title="Read walls, doors, rooms and stairs straight from the PDF's own lines"><ScanLine /> Read drawing</Button>
          )}
          <Button variant="primary" onClick={build}><Layers /> Build 3D <ArrowRight /></Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Tool palette */}
        <nav className="z-10 flex w-14 shrink-0 flex-col items-center gap-0.5 border-r border-border bg-surface py-2" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tool === t.id}
              title={`${t.label} (${t.key})`}
              onClick={() => setTool(t.id)}
              className={cn('flex w-12 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors', tool === t.id ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground')}
            >
              <t.icon className="size-[18px]" />
              {t.label}
            </button>
          ))}
        </nav>

        <main className="relative min-w-0 flex-1 overflow-hidden">
          <PlanCanvas
            spec={spec}
            levelIndex={li}
            underlay={underlay}
            frame={frame}
            underlayOpacity={opacity}
            tool={tool}
            wallThickness={thickness}
            unit={unit}
            selection={sel}
            onSelect={setSel}
            onEdit={editLevel}
            onCalibrate={(a, b) => setPendingCal([a, b])}
            onToolDone={() => setTool('select')}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <p className="rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs text-muted-foreground shadow-panel">{hint}</p>
          </div>
          {loading && <p className="absolute left-3 top-3 rounded-md bg-surface px-2.5 py-1.5 text-xs text-muted-foreground shadow-panel">Loading the drawing…</p>}
          {error && <p className="absolute left-3 top-3 max-w-sm rounded-md bg-surface px-2.5 py-1.5 text-xs text-primary shadow-panel">{error}</p>}
          {tracing && (
            <div className="absolute inset-0 grid place-items-center bg-[var(--overlay)]">
              <div className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3 text-sm shadow-pop" role="status"><span className="size-2 animate-pulse rounded-full bg-primary" /> {tracing}</div>
            </div>
          )}
          {pendingCal && (
            <form onSubmit={(e) => { e.preventDefault(); applyCalibration(); }} className="absolute left-1/2 top-4 z-20 w-[320px] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-pop animate-[pop_160ms_var(--ease-out-expo)]">
              <p className="text-[13px] font-semibold">How long is that line in real life?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Type it as written on the plan, e.g. 22' or 11'9" or 6.7 m.</p>
              <div className="mt-2 flex gap-2">
                <TextInput autoFocus value={calText} onChange={(e) => setCalText(e.target.value)} placeholder={unit === 'ft' ? `22'` : '6.7 m'} aria-label="Real length" />
                <Button type="submit" variant="primary">Set scale</Button>
              </div>
              <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setPendingCal(null)}>Cancel</button>
            </form>
          )}
        </main>

        {/* Properties */}
        <aside className="z-10 w-[280px] shrink-0 overflow-y-auto border-l border-border bg-surface px-3 pb-6 max-lg:hidden" aria-label="Properties">
          {sel ? <SelectionProps sel={sel} level={level} onEdit={editLevel} onRemove={removeSel} /> : (
            <>
              {needsCal && (
                <div className="mt-3 rounded-md border border-primary/40 bg-primary-soft p-2.5 text-[13px]">
                  <p className="font-semibold text-primary">Set the scale of {level.name.toLowerCase()} first</p>
                  <p className="mt-1 text-foreground/80">Pick <b>Scale</b>, click both ends of the overall width (for example the 22′ dimension line), and type the length. The first click becomes the corner of the house.</p>
                  <Button size="sm" variant="primary" className="mt-2" onClick={() => setTool('calibrate')}><Ruler /> Set scale</Button>
                </div>
              )}
              <SectionTitle>{level.name}</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Floor level"><TextInput readOnly value={`+${fmtLen(level.elevation, unit)}`} /></Field>
                <LenField label="Floor to floor" value={level.height} onCommit={(v) => editLevel((lv) => { lv.height = v; })} />
              </div>
              <SectionTitle>New walls</SectionTitle>
              <Segmented label="Wall thickness" value={String(thickness)} onChange={(v) => setThickness(+v)} options={[{ value: String(DEFAULTS.wall9), label: '9″ outer' }, { value: String(DEFAULTS.wall45), label: '4½″ partition' }]} />
              {underlay && (
                <>
                  <SectionTitle>Drawing</SectionTitle>
                  <Range label="Show drawing" min={0} max={1} step={0.05} value={opacity} display={`${Math.round(opacity * 100)}%`} onChange={setOpacity} />
                  <p className="mt-1.5 text-xs text-muted-foreground">{frame ? `Scale set: ${(frame.unitsPerMetre * 0.3048).toFixed(2)} units per foot.` : 'Scale not set for this floor.'}</p>
                </>
              )}
              <SectionTitle>Keys</SectionTitle>
              <div className="grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
                {TOOLS.map((t) => <span key={t.id} className="flex items-center gap-1.5"><Kbd>{t.key}</Kbd>{t.label}</span>)}
                <span className="flex items-center gap-1.5"><Kbd>F</Kbd>Fit</span>
                <span className="flex items-center gap-1.5"><Kbd>⌫</Kbd>Delete</span>
              </div>
              <Button size="sm" variant="quiet" className="mt-3" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))}><Maximize /> Fit to screen</Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function LenField({ label, value, onCommit }: { label: ReactNode; value: number; onCommit: (m: number) => void }) {
  const unit = useStore((s) => s.unit);
  return (
    <Field label={label}>
      <TextInput
        key={`${value}-${unit}`}
        defaultValue={fmtLen(value, unit).replace(' m', '')}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => { const m = parseLen(e.target.value, unit); if (m && m > 0.01) onCommit(m); else e.target.value = fmtLen(value, unit).replace(' m', ''); }}
      />
    </Field>
  );
}

function SelectionProps({ sel, level, onEdit, onRemove }: { sel: NonNullable<PlanSel>; level: Level; onEdit: (fn: (lv: Level) => void) => void; onRemove: () => void }) {
  const unit = useStore((s) => s.unit);
  const del = <Button size="sm" variant="danger" className="mt-4" onClick={onRemove}><Trash2 /> Delete</Button>;

  if (sel.kind === 'wall') {
    const w = level.walls.find((x) => x.id === sel.id);
    if (!w) return null;
    return (
      <>
        <SectionTitle>Wall</SectionTitle>
        <div className="grid gap-2">
          <LenField label="Length" value={wallLength(w)} onCommit={(L) => onEdit((lv) => { const ww = lv.walls.find((x) => x.id === w.id)!; const k = L / wallLength(ww); ww.b = [ww.a[0] + (ww.b[0] - ww.a[0]) * k, ww.a[1] + (ww.b[1] - ww.a[1]) * k]; })} />
          <Field label="Thickness">
            <Select value={w.thickness >= 0.18 ? 'full' : 'half'} onChange={(e) => onEdit((lv) => { const ww = lv.walls.find((x) => x.id === w.id)!; ww.thickness = e.target.value === 'full' ? DEFAULTS.wall9 : DEFAULTS.wall45; })}>
              <option value="full">9″ (230 mm)</option>
              <option value="half">4½″ (115 mm)</option>
            </Select>
          </Field>
          <Field label="Kind">
            <Select value={w.kind} onChange={(e) => onEdit((lv) => { lv.walls.find((x) => x.id === w.id)!.kind = e.target.value as typeof w.kind; })}>
              <option value="exterior">Outer wall</option>
              <option value="interior">Inner wall</option>
              <option value="partition">Partition</option>
            </Select>
          </Field>
        </div>
        {del}
      </>
    );
  }
  if (sel.kind === 'room') {
    const r = level.rooms.find((x) => x.id === sel.id);
    if (!r) return null;
    const b = bbox(r.polygon);
    const patch = (fn: (rr: Room) => void) => onEdit((lv) => fn(lv.rooms.find((x) => x.id === r.id)!));
    return (
      <>
        <SectionTitle>Room</SectionTitle>
        <div className="grid gap-2">
          <Field label="Name"><TextInput key={r.id} defaultValue={r.name} onBlur={(e) => e.target.value.trim() && patch((x) => { x.name = e.target.value.trim(); })} /></Field>
          <Field label="Type">
            <Select value={r.type} onChange={(e) => patch((x) => {
              const t = e.target.value as RoomType;
              x.type = t;
              const d = TYPE_DEFAULTS[t];
              if (d) { x.floor = d.floor; x.wallColor = d.wall; x.dado = d.dado; x.outdoor = d.outdoor; }
              if (/^Room \d+$/.test(x.name)) x.name = t[0].toUpperCase() + t.slice(1);
            })}>
              {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Size as on the plan" hint={`Measured ${fmtLen(b.x1 - b.x0, unit)} × ${fmtLen(b.y1 - b.y0, unit)}, ${fmtArea(polygonArea(r.polygon), unit)}`}>
            <TextInput key={`${r.id}-s`} defaultValue={r.sizeLabel ?? ''} onBlur={(e) => patch((x) => { x.sizeLabel = e.target.value.trim() || undefined; })} />
          </Field>
          <Field label="Floor">
            <Select value={r.floor} onChange={(e) => patch((x) => { x.floor = e.target.value; })}>
              {FINISHES.filter((f) => f.use !== 'wall').map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Wall paint">
            <Select value={r.wallColor} onChange={(e) => patch((x) => { x.wallColor = e.target.value; })}>
              {PAINTS.map((p) => <option key={p.id} value={p.hex}>{p.name}</option>)}
              {!PAINTS.some((p) => p.hex === r.wallColor) && <option value={r.wallColor}>Custom</option>}
            </Select>
          </Field>
        </div>
        {del}
      </>
    );
  }
  if (sel.kind === 'opening') {
    const o = level.openings.find((x) => x.id === sel.id);
    if (!o) return null;
    const w = level.walls.find((x) => x.id === o.wallId);
    const patch = (fn: (oo: Opening) => void) => onEdit((lv) => fn(lv.openings.find((x) => x.id === o.id)!));
    const L = w ? wallLength(w) : 99;
    return (
      <>
        <SectionTitle>{o.kind[0].toUpperCase() + o.kind.slice(1)}</SectionTitle>
        <div className="grid gap-2">
          <Field label="Kind">
            <Select value={o.kind} onChange={(e) => patch((x) => {
              x.kind = e.target.value as Opening['kind'];
              if (x.kind === 'door') { x.sill = 0; x.height = 2.1; x.leaf = 'single'; x.style = 'flush'; x.hinge = x.hinge ?? 'a'; x.swing = x.swing ?? 1; }
              if (x.kind === 'window') { x.sill = 0.9; x.height = 1.2; x.leaf = 'double'; x.style = 'casement'; }
              if (x.kind === 'ventilator') { x.sill = 1.8; x.height = 0.45; x.leaf = 'none'; x.style = 'louvre'; }
              if (x.kind === 'opening') { x.sill = 0; x.height = 2.1; x.leaf = 'none'; x.style = undefined; }
            })}>
              <option value="door">Door</option><option value="window">Window</option><option value="ventilator">Ventilator</option><option value="opening">Opening (no door)</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <LenField label="Width" value={o.width} onCommit={(v) => patch((x) => { x.width = Math.min(v, L); x.at = Math.min(Math.max(x.at, x.width / 2), L - x.width / 2); })} />
            <LenField label="Height" value={o.height} onCommit={(v) => patch((x) => { x.height = v; })} />
          </div>
          {o.kind === 'door' && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => patch((x) => { x.hinge = x.hinge === 'a' ? 'b' : 'a'; })}>Flip hinge</Button>
              <Button size="sm" onClick={() => patch((x) => { x.swing = x.swing === 1 ? -1 : 1; })}>Flip swing</Button>
              <Button size="sm" onClick={() => patch((x) => { x.leaf = x.leaf === 'double' ? 'single' : 'double'; })}>{o.leaf === 'double' ? 'Single leaf' : 'Double leaf'}</Button>
            </div>
          )}
        </div>
        {del}
      </>
    );
  }
  if (sel.kind === 'stair') {
    const s = level.stairs.find((x) => x.id === sel.id);
    if (!s) return null;
    return (
      <>
        <SectionTitle>Stair</SectionTitle>
        <p className="text-[13px]">{s.steps.length} treads · risers {Math.round(s.riser * 1000)} mm · rises {fmtLen(Math.max(...s.steps.map((x) => x.top)) + s.riser, unit)}</p>
        <p className="mt-1 text-xs text-muted-foreground">A straight flight up to the next floor. The slab above gets an opening over it when you build.</p>
        {del}
      </>
    );
  }
  return null;
}
