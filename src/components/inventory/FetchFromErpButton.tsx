import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ERP_HOME, applyText, durationText, erpApi, n, pickStockConnection, whenText,
  type ErpConnection, type StockApplyView,
} from '../../lib/v2/erp';
import { elapsedOf, isWorking, useErpStockRun, type ErpStockRunPhase } from '../../hooks/useErpStockRun';
import { ErpStockHistory, ErpStockRunPanel } from './ErpStockRunPanel';

/**
 * Sets this store's stock from its connected distributor ERP, by SKU, and SHOWS what is
 * happening (DEC-068): `POST /api/v2/erp/connections/{id}/stock/apply` starts it (the server
 * answers at once and works in the background), then `useErpStockRun` follows it step by
 * step — download, save the ERP copy, match SKUs and set stock — until it is done or failed.
 * A refresh while it runs picks the live progress up again. The same apply runs every hour
 * on its own; this button is "now".
 *
 * `onDone` is called only when the apply really changed stock, so a list is refreshed only
 * when there is something new to show.
 */
export default function FetchFromErpButton({ onDone, className }: { onDone?: () => void; className?: string }) {
  const { hasPerm } = useAuth();
  const canRead = hasPerm('settings.read');
  const canManage = hasPerm('settings.manage');
  const [connection, setConnection] = useState<ErpConnection | null>(null);
  const [looked, setLooked] = useState(false);
  const [last, setLast] = useState<StockApplyView | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  // Which connection keeps this store's stock, and when it last set it.
  useEffect(() => {
    if (!canRead) { setLooked(true); return; }
    let live = true;
    (async () => {
      try {
        const c = pickStockConnection(await erpApi.connections());
        if (!live) return;
        setConnection(c);
        if (c) setLast(c.last_stock_apply);
      } catch { /* the caption is advisory; the button still explains itself when pressed */ }
      finally { if (live) setLooked(true); }
    })();
    return () => { live = false; };
  }, [canRead]);

  const finished = useCallback((apply: StockApplyView | null, phase: ErpStockRunPhase) => {
    if (apply && apply.finished_us !== null) setLast(apply);
    setHistoryKey((k) => k + 1);
    if (phase === 'done' && apply && apply.changed > 0) onDone?.();
  }, [onDone]);

  const runner = useErpStockRun(connection?.id ?? null, finished);
  const { state, running, now } = runner;
  const label = connection?.label || 'the ERP';

  const blocked = !canManage
    ? 'You need the Manage settings permission to update stock from the ERP.'
    : looked && canRead && !connection ? 'No ERP is connected for this store yet.'
      : running ? 'An update is running — see its progress.' : null;

  const press = () => {
    if (!connection) return;
    setOpen(true);
    void runner.start(true);
  };

  const step = state ? stepNo(state.phase, state.fetchFirst) : null;

  return (
    <span className="inline-flex max-w-md flex-col items-start gap-1">
      <button
        type="button"
        className={className ?? 'btn btn-secondary'}
        onClick={press}
        disabled={running || !!blocked}
        aria-busy={running}
        data-testid="inv-fetch-erp"
        title={blocked ?? 'Fetch stock from the connected ERP now and set each matching SKU to the ERP’s quantity'}
      >
        {running ? 'Updating stock…' : 'Fetch from ERP'}
      </button>

      {state && isWorking(state.phase) && (
        <span className="text-xs text-blue-700" role="status" aria-live="polite" data-testid="inv-erp-progress">
          {state.how === 'already_running' || state.how === 'resumed' ? 'Already running' : 'Updating stock'}
          {step ? ` — step ${step} of 3` : ''} · {durationText(elapsedOf(state, now))} so far ·{' '}
          <button type="button" className="font-medium underline" onClick={() => setOpen(true)}>Show progress</button>
        </span>
      )}
      {state && !isWorking(state.phase) && (
        <span
          className={`text-sm ${state.phase === 'done' ? (state.apply?.status === 'ok' ? 'text-emerald-700' : 'text-amber-700') : state.phase === 'failed' ? 'text-red-700' : 'text-amber-700'}`}
          role={state.phase === 'failed' ? 'alert' : 'status'}
        >
          {state.phase === 'done' && state.apply ? applyText(state.apply, label)
            : state.phase === 'failed' ? `Stock was not updated: ${state.error ?? 'the server gave no reason.'}`
              : state.phase === 'interrupted' ? 'The update stopped before finishing (the server restarted). Run it again.'
                : state.phase === 'stopped' ? `The update was stopped${state.stoppedByYou ? ' by you' : ''}; SKUs already updated keep their new stock.`
                : 'The outcome is not known yet — it may still be running.'}
          {' '}<button type="button" className="font-medium underline" onClick={() => setOpen(true)}>Details</button>
        </span>
      )}
      {!state && connection && last && (
        <span className="text-xs text-gray-500" data-testid="inv-erp-last">
          Last updated from the ERP {whenText(last.finished_us ?? last.started_us)}
          {last.finished_us !== null && ` · ${last.status === 'ok' ? `${n(last.changed)} changed, ${n(last.unmatched)} without a SKU` : last.status}`}
          {' · '}every hour ·{' '}
          <button type="button" className="underline" onClick={() => setOpen(true)}>History</button>
        </span>
      )}
      {!state && connection && last === null && (
        <span className="text-xs text-gray-500">Not yet updated from the ERP · runs every hour</span>
      )}
      {looked && canRead && !connection && (
        <span className="text-xs text-gray-500">
          No ERP connected. <Link to={ERP_HOME} className="underline">Connect one</Link>
        </span>
      )}

      {connection && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Stock from {label}</DialogTitle>
              <DialogDescription>
                The ERP’s stock is downloaded, saved as the ERP copy, and each SKU whose code matches is set to the ERP’s quantity.
                You can close this window — the update carries on, and this page picks it up again.
              </DialogDescription>
            </DialogHeader>
            {state ? (
              <ErpStockRunPanel
                run={state}
                now={now}
                label={label}
                connectionId={connection.id}
                onRetry={() => void runner.start(state.fetchFirst)}
                onStop={canManage ? runner.stop : undefined}
                onRestart={canManage ? runner.restart : undefined}
                onDismiss={() => { runner.dismiss(); setOpen(false); }}
                onRefreshHistory={() => setHistoryKey((k) => k + 1)}
              />
            ) : (
              <p className="text-sm text-gray-600">Nothing is running now.</p>
            )}
            <ErpStockHistory connectionId={connection.id} refreshKey={historyKey} />
          </DialogContent>
        </Dialog>
      )}
    </span>
  );
}

/** Which of the three steps a phase is on (1-based), or null. */
function stepNo(phase: ErpStockRunPhase, fetchFirst: boolean): number | null {
  if (phase === 'starting') return fetchFirst ? 1 : 3;
  if (phase === 'downloading') return 1;
  if (phase === 'saving') return 2;
  if (phase === 'applying') return 3;
  return null;
}
