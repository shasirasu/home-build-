import { lazy, Suspense, useEffect } from 'react';
import { useRoute } from '@/lib/router';
import Intro from '@/features/intro/Intro';
import { useStore } from '@/lib/store';

const Studio = lazy(() => import('@/features/studio/Studio'));
const PlanEditor = lazy(() => import('@/features/plan/PlanEditor'));
const NewProject = lazy(() => import('@/features/plan/NewProject'));

function Loading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center bg-background text-muted-foreground" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm">
        <span className="size-2 animate-pulse rounded-full bg-primary" />
        {label}
      </div>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const titles = { intro: 'Home Build 3D · walk into your plan', studio: 'Studio · Home Build 3D', plan: 'Plan · Home Build 3D', new: 'New house · Home Build 3D' };
    document.title = titles[route.page];
  }, [route.page]);

  // Links can name the house to open (?project=sample): the default house stays one click away after an upload.
  const wanted = route.params.get('project');
  useEffect(() => {
    const st = useStore.getState();
    if (wanted && st.projects[wanted] && st.currentId !== wanted) st.openProject(wanted);
  }, [wanted]);

  if (route.page === 'intro') return <Intro />;
  return (
    <Suspense fallback={<Loading label={route.page === 'studio' ? 'Building the house…' : 'Opening the plan…'} />}>
      {route.page === 'studio' && <Studio params={route.params} />}
      {route.page === 'plan' && <PlanEditor />}
      {route.page === 'new' && <NewProject />}
    </Suspense>
  );
}
