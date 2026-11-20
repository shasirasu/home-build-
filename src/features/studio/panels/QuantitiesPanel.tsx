import { Download } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useProject, useStore } from '@/lib/store';
import { computeQuantities, RATE_LABELS, type Rates } from '@/lib/quantities';
import { fmtArea, fmtINR, fmtINRRange, fmtLen } from '@/lib/units';
import { downloadCSV, slug } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/ui/controls';

function Row({ k, v, sub }: { k: ReactNode; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="min-w-0">
        {k}
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="shrink-0 text-right font-medium tnum">{v}</span>
    </div>
  );
}

const m3 = (v: number) => `${v.toFixed(2)} m³`;

export function QuantitiesPanel() {
  const project = useProject();
  const unit = useStore((s) => s.unit);
  const rates = useStore((s) => s.rates);
  const setRates = useStore((s) => s.setRates);
  const q = useMemo(() => computeQuantities(project.spec, project.items, rates), [project, rates]);

  const shell = q.totals.materials + q.totals.paint;
  const builtUp = q.levels.reduce((s, l) => s + l.builtUp, 0);

  const exportCSV = () => {
    const rows: (string | number)[][] = [['Section', 'Item', 'Quantity', 'Unit', 'Amount / range (INR)', 'Basis']];
    q.levels.forEach((l) => rows.push(['Areas', `${l.name} built-up`, (l.builtUp / 0.0929).toFixed(0), 'sq ft', '', ''], ['Areas', `${l.name} carpet`, (l.carpet / 0.0929).toFixed(0), 'sq ft', '', '']));
    rows.push(['Concrete', 'Slabs', q.concrete.slabs, 'm³', '', 'M20'], ['Concrete', 'Beams', q.concrete.beams, 'm³', '', ''], ['Concrete', 'Columns', q.concrete.columns, 'm³', '', ''], ['Concrete', 'Footings', q.concrete.footings, 'm³', '', ''], ['Concrete', 'Stairs', q.concrete.stairs, 'm³', '', '']);
    q.materials.forEach((m) => rows.push(['Materials', m.item, m.qty, m.unit, Math.round(m.amount), m.basis]));
    q.flooring.forEach((f) => rows.push(['Flooring', f.name, f.units, f.unitLabel, `${f.cost[0]}-${f.cost[1]}`, `${f.area.toFixed(1)} m²`]));
    q.dado.forEach((f) => rows.push(['Wall tiles', f.name, f.units, f.unitLabel, `${f.cost[0]}-${f.cost[1]}`, `${f.area.toFixed(1)} m²`]));
    q.schedule.forEach((s) => rows.push(['Doors & windows', `${s.kind} · ${s.style}`, s.count, 'nos', '', `${(s.width * 1000).toFixed(0)} × ${(s.height * 1000).toFixed(0)} mm${s.assumed ? ' (assumed)' : ''}`]));
    q.furniture.forEach((f) => rows.push(['Furniture', f.name, f.count, 'nos', `${f.total[0]}-${f.total[1]}`, '']));
    downloadCSV(`${slug(project.name)}-quantities.csv`, rows);
  };

  return (
    <div className="px-3 pb-6">
      <div className="sticky top-0 z-10 -mx-3 border-b border-border bg-surface px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Shell materials + painting</p>
            <p className="text-lg font-bold leading-tight tnum">{fmtINR(shell)}</p>
            <p className="text-xs text-muted-foreground tnum">{fmtINR(shell / (builtUp / 0.0929))} per sq ft built-up · labour extra</p>
          </div>
          <Button size="sm" onClick={exportCSV}><Download /> CSV</Button>
        </div>
      </div>

      <SectionTitle>Areas</SectionTitle>
      {q.levels.map((l) => <Row key={l.id} k={l.name} sub={`Carpet ${fmtArea(l.carpet, unit)}`} v={fmtArea(l.builtUp, unit)} />)}
      {q.outdoorArea > 0 && <Row k="Portico / outdoor" v={fmtArea(q.outdoorArea, unit)} />}
      <Row k={<span className="font-semibold">Total built-up</span>} v={fmtArea(builtUp, unit)} />

      <SectionTitle>Structure · RCC M20</SectionTitle>
      <Row k="Slabs" sub={`${project.spec.levels.filter((l) => l.slab > 0).length + 1} slabs at ${(project.spec.roof.slab * 1000).toFixed(0)} mm`} v={m3(q.concrete.slabs)} />
      <Row k="Beams" sub={`${q.counts.beams} beams incl. plinth`} v={m3(q.concrete.beams)} />
      <Row k="Columns" sub={`${q.counts.columns} columns, footing to roof`} v={m3(q.concrete.columns)} />
      <Row k="Footings" sub={`${fmtLen(project.spec.structure.footing.size, unit)} square, ${fmtLen(project.spec.structure.footing.depth, unit)} deep`} v={m3(q.concrete.footings)} />
      <Row k="Stairs" sub={`${q.counts.risers} treads and landings`} v={m3(q.concrete.stairs)} />
      <Row k={<span className="font-semibold">Concrete</span>} sub={`Steel ≈ ${q.concrete.steelKg.toLocaleString('en-IN')} kg`} v={m3(q.concrete.total)} />

      <SectionTitle>Walls</SectionTitle>
      <Row k="Brickwork 9″" v={m3(q.masonry.fullVolume)} />
      <Row k="Brickwork 4½″" v={`${q.masonry.halfArea.toFixed(1)} m²`} />
      <Row k="Plaster inside / outside" v={`${q.plaster.internal} / ${q.plaster.external} m²`} />
      <Row k="Paint walls / ceilings" v={`${q.paint.walls} / ${q.paint.ceilings} m²`} />

      <SectionTitle action={<span className="text-xs text-muted-foreground">rates editable</span>}>Materials</SectionTitle>
      <div className="grid gap-1.5">
        {q.materials.map((m) => (
          <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[13px]">
            <span className="font-medium">{m.item}</span>
            <span className="text-right font-semibold tnum">{fmtINR(m.amount)}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground tnum">
              {m.qty.toLocaleString('en-IN')} {m.unit} ×
              <label className="inline-flex items-center">
                <span className="sr-only">{RATE_LABELS[m.key].label} rate</span>₹
                <input
                  type="number"
                  min={0}
                  value={rates[m.key]}
                  onChange={(e) => setRates({ [m.key]: Math.max(0, +e.target.value) } as Partial<Rates>)}
                  className="ml-0.5 h-5 w-14 rounded border border-border bg-surface px-1 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </label>
              {RATE_LABELS[m.key].unit}
            </span>
            <span />
          </div>
        ))}
      </div>

      <SectionTitle>Finishes</SectionTitle>
      {[...q.flooring, ...q.dado].map((f) => (
        <Row key={f.finishId} k={f.name} sub={`${f.area.toFixed(1)} m² · ${f.units.toLocaleString('en-IN')} ${f.unitLabel} incl. 7% wastage`} v={fmtINRRange(f.cost)} />
      ))}

      <SectionTitle>Doors and windows</SectionTitle>
      {q.schedule.map((s) => (
        <Row
          key={s.key}
          k={<span className="capitalize">{s.kind} · {s.style.replace('-', ' ')}</span>}
          sub={`${(s.width * 1000).toFixed(0)} × ${(s.height * 1000).toFixed(0)} mm${s.assumed ? ' · assumed, not on plan' : ''}`}
          v={`× ${s.count}`}
        />
      ))}

      <SectionTitle>Furniture and fixtures</SectionTitle>
      <Row k={`${q.counts.items} items`} v={fmtINRRange(q.totals.furniture)} />

      <p className="mt-4 rounded-md bg-surface-2 p-2.5 text-xs text-muted-foreground">
        Estimates from the drawing and common Indian site rules (M20 at 8 bags/m³, 500 bricks/m³, 1:6 mortar). Use them to plan and compare, not as a contractor's bill.
      </p>
    </div>
  );
}
