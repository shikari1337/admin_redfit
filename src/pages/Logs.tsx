import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ChevronDown, ChevronRight, History, KeyRound, Loader2, RefreshCw, ShieldCheck,
  Trash2, Bot, Building2,
} from 'lucide-react';
import {
  Page, PageHeader, Btn, Card, StatCard, StatGrid, FilterBar, Field, TextInput, SelectInput,
  EmptyState, BlockSkeleton,
} from '../components/erp';
import { useAuth } from '../contexts/AuthContext';
import { localeDateTime, isoDaysFromToday } from '../utils/date';
import {
  activityLogApi, activityLogGap, actorLabel, words,
  type LogAttention, type LogEntry, type LogEntryDetail, type LogQuery, type LogSummary,
} from '../lib/v2/activityLog';

/**
 * Activity log (System > Logs, `audit.read`): every change made in this admin, who made it and when,
 * read from the store's audit trail (`GET /api/v2/platform/audit`). Opens with what is worth a look this
 * week (access changes, removals, changes from outside the admin, changes by Growcord staff), then the
 * day's numbers, then the entries newest first. Read only: an entry is never edited or removed.
 *
 * The filters live in the address (`?actor_id=`, `?entity_type=`, `?entity_id=` ...) so another page can
 * link here, e.g. Staff and access opens one person's changes.
 */

const FILTER_KEYS = ['actor_id', 'actor_kind', 'entity_type', 'entity_id', 'action', 'from', 'to'] as const;
type FilterKey = typeof FILTER_KEYS[number];

/** What each kind of entry worth a look is called, and why it matters. The server decides what counts. */
const ATTENTION_TEXT: Record<string, { label: string; tip: string; icon: React.ComponentType<{ className?: string }> }> = {
  access: { label: 'Access changes', tip: 'Who may sign in and what they may do.', icon: KeyRound },
  removals: { label: 'Removals', tip: 'Records deleted, archived or switched off.', icon: Trash2 },
  outside: { label: 'Outside the admin', tip: 'Changes made by an API key, an AI agent or an automatic job.', icon: Bot },
  growcord: { label: 'By Growcord', tip: 'Changes made by Growcord staff or a support session.', icon: Building2 },
};

const PAGE_SIZE = 50;

function errText(e: any, fallback: string): string {
  return e?.response?.data?.message || e?.message || fallback;
}

/** A stored value as one line of text (long values are cut; the full value is in the title). */
function shown(v: unknown): string {
  if (v === undefined || v === null || v === '') return 'empty';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.length === 0) return 'none';
  return JSON.stringify(v);
}

const cut = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n)}...` : s);

function field(obj: unknown, key: string): unknown {
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>)[key] : undefined;
}

const EntryDetail: React.FC<{ seq: number; changed: string[] }> = ({ seq, changed }) => {
  const [detail, setDetail] = useState<LogEntryDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    activityLogApi.entry(seq)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (alive) setError(errText(e, 'Could not load this entry.')); });
    return () => { alive = false; };
  }, [seq]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <BlockSkeleton lines={3} />;

  const after = detail.after && typeof detail.after === 'object' && !Array.isArray(detail.after)
    ? (detail.after as Record<string, unknown>)
    : {};
  const keys = changed.length ? changed : Object.keys(after);
  if (!keys.length) {
    return <p className="text-sm text-gray-500">No field values were recorded for this entry.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Before</th>
            <th className="py-1 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {keys.map((k) => {
            const was = shown(field(detail.before, k));
            const is = shown(field(detail.after, k));
            return (
              <tr key={k} className="align-top">
                <td className="py-1.5 pr-3 font-medium text-gray-700">{words(k)}</td>
                <td className="py-1.5 pr-3 break-all text-gray-500" title={was}>{cut(was)}</td>
                <td className="py-1.5 break-all text-gray-900" title={is}>{cut(is)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const EntryRow: React.FC<{ e: LogEntry; open: boolean; onToggle: () => void; onActor: () => void }> = ({
  e, open, onToggle, onActor,
}) => {
  const shownChanged = e.changed.slice(0, 4);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-0.5 shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={open ? 'Hide the change' : 'Show the change'}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <button type="button" onClick={onToggle} className="min-w-0 text-left text-sm text-gray-900">
              <span className="font-semibold capitalize">{words(e.action)}</span>{' '}
              <span>{words(e.entity_type)}</span>
              {e.entity_id && <span className="ml-1 font-mono text-xs text-gray-500">{e.entity_id.slice(0, 12)}</span>}
            </button>
            <span className="shrink-0 text-xs text-gray-500">{localeDateTime(e.occurred_at)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
            <button type="button" onClick={onActor} className="hover:underline" title="Show only this actor's changes">
              {actorLabel(e)}
            </button>
            {shownChanged.length > 0 && e.action !== 'create' && (
              <span className="flex flex-wrap gap-1">
                {shownChanged.map((k) => (
                  <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">{words(k)}</span>
                ))}
                {e.changed.length > shownChanged.length && (
                  <span className="text-[11px] text-gray-500">+{e.changed.length - shownChanged.length}</span>
                )}
              </span>
            )}
          </div>
          {open && <div className="mt-3"><EntryDetail seq={e.seq} changed={e.changed} /></div>}
        </div>
      </div>
    </li>
  );
};

const Logs: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const f: Partial<Record<FilterKey, string>> = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);
  const filterKey = FILTER_KEYS.map((k) => filters[k] ?? '').join('|');
  const anyFilter = FILTER_KEYS.some((k) => filters[k]);

  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [items, setItems] = useState<LogEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [gap, setGap] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const loadSummary = useCallback(() => {
    setSummaryError('');
    activityLogApi.summary()
      .then(setSummary)
      .catch((e) => { if (!activityLogGap(e)) setSummaryError(errText(e, 'Could not load the week\'s figures.')); });
  }, []);

  const query = useCallback((before?: number): LogQuery => ({ ...filters, before, limit: PAGE_SIZE }), [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    setOpen(null);
    activityLogApi.list(query())
      .then((p) => { setItems(p.items); setNextBefore(p.next_before); setGap(false); })
      .catch((e) => {
        setItems([]);
        setNextBefore(null);
        if (activityLogGap(e)) setGap(true);
        else setError(errText(e, 'Could not load the activity log.'));
      })
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { load(); }, [load]);

  const loadMore = () => {
    if (nextBefore == null) return;
    setMore(true);
    activityLogApi.list(query(nextBefore))
      .then((p) => { setItems((prev) => [...prev, ...p.items]); setNextBefore(p.next_before); })
      .catch((e) => setError(errText(e, 'Could not load more entries.')))
      .finally(() => setMore(false));
  };

  const setFilter = (k: FilterKey, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const applyAttention = (a: LogAttention) => {
    const next = new URLSearchParams();
    if (a.entity_type) next.set('entity_type', a.entity_type);
    if (a.actions.length) next.set('action', a.actions.join(','));
    if (a.actor_kinds.length) next.set('actor_kind', a.actor_kinds.join(','));
    next.set('from', isoDaysFromToday(-7));
    setParams(next, { replace: true });
  };

  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });

  const refresh = () => { loadSummary(); load(); };

  const actorOptions = summary?.actors ?? [];
  const selectedActorMissing = filters.actor_id && !actorOptions.some((a) => a.actor_id === filters.actor_id);

  return (
    <Page>
      <PageHeader
        title="Activity log"
        icon={History}
        description="Every change made in this admin: who made it, what and when. Entries sit on the store's audit trail and can never be edited or removed."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canAccess('accounting') && hasPerm('audit.read') && (
              <Btn asChild variant="outline">
                <Link to="/panel/accounting/audit"><ShieldCheck /> Check the trail</Link>
              </Btn>
            )}
            <Btn variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
            </Btn>
          </div>
        )}
      />

      {gap ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Not available on this server yet"
            description="The activity log needs the latest Growcord backend. Nothing is lost: every change is still recorded."
          />
        </Card>
      ) : (
        <>
          {/* What to act on first: the week's entries worth a look. */}
          <section aria-label="Worth a look this week" className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">Worth a look this week</h2>
            {summaryError ? (
              <p className="text-sm text-red-600">{summaryError}</p>
            ) : !summary ? (
              <BlockSkeleton lines={2} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {summary.attention.map((a) => {
                  const t = ATTENTION_TEXT[a.key];
                  const Icon = t?.icon ?? History;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => applyAttention(a)}
                      disabled={a.count === 0}
                      title={t?.tip}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors ${a.count > 0 ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50' : 'border-gray-200 bg-white'} disabled:cursor-default`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900">{t?.label ?? words(a.key)}</span>
                        <span className="block truncate text-xs text-gray-500">{t?.tip ?? ''}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-xl font-bold tabular-nums text-gray-900">{a.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {summary && (
            <StatGrid cols={3}>
              <StatCard label="Changes today" value={summary.today} />
              <StatCard label="People today" value={summary.people_today} />
              <StatCard
                label="Last 7 days"
                value={summary.week}
                sub={summary.capped ? `At least this many: read from the newest ${summary.looked_at} entries.` : undefined}
              />
            </StatGrid>
          )}

          <FilterBar>
            <Field label="Who" className="w-full sm:w-auto">
              <SelectInput value={filters.actor_id ?? ''} onChange={(e) => setFilter('actor_id', e.target.value)} className="w-full sm:w-56">
                <option value="">Everyone</option>
                {selectedActorMissing && <option value={filters.actor_id}>The chosen person</option>}
                {actorOptions.filter((a) => a.actor_id).map((a) => (
                  <option key={`${a.actor_id}-${a.actor_kind}`} value={a.actor_id ?? ''}>
                    {actorLabel({ actor_kind: a.actor_kind, actor_detail: null, actor_name: a.actor_name })} ({a.count})
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Record" className="w-full sm:w-auto">
              <SelectInput value={filters.entity_type ?? ''} onChange={(e) => setFilter('entity_type', e.target.value)} className="w-full sm:w-48">
                <option value="">Every kind</option>
                {filters.entity_type && !summary?.entity_types.some((c) => c.value === filters.entity_type) && (
                  <option value={filters.entity_type}>{words(filters.entity_type)}</option>
                )}
                {(summary?.entity_types ?? []).map((c) => (
                  <option key={c.value} value={c.value}>{words(c.value)} ({c.count})</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Action" className="w-full sm:w-auto">
              <SelectInput value={filters.action ?? ''} onChange={(e) => setFilter('action', e.target.value)} className="w-full sm:w-40">
                <option value="">Any action</option>
                {filters.action && !summary?.actions.some((c) => c.value === filters.action) && (
                  <option value={filters.action}>{words(filters.action.replace(/,/g, ' or '))}</option>
                )}
                {(summary?.actions ?? []).map((c) => (
                  <option key={c.value} value={c.value}>{words(c.value)} ({c.count})</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="From" className="w-[calc(50%-0.375rem)] sm:w-auto">
              <TextInput type="date" value={filters.from ?? ''} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} className="w-full" />
            </Field>
            <Field label="To" className="w-[calc(50%-0.375rem)] sm:w-auto">
              <TextInput type="date" value={filters.to ?? ''} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} className="w-full" />
            </Field>
            <Field label="Record id" className="w-full sm:w-auto">
              <TextInput
                defaultValue={filters.entity_id ?? ''}
                key={filters.entity_id ?? ''}
                placeholder="Paste an id"
                onKeyDown={(e) => { if (e.key === 'Enter') setFilter('entity_id', (e.target as HTMLInputElement).value.trim()); }}
                onBlur={(e) => setFilter('entity_id', e.target.value.trim())}
                className="w-full sm:w-56"
              />
            </Field>
            {anyFilter && (
              <Btn variant="ghost" onClick={clearFilters}>Clear filters</Btn>
            )}
          </FilterBar>
          {filters.actor_kind && (
            <p className="text-xs text-gray-500">Showing changes by: {filters.actor_kind.split(',').map((k) => words(k)).join(', ')}.</p>
          )}

          {error && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
              <Btn size="sm" variant="outline" onClick={load}>Try again</Btn>
            </div>
          )}

          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-5"><BlockSkeleton lines={6} /></div>
            ) : items.length === 0 ? (
              !error && (
                <EmptyState
                  icon={History}
                  title={anyFilter ? 'No changes match these filters' : 'Nothing recorded yet'}
                  description={anyFilter ? 'Clear a filter or pick other dates.' : 'Changes made in this admin appear here as they happen.'}
                  action={anyFilter ? <Btn variant="outline" onClick={clearFilters}>Clear filters</Btn> : undefined}
                />
              )
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((e) => (
                  <EntryRow
                    key={e.seq}
                    e={e}
                    open={open === e.seq}
                    onToggle={() => setOpen((o) => (o === e.seq ? null : e.seq))}
                    onActor={() => {
                      const next = new URLSearchParams(params);
                      if (e.actor_id) { next.set('actor_id', e.actor_id); next.delete('actor_kind'); }
                      else { next.set('actor_kind', e.actor_kind); next.delete('actor_id'); }
                      setParams(next, { replace: true });
                    }}
                  />
                ))}
              </ul>
            )}
          </Card>

          {!loading && nextBefore != null && (
            <div className="flex justify-center">
              <Btn variant="outline" onClick={loadMore} disabled={more}>
                {more && <Loader2 className="animate-spin" />} Show older changes
              </Btn>
            </div>
          )}
        </>
      )}
    </Page>
  );
};

export default Logs;
