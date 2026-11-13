/**
 * Settings > Modules: which features this store uses.
 *
 * Every module comes from GET /modules, which answers what the server's own module guard
 * decides (platform api/modules.rs): the plan first, then Growcord's switch for this store,
 * then the store's own switch, then the default. `source` says which one decided it, and
 * `locked` means the store's own switch would change nothing, so that switch is shown but
 * disabled, with the reason. The superadmin console reads the same answer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Loader2, Lock, RotateCcw, Search } from 'lucide-react';
import { modulesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

type Source = 'plan' | 'super_admin' | 'store' | 'default';

interface Module {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  default_on?: boolean;
  category?: string;
  /** Who decided the switch (server, `StoreModuleView.source`). */
  source?: Source;
  /** The plan or Growcord set it: the store's own switch changes nothing. */
  locked?: boolean;
  read_only?: boolean;
  limit?: number | null;
}

interface StoreType {
  key: string;
  label: string;
  description: string;
  icon: string;
  vertical: string;
  highlights: string[];
  modules: Record<string, boolean>;
}

type Show = 'all' | 'on' | 'off' | 'locked';

/** Section names for the registry's categories; an unknown category is shown in plain words. */
const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  commerce: 'Commerce',
  catalog: 'Catalog',
  product_content: 'Product content',
  engagement: 'Engagement',
  marketing: 'Marketing',
  insights: 'Insights and analytics',
  ai: 'AI and automation',
  operations: 'Operations',
  erp: 'ERP',
  advanced: 'Advanced',
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1)).replace(/_/g, ' ');

const errorText = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || fallback;

/** Why a switch is locked, in the words the card and its tooltip show. */
function lockReason(m: Module): string | null {
  if (m.source === 'plan') return 'Not in your plan';
  if (m.source === 'super_admin') return 'Set by Growcord';
  return null;
}

export default function Modules() {
  const { refreshModules } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [storeTypes, setStoreTypes] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [applyingType, setApplyingType] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [show, setShow] = useState<Show>('all');

  const load = useCallback(async () => {
    const [list, types] = await Promise.all([
      modulesAPI.list(),
      modulesAPI.storeTypes().catch(() => null),
    ]);
    const rows: Module[] = Array.isArray(list) ? list : list?.modules ?? list?.data ?? [];
    setModules(rows);
    const typeRows = Array.isArray(types) ? types : types?.data ?? [];
    setStoreTypes(typeRows);
  }, []);

  useEffect(() => {
    let live = true;
    load()
      .catch((e) => { if (live) setLoadError(errorText(e, 'The modules could not be loaded.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [load]);

  /** After any write: the server's answer again (a store switch may be overridden), and the sidebar. */
  const settle = useCallback(async (message: string) => {
    await load();
    refreshModules().catch(() => undefined);
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }, [load, refreshModules]);

  const toggle = async (m: Module, next: boolean) => {
    setSaving(m.key);
    setError(null);
    try {
      await modulesAPI.toggle(m.key, next);
      await settle(`${m.name} is ${next ? 'on' : 'off'}.`);
    } catch (e) {
      setError(errorText(e, `${m.name} could not be changed.`));
    } finally {
      setSaving(null);
    }
  };

  const reset = async () => {
    if (!window.confirm('Put every module back to its default? Your own on and off choices are cleared. Settings inside each module are kept.')) return;
    setResetting(true);
    setError(null);
    try {
      await modulesAPI.initialize();
      await settle('Every module is back to its default.');
    } catch (e) {
      setError(errorText(e, 'The modules could not be reset.'));
    } finally {
      setResetting(false);
    }
  };

  const applyType = async (t: StoreType) => {
    const on = Object.values(t.modules).filter(Boolean).length;
    if (!window.confirm(`Use the "${t.label}" setup? It switches on ${on} modules suited to this kind of store, switches the others off and sets the product fields. Settings inside each module are kept, and you can change any switch afterwards.`)) return;
    setApplyingType(t.key);
    setError(null);
    try {
      await modulesAPI.applyStoreType(t.key);
      await settle(`The "${t.label}" setup is applied. Reload an open product form to see its fields change.`);
    } catch (e) {
      setError(errorText(e, 'The store type could not be applied.'));
    } finally {
      setApplyingType(null);
    }
  };

  const onCount = modules.filter((m) => m.enabled).length;
  const notInPlan = modules.filter((m) => m.source === 'plan');
  const byGrowcord = modules.filter((m) => m.source === 'super_admin');

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return modules.filter((m) => {
      if (show === 'on' && !m.enabled) return false;
      if (show === 'off' && m.enabled) return false;
      if (show === 'locked' && !m.locked) return false;
      if (!q) return true;
      return [m.name, m.description, m.key].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [modules, find, show]);

  const grouped = useMemo(() => {
    const out = new Map<string, Module[]>();
    for (const m of shown) {
      const c = m.category || 'other';
      if (!out.has(c)) out.set(c, []);
      out.get(c)!.push(m);
    }
    return Array.from(out.entries());
  }, [shown]);

  return (
    <div className="mx-auto max-w-6xl space-y-5" data-modules-page>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">Modules</h1>
          <p className="mt-1 text-sm text-gray-500">
            The features this store uses. A change applies at once, in this admin and on your shop.
          </p>
        </div>
        {!loading && !loadError && modules.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-ink-soft tabular-nums" data-module-count>
              {onCount} of {modules.length} on
            </span>
            <Button size="sm" variant="outline" onClick={reset} disabled={resetting}>
              {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Reset to defaults
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-bad/20 bg-bad-bg px-4 py-3 text-sm text-bad-ink" role="alert">
          <span>{error}</span>
          <button className="text-base leading-none" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-good/20 bg-good-bg px-4 py-3 text-sm text-good-ink" role="status">{notice}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-gray-500" role="alert">
          <p className="text-bad-ink">{loadError}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => {
            setLoading(true); setLoadError(null);
            load().catch((e) => setLoadError(errorText(e, 'The modules could not be loaded.'))).finally(() => setLoading(false));
          }}>Try again</Button>
        </div>
      ) : modules.length === 0 ? (
        <div className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-gray-500">
          <p>No module is set up for this store yet.</p>
          <Button className="mt-3" size="sm" onClick={reset} disabled={resetting}>Set up the defaults</Button>
        </div>
      ) : (
        <>
          {/* What to act on: switches the store cannot change from here, and why */}
          {(notInPlan.length > 0 || byGrowcord.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2" data-module-locks>
              {notInPlan.length > 0 && (
                <div className="rounded-lg border border-l-4 border-l-warn bg-white p-4 text-sm">
                  <p className="font-semibold text-gray-900">
                    {notInPlan.length} feature{notInPlan.length === 1 ? ' is' : 's are'} not in your plan
                  </p>
                  <p className="mt-1 text-gray-500">
                    {notInPlan.slice(0, 6).map((m) => m.name).join(', ')}{notInPlan.length > 6 ? ` and ${notInPlan.length - 6} more` : ''}.
                  </p>
                  <Link to="/settings/billing" className="mt-2 inline-block text-sm font-medium text-brand hover:underline">See your plan</Link>
                </div>
              )}
              {byGrowcord.length > 0 && (
                <div className="rounded-lg border bg-white p-4 text-sm">
                  <p className="font-semibold text-gray-900">
                    {byGrowcord.length} switch{byGrowcord.length === 1 ? ' is' : 'es are'} set by Growcord
                  </p>
                  <p className="mt-1 text-gray-500">
                    {byGrowcord.slice(0, 6).map((m) => `${m.name} (${m.enabled ? 'on' : 'off'})`).join(', ')}{byGrowcord.length > 6 ? ` and ${byGrowcord.length - 6} more` : ''}. Ask Growcord support to change them.
                  </p>
                </div>
              )}
            </div>
          )}

          {storeTypes.length > 0 && (
            <details className="group rounded-lg border bg-white" data-store-types>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Start from a store type</span>
                  <span className="block text-xs text-gray-500">A ready set of modules and product fields for the kind of store you run.</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3">
                {storeTypes.map((t) => {
                  const on = Object.values(t.modules).filter(Boolean).length;
                  return (
                    <div key={t.key} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none" aria-hidden>{t.icon}</span>
                        <span className="text-sm font-semibold text-gray-900">{t.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{t.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {t.highlights.slice(0, 4).map((h) => <Badge key={h} variant="neutral" className="font-normal">{h}</Badge>)}
                      </div>
                      <Button className="mt-auto" size="sm" variant="outline" onClick={() => applyType(t)} disabled={applyingType !== null}>
                        {applyingType === t.key ? <Loader2 className="size-3.5 animate-spin" /> : null} Use this setup ({on} on)
                      </Button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a module" className="h-8 pl-8 text-sm" aria-label="Find a module" />
            </div>
            <select
              className="h-8 rounded-md border border-input bg-surface px-2 text-sm"
              value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
              <option value="all">All modules</option>
              <option value="on">On</option>
              <option value="off">Off</option>
              <option value="locked">Set by plan or Growcord</option>
            </select>
          </div>

          {grouped.length === 0 ? (
            <p className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-gray-500">No module matches.</p>
          ) : (
            <div className="space-y-6">
              {grouped.map(([category, mods]) => (
                <section key={category} aria-labelledby={`modules-${category}`}>
                  <h2 id={`modules-${category}`} className="mb-2 border-b pb-1.5 text-sm font-semibold text-gray-700">{categoryLabel(category)}</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {mods.map((m) => {
                      const why = lockReason(m);
                      return (
                        <div
                          key={m.key} data-module={m.key}
                          className={`flex items-start justify-between gap-3 rounded-lg border bg-white p-4 ${m.enabled ? 'border-brand/30' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                              {m.default_on && <Badge variant="neutral" className="font-normal">Default</Badge>}
                              {why && (
                                <Badge variant={m.source === 'plan' ? 'warn' : 'info'} className="font-normal">
                                  <Lock className="size-3" aria-hidden /> {why}
                                </Badge>
                              )}
                              {m.read_only && <Badge variant="neutral" className="font-normal">View only on your plan</Badge>}
                              {m.limit != null && <Badge variant="neutral" className="font-normal">Up to {m.limit} on your plan</Badge>}
                            </div>
                            {m.description && <p className="mt-1 text-xs leading-snug text-gray-500">{m.description}</p>}
                          </div>
                          <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                            <Switch
                              checked={m.enabled}
                              disabled={!!m.locked || saving === m.key}
                              onCheckedChange={(next) => toggle(m, next)}
                              aria-label={`${m.name}: ${m.enabled ? 'on' : 'off'}`}
                              title={why ? `${why}. This switch cannot be changed here.` : undefined}
                            />
                            <span className="text-[11px] text-gray-500">{saving === m.key ? 'Saving' : m.enabled ? 'On' : 'Off'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
