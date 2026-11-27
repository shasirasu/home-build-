import { Lightbulb, LightbulbOff, LogOut, Sofa } from 'lucide-react';
import { useProject, useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export function WalkHud() {
  const mode = useStore((s) => s.mode);
  const walkRoom = useStore((s) => s.walkRoom);
  const setMode = useStore((s) => s.setMode);
  const furniture = useStore((s) => s.display.showFurniture !== false);
  const night = useStore((s) => !!s.display.night);
  const lightsOn = useStore((s) => s.display.lightsOn !== false);
  const setDisplay = useStore((s) => s.setDisplay);
  const project = useProject();
  if (mode !== 'walk') return null;
  const lv = project.spec.levels.find((l) => l.id === walkRoom.levelId);
  const room = lv?.rooms.find((r) => r.id === walkRoom.roomId);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="rounded-full border border-border bg-surface/90 px-3.5 py-1.5 text-[13px] shadow-panel backdrop-blur-sm animate-[rise_200ms_var(--ease-out-expo)]" aria-live="polite">
          {room ? <><span className="font-semibold">{room.name}</span><span className="text-muted-foreground"> · {lv?.name}{room.sizeLabel ? ` · ${room.sizeLabel}` : ''}</span></> : <span className="text-muted-foreground">Outside</span>}
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 bottom-3 z-10 hidden rounded-lg border border-border bg-surface/90 p-2.5 text-xs shadow-panel backdrop-blur-sm sm:block">
        <p className="mb-1.5 font-semibold">Walking</p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="flex gap-0.5"><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd></span><span>move</span>
          <span><Kbd>Shift</Kbd></span><span>walk faster</span>
          <span className="text-foreground">Click + mouse</span><span>look around</span>
          <span><Kbd>F</Kbd></span><span>furniture {furniture ? 'off (walk through)' : 'back on'}</span>
          {night && <><span><Kbd>L</Kbd></span><span>lights {lightsOn ? 'off' : 'on'}</span></>}
          <span><Kbd>Esc</Kbd></span><span>free the mouse</span>
        </div>
      </div>
      <div className="absolute right-3 bottom-3 z-10 flex gap-2">
        {night && (
          <Button
            variant="secondary"
            className="shadow-panel"
            aria-pressed={!lightsOn}
            title={lightsOn ? 'Switch every outdoor light off (L)' : 'Switch the outdoor lights back on (L)'}
            onClick={() => setDisplay({ lightsOn: !lightsOn })}
          >
            {lightsOn ? <><LightbulbOff /> Lights off</> : <><Lightbulb /> Lights on</>}
          </Button>
        )}
        <Button
          variant="secondary"
          className={cn('shadow-panel', !furniture && 'border-primary/50 bg-primary-soft text-primary hover:bg-primary-soft')}
          aria-pressed={!furniture}
          title={furniture ? 'Hide the furniture and walk through where it stood (F)' : 'Show the furniture again (F)'}
          onClick={() => setDisplay({ showFurniture: !furniture })}
        >
          <Sofa /> {furniture ? 'Hide furniture' : 'Furniture hidden'}
        </Button>
        <Button variant="secondary" className="shadow-panel" onClick={() => setMode('orbit')}><LogOut /> Leave walk</Button>
      </div>
      {/* crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]" aria-hidden />
    </>
  );
}
