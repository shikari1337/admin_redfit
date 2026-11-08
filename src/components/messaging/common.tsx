/**
 * Shared pieces of the Messaging screens (Notifications · WhatsApp · Email ·
 * SMS): the "not on this server yet" notice, the error line, the tab-in-URL
 * hook, and the two reads several tabs share (the message catalogue the
 * template drawer works on, and the settings registry the branding form and
 * the review-timing card read). Lane ADMIN-MSG-1.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import { messageTemplatesAPI, settingsRegistryAPI, type MsgCatalogue, type MsgCatalogueEntry } from '@/services/api';
import { isGap, errText, messagingAPI, type NotificationRow } from '@/lib/v2/messaging';
import { cn } from '@/lib/utils';

/** The one wording for a route this server does not serve yet — never a blank page. */
export const GapNotice: React.FC<{ what: string; children?: React.ReactNode; className?: string }> = ({ what, children, className }) => (
  <div role="status" className={cn('rounded-lg border border-line bg-surface-2 px-4 py-3', className)} data-testid="messaging-gap">
    <div className="flex items-start gap-2.5">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-ink">Not available on this server yet</p>
        <p className="mt-0.5 text-ink-soft">{what}</p>
        {children && <div className="mt-2 text-ink-soft">{children}</div>}
      </div>
    </div>
  </div>
);

export const ErrorNotice: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad-ink">
    <span className="min-w-0 flex-1">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="rounded px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:no-underline">
        Try again
      </button>
    )}
  </div>
);

/** A tab whose setting needs `settings.read` (the sender / connection rows' own permission, MSG-2). */
export const SettingsPermNotice: React.FC<{ what: string }> = ({ what }) => (
  <div role="status" className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink-soft">
    Viewing {what} needs the <span className="font-mono text-xs">settings.read</span> permission; changing it needs <span className="font-mono text-xs">settings.manage</span>. Ask the store owner.
  </div>
);

/** A failed read, sorted: a route that is not deployed, or a real error. */
export interface LoadFailure { gap: boolean; message: string }
export const failureOf = (e: any, fallback: string): LoadFailure => ({ gap: isGap(e), message: errText(e, fallback) });

/**
 * The page's tab, kept in the URL (`?tab=` unless `param` names another) so a tab is linkable and survives a
 * reload. With `push`, each pick adds a browser history entry so Back returns to the previous tab, and the
 * fallback tab is written too, because a `fallback` that depends on live data is not a stable address.
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  fallback: T,
  { param = 'tab', push = false }: { param?: string; push?: boolean } = {},
): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param) as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const setTab = useCallback((t: T) => {
    const next = new URLSearchParams(params);
    if (t === fallback && !push) next.delete(param); else next.set(param, t);
    setParams(next, { replace: !push });
  }, [params, setParams, fallback, param, push]);
  return [tab, setTab];
}

/**
 * The Commerce message catalogue (existing route `GET /comms/templates/catalogue`):
 * what `TemplateEditorDrawer` edits. `entryFor` finds a notification's entry by
 * its key, its namespaced key, or its event.
 */
export function useCommerceCatalogue() {
  const [cat, setCat] = useState<MsgCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const reload = useCallback(async () => {
    setFailure(null);
    try {
      setCat(await messageTemplatesAPI.catalogue('commerce'));
    } catch (e: any) {
      setFailure(failureOf(e, 'Could not load the message catalogue.'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const entries = useMemo(() => (cat?.entries ?? []).filter((e) => e.def.product === 'commerce'), [cat]);
  const entryFor = useCallback((key: string | null): MsgCatalogueEntry | null => {
    if (!key) return null;
    return entries.find((e) => e.def.key === key)
      ?? entries.find((e) => e.def.key === `commerce.${key}`)
      ?? entries.find((e) => e.def.event === key)
      ?? null;
  }, [entries]);
  return { cat, entries, loading, failure, reload, entryFor };
}
export type CommerceCatalogue = ReturnType<typeof useCommerceCatalogue>;

/** The Commerce notifications list (§4.1), for the pages that only need names and states from it. */
export function useNotificationRows() {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const reload = useCallback(async () => {
    setFailure(null);
    try { setRows(await messagingAPI.notifications('commerce')); }
    catch (e: any) { setFailure(failureOf(e, 'Could not load the notifications.')); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const messages = useMemo(() => (rows ?? []).map((r) => ({ key: r.key, label: r.label })), [rows]);
  return { rows, failure, reload, messages };
}

/** One registry definition, as the Settings Center reads it (`GET /settings/registry`). */
export interface RegistryDefLite {
  key: string; code: string; title: string; description: string;
  fields: Array<{ path: string; label: string; type: string; readonly?: boolean; description?: string; help?: string; [k: string]: any }>;
  value: any; canWrite: boolean; options: Record<string, any[]>; secretsStored: string[];
  permission?: { read: string; write: string };
}

/** The settings registry — the SAME store settings the Settings Center edits. */
export function useSettingsRegistry() {
  const [defs, setDefs] = useState<RegistryDefLite[] | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setFailure(null);
    try {
      const data: any = await settingsRegistryAPI.get();
      const list = data?.definitions ?? data?.data?.definitions ?? [];
      setDefs(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setFailure(failureOf(e, 'Could not load the store settings.'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const defFor = useCallback((key: string) => defs?.find((d) => d.key === key) ?? null, [defs]);
  return { defs, loading, failure, reload, defFor };
}

/** A messaging page's frame: title, purpose, then its tab strip and body. */
export const MessagingHeader: React.FC<{
  icon: React.ComponentType<{ className?: string }>; title: string; purpose: string; actions?: React.ReactNode;
}> = ({ icon: Icon, title, purpose, actions }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-soft sm:flex">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-ink-soft">{purpose}</p>
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/**
 * The tab strip: real ARIA tabs, scrolls sideways on a phone instead of
 * wrapping into a second ragged row.
 */
export function MessagingTabs<T extends string>({ tabs, active, onChange, label }: {
  tabs: ReadonlyArray<{ key: T; label: string }>; active: T; onChange: (k: T) => void; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === active} id={`tab-${t.key}`}
          onClick={() => onChange(t.key)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
            t.key === active ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-soft hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Whose account a channel sends with (MSG-0 §3 "Credentials"): a store that has
 * not set up its own provider sends through Growcord's — the message still
 * reads as the store's. Read from the server's `mode`, never guessed here.
 */
export const AccountBanner: React.FC<{ own: boolean; children?: React.ReactNode }> = ({ own, children }) => (
  <div role="status" data-testid="account-banner"
    className={cn('rounded-lg border px-4 py-3 text-sm', own ? 'border-good bg-good-bg text-good-ink' : 'border-info bg-info-bg text-info-ink')}>
    <p className="font-semibold">{own ? 'Sending with your own account' : 'Sending with Growcord’s account'}</p>
    {children && <div className="mt-1 text-xs opacity-90">{children}</div>}
  </div>
);
