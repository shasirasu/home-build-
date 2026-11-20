import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-[0_1px_2px_rgb(var(--shadow-color)/0.2)]',
        secondary: 'bg-surface text-foreground border border-border hover:border-border-strong hover:bg-surface-2',
        ghost: 'text-foreground hover:bg-surface-2',
        quiet: 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
        danger: 'text-primary hover:bg-primary-soft',
        ink: 'bg-foreground text-background hover:opacity-90',
      },
      size: {
        sm: 'h-7 px-2.5 text-[13px] [&_svg]:size-3.5',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-12 px-5 text-base [&_svg]:size-[18px]',
        icon: 'size-8 [&_svg]:size-4',
        'icon-sm': 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';
