import { RCC as STRUCTURE_COLORS } from '@/three/materials';
import { useProject, useStore } from '@/lib/store';
import { fmtLen, fmtSection } from '@/lib/units';

/** Key to the structure view: what each colour is, with the sizes from the spec. */
export function StructureLegend() {
  const on = useStore((s) => !!s.display.structure);
  const mode = useStore((s) => s.mode);
  const unit = useStore((s) => s.unit);
  const { spec } = useProject();
  if (!on || mode === 'walk') return null;
  const st = spec.structure;
  const col = st.columns[0];
  const floorBeam = st.beams.find((b) => b.kind !== 'plinth');
  const plinthBeam = st.beams.find((b) => b.kind === 'plinth');
  const mm = (v: number) => Math.round(v * 1000);
  const rows: [string, string, string][] = [
    [STRUCTURE_COLORS.column, 'Columns', col ? `${st.columns.length} nos · ${fmtSection(col.w, col.d, unit)}` : 'none'],
    [STRUCTURE_COLORS.beam, 'Floor and roof beams', floorBeam ? fmtSection(floorBeam.width, floorBeam.depth, unit) : 'none'],
    [STRUCTURE_COLORS.plinthBeam, 'Plinth beams', plinthBeam ? fmtSection(plinthBeam.width, plinthBeam.depth, unit) : 'none'],
    [STRUCTURE_COLORS.slab, 'Slabs', `${mm(spec.roof.slab)} mm RCC`],
    [STRUCTURE_COLORS.stair, 'Stair', 'waist slab + treads'],
    [STRUCTURE_COLORS.footing, 'Footings', `${fmtLen(st.footing.size, unit)} square, ${fmtLen(st.footing.depth, unit)} below ground`],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 w-[250px] rounded-lg border border-border bg-surface/92 p-3 text-xs shadow-panel backdrop-blur-sm animate-[rise_200ms_var(--ease-out-expo)]">
      <p className="mb-2 text-[13px] font-semibold">RCC frame</p>
      <ul className="grid gap-1.5">
        {rows.map(([c, name, detail]) => (
          <li key={name} className="flex items-baseline gap-2">
            <span className="size-2.5 shrink-0 translate-y-px rounded-[3px]" style={{ background: c }} aria-hidden />
            <span className="font-medium">{name}</span>
            <span className="ml-auto text-right text-muted-foreground tnum">{detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-muted-foreground">Column positions are from the plan. Beam and footing sizes are assumed; click any member for its size.</p>
    </div>
  );
}
