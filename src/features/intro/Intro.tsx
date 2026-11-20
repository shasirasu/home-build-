import { ArrowRight, Footprints, Moon, Sun, Upload } from 'lucide-react';
import PerspectiveTunnelHero, { type TunnelImage } from '@/components/ui/perspective-tunnel-hero';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/Wordmark';
import { useStore } from '@/lib/store';
import { go } from '@/lib/router';

// The tunnel flies from the 2D drawing into the 3D house built from it: plan sheets and renders of the same sample.
const CARDS: (TunnelImage & { to: string })[] = [
  { src: '/intro/plan-ground.png', title: 'Ground floor · the drawing', to: '#/plan?project=sample' },
  { src: '/intro/render-exterior.jpg', title: 'North face · portico', to: '#/studio?project=sample' },
  { src: '/intro/render-hall.jpg', title: 'Hall', to: '#/studio?project=sample&focus=gf-hall' },
  { src: '/intro/plan-first.png', title: 'First floor · the drawing', to: '#/plan?project=sample&level=ff' },
  { src: '/intro/render-stair.jpg', title: 'Dog-leg stair · 18 risers', to: '#/studio?project=sample&walk=stair' },
  { src: '/intro/render-kitchen.jpg', title: 'Kitchen', to: '#/studio?project=sample&focus=gf-kitchen' },
  { src: '/intro/render-structure.jpg', title: 'RCC frame', to: '#/studio?project=sample&structure=1' },
  { src: '/intro/render-bedroom.jpg', title: 'Bedroom 3', to: '#/studio?project=sample&focus=ff-bed-front' },
  { src: '/intro/render-cutaway.jpg', title: 'First floor · cutaway', to: '#/studio?project=sample&level=ff' },
];

export default function Intro() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <main className="relative h-[100svh] overflow-hidden bg-background">
      <PerspectiveTunnelHero
        images={CARDS}
        onCardSelect={(_, i) => go(CARDS[i].to)}
        title={<>WALK INTO<br />YOUR PLAN.</>}
        subtitle="Give us a 2D house plan. Every wall, door and stair is built in 3D from the drawing, so you can walk through the house, furnish it and count what it takes to build."
        scrollPrompt="Scroll to fly in"
        initialProgress={0.1}
      />
      {/* Navigation and actions sit outside the tunnel's 3D space so a near card can never cover them. */}
        <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <Wordmark />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#/studio" className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface-2 sm:inline-flex">3D studio</a>
            <a href="#/new" className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-surface-2 sm:inline-flex">New plan</a>
            <Button variant="quiet" size="icon" aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </nav>
        </header>

        <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-5 sm:px-8 sm:pb-8">
          <div className="mx-auto flex max-w-5xl flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
            {/* Drawing title block: what the sample is, in the drawing's own vocabulary */}
            <dl className="grid grid-cols-4 overflow-hidden rounded-md border border-foreground/70 bg-surface text-[11px] leading-tight shadow-panel sm:w-[440px]">
              {[
                ['Sample', 'House Plan-Model'],
                ['Plot', `22' × 36'`],
                ['Floors', 'G + 1'],
                ['Rooms', '15'],
              ].map(([k, v], i) => (
                <div key={k} className={i ? 'border-l border-foreground/25 px-2.5 py-2' : 'px-2.5 py-2'}>
                  <dt className="text-muted-foreground uppercase tracking-[0.06em]">{k}</dt>
                  <dd className="mt-0.5 truncate font-semibold text-foreground tnum">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" size="lg" onClick={() => go('#/new')} className="shadow-panel">
                <Upload /> Upload your plan
              </Button>
              <Button variant="primary" size="lg" onClick={() => go('#/studio?project=sample&walk=1')}>
                <Footprints /> Walk through the sample <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
    </main>
  );
}
