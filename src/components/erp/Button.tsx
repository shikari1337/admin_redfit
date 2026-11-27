import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * ERP button — ONE visual language across every panel, POS and the scanner.
 *   primary  → Growcord orange, lifted (the suite kit's gc-btn-primary; ADMIN-BRAND-1, owner 27 Nov 2026)
 *   success  → emerald (save / download / confirm-money)
 *   danger   → solid red (destructive)
 *   dangerOutline → quiet red (destructive, secondary weight)
 *   outline  → white with hairline border (secondary)
 *   ghost    → text-only (tertiary / toolbar)
 *
 * Sizes lg/xl keep 44px+ touch targets for the POS & warehouse floor.
 */
export const btn = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_4px_10px_-4px_color-mix(in_srgb,var(--b-600)_60%,transparent)] hover:from-brand-600 hover:to-brand-700',
        success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
        danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
        dangerOutline: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
        outline: 'border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50',
        ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-sm',
        xl: 'h-14 px-6 text-lg font-semibold [&_svg]:size-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface BtnProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof btn> {
  asChild?: boolean;
}

export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(btn({ variant, size }), className)} {...props} />;
  },
);
Btn.displayName = 'Btn';

export default Btn;
