import { Footprints } from 'lucide-react';
import { useProject, useStore } from '@/lib/store';
import { polygonArea, labelPoint } from '@/lib/geom';
import { fmtArea, fmtLen } from '@/lib/units';
import { SectionTitle } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { useViewer } from '../viewerContext';

export function RoomsPanel() {
  const project = useProject();
  const unit = useStore((s) => s.unit);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setDisplay = useStore((s) => s.setDisplay);
  const walkRoom = useStore((s) => s.walkRoom);
  const viewer = useViewer();

  return (
    <div className="px-3 pb-4">
      {project.spec.levels.map((lv) => (
        <section key={lv.id}>
          <SectionTitle>
            {lv.name} <span className="font-normal normal-case tracking-normal">· +{fmtLen(lv.elevation, unit)}</span>
          </SectionTitle>
          <ul className="grid gap-px">
            {lv.rooms.map((r) => {
              const on = selection?.type === 'room' && selection.roomId === r.id;
              const here = walkRoom.roomId === r.id;
              const items = project.items.filter((i) => i.roomId === r.id).length;
              return (
                <li key={r.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelection({ type: 'room', levelId: lv.id, roomId: r.id });
                      setDisplay({ level: lv.id });
                      viewer.current?.focusRoom(lv.id, r.id);
                    }}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors', on ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                  >
                    <span className="size-3 shrink-0 rounded-sm border border-black/10" style={{ background: r.wallColor }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[13px] font-medium', on && 'text-primary')}>
                        {r.name}
                        {here && <span className="ml-1.5 text-[11px] font-semibold text-primary">· you are here</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground tnum">
                        {r.sizeLabel ?? '—'} · {fmtArea(polygonArea(r.polygon), unit)}{items ? ` · ${items} item${items > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                  </button>
                  {!r.outdoor && (
                    <button
                      type="button"
                      title={`Walk into ${r.name}`}
                      aria-label={`Walk into ${r.name}`}
                      onClick={() => {
                        const [x, y] = labelPoint(r.polygon);
                        setDisplay({ level: 'all' });
                        useStore.getState().setMode('walk');
                        requestAnimationFrame(() => viewer.current?.enterWalk({ levelId: lv.id, x, y }));
                      }}
                      className="absolute right-1.5 top-1/2 hidden size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground group-hover:grid focus-visible:grid"
                    >
                      <Footprints className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
