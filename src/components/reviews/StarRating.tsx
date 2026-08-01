import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stars, read-only or interactive. One implementation so a rating looks the same
 * in the queue, the drawer, the editor and the import preview.
 */
export const StarRating: React.FC<{
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
  showValue?: boolean;
}> = ({ value, onChange, size = 14, className, showValue }) => {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  const interactive = Boolean(onChange);

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        const star = (
          <Star
            width={size}
            height={size}
            className={cn(
              'transition-colors',
              filled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-gray-300',
            )}
          />
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange!(n)}
            className="rounded p-0.5 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
      {showValue && (
        <span className="ml-1 text-xs font-medium tabular-nums text-gray-600">
          {Number(value || 0).toFixed(1)}
        </span>
      )}
    </span>
  );
};

export default StarRating;
