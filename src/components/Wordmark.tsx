import { cn } from '@/lib/utils';

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <a href="#/" className={cn('group inline-flex items-center gap-2 text-foreground no-underline', className)} aria-label="Home Build 3D — intro">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-foreground" />
        <path d="M8 23V13.5L16 8l8 5.5V23" fill="none" className="stroke-background" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M13 23v-5h6v5" fill="none" className="stroke-primary" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="wide text-[15px] font-bold tracking-[-0.01em]">Home Build 3D</span>}
    </a>
  );
}
