/**
 * Small pieces every ERP screen shares: a loader hook, the notice / error / "not on this
 * server yet" blocks, and a confirm dialog. Built on the admin's own kit
 * (`components/erp`) so these screens look like the other Inventory panel pages.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, PlugZap, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BlockSkeleton, Btn } from '@/components/erp';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { errorText, isNotServed } from '../../../lib/v2/erp';

export const READ = 'settings.read';
export const MANAGE = 'settings.manage';

/** Why a control is off, in the words the person needs — or null when it is on. */
export function whyDisabled(canManage: boolean, blockers: (string | false | null | undefined)[]): string | null {
  if (!canManage) return 'You need the Manage settings permission.';
  for (const b of blockers) if (b) return b;
  return null;
}

/* ── loading ─────────────────────────────────────────────────────────────── */

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Load once (and again when `deps` change or `reload()` is called). Stale answers are dropped. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList, enabled = true): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const out = await run();
      if (mine === seq.current) setData(out);
    } catch (e) {
      if (mine === seq.current) { setError(e); setData(null); }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [run, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

/* ── notices ─────────────────────────────────────────────────────────────── */

type NoticeTone = 'good' | 'warn' | 'bad' | 'info';

const NOTICE: Record<NoticeTone, { box: string; icon: React.ComponentType<{ className?: string }> }> = {
  good: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
  warn: { box: 'border-amber-200 bg-amber-50 text-amber-800', icon: AlertTriangle },
  bad: { box: 'border-red-200 bg-red-50 text-red-800', icon: XCircle },
  info: { box: 'border-gray-200 bg-gray-50 text-gray-700', icon: Info },
};

export const Notice: React.FC<{ tone?: NoticeTone; title?: React.ReactNode; className?: string; children?: React.ReactNode }> = ({
  tone = 'info', title, className, children,
}) => {
  const { box, icon: Icon } = NOTICE[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1 break-words">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
};

/** The plain state for a route this server does not serve yet (an older backend). */
export const NotServed: React.FC<{ what: string; className?: string }> = ({ what, className }) => (
  <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center', className)}>
    <PlugZap className="mb-2 h-6 w-6 text-gray-400" aria-hidden />
    <div className="text-sm font-semibold text-gray-900">{what} is not available on this server yet.</div>
    <p className="mt-1 max-w-md text-sm text-gray-500">
      The backend this admin talks to has not been updated with it. Nothing is wrong with your data; it will appear here once the server is updated.
    </p>
  </div>
);

/** A failed call: "not on this server yet" when it is that, otherwise what the server said. */
export const ErrorNote: React.FC<{ error: unknown; what?: string; onRetry?: () => void; className?: string }> = ({
  error, what = 'This', onRetry, className,
}) => {
  if (isNotServed(error)) return <NotServed what={what} className={className} />;
  return (
    <Notice tone="bad" title="That did not work" className={className}>
      <p>{errorText(error)}</p>
      {onRetry && <Btn variant="outline" size="sm" onClick={onRetry}>Try again</Btn>}
    </Notice>
  );
};

export const Loading: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
  <div className={cn('space-y-3 py-4', className)} role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <p className="text-sm text-gray-500" aria-hidden>{label}</p>
    <BlockSkeleton lines={4} />
  </div>
);

/* ── confirm ─────────────────────────────────────────────────────────────── */

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}> = ({ open, title, confirmLabel, busy, danger, onClose, onConfirm, children }) => (
  <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-2 text-sm text-gray-600">{children}</div>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Btn variant="outline" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Btn>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** A switch-like on/off button with a real pressed state for screen readers. */
export const OnOff: React.FC<{
  on: boolean;
  label: string;
  disabled?: boolean;
  title?: string;
  busy?: boolean;
  onToggle: () => void;
}> = ({ on, label, disabled, title, busy, onToggle }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    title={title}
    disabled={disabled || busy}
    onClick={onToggle}
    className={cn(
      'inline-flex h-8 min-w-[3.5rem] items-center justify-center rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50',
      on ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/30' : 'bg-gray-100 text-gray-600 ring-gray-400/30',
    )}
  >
    {busy ? '…' : on ? 'On' : 'Off'}
  </button>
);

/** Text that wraps on a phone but keeps codes readable. */
export const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="break-all rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">{children}</code>
);

export const Pre: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre className="max-h-80 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-800">{children}</pre>
);
