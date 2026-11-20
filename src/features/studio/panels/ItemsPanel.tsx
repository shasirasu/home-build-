import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { catalogByKind } from '@/data/catalog';
import { useProject, useStore } from '@/lib/store';
import { fmtINRRange } from '@/lib/units';
import { downloadCSV, slug } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { useViewer } from '../viewerContext';

/** The items list: everything placed in the house, room by room, with indicative prices. */
export function ItemsPanel() {
  const project = useProject();
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const viewer = useViewer();

  const groups = useMemo(() => {
    const rooms = project.spec.levels.flatMap((l) => l.rooms.map((r) => ({ ...r, level: l })));
    const byRoom = new Map<string, typeof project.items>();
    for (const it of project.items) {
      const k = it.roomId ?? `outside-${it.levelId}`;
      byRoom.set(k, [...(byRoom.get(k) ?? []), it]);
    }
    return [...byRoom.entries()].map(([k, items]) => {
      const r = rooms.find((x) => x.id === k);
      const total = items.reduce<[number, number]>((s, it) => { const p = catalogByKind(it.kind)?.price ?? [0, 0]; return [s[0] + p[0], s[1] + p[1]]; }, [0, 0]);
      return { key: k, title: r ? `${r.name} · ${r.level.short}` : 'Outside', items, total };
    });
  }, [project]);

  const grand = groups.reduce<[number, number]>((s, g) => [s[0] + g.total[0], s[1] + g.total[1]], [0, 0]);

  const exportCSV = () => {
    const rows: (string | number)[][] = [['Room', 'Item', 'Category', 'Width (m)', 'Depth (m)', 'Height (m)', 'Material', 'Price low (INR)', 'Price high (INR)']];
    for (const g of groups)
      for (const it of g.items) {
        const c = catalogByKind(it.kind);
        rows.push([g.title, c?.name ?? it.kind, c?.category ?? '', it.w.toFixed(2), it.d.toFixed(2), it.h.toFixed(2), c?.material ?? '', c?.price[0] ?? 0, c?.price[1] ?? 0]);
      }
    rows.push([], ['Total', '', '', '', '', '', '', grand[0], grand[1]]);
    downloadCSV(`${slug(project.name)}-items.csv`, rows);
  };

  return (
    <div className="px-3 pb-4">
      <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between border-b border-border bg-surface px-3 py-2.5">
        <div>
          <p className="text-[13px] font-semibold tnum">{project.items.length} items</p>
          <p className="text-xs text-muted-foreground tnum">{fmtINRRange(grand)} indicative</p>
        </div>
        <Button size="sm" onClick={exportCSV}><Download /> CSV</Button>
      </div>
      {groups.map((g) => (
        <section key={g.key}>
          <SectionTitle action={<span className="text-xs text-muted-foreground tnum">{fmtINRRange(g.total)}</span>}>{g.title}</SectionTitle>
          <ul className="grid gap-px">
            {g.items.map((it) => {
              const c = catalogByKind(it.kind);
              const on = selection?.type === 'item' && selection.uid === it.uid;
              return (
                <li key={it.uid}>
                  <button
                    type="button"
                    onClick={() => { setSelection({ type: 'item', uid: it.uid }); viewer.current?.focusItem(it.uid); }}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px]', on ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2')}
                  >
                    <span className="size-2.5 shrink-0 rounded-full border border-black/10" style={{ background: it.color ?? '#999' }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{c?.name ?? it.kind}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tnum">{c && c.price[1] ? fmtINRRange(c.price) : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!project.items.length && <p className="py-8 text-center text-[13px] text-muted-foreground">No furniture yet. Open Add and place a bed, a sofa or a kitchen counter.</p>}
    </div>
  );
}
