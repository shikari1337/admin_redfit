import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupStatus } from '../hooks/useSetupStatus';

const DISMISS_KEY = 'setup_banner_dismissed_until';

export const SetupBanner: React.FC = () => {
  const navigate = useNavigate();
  const { isComplete, completedCount, totalCount, steps, loading } = useSetupStatus();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      return until ? Date.now() < parseInt(until, 10) : false;
    } catch { return false; }
  });

  if (loading || isComplete || dismissed) return null;

  const incomplete = steps.filter(s => !s.done);
  if (incomplete.length === 0) return null;

  const handleDismiss = () => {
    // Dismiss for 24 hours
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 86_400_000)); } catch { /* */ }
    setDismissed(true);
  };

  const pct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-amber-900">
              Store setup {pct}% complete
            </span>
            {/* Progress bar */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-32 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-amber-700">{completedCount}/{totalCount}</span>
            </div>
          </div>

          <div className="text-xs text-amber-700 mt-0.5 truncate">
            Still needed: {incomplete.map(s => s.label).join(', ')}
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => navigate('/setup')}
          className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
        >
          Complete Setup
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-600 hover:text-amber-800 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
