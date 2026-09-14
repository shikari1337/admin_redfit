import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The (i) button every form field carries: hover/focus/tap shows what the
 * field does and where it appears. Wraps its own TooltipProvider so it works
 * inside modals and portals that sit outside the layout's provider.
 */
const InfoTip: React.FC<{
  text: React.ReactNode;
  /** Optional second line, e.g. where on the website the value shows. */
  where?: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ text, where, className = '', side = 'top' }) => {
  if (!text && !where) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="What is this?"
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 align-middle ${className}`}
            onClick={(e) => e.preventDefault()}
          >
            <Info size={13} strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs bg-gray-900 text-white text-xs leading-relaxed px-3 py-2">
          <div>{text}</div>
          {where && <div className="mt-1 text-[11px] text-brand-200">{where}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoTip;
