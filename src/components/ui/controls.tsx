import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Segmented control: one choice from a few, all visible. */
export function Segmented<T extends string>({
  value, options, onChange, size = 'md', className, label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-border bg-surface-2 p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-[background-color,color,box-shadow] duration-150 disabled:opacity-40 [&_svg]:size-3.5',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[13px]',
              on ? 'bg-surface text-foreground shadow-[0_1px_2px_rgb(var(--shadow-color)/0.14)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled on/off switch. */
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} title={hint} className={cn('flex cursor-pointer items-center justify-between gap-3 py-1 text-[13px]', disabled && 'opacity-45 pointer-events-none')}>
      <span>{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-primary' : 'bg-surface-3 border border-border')}
      >
        <span className={cn('absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-150 ease-out', checked ? 'left-[15px]' : 'left-[2px]')} />
      </button>
    </label>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cn('h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 tnum', className)}
    />
  );
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cn('h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] text-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20', className)}
    >
      {children}
    </select>
  );
}

export function Range({ value, min, max, step, onChange, label, display }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; display?: string }) {
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="flex justify-between text-muted-foreground"><span>{label}</span><span className="tnum text-foreground">{display ?? value}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-[var(--primary)]" />
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 text-[11px] font-medium text-muted-foreground">{children}</kbd>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5 first:pt-1">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{children}</h3>
      {action}
    </div>
  );
}

export function Swatch({ color, active, onClick, title }: { color: string; active?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn('size-6 rounded-full border border-black/10 transition-[box-shadow,transform] duration-150 hover:scale-110', active && 'ring-2 ring-primary ring-offset-2 ring-offset-surface')}
      style={{ background: color }}
    />
  );
}
