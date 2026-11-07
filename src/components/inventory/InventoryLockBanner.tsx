import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Btn } from '@/components/erp';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useInventoryLock } from '../../hooks/useInventoryLock';
import { formatDateTime } from '../../utils/date';

/** Epoch microseconds → the store's wall clock. */
const when = (us: number | null | undefined) => (typeof us === 'number' ? formatDateTime(new Date(us / 1000)) : 'unknown');

/**
 * The inventory lock, said once at the top of a stock screen (DEC-069):
 *  · locked   → "🔒 Stock is managed by <ERP> and updated every hour. Manual changes are locked."
 *               plus, for an admin (`inventory.delete`), Unlock (reason required);
 *  · unlocked after having been locked → a quieter line saying the hourly ERP update is
 *               paused, plus Lock again for an admin;
 *  · never locked / not served by this server → nothing.
 * Downloads and exports are never affected by the lock.
 */
export default function InventoryLockBanner({ className = '' }: { className?: string }) {
  const lock = useInventoryLock();
  const [dialog, setDialog] = useState<'' | 'unlock' | 'lock'>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lock.loading || lock.unavailable || !lock.state) return null;
  const s = lock.state;
  const wasLocked = !s.locked && (lock.events.some((e) => e.locked) || (s.source ?? '').startsWith('erp:'));
  if (!s.locked && !wasLocked) return null;

  const open = (which: 'unlock' | 'lock') => { setReason(''); setError(null); setDialog(which); };
  const tooShort = dialog === 'unlock' && reason.trim().length < 10;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (dialog === 'unlock') await lock.unlock(reason.trim());
      else await lock.lock(reason.trim() || undefined);
      setDialog('');
    } catch (err: any) {
      const status = err?.response?.status;
      setError(status === 403
        ? 'Only an admin can do this (it needs the inventory.delete permission).'
        : status === 404 || status === 501
          ? 'Locking and unlocking are not available on this server yet.'
          : err?.response?.data?.message || err?.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {s.locked ? (
        <div role="status" data-testid="inventory-lock-banner"
          className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className}`}>
          <div className="flex min-w-0 items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold"><span aria-hidden>🔒 </span>{lock.message}</p>
              <p className="mt-0.5 text-xs text-amber-800">
                Locked {when(s.since_us)}{s.by_name ? ` by ${s.by_name}` : ''}{s.reason ? `: ${s.reason}` : ''}.
                {' '}Downloads, sheet exports and the ERP order export still work.
                {!lock.canUnlock && ' Only an admin can unlock it.'}
              </p>
            </div>
          </div>
          {lock.canUnlock && (
            <Btn variant="outline" size="sm" onClick={() => open('unlock')} data-testid="inventory-unlock">
              <LockOpen /> Unlock
            </Btn>
          )}
        </div>
      ) : (
        <div role="status" data-testid="inventory-unlocked-banner"
          className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 ${className}`}>
          <div className="flex min-w-0 items-start gap-2">
            <LockOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0">
              Stock is unlocked for manual changes{s.by_name ? ` by ${s.by_name}` : ''} since {when(s.since_us)}{s.reason ? `: ${s.reason}` : ''}.
              {' '}The hourly update from {lock.label} is paused until it is locked again.
            </p>
          </div>
          {lock.canUnlock && (
            <Btn variant="outline" size="sm" onClick={() => open('lock')} data-testid="inventory-lock-again">
              <Lock /> Lock again
            </Btn>
          )}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && !busy) setDialog(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === 'unlock' ? 'Unlock stock for manual changes?' : 'Lock stock again?'}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-gray-600">
                {dialog === 'unlock' ? (
                  <p className="rounded-md bg-amber-50 p-2.5 text-amber-900">
                    While unlocked the hourly ERP update is paused; your manual changes will stay until you lock again.
                  </p>
                ) : (
                  <p>
                    Manual stock changes will be refused again, and the next hourly run sets every matching SKU to {lock.label}'s quantity.
                    Manual changes made while unlocked are overwritten then.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-gray-600">
              {dialog === 'unlock' ? 'Why are you unlocking? (at least 10 characters, kept in the lock history)' : 'Note (optional, kept in the lock history)'}
            </span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-gray-200 p-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              required={dialog === 'unlock'}
              aria-invalid={tooShort && reason.length > 0}
            />
            {dialog === 'unlock' && <span className="text-xs text-gray-500">{reason.trim().length}/10 characters minimum</span>}
          </label>
          {error && <p className="rounded-md bg-red-50 p-2.5 text-sm text-red-700" role="alert">{error}</p>}
          <DialogFooter className="gap-2">
            <Btn variant="outline" onClick={() => setDialog('')} disabled={busy}>Cancel</Btn>
            <Btn variant={dialog === 'unlock' ? 'danger' : 'primary'} onClick={() => void confirm()} disabled={busy || tooShort}
              title={tooShort ? 'Give a reason of at least 10 characters.' : undefined}>
              {busy ? 'Saving…' : dialog === 'unlock' ? 'Unlock' : 'Lock again'}
            </Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
