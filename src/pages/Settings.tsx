/**
 * All settings pages (`/settings/directory`): every dedicated settings screen this person can open, in one
 * searchable list, then the two tools that belong to this browser and to the website.
 *
 * The list is never typed here. It is the union of the two lists that already exist:
 *  - the registry's own pages (`GET /settings/registry` `pages`, P1 on; commerce `settings_registry.rs`
 *    PAGES), filtered by the server for this person's permissions and the store's modules;
 *  - the admin menu's settings routes (`lib/menu.ts` MENU and OFF_MENU, anything under `/settings`,
 *    `/panel/settings` or `/setup`), filtered by the same rules as the sidebar (`menuAccess.ts`),
 * so a page added to either shows here, and the list still answers when the registry read fails.
 * Pages are grouped by the sidebar group that owns their route (`groupForPath`).
 *
 * What is left of the old page are the two tools that do not belong to the registry at all:
 *  - the store key, which is written to THIS BROWSER, not to the store;
 *  - refreshing the storefront's cache, which is a request to the website.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreSiteUrl } from '../lib/storefront';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, RefreshCw, CheckCircle, AlertCircle, ArrowRight, Search, Loader2, ExternalLink } from 'lucide-react';
import { getTenantApiKey, setTenantApiKey, settingsRegistryAPI } from '@/services/api';
import { useAuth } from '../contexts/AuthContext';
import { MENU, OFF_MENU, groupForPath, productUrl, routeBase, withChildren, type MenuItem } from '@/lib/menu';
import { permitted, moduleOn } from '@/components/menu/menuAccess';

/** A registry page as `GET /settings/registry` answers it (`app` when it lives on another panel). */
interface RegistryPage { code?: string; path: string; app?: string; label: string; hint?: string }

interface DirectoryEntry { key: string; to: string; href?: string; label: string; hint?: string; code?: string; group: string }

/** The admin routes that are settings screens by where they live. */
const SETTINGS_ROUTE = /^\/(settings|panel\/settings|setup)(\/|$)/;

const OTHER_GROUP = 'More settings';

function groupLabelFor(path: string): string {
  const id = groupForPath(routeBase(path));
  return MENU.find((g) => g.id === id)?.label ?? OTHER_GROUP;
}

const Settings: React.FC = () => {
  const { hasPerm, canAccess } = useAuth();
  const [pages, setPages] = useState<RegistryPage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const view = await settingsRegistryAPI.get();
      setPages(Array.isArray(view?.pages) ? view.pages : []);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'The settings list could not be loaded.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const entries = useMemo<DirectoryEntry[]>(() => {
    const byKey = new Map<string, DirectoryEntry>();
    const keyOf = (path: string) => path.split('#')[0];
    for (const p of pages ?? []) {
      if (!p?.path || !p.label) continue;
      const absolute = /^https?:\/\//i.test(p.path);
      const href = absolute ? p.path : p.app ? productUrl(p.app, p.path) : undefined;
      byKey.set(keyOf(href ?? p.path), {
        key: keyOf(href ?? p.path), to: p.path, href, label: p.label, hint: p.hint, code: p.code,
        group: href ? OTHER_GROUP : groupLabelFor(p.path),
      });
    }
    const access = { hasPerm, canAccess };
    const menuItems: MenuItem[] = [...MENU.flatMap((g) => g.subs.flatMap((s) => s.items)), ...OFF_MENU].flatMap(withChildren);
    /** Keys named by a parent row ("Settings"): its first child of the same route names it better ("Settings Center"). */
    const fromParent = new Set<string>();
    for (const item of menuItems) {
      if (item.external || !SETTINGS_ROUTE.test(item.to) || item.to === '/settings/directory') continue;
      if (!permitted(item, access) || !moduleOn(item, access)) continue;
      const k = keyOf(item.to);
      if (fromParent.has(k) && !item.children?.length) {
        byKey.set(k, { ...byKey.get(k)!, label: item.label, hint: item.tip });
        fromParent.delete(k);
        continue;
      }
      if (item.children?.length && !byKey.has(k)) fromParent.add(k);
      if (byKey.has(k)) {
        // The registry names it already; the menu's one-line tip is the better hint when the registry has none.
        const e = byKey.get(k)!;
        if (!e.hint) e.hint = item.tip;
        continue;
      }
      byKey.set(k, { key: k, to: item.to, label: item.label, hint: item.tip, group: groupLabelFor(item.to) });
    }
    return [...byKey.values()];
  }, [pages, hasPerm, canAccess]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (e: DirectoryEntry) => !q || `${e.label} ${e.hint ?? ''} ${e.code ?? ''} ${e.to}`.toLowerCase().includes(q);
    const order = [...MENU.map((g) => g.label), OTHER_GROUP];
    const out = new Map<string, DirectoryEntry[]>();
    for (const e of entries.filter(hit)) out.set(e.group, [...(out.get(e.group) ?? []), e]);
    return [...out.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([label, list]) => ({ label, list: list.sort((x, y) => x.label.localeCompare(y.label)) }));
  }, [entries, query]);

  const shown = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">All settings pages</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every screen with settings you can open, by the part of the admin it belongs to.
            {!loading && ` ${entries.length} pages.`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-mute" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a page" className="h-9 pl-8" aria-label="Find a settings page" />
        </div>
      </header>

      <Link
        to="/settings"
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft hover:bg-surface-2"
      >
        <span className="flex-1">Looking for one setting? The Settings Center finds any of them by name or number.</span>
        <ArrowRight className="size-4 shrink-0 text-ink-mute" />
      </Link>

      {loadError && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">The server's list could not be loaded ({loadError}). Showing the pages this admin knows.</span>
          <Button size="sm" variant="outline" onClick={() => void load()} className="h-7 gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Try again</Button>
        </div>
      )}

      {loading && !pages ? (
        <div className="flex h-32 items-center justify-center text-sm text-ink-soft"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the settings pages</div>
      ) : shown === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-soft">
          {query ? `No settings page matches "${query}".` : 'No settings pages are open to you. Ask the store owner for access.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <section key={g.label} className="rounded-xl border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-mute">
                {g.label} <span className="font-normal">({g.list.length})</span>
              </h2>
              <ul className="divide-y divide-line">
                {g.list.map((e) => {
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{e.label}</span>
                        {e.hint && <span className="block text-xs text-ink-soft">{e.hint}</span>}
                      </span>
                      {e.code && <span className="shrink-0 font-mono text-[11px] text-ink-mute">{e.code}</span>}
                      {e.href ? <ExternalLink className="size-3.5 shrink-0 text-ink-mute" /> : <ArrowRight className="size-3.5 shrink-0 text-ink-mute" />}
                    </>
                  );
                  const cls = 'flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2';
                  return (
                    <li key={e.key}>
                      {e.href
                        ? <a href={e.href} className={cls}>{body}</a>
                        : <Link to={e.to} className={cls}>{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <h2 className="pt-2 text-sm font-semibold text-ink">Tools</h2>
      <BrowserKeyCard />
      <WebsiteRefreshCard />
    </div>
  );
};

/** The store key for this browser: sent as x-api-key when this admin is not on the store's own domain. */
const BrowserKeyCard: React.FC = () => {
  const [input, setInput] = useState('');
  const [isSet, setIsSet] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setIsSet(!!getTenantApiKey()); }, []);

  const save = () => {
    const value = input.trim();
    setTenantApiKey(value);
    setInput('');
    setIsSet(!!value);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  const clear = () => {
    setTenantApiKey(null);
    setInput('');
    setIsSet(false);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
            <Key className="size-5 text-ink-mute" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-ink">Store key for this browser</h3>
            <p className="mt-0.5 text-sm text-ink-soft">
              Sent as <code className="rounded bg-surface-2 px-1">x-api-key</code> so the server knows which store
              you mean when this admin is not on the store's own domain. It is saved in this browser only.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="password" placeholder="rf_…" value={input} onChange={(e) => setInput(e.target.value)} className="max-w-md" aria-label="Store key" />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!input.trim()}>Save</Button>
            <Button variant="outline" onClick={clear}>Clear</Button>
          </div>
        </div>
        {isSet && <p className="text-sm text-ink-soft">A key is set. Every request carries it.</p>}
        {saved && <p className="text-sm text-good">Saved.</p>}
      </CardContent>
    </Card>
  );
};

/** Refresh the storefront's cached pages: a request to this store's own website. */
const WebsiteRefreshCard: React.FC = () => {
  /** This store's own website, from the server, per store (lib/storefront.ts). */
  const siteUrl = useStoreSiteUrl();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const refresh = async (path?: string) => {
    setStatus('loading');
    setMessage('');
    // No resolvable website means there is no cache to clear: say so, rather than posting to localhost.
    if (!siteUrl) {
      setStatus('error');
      setMessage('This store has no website address on record, so there is no cache to clear.');
      return;
    }
    try {
      const res = await fetch(`${siteUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.revalidated) {
        setStatus('success');
        setMessage(path ? `Refreshed ${path}.` : 'Refreshed the whole website.');
      } else {
        setStatus('error');
        setMessage(data?.message ?? 'The website did not accept the request.');
      }
    } catch {
      setStatus('error');
      setMessage('Could not reach the website.');
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
            <RefreshCw className="size-5 text-ink-mute" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-ink">Refresh the website</h3>
            <p className="mt-0.5 text-sm text-ink-soft">
              The shop caches its pages. Use this when a change you made in here has not appeared yet.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => refresh()} disabled={status === 'loading'}>Refresh everything</Button>
          <Button variant="outline" onClick={() => refresh('/')} disabled={status === 'loading'}>Refresh the home page</Button>
        </div>
        {status === 'success' && (
          <p className="flex items-center gap-2 text-sm text-good"><CheckCircle className="size-4" />{message}</p>
        )}
        {status === 'error' && (
          <p className="flex items-center gap-2 text-sm text-bad"><AlertCircle className="size-4" />{message}</p>
        )}
        <p className="text-xs text-ink-mute">
          Website: <code className="rounded bg-surface-2 px-1">{siteUrl ?? 'not set'}</code>, this store's own
          address, from its domain settings.
        </p>
      </CardContent>
    </Card>
  );
};

export default Settings;
