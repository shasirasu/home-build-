import { useMemo, useState } from 'react';
import { Armchair, Bath, Bed, CookingPot, Flame, Frame, Lamp, Plus, Search, Sofa, Trees, Utensils, WashingMachine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATALOG, CATEGORIES, type CatalogCategory, type CatalogItem } from '@/data/catalog';
import { useStore } from '@/lib/store';
import { fmtDims, fmtINRRange } from '@/lib/units';
import { TextInput } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export const CATEGORY_ICON: Record<CatalogCategory, typeof Bed> = {
  Living: Sofa, Dining: Utensils, Bedroom: Bed, Kitchen: CookingPot, Bath: Bath, Pooja: Flame,
  Utility: WashingMachine, Lighting: Lamp, Decor: Frame, Outdoor: Trees,
};

export function AddPanel({ onAdd, onFurnish }: { onAdd: (c: CatalogItem) => void; onFurnish: () => number }) {
  const [added, setAdded] = useState<number | null>(null);
  const unit = useStore((s) => s.unit);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CatalogCategory | 'All'>('All');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CATALOG.filter((c) => (cat === 'All' || c.category === cat) && (!t || `${c.name} ${c.material} ${c.category}`.toLowerCase().includes(t)));
  }, [q, cat]);

  return (
    <div className="grid gap-2 px-3 pb-4 pt-2">
      <div className="rounded-md border border-border bg-surface-2 p-2.5">
        <Button size="sm" className="w-full" onClick={() => { setAdded(onFurnish()); setTimeout(() => setAdded(null), 2600); }}>
          <Armchair /> Furnish the empty rooms
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
          {added === null ? 'Puts a standard layout in every room that has no furniture yet: beds, kitchen run, sofa and TV, toilet fittings.' : added ? `Added ${added} pieces. Move or remove any of them.` : 'Every room already has furniture.'}
        </p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search beds, sofa, geyser…" className="pl-8" aria-label="Search furniture" />
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Category">
        {(['All', ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={cn('h-6 rounded-full border px-2 text-xs font-medium transition-colors', cat === c ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground hover:border-border-strong')}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Pick an item, then click a floor in the 3D view to place it. <span className="whitespace-nowrap">R rotates, Esc cancels.</span></p>
      <ul className="grid gap-px">
        {list.map((c) => {
          const Icon = CATEGORY_ICON[c.category];
          return (
            <li key={c.kind}>
              <button type="button" onClick={() => onAdd(c)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-muted-foreground group-hover:bg-surface-3 group-hover:text-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground tnum">{fmtDims(c.w, c.d, unit)} · {fmtINRRange(c.price)}</span>
                </span>
                <Plus className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          );
        })}
        {!list.length && <li className="px-2 py-6 text-center text-[13px] text-muted-foreground">Nothing matches “{q}”. Try a room name like kitchen or toilet.</li>}
      </ul>
    </div>
  );
}
