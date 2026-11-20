import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Small anchored popover rendered in a portal (escapes overflow clipping). Closes on outside click and Esc. */
export function Popover({ trigger, children, align = 'end', className }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; align?: 'start' | 'end'; className?: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = panel.current?.offsetWidth ?? 260;
    const left = align === 'end' ? Math.max(8, r.right - w) : Math.min(window.innerWidth - w - 8, r.left);
    setPos({ top: r.bottom + 6, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', onDown, true);
    addEventListener('keydown', onKey);
    return () => { removeEventListener('pointerdown', onDown, true); removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <span ref={anchor} className="inline-flex">{trigger({ open, toggle: () => setOpen((o) => !o) })}</span>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            style={{ top: pos.top, left: pos.left }}
            className={cn('fixed z-50 w-[260px] rounded-lg border border-border bg-surface p-3 shadow-pop animate-[pop_160ms_var(--ease-out-expo)]', className)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
