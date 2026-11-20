import { useEffect, useRef, useState } from 'react';
import { HouseViewer } from '@/three/HouseViewer';
import type { PlacedItem } from '@/types/house';
import { useProject, useStore } from '@/lib/store';
import { useViewer } from './viewerContext';

/** Mounts the 3D engine and keeps it in step with the store. All state lives in the store; the engine renders it. */
export function Viewer3D({ onReady, onPlaced }: { onReady?: () => void; onPlaced?: (item: PlacedItem | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useViewer();
  const project = useProject();
  const display = useStore((s) => s.display);
  const theme = useStore((s) => s.theme);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const editing = useStore((s) => s.editing);
  const [failed, setFailed] = useState<string | null>(null);
  const placedRef = useRef(onPlaced);
  placedRef.current = onPlaced;
  // What the engine currently holds, so mount and the sync effects never build the same house twice.
  const applied = useRef<{ spec: unknown; items: unknown }>({ spec: null, items: null });

  useEffect(() => {
    if (!host.current) return;
    let v: HouseViewer;
    try {
      const st = useStore.getState();
      v = new HouseViewer({
        container: host.current,
        display: { ...st.display, theme: st.theme, showLabels: false },
        onSelect: (sel) => useStore.getState().setSelection(sel),
        onRoomChange: (levelId, roomId) => useStore.getState().setWalkRoom(levelId, roomId),
        onModeChange: (m) => { if (useStore.getState().mode !== m) useStore.getState().setMode(m); },
        onItemChange: (item) => useStore.getState().updateItems((items) => items.map((it) => (it.uid === item.uid ? item : it))),
        onPlaceEnd: (item) => placedRef.current?.(item),
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
      return;
    }
    viewerRef.current = v;
    if (import.meta.env.DEV) (window as unknown as { __viewer?: HouseViewer }).__viewer = v; // for scripted checks
    const p = useStore.getState().current();
    v.setHouse(p.spec);
    v.setItems(p.items);
    applied.current = { spec: p.spec, items: p.items };
    onReady?.();
    const ro = new ResizeObserver(() => v.resize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      viewerRef.current = null;
      applied.current = { spec: null, items: null };
      v.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || applied.current.spec === project.spec) return;
    applied.current.spec = project.spec;
    v.setHouse(project.spec);
  }, [project.spec, viewerRef]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || applied.current.items === project.items) return;
    applied.current.items = project.items;
    v.setItems(project.items);
  }, [project.items, viewerRef]);
  useEffect(() => {
    // Room labels only help when you can see into the rooms; on the closed house they float through the walls.
    const open = !display.structure && (display.level !== 'all' || !!display.cutWalls || display.showRoof === false);
    viewerRef.current?.setDisplay({ ...display, theme, showLabels: !!display.showLabels && open });
  }, [display, theme, viewerRef]);
  useEffect(() => { viewerRef.current?.select(selection); }, [selection, viewerRef]);
  useEffect(() => { viewerRef.current?.setEditing(editing); }, [editing, viewerRef]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.getMode() === mode) return;
    if (mode === 'walk') v.enterWalk();
    else v.setMode(mode);
  }, [mode, viewerRef]);

  if (failed)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="font-semibold">The 3D view could not start.</p>
          <p className="mt-1 text-sm text-muted-foreground">Your browser blocked WebGL ({failed}). Turn on hardware acceleration in the browser settings, then reload.</p>
        </div>
      </div>
    );
  return <div ref={host} className="absolute inset-0 touch-none outline-none" />;
}
