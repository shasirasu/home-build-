import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HouseSpec, PlacedItem } from '@/types/house';
import type { DisplayOptions, Selection, ViewMode } from '@/three/api';
import { SAMPLE_HOUSE } from '@/data/sampleHouse';
import { SAMPLE_FURNISHING } from '@/data/sampleFurnishing';
import { DEFAULT_RATES, type Rates } from './quantities';

export interface Project {
  id: string;
  name: string;
  spec: HouseSpec;
  items: PlacedItem[];
  createdAt: number;
  updatedAt: number;
  /** Uploaded drawing kept in IndexedDB under this key (see blobStore). */
  sourceKey?: string;
  sourceName?: string;
}

const clone = <T,>(v: T): T => structuredClone(v);

export const SAMPLE_ID = 'sample';
const sampleProject = (): Project => ({
  id: SAMPLE_ID,
  name: 'House Plan-Model',
  spec: clone(SAMPLE_HOUSE),
  items: clone(SAMPLE_FURNISHING),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sourceName: 'House Plan-Model.pdf',
});

interface Snapshot { spec: HouseSpec; items: PlacedItem[] }

interface State {
  projects: Record<string, Project>;
  currentId: string;
  rates: Rates;
  unit: 'ft' | 'm';
  theme: 'light' | 'dark';
  display: Partial<DisplayOptions>;
  // session (not persisted)
  selection: Selection | null;
  mode: ViewMode;
  editing: boolean;
  walkRoom: { levelId: string | null; roomId: string | null };
  past: Snapshot[];
  future: Snapshot[];

  current: () => Project;
  openProject: (id: string) => void;
  createProject: (p: Omit<Project, 'createdAt' | 'updatedAt'>) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  resetSample: () => void;
  updateSpec: (fn: (spec: HouseSpec) => void, opts?: { history?: boolean }) => void;
  setSpec: (spec: HouseSpec) => void;
  updateItems: (fn: (items: PlacedItem[]) => PlacedItem[] | void, opts?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (s: Selection | null) => void;
  setMode: (m: ViewMode) => void;
  setEditing: (v: boolean) => void;
  setWalkRoom: (levelId: string | null, roomId: string | null) => void;
  setDisplay: (d: Partial<DisplayOptions>) => void;
  setRates: (r: Partial<Rates>) => void;
  setUnit: (u: 'ft' | 'm') => void;
  setTheme: (t: 'light' | 'dark') => void;
}

const HISTORY = 60;

/** Set when the browser refused to save (storage full): the studio shows it. */
export const storageProblem: { full: boolean; listeners: Set<() => void> } = { full: false, listeners: new Set() };

/** localStorage that never throws into the app: a full store is reported instead of breaking every edit. */
const safeLocalStorage: Storage = {
  get length() { return localStorage.length; },
  clear: () => localStorage.clear(),
  key: (i) => localStorage.key(i),
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
  setItem: (k, v) => {
    let full = false;
    try { localStorage.setItem(k, v); } catch (e) { full = true; console.warn('[store] could not save the houses', e); }
    if (full !== storageProblem.full) { storageProblem.full = full; storageProblem.listeners.forEach((f) => f()); }
  },
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const snapshot = (): Snapshot => {
        const p = get().current();
        return { spec: p.spec, items: p.items };
      };
      const touch = (patch: Partial<Project>, history = true) =>
        set((s) => {
          const p = s.projects[s.currentId];
          const past = history ? [...s.past, { spec: p.spec, items: p.items }].slice(-HISTORY) : s.past;
          return { projects: { ...s.projects, [p.id]: { ...p, ...patch, updatedAt: Date.now() } }, past, future: history ? [] : s.future };
        });
      return {
        projects: { [SAMPLE_ID]: sampleProject() },
        currentId: SAMPLE_ID,
        rates: DEFAULT_RATES,
        unit: 'ft',
        theme: (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') ? 'dark' : 'light',
        display: { level: 'all', cutWalls: false, cutHeight: 1.25, structure: false, showRoof: true, showFurniture: true, showLabels: true, showSite: true, sunHour: 10, night: false, lightsOn: true },
        selection: null,
        mode: 'orbit',
        editing: false,
        walkRoom: { levelId: null, roomId: null },
        past: [],
        future: [],

        current: () => get().projects[get().currentId] ?? get().projects[SAMPLE_ID] ?? sampleProject(),
        openProject: (id) => set({ currentId: id, selection: null, past: [], future: [] }),
        createProject: (p) => set((s) => ({ projects: { ...s.projects, [p.id]: { ...p, createdAt: Date.now(), updatedAt: Date.now() } }, currentId: p.id, selection: null, past: [], future: [] })),
        renameProject: (id, name) => set((s) => ({ projects: { ...s.projects, [id]: { ...s.projects[id], name } } })),
        deleteProject: (id) =>
          set((s) => {
            if (id === SAMPLE_ID) return s;
            const { [id]: _, ...rest } = s.projects;
            return { projects: rest, currentId: s.currentId === id ? SAMPLE_ID : s.currentId };
          }),
        resetSample: () => set((s) => ({ projects: { ...s.projects, [SAMPLE_ID]: sampleProject() }, past: [], future: [], selection: null })),
        updateSpec: (fn, opts) => {
          const spec = clone(get().current().spec);
          fn(spec);
          touch({ spec }, opts?.history !== false);
        },
        setSpec: (spec) => touch({ spec }),
        updateItems: (fn, opts) => {
          const items = clone(get().current().items);
          const out = fn(items);
          touch({ items: out ?? items }, opts?.history !== false);
        },
        undo: () =>
          set((s) => {
            const prev = s.past[s.past.length - 1];
            if (!prev) return s;
            const p = s.projects[s.currentId];
            return { past: s.past.slice(0, -1), future: [snapshot(), ...s.future].slice(0, HISTORY), projects: { ...s.projects, [p.id]: { ...p, ...prev, updatedAt: Date.now() } } };
          }),
        redo: () =>
          set((s) => {
            const next = s.future[0];
            if (!next) return s;
            const p = s.projects[s.currentId];
            return { future: s.future.slice(1), past: [...s.past, snapshot()].slice(-HISTORY), projects: { ...s.projects, [p.id]: { ...p, ...next, updatedAt: Date.now() } } };
          }),
        setSelection: (selection) => set({ selection }),
        setMode: (mode) => set({ mode }),
        setEditing: (editing) => set({ editing }),
        setWalkRoom: (levelId, roomId) => set({ walkRoom: { levelId, roomId } }),
        setDisplay: (d) => set((s) => ({ display: { ...s.display, ...d } })),
        setRates: (r) => set((s) => ({ rates: { ...s.rates, ...r } })),
        setUnit: (unit) => set({ unit }),
        setTheme: (theme) => {
          try { localStorage.setItem('hb3d-theme', theme); } catch { /* private mode */ }
          document.documentElement.dataset.theme = theme;
          set({ theme });
        },
      };
    },
    {
      name: 'hb3d-store-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ projects: s.projects, currentId: s.currentId, rates: s.rates, unit: s.unit, display: s.display }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const projects = { ...(p.projects ?? {}) };
        if (!projects[SAMPLE_ID]) projects[SAMPLE_ID] = sampleProject();
        return { ...current, ...p, projects, currentId: p.currentId && projects[p.currentId] ? p.currentId : SAMPLE_ID };
      },
    },
  ),
);

export const useProject = () => useStore((s) => s.projects[s.currentId] ?? s.projects[SAMPLE_ID]);
