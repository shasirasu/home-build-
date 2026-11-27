import { useRef } from 'react';
import { Download, FileText, FolderOpen, RotateCcw, Trash2, Upload } from 'lucide-react';
import { SAMPLE_ID, useProject, useStore } from '@/lib/store';
import { downloadBlob, slug } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { SectionTitle, TextInput } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import type { HouseSpec, PlacedItem } from '@/types/house';
import { uid } from '@/lib/geom';
import { getBlob } from '@/lib/blobStore';

export function ProjectPanel() {
  const project = useProject();
  const projects = useStore((s) => s.projects);
  const currentId = useStore((s) => s.currentId);
  const { renameProject, openProject, deleteProject, resetSample, createProject } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJSON = () =>
    downloadBlob(`${slug(project.name)}.house.json`, new Blob([JSON.stringify({ format: 'home-build-3d', version: 1, name: project.name, spec: project.spec, items: project.items }, null, 2)], { type: 'application/json' }));

  const importJSON = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as { name?: string; spec?: HouseSpec; items?: PlacedItem[] };
      if (!data.spec?.levels?.length) throw new Error('no levels');
      createProject({ id: uid('p'), name: data.name ?? f.name.replace(/\..*$/, ''), spec: data.spec, items: data.items ?? [] });
    } catch {
      alert('That file is not a Home Build 3D house (.house.json). Export one from this panel to see the format.');
    }
  };

  const openSource = async () => {
    if (project.sourceKey) {
      const b = await getBlob(project.sourceKey);
      if (b) return window.open(URL.createObjectURL(b), '_blank');
    }
    if (project.spec.underlay?.url) window.open(project.spec.underlay.url, '_blank');
  };

  return (
    <div className="px-3 pb-6">
      <SectionTitle>This house</SectionTitle>
      <label className="grid gap-1 text-[13px]">
        <span className="text-muted-foreground">Name</span>
        <TextInput defaultValue={project.name} key={project.id} onBlur={(e) => e.target.value.trim() && renameProject(project.id, e.target.value.trim())} />
      </label>
      {project.spec.description && <p className="mt-2 text-[13px] text-muted-foreground">{project.spec.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(project.sourceKey || project.spec.underlay?.url) && (
          <Button size="sm" onClick={openSource}><FileText /> Source drawing</Button>
        )}
        <Button size="sm" onClick={exportJSON}><Download /> Export</Button>
        <Button size="sm" onClick={() => fileRef.current?.click()}><Upload /> Import</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ''; }} />
        {project.id === SAMPLE_ID && (
          <Button size="sm" variant="quiet" onClick={() => confirm('Reset the sample house to the original plan and furniture?') && resetSample()}><RotateCcw /> Reset sample</Button>
        )}
      </div>

      {!!project.spec.notes?.length && (
        <>
          <SectionTitle>How it was built</SectionTitle>
          <ul className="grid gap-2 text-[13px] leading-snug">
            {project.spec.notes.map((n, i) => (
              <li key={i} className="flex gap-2"><span className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" aria-hidden />{n}</li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Your houses</SectionTitle>
      <ul className="grid gap-px">
        {Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
          <li key={p.id} className="group flex items-center gap-1">
            <button type="button" onClick={() => openProject(p.id)} className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]', p.id === currentId ? 'bg-primary-soft text-primary' : 'hover:bg-surface-2')}>
              <FolderOpen className="size-3.5 shrink-0" />
              <span className="truncate font-medium">{p.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tnum">{p.spec.levels.length} fl · {p.items.length} items</span>
            </button>
            {p.id !== SAMPLE_ID && (
              <Button variant="quiet" size="icon-sm" aria-label={`Delete ${p.name}`} onClick={() => confirm(`Delete “${p.name}”? This can't be undone.`) && deleteProject(p.id)}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {currentId !== SAMPLE_ID && <Button className="mt-2 w-full" onClick={() => openProject(SAMPLE_ID)}><FolderOpen /> Open the default house</Button>}
      <Button className="mt-2 w-full" onClick={() => (location.hash = '#/new')}><Upload /> Create a new plan</Button>
    </div>
  );
}
