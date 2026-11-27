import { useRef } from 'react';
import { Box, Camera, Eye, Footprints, Lamp, Layers, Lightbulb, LightbulbOff, Map as MapIcon, Moon, Move3d, PencilRuler, Redo2, Scissors, Sun, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented, Switch, Range } from '@/components/ui/controls';
import { Popover } from '@/components/ui/popover';
import { Wordmark } from '@/components/Wordmark';
import { useProject, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useViewer } from './viewerContext';
import type { ViewMode } from '@/three/api';

function Toggle({ on, onClick, icon, label, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-[background-color,border-color,color] duration-150 [&_svg]:size-4',
        on ? 'border-primary/50 bg-primary-soft text-primary' : 'border-border bg-surface text-foreground hover:border-border-strong',
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

const hourLabel = (h: number) => `${Math.floor(h) % 12 || 12}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;

export function TopBar() {
  const project = useProject();
  const display = useStore((s) => s.display);
  const setDisplay = useStore((s) => s.setDisplay);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const unit = useStore((s) => s.unit);
  const setUnit = useStore((s) => s.setUnit);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const viewer = useViewer();

  const levels = project.spec.levels;
  // Plan on the closed house would show only the roof: open the ground floor's plan, and put the whole house back
  // on leaving if the storey wasn't changed meanwhile.
  const autoLevel = useRef<string | null>(null);
  const pickMode = (m: ViewMode) => {
    const level = display.level ?? 'all';
    if (m === 'top' && level === 'all' && levels[0]) {
      autoLevel.current = levels[0].id;
      setDisplay({ level: levels[0].id });
    } else if (m !== 'top' && autoLevel.current) {
      if (level === autoLevel.current) setDisplay({ level: 'all' });
      autoLevel.current = null;
    }
    setMode(m);
  };
  const levelOptions = [{ value: 'all', label: 'All', title: 'Whole house with roof' }, ...levels.map((l) => ({ value: l.id, label: l.short, title: `${l.name} and below, cut away above` }))];

  const shot = () => {
    const url = viewer.current?.screenshot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, '-')}-3d.png`;
    a.click();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-3 [scrollbar-width:none] [&>*]:shrink-0">
      <Wordmark compact />
      <div className="mr-1 hidden min-w-0 max-w-[220px] sm:block">
        <p className="truncate text-[13px] font-semibold leading-tight">{project.name}</p>
        <a href="#/plan" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <PencilRuler className="size-3" /> Edit plan
        </a>
      </div>

      <div className="mx-auto flex items-center gap-2">
        <Segmented<ViewMode>
          label="Camera"
          value={mode}
          onChange={pickMode}
          options={[
            { value: 'orbit', label: <><Move3d /> <span className="hidden md:inline">Orbit</span></>, title: 'Orbit around the house (drag to turn, scroll to zoom)' },
            { value: 'walk', label: <><Footprints /> <span className="hidden md:inline">Walk</span></>, title: 'Walk inside at eye height (W A S D + mouse)' },
            { value: 'top', label: <><MapIcon /> <span className="hidden md:inline">Plan</span></>, title: 'Top view, aligned with the drawing' },
          ]}
        />
        <Segmented label="Storey" value={display.level ?? 'all'} onChange={(level) => setDisplay({ level })} options={levelOptions} />
        <span className="hidden h-6 w-px bg-border sm:block" />
        <Toggle on={!!display.cutWalls} onClick={() => setDisplay({ cutWalls: !display.cutWalls })} icon={<Scissors />} label="Dollhouse" title="Cut the walls at 1.25 m to see into the rooms" />
        <Toggle on={!!display.structure} onClick={() => setDisplay({ structure: !display.structure })} icon={<Box />} label="Structure" title="Show the RCC frame: footings, columns, beams, slabs" />
        <Toggle on={!!display.night} onClick={() => setDisplay({ night: !display.night })} icon={<Lamp />} label="Night" title="Night: the outdoor lights on (design them under Outside)" />
        {display.night && (
          <Toggle
            on={display.lightsOn !== false}
            onClick={() => setDisplay({ lightsOn: display.lightsOn === false })}
            icon={display.lightsOn === false ? <LightbulbOff /> : <Lightbulb />}
            label={display.lightsOn === false ? 'Lights off' : 'Lights on'}
            title={display.lightsOn === false ? 'Switch the outdoor lights back on (L)' : 'Switch every outdoor light off (L)'}
          />
        )}
        <Popover
          trigger={({ toggle, open }) => (
            <Button variant="secondary" size="sm" className={cn('h-8', open && 'border-border-strong')} onClick={toggle} aria-expanded={open}>
              <Eye /> <span className="hidden lg:inline">View</span>
            </Button>
          )}
        >
          <div className="grid gap-0.5">
            <Switch label="Roof and parapet" checked={!!display.showRoof} onChange={(v) => setDisplay({ showRoof: v })} />
            <Switch label="Furniture" hint="Off: hidden, and you can walk through where it stood" checked={!!display.showFurniture} onChange={(v) => setDisplay({ showFurniture: v })} />
            <Switch label="Room labels" checked={!!display.showLabels} onChange={(v) => setDisplay({ showLabels: v })} />
            <Switch label="Plot and compound wall" checked={!!display.showSite} onChange={(v) => setDisplay({ showSite: v })} />
            <div className="mt-2 grid gap-3 border-t border-border pt-3">
              <Range label={display.night ? 'Sun (shows by day)' : 'Sun'} min={6} max={19} step={0.25} value={display.sunHour ?? 10} display={hourLabel(display.sunHour ?? 10)} onChange={(sunHour) => setDisplay({ sunHour })} />
              <Range label="Dollhouse cut height" min={0.6} max={2.4} step={0.05} value={display.cutHeight ?? 1.25} display={`${(display.cutHeight ?? 1.25).toFixed(2)} m`} onChange={(cutHeight) => setDisplay({ cutHeight })} />
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Units</span>
                <Segmented size="sm" label="Units" value={unit} onChange={setUnit} options={[{ value: 'ft', label: `ft-in` }, { value: 'm', label: 'metres' }]} />
              </div>
            </div>
          </div>
        </Popover>
      </div>

      <div className="flex items-center gap-1">
        <Toggle on={editing} onClick={() => setEditing(!editing)} icon={<Layers />} label="Arrange" title="Drag furniture on the floor; R rotates 90°, Shift+R 15°" />
        <Button variant="quiet" size="icon" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Undo2 /></Button>
        <Button variant="quiet" size="icon" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 /></Button>
        <Button variant="quiet" size="icon" onClick={shot} aria-label="Save image" title="Save this view as PNG"><Camera /></Button>
        <Button variant="quiet" size="icon" aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
