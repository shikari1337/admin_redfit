/**
 * What a "set store stock from the ERP" run is doing, step by step, and how it ended —
 * fed by `useErpStockRun`. Three steps (download · save the ERP copy · match SKUs and set
 * stock), each pending / working / done / failed, a plain one-line status at the top, the
 * result in words when it is done (with the ERP codes that matched no SKU and a CSV of
 * them), and the server's own words when it is not. While it runs: the bytes downloaded so far
 * ("12.4 of ~59 MB" when the last answer's size is known) and when the server last heard from
 * the task; when the server restarted under it (`interrupted`), what that means and Retry.
 *
 * Also `ErpStockHistory`: the last 10 updates (`GET …/stock/applies`).
 */
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Download, Loader2, MinusCircle, HelpCircle, RefreshCw, RotateCcw, Square, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Btn, EmptyRow, StatCard, StatGrid, StatusChip, TBody, Td, Th, THead, Tr, downloadCsv } from '@/components/erp';
import {
  allStockItems, applySecs, bytesText, downloadText, durationText, erpApi, erpConnUrl, errorText, n, plural, secsSince,
  statusTone, whenText,
  type StockApplyView,
} from '../../lib/v2/erp';
import { elapsedOf, isWorking, type ErpStockRunState } from '../../hooks/useErpStockRun';
import { formatDateTime, formatTime, isoDate, todayIso } from '../../utils/date';

type StepState = 'pending' | 'active' | 'done' | 'failed' | 'skipped' | 'unknown' | 'stopped';

const STEP_INDEX = { downloading: 0, saving: 1, applying: 2 } as const;

/** "18:24" today, "24 Oct 2026, 18:24" on another day — the store's clock. */
function clock(d: Date | null): string {
  if (!d) return '—';
  return isoDate(d) === todayIso() ? formatTime(d) : formatDateTime(d);
}

/** How often the server stamps a running task's heartbeat (seconds; ERP-BG-2). */
const HEARTBEAT_SECS = 15;

/** When the server last heard from the run (epoch µs): the apply's heartbeat, else its start. */
function lastHeardUs(s: ErpStockRunState): number | null {
  const a = s.apply;
  if (!a) return null;
  if (typeof a.heartbeat_us === 'number' && a.heartbeat_us > 0) return a.heartbeat_us;
  return a.started_us > 0 ? a.started_us : null;
}

/**
 * The latest moment an interrupted run could still have changed stock: one heartbeat after it was
 * last heard from, rounded UP to the whole minute (the time is shown as HH:MM), so "nothing
 * changed after" it is true.
 */
function stoppedBy(s: ErpStockRunState): Date | null {
  const us = lastHeardUs(s);
  if (us === null) return null;
  const ms = us / 1000 + HEARTBEAT_SECS * 1000;
  return new Date(Math.ceil(ms / 60_000) * 60_000);
}

/**
 * Which step an interrupted or stopped run ended in (0-based): its fetch, when that is still
 * marked running or was stopped with it (downloading until its rows are counted, then saving),
 * else matching and setting stock.
 */
function interruptedStep(s: ErpStockRunState): number {
  const f = s.fetch;
  if (s.fetchFirst && f && (f.status === 'running' || f.stopped === true)) return f.rows_fetched > 0 ? 1 : 0;
  return 2;
}

/** Codes processed so far (each is either matched to a SKU or not found) and the total to process. */
function codesDone(a: StockApplyView): { done: number; total: number } {
  return { done: a.matched + a.unmatched, total: a.erp_items };
}

/** The phases during which the run can be stopped (the server may still be working, or has gone silent). */
const STOPPABLE = ['downloading', 'saving', 'applying', 'interrupted'] as const;

/** "Stopped by you at 18:40 — 1,500 of 4,210 codes were processed; 212 SKUs were updated." */
function stoppedSentence(s: ErpStockRunState): string {
  const a = s.apply;
  const who = s.stoppedByYou ? 'Stopped by you' : 'Stopped by staff';
  const at = a?.finished_us ? ` at ${clock(new Date(a.finished_us / 1000))}` : '';
  if (!a || a.erp_items <= 0) return `${who}${at}, before any stock was changed.`;
  const { done, total } = codesDone(a);
  return `${who}${at} — ${n(done)} of ${n(total)} codes were processed; ${plural(a.changed, 'SKU')} ${a.changed === 1 ? 'was' : 'were'} updated.`;
}

/** True when the run was refused before any work (nothing downloaded, nothing applied). */
function refused(s: ErpStockRunState): boolean {
  return s.phase === 'failed' && !s.lastWorking && !s.apply && !s.fetch;
}

function stepStates(s: ErpStockRunState): [StepState, StepState, StepState] {
  const out: StepState[] = ['pending', 'pending', 'pending'];
  const skipFetch = !s.fetchFirst;
  const mark = (upTo: number, at: StepState) => {
    for (let i = 0; i < 3; i += 1) out[i] = i < upTo ? 'done' : i === upTo ? at : 'pending';
  };
  if (s.phase === 'starting') mark(skipFetch ? 2 : 0, 'active');
  else if (s.phase === 'downloading' || s.phase === 'saving' || s.phase === 'applying') mark(STEP_INDEX[s.phase], 'active');
  else if (s.phase === 'done') mark(3, 'done');
  else if (s.phase === 'failed') {
    if (!refused(s)) {
      let at: number = s.lastWorking ? STEP_INDEX[s.lastWorking] : 2;
      if (!s.lastWorking && s.fetch?.status === 'failed') at = s.fetch.records_written > 0 ? 1 : 0;
      mark(at, 'failed');
    }
  } else if (s.phase === 'unknown') mark(s.lastWorking ? STEP_INDEX[s.lastWorking] : skipFetch ? 2 : 0, 'unknown');
  else if (s.phase === 'interrupted' || s.phase === 'stopped') mark(interruptedStep(s), 'stopped');
  if (skipFetch) { out[0] = 'skipped'; out[1] = 'skipped'; }
  return [out[0], out[1], out[2]];
}

const STEP_LOOK: Record<StepState, { icon: ComponentType<{ className?: string }>; ring: string; word: string }> = {
  pending: { icon: Circle, ring: 'text-gray-300', word: 'Waiting' },
  active: { icon: Loader2, ring: 'text-blue-600 animate-spin', word: 'Working' },
  done: { icon: CheckCircle2, ring: 'text-emerald-600', word: 'Done' },
  failed: { icon: XCircle, ring: 'text-red-600', word: 'Failed' },
  skipped: { icon: MinusCircle, ring: 'text-gray-400', word: 'Skipped' },
  unknown: { icon: HelpCircle, ring: 'text-amber-600', word: 'Not known' },
  stopped: { icon: XCircle, ring: 'text-amber-600', word: 'Stopped' },
};

function Step({ no, title, state, children, bar }: {
  no: number; title: string; state: StepState; children?: ReactNode; bar?: number | null;
}) {
  const look = STEP_LOOK[state];
  const Icon = look.icon;
  return (
    <li className={cn('flex gap-3 rounded-lg border p-3', state === 'active' ? 'border-blue-200 bg-blue-50/40' : state === 'failed' ? 'border-red-200 bg-red-50/40' : state === 'stopped' ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white')}>
      <div className="flex flex-col items-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{no}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn('text-sm font-medium', state === 'pending' || state === 'skipped' ? 'text-gray-500' : 'text-gray-900')}>{title}</span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <Icon className={cn('h-4 w-4', look.ring)} aria-hidden /> {look.word}
          </span>
        </div>
        {children && <div className="text-xs text-gray-600">{children}</div>}
        {typeof bar === 'number' && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar)}>
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
          </div>
        )}
      </div>
    </li>
  );
}

/** The one-line status at the top. */
function statusLine(s: ErpStockRunState, now: number): string {
  const secs = elapsedOf(s, now);
  const started = clock(s.startedAt);
  switch (s.phase) {
    case 'starting':
      // A current server answers the start at once; still waiting = an older server that
      // replies only when all three steps are over.
      return secs !== null && secs > 10
        ? `Started ${started} · ${durationText(secs)} so far — waiting for the server to finish`
        : 'Starting — asking the server to begin…';
    case 'downloading':
    case 'saving':
    case 'applying': {
      const heard = secsSince(s.apply?.heartbeat_us, now);
      const so = `Started ${started} · ${durationText(secs)} so far${heard !== null ? ` · last heard ${heard} s ago` : ''}`;
      if (s.how === 'already_running') return `Already running — showing its progress. ${so}`;
      if (s.how === 'resumed') return `${so} (it was already running when this page opened)`;
      return so;
    }
    case 'done': {
      const fin = s.apply?.finished_us ? clock(new Date(s.apply.finished_us / 1000)) : null;
      return `Finished${fin ? ` ${fin}` : ''}${secs !== null ? ` · took ${durationText(secs)}` : ''}${s.legacy ? '' : ` · started ${started}`}`;
    }
    case 'failed':
      if (refused(s)) return s.errorKind === 'already_running' ? 'Not started — another update is already running' : 'Not started';
      return `Stopped with an error${secs !== null ? ` after ${durationText(secs)}` : ''} · started ${started}`;
    case 'unknown': return `Outcome not known yet · started ${started}`;
    case 'stopped': return `${stoppedSentence(s).split(' — ')[0]} · started ${started}`;
    case 'interrupted': {
      const heard = lastHeardUs(s);
      return `Stopped before finishing${heard !== null ? ` · last heard ${clock(new Date(heard / 1000))}` : ''} · started ${started}`;
    }
    default: return 'Nothing is running.';
  }
}

export function ErpStockRunPanel({ run, now, label, connectionId, onRetry, onStop, onRestart, onDismiss, onRefreshHistory }: {
  run: ErpStockRunState;
  now: number;
  /** The ERP's name ("Siddharth Medicare"). */
  label: string;
  connectionId: string;
  onRetry?: () => void;
  /** Stop the run (the hook's `stop`): null when stopped, else why not. */
  onStop?: () => Promise<string | null>;
  /** Stop, then start again (the hook's `restart`): null when done, else why not. */
  onRestart?: () => Promise<string | null>;
  onDismiss?: () => void;
  onRefreshHistory?: () => void;
}) {
  const [confirm, setConfirm] = useState<'stop' | 'restart' | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const stoppable = STOPPABLE.some((p) => p === run.phase) && !!(onStop || onRestart) && !!run.apply?.id;
  const confirmed = async () => {
    const act = confirm === 'restart' ? onRestart : onStop;
    if (!act) return;
    setStopBusy(true);
    setStopError(null);
    try {
      const why = await act();
      setStopError(why);
      if (!why) setConfirm(null);
    } finally {
      setStopBusy(false);
    }
  };
  const [s1, s2, s3] = stepStates(run);
  const f = run.fetch;
  const a = run.apply;
  const working = isWorking(run.phase);
  const savePct = f && f.rows_fetched > 0 ? (f.records_written / f.rows_fetched) * 100 : null;
  const tone = run.phase === 'done' ? (a?.status === 'ok' ? 'green' : 'amber') : run.phase === 'failed' ? 'red'
    : run.phase === 'unknown' || run.phase === 'interrupted' || run.phase === 'stopped' ? 'amber' : 'blue';
  const chip = run.phase === 'done' ? (a?.status === 'partial' ? 'Partly done' : a?.status === 'skipped' ? 'Skipped' : 'Done')
    : run.phase === 'failed' ? 'Failed' : run.phase === 'unknown' ? 'Not known' : run.phase === 'interrupted' ? 'Not responding'
      : run.phase === 'stopped' ? 'Stopped' : 'Running';
  const stopped = run.phase === 'interrupted' ? stoppedBy(run) : null;

  return (
    <div className="space-y-3" data-testid="erp-stock-run">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-800" role="status" aria-live="polite">
        <StatusChip status={chip} tone={tone} label={chip} />
        <span>{statusLine(run, now)}</span>
      </div>

      <ol className="space-y-2" aria-label="Steps">
        <Step no={1} title={`Download from ${label}`} state={s1}>
          {s1 === 'skipped' && 'Skipped — stock is set from the ERP copy already held.'}
          {s1 === 'active' && (f && f.bytes_received > 0
            ? `Downloading: ${downloadText(f.bytes_received, f.expected_bytes)}…`
            : `Asking the ERP for its stock list. A full list can take a few minutes${f && typeof f.expected_bytes === 'number' && f.expected_bytes > 0 ? ` (the last one was ~${bytesText(f.expected_bytes)})` : ''}.`)}
          {s1 === 'done' && f && `${bytesText(f.bytes_received)} received · ${plural(f.rows_fetched, 'row')}`}
          {(s1 === 'failed' || s1 === 'unknown' || s1 === 'stopped') && (f?.message || (f ? `${bytesText(f.bytes_received)} received before it stopped.` : null))}
        </Step>
        <Step no={2} title="Save the ERP copy" state={s2} bar={s2 === 'active' ? savePct : null}>
          {s2 === 'skipped' && 'Skipped.'}
          {s2 === 'active' && f && (f.rows_fetched > 0
            ? `${n(f.records_written)} of ${plural(f.rows_fetched, 'row')} saved`
            : 'Saving…')}
          {s2 === 'done' && f && (
            <>
              {plural(f.records_written, 'row')} saved · {n(f.records_changed)} different from last time
              {f.rows_unkeyed > 0 && <> · {plural(f.rows_unkeyed, 'row')} had no item code and were skipped</>}
            </>
          )}
          {(s2 === 'failed' || s2 === 'unknown' || s2 === 'stopped') && f && `${n(f.records_written)} of ${plural(f.rows_fetched, 'row')} were saved before it stopped.${f.message ? ` ${f.message}` : ''}`}
        </Step>
        <Step no={3} title="Match SKUs and update stock" state={s3} bar={s3 === 'active' && a && a.erp_items > 0 ? (codesDone(a).done / a.erp_items) * 100 : null}>
          {(s3 === 'active' || s3 === 'stopped') && a && a.erp_items > 0 && (
            <>
              {n(codesDone(a).done)} of {n(a.erp_items)} codes · {n(a.matched)} matched · {n(a.changed)} changed
              {' '}(<span className="text-emerald-700">+{n(a.units_up)}</span>/<span className="text-red-700">−{n(a.units_down)}</span> units) · {n(a.unmatched)} not found
              {s3 === 'active' && ' so far…'}
            </>
          )}
          {(s3 === 'done' || s3 === 'failed' || s3 === 'unknown') && a && (a.matched > 0 || a.erp_items > 0 || s3 === 'done') && (
            <>
              {n(a.matched)} matched · {n(a.changed)} changed · {n(a.unchanged)} unchanged · {n(a.unmatched)} no SKU
              {(a.units_up > 0 || a.units_down > 0) && <> · <span className="text-emerald-700">+{n(a.units_up)}</span> / <span className="text-red-700">−{n(a.units_down)}</span> units</>}
            </>
          )}
          {s3 === 'active' && (!a || (a.matched === 0 && a.erp_items === 0)) && 'Matching ERP item codes to your SKUs…'}
        </Step>
      </ol>

      {run.phase === 'starting' && (elapsedOf(run, now) ?? 0) > 10 && (
        <p className="text-xs text-gray-600">
          This server does not report each step: it answers once all three are finished. A full stock list can take several minutes — keep this page open.
        </p>
      )}
      {run.pollTrouble && working && <p className="text-xs text-amber-700">{run.pollTrouble}</p>}

      {stoppable && (
        <div className="space-y-2" data-testid="erp-stock-stop">
          {confirm === null ? (
            <div className="flex flex-wrap gap-2">
              {onStop && <Btn size="sm" variant="dangerOutline" onClick={() => { setStopError(null); setConfirm('stop'); }}><Square /> Stop</Btn>}
              {onRestart && <Btn size="sm" variant="outline" onClick={() => { setStopError(null); setConfirm('restart'); }}><RotateCcw /> Stop and start again</Btn>}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              <p>
                Stop this update? SKUs already updated keep their new stock; the rest stay as they were.
                {confirm === 'restart' && ' A new update starts straight after.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Btn size="sm" variant="danger" onClick={() => void confirmed()} disabled={stopBusy}>
                  {stopBusy ? 'Stopping…' : confirm === 'restart' ? 'Yes, stop and start again' : 'Yes, stop it'}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={stopBusy}>Keep it running</Btn>
              </div>
            </div>
          )}
          {stopError && <p className="text-xs text-red-700" role="alert">{stopError}</p>}
        </div>
      )}

      {run.phase === 'done' && a && <ApplyResult a={a} label={label} connectionId={connectionId} />}

      {run.phase === 'failed' && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <div className="font-semibold">{refused(run) ? 'The update did not start' : 'Stock was not fully updated'}</div>
          {run.error && <p className="whitespace-pre-wrap break-words">{run.error}</p>}
          {!refused(run) && a && a.changed > 0 && (
            <p>{plural(a.changed, 'SKU')} had already been set from the ERP before it stopped; every other SKU keeps the stock it had.</p>
          )}
          {!refused(run) && (!a || a.changed === 0) && <p>No store stock was changed.</p>}
          <p className="text-red-700">
            {run.errorKind === 'already_running'
              ? 'Another update of this ERP is running. Wait for it to finish — the history shows when it has — then try again.'
              : run.errorKind === 'not_served'
                ? 'This server cannot do this yet.'
                : 'You can try again. If it keeps failing, check the connection on the ERP Settings tab (the address, login and that the ERP is reachable).'}
          </p>
          {run.errorKind !== 'not_served' && onRetry && (
            <Btn size="sm" variant="outline" onClick={onRetry}><RefreshCw /> {run.errorKind === 'already_running' ? 'Check again' : 'Try again'}</Btn>
          )}
        </div>
      )}

      {run.phase === 'interrupted' && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert" data-testid="erp-stock-interrupted">
          <div className="font-semibold">
            The update stopped before finishing (the server restarted).
            {stopped ? ` No stock was changed after ${clock(stopped)}.` : ''} Run it again.
          </div>
          {a && a.changed > 0 && (
            <p>At least {plural(a.changed, 'SKU')} had already been set from the ERP before it stopped; every other SKU keeps the stock it had.</p>
          )}
          {/* With a stop available, "Stop and start again" above is the way to run it again. */}
          {!onRestart && onRetry && <Btn size="sm" variant="outline" onClick={onRetry}><RefreshCw /> Retry</Btn>}
        </div>
      )}

      {run.phase === 'stopped' && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status" data-testid="erp-stock-stopped">
          <p className="font-semibold">{stoppedSentence(run)}</p>
          <p>Every other SKU keeps the stock it had.</p>
          {onRetry && <Btn size="sm" variant="outline" onClick={onRetry}><RefreshCw /> Start again</Btn>}
        </div>
      )}

      {run.phase === 'unknown' && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          {run.error && <p>{run.error}</p>}
          <p>Look at the update history in a few minutes: the newest row shows how it ended. Pressing the button again while it runs is refused, so nothing runs twice.</p>
          {onRefreshHistory && <Btn size="sm" variant="outline" onClick={onRefreshHistory}><RefreshCw /> Refresh the history</Btn>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link to={erpConnUrl(connectionId, 'stock')} className="font-medium text-gray-700 underline">Update history</Link>
        <Link to={erpConnUrl(connectionId, 'runs')} className="font-medium text-gray-700 underline">Run log</Link>
        {!working && onDismiss && <button type="button" className="text-gray-500 underline" onClick={onDismiss}>Close this result</button>}
      </div>
    </div>
  );
}

/* ── the result, in words ─────────────────────────────────────────────────── */

const SHOWN_CODES = 50;

/**
 * The CSV of every ERP code with no matching SKU: the list the update kept when that is the whole
 * list, else every page of the ERP copy. A failed read downloads nothing, so a short file is never
 * mistaken for the whole list.
 */
export function useUnmatchedCsv(apply: StockApplyView | null, connectionId: string) {
  const [read, setRead] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const startedUs = apply?.started_us;
  useEffect(() => setNote(null), [startedUs]);

  const download = async () => {
    if (!apply) return;
    setNote(null);
    const day = isoDate(apply.started_us ? new Date(apply.started_us / 1000) : new Date()) || todayIso();
    const file = `erp-codes-without-sku-${day}`;
    const codes = apply.unmatched_codes;
    if (apply.unmatched <= codes.length) {
      downloadCsv(file, [{ key: 'code', label: 'ERP item code' }], codes.map((code) => ({ code })));
      return;
    }
    setRead({ done: 0, total: apply.unmatched });
    try {
      const all = await allStockItems(connectionId, { unmatched: true }, Number.MAX_SAFE_INTEGER, (done, total) => setRead({ done, total }));
      downloadCsv(file, [
        { key: 'item_code', label: 'ERP item code' },
        { key: 'total_units', label: 'Units at the ERP' },
      ], all.items.map((i) => ({ item_code: i.item_code, total_units: i.total_units })));
      setNote(`${plural(all.items.length, 'code')} from the ERP copy as it is now.`);
    } catch (e) {
      setNote(`The full list could not be read (${errorText(e)}), so nothing was downloaded. Please try again.`);
    } finally {
      setRead(null);
    }
  };

  const label = read ? `Reading ${n(read.done)} of ${n(read.total)}` : `Download all ${n(apply?.unmatched ?? 0)} (CSV)`;
  return { busy: read !== null, label, note, download };
}

export function ApplyResult({ a, label, connectionId }: { a: StockApplyView; label: string; connectionId: string }) {
  const csv = useUnmatchedCsv(a, connectionId);
  const codes = a.unmatched_codes;

  if (a.status === 'skipped') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700" role="status">
        Stock was not updated from {label}{a.message ? `: ${a.message}` : '.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-800" data-testid="erp-stock-result">
        <span className="font-medium">{plural(a.matched, 'SKU')} matched</span>
        {' · '}{n(a.changed)} stock {a.changed === 1 ? 'level' : 'levels'} changed (<span className="text-emerald-700">+{n(a.units_up)}</span> / <span className="text-red-700">−{n(a.units_down)}</span> units)
        {' · '}{n(a.unchanged)} already right
        {' · '}{a.unmatched > 0
          ? <span className="text-amber-700">{plural(a.unmatched, 'ERP code')} {a.unmatched === 1 ? 'has' : 'have'} no matching SKU</span>
          : 'every ERP code matched a SKU'}
        {a.fractional > 0 && <> · {plural(a.fractional, 'part quantity', 'part quantities')} rounded down</>}
      </p>
      {a.status === 'partial' && a.message && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">Not everything went through: {a.message}</p>
      )}
      <StatGrid cols={4}>
        <StatCard label="SKUs matched" value={n(a.matched)} sub={`of ${n(a.erp_items)} ERP items`} />
        <StatCard label="Stock changed" value={n(a.changed)} sub={`+${n(a.units_up)} / −${n(a.units_down)} units`} tone={a.changed > 0 ? 'good' : 'default'} />
        <StatCard label="Already right" value={n(a.unchanged)} />
        <StatCard label="No matching SKU" value={n(a.unmatched)} tone={a.unmatched > 0 ? 'warn' : 'default'} />
      </StatGrid>
      {a.unmatched > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-gray-900">ERP codes with no matching SKU</div>
            <Btn size="sm" variant="outline" onClick={() => void csv.download()} disabled={csv.busy}>
              <Download /> {csv.label}
            </Btn>
          </div>
          <p className="text-xs text-gray-500">
            Their stock was not used. Add (or correct) the SKU on the product and the next update picks it up.
            {codes.length > SHOWN_CODES && ` Showing the first ${SHOWN_CODES}.`}
          </p>
          {csv.note && <p className="text-xs text-gray-600" role="status">{csv.note}</p>}
          {codes.length > 0 ? (
            <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-auto" aria-label="ERP codes with no matching SKU">
              {codes.slice(0, SHOWN_CODES).map((code) => (
                <li key={code}><code className="break-all rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">{code}</code></li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">This server did not send the list with the result; the CSV reads it from the ERP copy.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── the last 10 updates ──────────────────────────────────────────────────── */

export function ErpStockHistory({ connectionId, refreshKey = 0, limit = 10 }: { connectionId: string; refreshKey?: number; limit?: number }) {
  const [rows, setRows] = useState<StockApplyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    erpApi.stockApplies(connectionId, limit, 0)
      .then((p) => { if (live) setRows(p.items); })
      .catch((e: unknown) => { if (live) setError(errorText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [connectionId, limit, refreshKey, again]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-900">Last {limit} updates</div>
        <Btn size="sm" variant="ghost" onClick={() => setAgain((x) => x + 1)} disabled={loading}><RefreshCw /> Refresh</Btn>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {!error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-sm">
            <THead>
              <Th>When</Th><Th>How</Th><Th>Result</Th><Th num>Matched</Th><Th num>Changed</Th><Th num>No SKU</Th><Th num>Took</Th>
            </THead>
            <TBody>
              {loading && !rows && <EmptyRow colSpan={7}>Reading the history…</EmptyRow>}
              {rows && rows.length === 0 && <EmptyRow colSpan={7}>Store stock has not been set from this ERP yet.</EmptyRow>}
              {rows?.map((a) => {
                const open = a.finished_us == null;
                // A running row the server has not heard from for 2 minutes is dead (the server restarted).
                const silent = open && (secsSince(a.heartbeat_us ?? a.started_us, Date.now()) ?? 0) > 120;
                return (
                  <Tr key={a.id}>
                    <Td className="whitespace-nowrap">{whenText(a.started_us)}</Td>
                    <Td>{a.trigger === 'schedule' ? 'Hourly' : a.trigger === 'manual' ? 'By hand' : a.trigger}</Td>
                    <Td>
                      {silent ? <StatusChip status="interrupted" tone="amber" label="Not responding" />
                        : open ? <StatusChip status="running" tone="blue" label="Running" />
                          : a.stopped ? <StatusChip status="stopped" tone="amber" label="Stopped" />
                            : <StatusChip status={a.status} tone={statusTone(a.status)} />}
                      {a.message && <div className="mt-0.5 max-w-xs text-xs text-gray-500">{a.message}</div>}
                    </Td>
                    <Td num>{n(a.matched)}</Td>
                    <Td num>{n(a.changed)}</Td>
                    <Td num>{n(a.unmatched)}</Td>
                    <Td num>{open ? '—' : durationText(applySecs(a))}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </table>
        </div>
      )}
    </div>
  );
}
