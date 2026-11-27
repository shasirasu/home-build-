import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, DoorOpen, Home, ListChecks, PaintRoller, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import type { HouseViewerAPI } from '@/three/api';
import type { CatalogItem } from '@/data/catalog';
import type { PlacedItem } from '@/types/house';
import { useProject, useStore } from '@/lib/store';
import { labelPoint, uid } from '@/lib/geom';
import { autoFurnish } from '@/lib/furnish';
import { cn } from '@/lib/utils';
import { ViewerContext } from './viewerContext';
import { Viewer3D } from './Viewer3D';
import { TopBar } from './TopBar';
import { Inspector } from './Inspector';
import { WalkHud } from './WalkHud';
import { StructureLegend } from './StructureLegend';
import { RoomsPanel } from './panels/RoomsPanel';
import { AddPanel } from './panels/AddPanel';
import { ItemsPanel } from './panels/ItemsPanel';
import { QuantitiesPanel } from './panels/QuantitiesPanel';
import { ProjectPanel } from './panels/ProjectPanel';
import { ExteriorPanel } from './panels/ExteriorPanel';

type Tab = 'rooms' | 'outside' | 'add' | 'items' | 'qty' | 'house';
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'rooms', label: 'Rooms', icon: DoorOpen },
  { id: 'outside', label: 'Outside', icon: PaintRoller },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'items', label: 'Items', icon: ListChecks },
  { id: 'qty', label: 'Quantities', icon: Calculator },
  { id: 'house', label: 'House', icon: Home },
];

export default function Studio({ params }: { params: URLSearchParams }) {
  const viewerRef = useRef<HouseViewerAPI | null>(null);
  const project = useProject();
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const [tab, setTab] = useState<Tab>('rooms');
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 900);
  const [placing, setPlacing] = useState<string | null>(null);

  // Deep links from the intro: ?walk=1 | ?walk=stair | ?focus=<roomId> | ?structure=1 | ?level=<id> | ?night=1 | ?tab=outside
  const applyParams = useCallback(() => {
    let st = useStore.getState();
    const v = viewerRef.current;
    if (!v) return;
    // ?project=sample: switch to that house first, so the rest of the link applies to it
    const pid = params.get('project');
    if (pid && st.projects[pid] && st.currentId !== pid) { st.openProject(pid); st = useStore.getState(); }
    const spec = st.current().spec;
    if (params.get('structure')) st.setDisplay({ structure: true, level: 'all' });
    if (params.has('night')) st.setDisplay({ night: params.get('night') !== '0' });
    const t = params.get('tab');
    if (t && TABS.some((x) => x.id === t)) { setTab(t as Tab); setPanelOpen(true); }
    const level = params.get('level');
    if (level && spec.levels.some((l) => l.id === level)) st.setDisplay({ level, cutWalls: true });
    const focus = params.get('focus');
    if (focus) {
      const lv = spec.levels.find((l) => l.rooms.some((r) => r.id === focus));
      if (lv) { st.setDisplay({ level: lv.id, cutWalls: true }); st.setSelection({ type: 'room', levelId: lv.id, roomId: focus }); setTimeout(() => v.focusRoom(lv.id, focus), 50); }
    }
    const walk = params.get('walk');
    if (walk) {
      st.setDisplay({ level: 'all', cutWalls: false, structure: false });
      st.setMode('walk');
      if (walk === 'stair') {
        const gf = spec.levels[0];
        const stair = gf.rooms.find((r) => r.type === 'staircase') ?? gf.rooms.find((r) => r.type === 'hall');
        if (stair) { const [x, y] = labelPoint(stair.polygon); setTimeout(() => v.enterWalk({ levelId: gf.id, x: x + 1.6, y: y + 2.2, yaw: Math.PI / 2 }), 50); }
      } else setTimeout(() => v.enterWalk(), 50);
    }
    if (params.toString()) history.replaceState(null, '', '#/studio');
  }, [params]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection?.type === 'item') {
        const id = st.selection.uid;
        const it = st.current().items.find((i) => i.uid === id);
        if (it && !it.locked) { st.updateItems((items) => items.filter((i) => i.uid !== id)); st.setSelection(null); }
      }
      if (e.key === 'Escape' && st.mode !== 'walk' && !placing) st.setSelection(null);
      // walking: F hides the furniture (and lets you walk through where it stood) or brings it back
      if (st.mode === 'walk' && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'KeyF') st.setDisplay({ showFurniture: st.display.showFurniture === false });
      // L switches the outdoor lights off / on at night (anywhere but in a text field)
      if (st.display.night && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'KeyL') st.setDisplay({ lightsOn: st.display.lightsOn === false });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [placing]);

  const startPlace = (c: CatalogItem) => {
    const st = useStore.getState();
    const spec = st.current().spec;
    let levelId = st.display.level && st.display.level !== 'all' ? st.display.level : spec.levels[0].id;
    if (st.display.level === 'all' || !st.display.level) st.setDisplay({ level: levelId, cutWalls: true });
    if (st.mode === 'walk') st.setMode('orbit');
    const draft: PlacedItem = {
      uid: uid('it'), kind: c.kind, levelId, x: 0, y: 0, rot: 0, w: c.w, d: c.d, h: c.h,
      elevation: c.mount === 'wall' ? c.elevation : undefined, color: c.colors[0],
    };
    const v = viewerRef.current;
    if (v) {
      setPlacing(c.name);
      requestAnimationFrame(() => v.beginPlace(draft));
    } else {
      // No 3D: drop it in the middle of the first room on the level that suits it.
      const lv = spec.levels.find((l) => l.id === levelId)!;
      const room = lv.rooms.find((r) => c.rooms.includes(r.type)) ?? lv.rooms[0];
      const [x, y] = room ? labelPoint(room.polygon) : [1, 1];
      st.updateItems((items) => [...items, { ...draft, x, y, roomId: room?.id }]);
    }
  };

  /** A standard layout for every room that has nothing in it yet. Returns how many pieces were added. */
  const furnishEmpty = () => {
    const st = useStore.getState();
    const p = st.current();
    const have = new Set(p.items.map((i) => i.roomId));
    const add = autoFurnish(p.spec).filter((i) => !have.has(i.roomId)).map((i) => ({ ...i, uid: uid('it') }));
    if (add.length) st.updateItems((items) => [...items, ...add]);
    return add.length;
  };

  const onPlaced = (item: PlacedItem | null) => {
    setPlacing(null);
    if (!item) return;
    const st = useStore.getState();
    st.updateItems((items) => [...items, item]);
    st.setSelection({ type: 'item', uid: item.uid });
    setTab('items');
  };

  return (
    <ViewerContext.Provider value={viewerRef}>
      <div className="flex h-[100svh] flex-col bg-background">
        <TopBar />
        <div className="relative flex min-h-0 flex-1">
          {/* Left panel */}
          <aside
            className={cn(
              'z-20 flex w-[300px] shrink-0 flex-col border-r border-border bg-surface transition-[margin] duration-200 ease-out max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-pop',
              !(panelOpen && mode !== 'walk') && '-ml-[300px] max-md:-translate-x-full max-md:ml-0',
            )}
            aria-label="House panel"
            aria-hidden={!panelOpen || mode === 'walk'}
            inert={!panelOpen || mode === 'walk'}
          >
            <nav className="flex shrink-0 gap-0.5 border-b border-border px-2 pt-2" role="tablist" aria-label="Panels">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('-mb-px flex flex-1 flex-col items-center gap-0.5 border-b-2 px-1 pb-1.5 pt-1 text-[11px] font-medium transition-colors', tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'rooms' && <RoomsPanel />}
              {tab === 'outside' && <ExteriorPanel />}
              {tab === 'add' && <AddPanel onAdd={startPlace} onFurnish={furnishEmpty} />}
              {tab === 'items' && <ItemsPanel />}
              {tab === 'qty' && <QuantitiesPanel />}
              {tab === 'house' && <ProjectPanel />}
            </div>
          </aside>

          {/* 3D */}
          <main className="relative min-w-0 flex-1 overflow-hidden" aria-label={`3D view of ${project.name}`}>
            <Viewer3D onReady={applyParams} onPlaced={onPlaced} />
            {mode !== 'walk' && (
              <button
                type="button"
                onClick={() => setPanelOpen((o) => !o)}
                aria-label={panelOpen ? 'Hide panel' : 'Show panel'}
                className="absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-md border border-border bg-surface/90 text-muted-foreground shadow-panel backdrop-blur-sm hover:text-foreground"
              >
                {panelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </button>
            )}
            {placing && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                <div className="rounded-full bg-foreground px-3.5 py-1.5 text-[13px] text-background shadow-pop animate-[rise_200ms_var(--ease-out-expo)]">
                  Placing <b>{placing}</b> · click a floor · R rotates · Esc cancels
                </div>
              </div>
            )}
            <WalkHud />
            <StructureLegend />
          </main>

          {/* Inspector */}
          {selection && mode !== 'walk' && (
            <aside className="z-20 w-[300px] shrink-0 overflow-y-auto border-l border-border bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:shadow-pop animate-[rise_180ms_var(--ease-out-expo)]" aria-label="Selection">
              <Inspector />
            </aside>
          )}
        </div>
      </div>
    </ViewerContext.Provider>
  );
}
