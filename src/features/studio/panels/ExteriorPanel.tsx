import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ImagePlus, Moon, Sun, Trash2 } from 'lucide-react';
import {
  CLADDING_GROUPS, CLADDINGS, EXTERIOR_STYLES, FACADE_COLOURS, LIGHT_COLOURS, LIGHT_KINDS, ZONES,
  claddingById, claddingLabel, designOfStyle, resolveExterior,
} from '@/data/exterior';
import type { Cladding, ExteriorDesign, ExteriorZone } from '@/types/house';
import { storageProblem, useProject, useStore } from '@/lib/store';
import { FACADE_IMAGE_TYPES, FacadeImageError, readFacadeImage } from '@/lib/facadeImage';
import { uid } from '@/lib/geom';
import { fmtLen } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Segmented, SectionTitle, Select, Switch, Swatch } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { useViewer } from '../viewerContext';

const ACCENTS = ['#1f2124', '#2b2d31', '#4a4f55', '#f1efea', '#6b4a32', '#8a6a3c', '#3c4a3a', '#2f3e52'];

/** CSS background standing in for a finish. */
function finishSwatch(c: Cladding, d: ExteriorDesign): string {
  if (c.material === 'image') {
    const url = d.images?.[c.image ?? '']?.url;
    return url ? `center / cover no-repeat url("${url}")` : '#ddd';
  }
  const def = claddingById(c.material);
  return def.swatch(def.tintable ? c.color ?? def.color : def.color);
}

/** A small elevation of the style: storeys, bands, feature strip, frame and windows in the style's own finishes. */
function StyleThumb({ d }: { d: ExteriorDesign }) {
  const bg = (z: ExteriorZone) => finishSwatch(d.zones[z], d);
  const upper = d.feature === 'front' || d.feature === 'front-upper' ? bg('feature') : bg('upper');
  const ground = d.feature === 'front' || d.feature === 'front-ground' ? bg('feature') : bg('ground');
  const win = (cls: string) => (
    <span
      className={cn('absolute h-[34%] w-[16%] bg-[#33424d]', cls)}
      style={d.windows === 'box' ? { boxShadow: `0 0 0 1.5px ${d.accent}` } : d.windows === 'band' ? { boxShadow: '0 0 0 1px #f7f4ee' } : undefined}
    />
  );
  return (
    <div className="relative h-14 w-full overflow-hidden rounded-[3px] border border-black/10 bg-[#dfe6e8]" aria-hidden>
      <div className="absolute inset-x-[12%] bottom-[8%] top-[14%] flex flex-col">
        <div className="h-[9%]" style={{ background: d.parapet === 'solid' ? bg('parapet') : 'transparent', borderBottom: d.parapet !== 'solid' ? `1px solid ${d.parapet === 'glass' ? '#9fb7c0' : d.accent}` : undefined }} />
        <div className="h-[5%]" style={{ background: bg('band') }} />
        <div className="relative flex-1" style={{ background: upper, boxShadow: d.frame ? `inset 0 0 0 2.5px ${d.accent}` : undefined }}>
          {win('left-[14%] top-[30%]')}
          {win('left-[64%] top-[30%]')}
        </div>
        <div className="h-[5%]" style={{ background: bg('band') }} />
        <div className="relative flex-1" style={{ background: ground }}>
          {win('left-[14%] top-[28%]')}
          <span className="absolute bottom-0 left-[56%] h-[62%] w-[14%] bg-[#5a3a24]" />
        </div>
        <div className="h-[8%]" style={{ background: bg('plinth') }} />
        {d.feature === 'entrance' && <span className="absolute bottom-[8%] left-[50%] top-[9%] w-[28%]" style={{ background: bg('feature'), opacity: 0.92 }} />}
      </div>
    </div>
  );
}

/** A slider that shows its value while dragging and only rebuilds the house when let go. */
function CommitRange({ label, value, min, max, step, format, onCommit }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const live = useRef(value);
  useEffect(() => { setV(value); live.current = value; }, [value]);
  const commit = () => { if (live.current !== value) onCommit(live.current); };
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="flex justify-between text-muted-foreground"><span>{label}</span><span className="tnum text-foreground">{format(v)}</span></span>
      <input
        type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => { live.current = +e.target.value; setV(+e.target.value); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        className="w-full accent-[var(--primary)]"
      />
    </label>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ExteriorPanel() {
  const project = useProject();
  const updateSpec = useStore((s) => s.updateSpec);
  const display = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);
  const unit = useStore((s) => s.unit);
  const viewer = useViewer();
  const d = resolveExterior(project.spec);
  const [open, setOpen] = useState<ExteriorZone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingZone = useRef<ExteriorZone | null>(null);

  const update = (fn: (d: ExteriorDesign) => void) =>
    updateSpec((spec) => {
      const next = resolveExterior(spec);
      fn(next);
      spec.exterior = { ...spec.exterior, design: next };
    });
  const setZone = (z: ExteriorZone, c: Cladding) => update((n) => { n.zones[z] = c; });
  /** A change to the lights: switch them back on so the change can be seen. */
  const updateLights = (fn: (d: ExteriorDesign) => void) => {
    if (useStore.getState().display.lightsOn === false) setDisplay({ lightsOn: true });
    update(fn);
  };

  /** Show the whole house from outside (the exterior is what is being designed). */
  const lookAtOutside = () => {
    const st = useStore.getState();
    if (st.display.level !== 'all' || st.display.cutWalls || st.display.structure || st.display.showRoof === false) setDisplay({ level: 'all', cutWalls: false, structure: false, showRoof: true });
    if (st.mode !== 'orbit') st.setMode('orbit');
  };

  const applyStyle = (id: string) => {
    lookAtOutside();
    update((n) => {
      const s = designOfStyle(id);
      Object.assign(n, s, { images: n.images });
    });
  };

  const addPicture = async (file: File, zone: ExteriorZone | null) => {
    setError(null);
    setBusy(true);
    try {
      const img = await readFacadeImage(file);
      const key = uid('pic');
      update((n) => {
        n.images = { ...(n.images ?? {}), [key]: img };
        if (zone) n.zones[zone] = { material: 'image', image: key, size: 2.4, fit: 'tile' };
      });
    } catch (e) {
      setError(e instanceof FacadeImageError ? e.message : 'The picture could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const removePicture = (key: string) =>
    update((n) => {
      const { [key]: _gone, ...rest } = n.images ?? {};
      n.images = Object.keys(rest).length ? rest : undefined;
      // walls that used it go back to the finish of the style
      const base = designOfStyle(n.style);
      for (const z of Object.keys(n.zones) as ExteriorZone[]) if (n.zones[z].material === 'image' && n.zones[z].image === key) n.zones[z] = base.zones[z];
    });

  const storageFull = useSyncExternalStore((cb) => { storageProblem.listeners.add(cb); return () => { storageProblem.listeners.delete(cb); }; }, () => storageProblem.full);
  const night = !!display.night;
  const lightsOn = display.lightsOn !== false;
  const pictures = Object.entries(d.images ?? {});

  return (
    <div className="px-3 pb-6">
      <p className="pt-3 text-[13px] leading-snug text-muted-foreground">
        A 2D plan doesn't say how the outside is finished. Start from a style, then change any surface, detail or light.
      </p>

      {/* ------------------------------------------------------------------ styles */}
      <SectionTitle>Style</SectionTitle>
      <ul className="grid grid-cols-2 gap-2">
        {EXTERIOR_STYLES.map((s) => {
          const on = d.style === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => applyStyle(s.id)}
                aria-pressed={on}
                title={s.blurb}
                className={cn('grid w-full gap-1.5 rounded-md border p-1.5 text-left transition-[border-color,background-color] duration-150', on ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong')}
              >
                <StyleThumb d={s.design} />
                <span className={cn('px-0.5 text-xs font-medium leading-tight', on && 'text-primary')}>{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{EXTERIOR_STYLES.find((s) => s.id === d.style)?.blurb}. Choosing a style replaces the finishes, details and lights below; ⌘Z brings yours back.</p>

      {/* ------------------------------------------------------------------ finishes */}
      <SectionTitle>Finishes</SectionTitle>
      <ul className="grid gap-px">
        {ZONES.map((z) => {
          const c = d.zones[z.id];
          const isOpen = open === z.id;
          const def = c.material === 'image' ? null : claddingById(c.material);
          const unused = z.id === 'feature' && d.feature === 'none';
          return (
            <li key={z.id} className={cn('rounded-md', isOpen && 'bg-surface-2')}>
              <button
                type="button"
                onClick={() => { setOpen(isOpen ? null : z.id); setError(null); }}
                aria-expanded={isOpen}
                title={z.hint}
                className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', !isOpen && 'hover:bg-surface-2')}
              >
                <span className="size-7 shrink-0 rounded-[4px] border border-black/10" style={{ background: finishSwatch(c, d) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{z.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{unused ? 'Not used: no feature wall chosen' : claddingLabel(c, d)}</span>
                </span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', isOpen && 'rotate-180')} />
              </button>

              {isOpen && (
                <div className="grid gap-3 px-2 pb-3 pt-1">
                  {CLADDING_GROUPS.map((g) => (
                    <div key={g}>
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{g}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CLADDINGS.filter((m) => m.group === g).map((m) => {
                          const on = c.material === m.id;
                          const colour = m.tintable && on ? c.color ?? m.color : m.color;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { if (!on) setZone(z.id, { material: m.id, color: m.color }); }}
                              aria-pressed={on}
                              title={m.name}
                              className="group grid gap-1 text-left"
                            >
                              <span className={cn('h-9 rounded-[4px] border border-black/10 transition-shadow duration-150', on ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface-2' : 'group-hover:border-border-strong')} style={{ background: m.swatch(colour) }} />
                              <span className={cn('line-clamp-2 text-[11px] leading-tight', on ? 'font-medium text-primary' : 'text-muted-foreground')}>{m.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {def?.tintable && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Colour</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FACADE_COLOURS.map((col) => (
                          <Swatch key={col} color={col} active={(c.color ?? def.color).toLowerCase() === col} title={col} onClick={() => setZone(z.id, { ...c, color: col })} />
                        ))}
                        <label className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong text-[13px] text-muted-foreground hover:text-foreground" title="Any colour">
                          +
                          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={c.color ?? def.color} onChange={(e) => setZone(z.id, { ...c, color: e.target.value })} aria-label="Pick any colour" />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* ---- the owner's own picture */}
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">Your picture</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pictures.map(([key, img]) => {
                        const on = c.material === 'image' && c.image === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={img.name}
                            aria-pressed={on}
                            onClick={() => setZone(z.id, { material: 'image', image: key, size: on ? c.size : 2.4, fit: on ? c.fit : 'tile' })}
                            className={cn('size-12 rounded-[4px] border border-black/10 bg-cover bg-center', on && 'ring-2 ring-primary ring-offset-1 ring-offset-surface-2')}
                            style={{ backgroundImage: `url("${img.url}")` }}
                          />
                        );
                      })}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => { pendingZone.current = z.id; fileRef.current?.click(); }}
                        className="grid size-12 place-items-center rounded-[4px] border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                        title="Use your own picture on this surface"
                        aria-label="Add your own picture"
                      >
                        <ImagePlus className="size-4" />
                      </button>
                    </div>
                    {c.material === 'image' ? (
                      <div className="mt-2.5 grid gap-2.5">
                        <Row label="Placing">
                          <Segmented size="sm" label="How the picture is placed" value={c.fit ?? 'tile'} onChange={(fit) => setZone(z.id, { ...c, fit })}
                            options={[{ value: 'tile', label: 'Repeat', title: 'Repeat the picture across the wall at the size below' }, { value: 'fit', label: 'Stretch', title: 'Stretch one copy over each wall (a mural, a printed panel)' }]} />
                        </Row>
                        {c.fit !== 'fit' && (
                          <CommitRange label="One copy covers" min={0.3} max={12} step={0.1} value={c.size ?? 2.4} format={(v) => `${fmtLen(v, unit)} across`} onCommit={(size) => setZone(z.id, { ...c, size })} />
                        )}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">A photo of a material taken straight on (stone, tile, cladding, a mural) works best. It stays on this device and is saved with the house.</p>
                    )}
                    {error && open === z.id && <p className="mt-1.5 text-xs text-primary" role="alert">{error}</p>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <input
        ref={fileRef}
        type="file"
        accept={FACADE_IMAGE_TYPES}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addPicture(f, pendingZone.current); e.target.value = ''; }}
      />
      {storageFull && (
        <p className="mt-2 rounded-md border border-warning/40 px-2.5 py-2 text-xs leading-snug text-warning" role="alert">
          This browser's storage for saved houses is full, so the latest changes are not saved. Remove a picture you don't use, or export the house from the House tab.
        </p>
      )}
      {pictures.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Pictures in this house</p>
          <ul className="grid gap-px">
            {pictures.map(([key, img]) => {
              const used = ZONES.filter((z) => d.zones[z.id].material === 'image' && d.zones[z.id].image === key).map((z) => z.name);
              return (
                <li key={key} className="flex items-center gap-2 rounded-md px-1 py-1">
                  <span className="size-6 shrink-0 rounded-[3px] border border-black/10 bg-cover bg-center" style={{ backgroundImage: `url("${img.url}")` }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{img.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{used.length ? used.join(', ') : 'Not used'}</span>
                  </span>
                  <Button variant="quiet" size="icon-sm" aria-label={`Remove ${img.name}`} onClick={() => removePicture(key)}><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------------------------ details */}
      <SectionTitle>Details</SectionTitle>
      <div className="grid gap-1">
        <label className="grid gap-1 py-1 text-[13px]">
          <span className="text-muted-foreground">Feature wall</span>
          <Select value={d.feature} onChange={(e) => update((n) => { n.feature = e.target.value as ExteriorDesign['feature']; })}>
            <option value="entrance">Entrance bay, full height</option>
            <option value="front">The whole front</option>
            <option value="front-upper">Front, upper storey</option>
            <option value="front-ground">Front, ground storey</option>
            <option value="none">None</option>
          </Select>
        </label>
        <Row label="Windows">
          <Segmented size="sm" label="Window surrounds" value={d.windows} onChange={(windows) => update((n) => { n.windows = windows; })}
            options={[{ value: 'box', label: 'Box', title: 'A projecting box frame round each window' }, { value: 'hood', label: 'Hood', title: 'A thin sunshade over each window' }, { value: 'band', label: 'Band', title: 'Traditional: a lintel band round the house, moulded columns' }, { value: 'none', label: 'Plain' }]} />
        </Row>
        <Row label="Parapet at the front">
          <Segmented size="sm" label="Front parapet" value={d.parapet} onChange={(parapet) => update((n) => { n.parapet = parapet; })}
            options={[{ value: 'solid', label: 'Wall' }, { value: 'glass', label: 'Glass' }, { value: 'rail', label: 'Rail' }]} />
        </Row>
        <Row label="Fins at the entrance">
          <Segmented size="sm" label="Fins" value={d.fins} onChange={(fins) => update((n) => { n.fins = fins; })}
            options={[{ value: 'none', label: 'None' }, { value: 'wood', label: 'Timber' }, { value: 'metal', label: 'Metal' }]} />
        </Row>
        <Row label="Gate">
          <Segmented size="sm" label="Gate" value={d.gate} onChange={(gate) => update((n) => { n.gate = gate; })}
            options={[{ value: 'bars', label: 'Bars' }, { value: 'slats', label: 'Timber' }, { value: 'sheet', label: 'Panels' }]} />
        </Row>
        <Switch label="Frame round the upper front" checked={d.frame} onChange={(frame) => update((n) => { n.frame = frame; })} />
        <Switch label="Canopy over the main door" hint="Only where nothing covers the door already" checked={d.canopy} onChange={(canopy) => update((n) => { n.canopy = canopy; })} />
        <Switch label="Pergola on the terrace" checked={d.pergola} onChange={(pergola) => update((n) => { n.pergola = pergola; })} />
        <div className="py-1">
          <CommitRange label="Roof overhang" min={0} max={1.2} step={0.05} value={d.overhang} format={(v) => (v < 0.02 ? 'flush' : fmtLen(v, unit))} onCommit={(overhang) => update((n) => { n.overhang = overhang; })} />
        </div>
        <div className="py-1">
          <p className="mb-1.5 text-[13px] text-muted-foreground">Frames, boxes and metalwork</p>
          <div className="flex flex-wrap gap-1.5">
            {ACCENTS.map((col) => <Swatch key={col} color={col} active={d.accent.toLowerCase() === col} title={col} onClick={() => update((n) => { n.accent = col; })} />)}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ lights */}
      <SectionTitle
        action={
          <Segmented size="sm" label="Time of day" value={night ? 'night' : 'day'}
            onChange={(v) => { if (v === 'night') lookAtOutside(); setDisplay({ night: v === 'night' }); }}
            options={[{ value: 'day', label: <><Sun /> Day</> }, { value: 'night', label: <><Moon /> Night</> }]} />
        }
      >
        Lights
      </SectionTitle>
      {!night && <p className="pb-1 text-xs leading-snug text-muted-foreground">The lights show at night. Switch to Night to see them, from outside or while walking.</p>}
      <div className="mb-1 border-b border-border pb-1.5">
        <Switch
          label={<span className="grid"><span className="font-medium">All lights</span><span className="text-xs text-muted-foreground">{lightsOn ? 'On at night. Turn off to see the house dark (L)' : 'Off: the house is dark at night (L)'}</span></span>}
          checked={lightsOn}
          onChange={(v) => setDisplay({ lightsOn: v })}
        />
      </div>
      <div className="grid gap-px">
        {LIGHT_KINDS.map((k) => (
          <Switch
            key={k.id}
            label={<span className="grid"><span>{k.name}</span><span className="text-xs text-muted-foreground">{k.hint}</span></span>}
            checked={!!d.lighting.kinds[k.id]}
            onChange={(v) => updateLights((n) => { n.lighting.kinds = { ...n.lighting.kinds, [k.id]: v }; })}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-3">
        <div>
          <p className="mb-1.5 flex justify-between text-[13px] text-muted-foreground">
            <span>Colour</span>
            <span className="text-foreground">{LIGHT_COLOURS.find((l) => l.color === d.lighting.color.toLowerCase())?.name ?? 'Your colour'}</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {LIGHT_COLOURS.map((l) => <Swatch key={l.color} color={l.color} title={l.name} active={d.lighting.color.toLowerCase() === l.color} onClick={() => updateLights((n) => { n.lighting.color = l.color; })} />)}
            <label className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong text-[13px] text-muted-foreground hover:text-foreground" title="Any colour">
              +
              <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={d.lighting.color} onChange={(e) => updateLights((n) => { n.lighting.color = e.target.value; })} aria-label="Pick any light colour" />
            </label>
          </div>
        </div>
        <CommitRange label="Brightness" min={0.3} max={1.6} step={0.05} value={d.lighting.brightness} format={(v) => `${Math.round(v * 100)}%`} onCommit={(brightness) => updateLights((n) => { n.lighting.brightness = brightness; })} />
        {night && (
          <Button size="sm" variant="secondary" onClick={() => { lookAtOutside(); viewer.current?.resetView(); }}>Look at the front</Button>
        )}
      </div>
    </div>
  );
}
