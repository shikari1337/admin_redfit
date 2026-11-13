/**
 * Catalog: what Meta rejected first (grouped by Meta's message, each product linked to its edit page), then
 * the counts, every item with its status, the sync settings (saved in the facebook_catalog channel's own
 * `config` through its existing PATCH), product sets, Sync now (the channel's existing full pass) and the
 * WhatsApp catalog switches.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { connectionsHref } from './routes';
import { ImageOff, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination } from '@/components/erp';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/utils/date';
import {
  metaApi, type CatalogItem, type CatalogSummary, type ProductSet, type StoreCategory, type WaCatalogStatus,
} from '@/lib/v2/areas/meta';
import { useMetaCtx, type MetaCtx } from './useMetaCtx';
import MetaHeader from './MetaHeader';
import ProductSetForm, { filterText } from './ProductSetForm';
import CatalogAdvanced from './CatalogAdvanced';
import CatalogHealthCard from './CatalogHealthCard';
import CatalogFactsCard from './CatalogFactsCard';
import {
  Figure, Lead, LoadFailure, Section, StateChip, ago, linkCls, moneyMajor, num, plural, useLoad, writeError, type Failure, type Tone,
} from './common';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  synced: { label: 'On Meta', tone: 'good' },
  pending: { label: 'Waiting', tone: 'info' },
  warning: { label: 'Warning', tone: 'warn' },
  error: { label: 'Rejected', tone: 'bad' },
  excluded: { label: 'Not sent', tone: 'neutral' },
  deleted: { label: 'Removed', tone: 'neutral' },
};
const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' }, { key: 'error', label: 'Rejected' }, { key: 'warning', label: 'Warnings' }, { key: 'pending', label: 'Waiting' },
  { key: 'synced', label: 'On Meta' }, { key: 'excluded', label: 'Not sent' }, { key: 'deleted', label: 'Removed' },
];
/** Used only when the summary carries no `label_sources` (CONTRACT QUESTION). */
const LABEL_SOURCES_FALLBACK = [{ key: 'brand', label: 'Brand' }, { key: 'category', label: 'Main category' }];
const editLink = (it: CatalogItem) => `/products/${encodeURIComponent(it.product_id)}/edit`;
const shortOf = (text: string) => text.split(/[:.]/)[0].trim();
/** A product title link: dark text, the brand colour on hover. */
const titleLink = 'font-medium text-gray-900 underline-offset-2 hover:text-primary hover:underline';
const reviewText = (it: CatalogItem) => (it.meta_review_status && it.meta_review_status !== 'approved' ? `Meta review: ${it.meta_review_status}` : '');

interface IssueGroup { key: string; level: string; text: string; items: CatalogItem[] }

/** Every rejected and warned item, grouped by Meta's message (at most 8 pages of each). */
async function loadIssues(channelId: string): Promise<{ groups: IssueGroup[]; capped: boolean }> {
  const all: CatalogItem[] = [];
  let capped = false;
  for (const status of ['error', 'warning']) {
    let page = 1;
    let pages = 1;
    do {
      const r = await metaApi.catalogItems(channelId, { status, page });
      all.push(...r.rows);
      pages = r.pages;
      page += 1;
    } while (page <= pages && page <= 8);
    if (pages > 8) capped = true;
  }
  const map = new Map<string, IssueGroup>();
  for (const it of all) {
    for (const m of it.messages.length ? it.messages : [{ level: it.status === 'error' ? 'error' : 'warning', code: 'unknown', text: 'Meta gave no reason' }]) {
      const key = `${m.level}:${m.code || m.text}`;
      const g = map.get(key) ?? { key, level: m.level, text: m.text, items: [] };
      g.items.push(it);
      map.set(key, g);
    }
  }
  const groups = [...map.values()].sort((a, b) => (a.level === b.level ? b.items.length - a.items.length : a.level === 'error' ? -1 : 1));
  return { groups, capped };
}

const ItemThumb: React.FC<{ src: string | null }> = ({ src }) => (src
  ? <img src={src} alt="" className="h-10 w-10 shrink-0 rounded border object-cover" loading="lazy" />
  : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-gray-50 text-gray-400"><ImageOff className="h-4 w-4" /></span>);

const CatalogTab: React.FC<{ ctx: MetaCtx }> = ({ ctx }) => {
  const loadingChannels = ctx.channelsLoading;
  const summaryFailure = ctx.summaryFailure;
  const { toast } = useToast();
  const fb = ctx.fbChannel;
  const [creating, setCreating] = useState(false);

  const createChannel = async () => {
    setCreating(true);
    try {
      const platform = await metaApi.platform('facebook_catalog');
      if (!platform) { toast({ title: 'Not available', description: 'The Facebook catalog channel is not switched on for this store. Ask your platform admin.' }); return; }
      await metaApi.createChannel(platform.code, platform.name);
      toast({ title: `${platform.name} created` });
      await ctx.reloadChannels();
    } catch (e) {
      toast({ title: 'Not created', description: writeError(e, 'The channel could not be created.'), variant: 'destructive' });
    } finally { setCreating(false); }
  };

  if (loadingChannels) return <p className="text-sm text-gray-500">Loading your channels...</p>;
  if (!fb) {
    return (
      <div className="space-y-5">
        <Lead tone="warn" title="Your products are not on Meta yet"
          actions={ctx.can.catalog && <Button onClick={createChannel} disabled={creating}>{creating && <Loader2 className="animate-spin" />} Create the Facebook catalog channel</Button>}>
          The Facebook catalog channel sends your products to Meta for the Facebook and Instagram shop, product tags, WhatsApp and ads.
          {!ctx.can.catalog && ' Ask someone who can manage channels to create it.'}
        </Lead>
        <WhatsAppSection ctx={ctx} summary={null} />
      </div>
    );
  }
  return <CatalogBody ctx={ctx} channelId={fb.id} summaryFailure={summaryFailure} />;
};

const CatalogBody: React.FC<{ ctx: MetaCtx; channelId: string; summaryFailure: Failure | null }> = ({ ctx, channelId, summaryFailure }) => {
  const { toast } = useToast();
  const summary = ctx.summary;
  const issuesQ = useLoad(() => loadIssues(channelId), [channelId]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const itemsQ = useLoad(() => metaApi.catalogItems(channelId, { status: status || undefined, q: term || undefined, page }), [channelId, status, term, page]);
  const [syncing, setSyncing] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const showStatus = (s: string) => {
    setStatus(s); setPage(1);
    document.getElementById('meta-catalog-items')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await metaApi.syncChannel(channelId);
      toast(r ? { title: 'Full pass done', description: `${num(r.ok)} of ${num(r.total)} accepted, ${num(r.error)} rejected.` } : { title: 'Nothing to send', description: 'Meta already has every change, or this channel sends a feed file Meta reads on its own schedule.' });
      await Promise.all([ctx.reloadSummary(), issuesQ.reload(), itemsQ.reload()]);
    } catch (e) {
      toast({ title: 'Sync failed', description: writeError(e, 'Meta did not take the catalog.'), variant: 'destructive' });
    } finally { setSyncing(false); }
  };

  const groups = issuesQ.data?.groups ?? [];
  const errorGroups = groups.filter((g) => g.level === 'error');
  const warnGroups = groups.filter((g) => g.level !== 'error');
  const c = summary?.counts;

  return (
    <div className="space-y-5">
      {summaryFailure && !summary && <LoadFailure failure={summaryFailure} what="The catalog summary (GET /api/v2/commerce/channels/{id}/catalog-summary) is not served yet." onRetry={ctx.reloadSummary} />}

      {c && (c.errors > 0 ? (
        <Lead tone="bad" title={`${plural(c.errors, 'product')} rejected by Meta`}
          actions={<Button size="sm" variant="outline" className="bg-white" onClick={() => showStatus('error')}>Show them</Button>}>
          {errorGroups.length
            ? <>{errorGroups.map((g) => `${shortOf(g.text)} (${num(g.items.length)})`).join(', ')}. Fix them on each product; the next change goes to Meta {summary?.realtime ? 'within seconds' : 'with the next sync'}.</>
            : 'Loading the reasons...'}
          {warnGroups.length > 0 && <p className="mt-1">Also {plural(c.warnings, 'warning')}: {warnGroups.map((g) => `${shortOf(g.text)} (${num(g.items.length)})`).join(', ')}.</p>}
        </Lead>
      ) : c.pending > 0 ? (
        <Lead tone="info" title={`${plural(c.pending, 'product')} on the way to Meta`}>Everything else is on Meta. Nothing for you to do.</Lead>
      ) : (
        <Lead tone="good" title={`All ${num(c.synced)} products are on Meta`}>{c.warnings ? `${plural(c.warnings, 'warning')} to look at when you have time.` : 'No warnings.'}</Lead>
      ))}

      {summary && <SummarySection summary={summary} status={status} onStatus={showStatus} syncing={syncing} onSync={syncNow} canSync={ctx.can.catalog} />}

      {groups.length > 0 && (
        <Section title="What Meta says" hint="Grouped by Meta's message. Open a group to fix each product.">
          {issuesQ.data?.capped && <p className="mb-2 text-xs text-gray-500">Grouping the first 200 of each kind. Use the table below for the rest.</p>}
          <ul className="-my-2 divide-y">
            {groups.map((g) => (
              <li key={g.key} className="py-2">
                <button type="button" onClick={() => setOpenIssue(openIssue === g.key ? null : g.key)} className="flex w-full flex-wrap items-center gap-2 text-left">
                  <StateChip tone={g.level === 'error' ? 'bad' : 'warn'}>{g.level === 'error' ? 'Rejected' : 'Warning'}</StateChip>
                  <span className="min-w-0 flex-1 text-sm text-gray-900">{g.text}</span>
                  <span className="text-sm font-semibold tabular-nums">{num(g.items.length)}</span>
                  <span className="text-xs text-primary">{openIssue === g.key ? 'Hide' : 'Show'}</span>
                </button>
                {openIssue === g.key && (
                  <ul className="mt-2 space-y-1 pl-1">
                    {g.items.slice(0, 12).map((it) => (
                      <li key={`${g.key}:${it.retailer_id}`} className="flex items-center gap-2 text-sm">
                        <span className="w-28 shrink-0 truncate font-mono text-xs text-gray-500">{it.retailer_id}</span>
                        <Link to={editLink(it)} className={`${linkCls} min-w-0 truncate`}>{it.title}</Link>
                      </li>
                    ))}
                    {g.items.length > 12 && (
                      <li><button type="button" className="text-xs text-primary" onClick={() => showStatus(g.level === 'error' ? 'error' : 'warning')}>All {num(g.items.length)} in the table</button></li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="meta-catalog-items" title="Products on Meta" hint={itemsQ.data ? `${plural(itemsQ.data.total, 'item')}${status ? ` ${STATUS[status]?.label.toLowerCase() ?? status}` : ''}` : undefined}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => { setStatus(f.key); setPage(1); }}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status === f.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" className="pl-8" aria-label="Search products" />
          </div>
        </div>
        {itemsQ.error && !itemsQ.data ? <LoadFailure failure={itemsQ.error} what="The catalog item list (GET /api/v2/commerce/channels/{id}/catalog-items) is not served yet." onRetry={itemsQ.reload} />
          : !itemsQ.data ? <p className="text-sm text-gray-500">Loading...</p>
            : itemsQ.data.rows.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">No products match.</p>
              : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="border-b text-left text-xs text-gray-500">
                        <tr><th className="py-2 pr-3 font-medium">Product</th><th className="pr-3 font-medium">SKU on Meta</th><th className="pr-3 text-right font-medium">Price</th><th className="pr-3 font-medium">Status</th><th className="pr-3 font-medium">What Meta says</th><th className="font-medium">Sent</th></tr>
                      </thead>
                      <tbody>
                        {itemsQ.data.rows.map((it) => (
                          <tr key={it.retailer_id} className="border-b align-top last:border-0">
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <ItemThumb src={it.image} />
                                <Link to={editLink(it)} className={`${titleLink} line-clamp-2 min-w-0 max-w-[18rem]`}>{it.title}</Link>
                              </div>
                            </td>
                            <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-gray-600">{it.retailer_id}</td>
                            <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{moneyMajor(it.price, it.currency)}</td>
                            <td className="py-2 pr-3"><StateChip tone={STATUS[it.status]?.tone ?? 'neutral'}>{STATUS[it.status]?.label ?? it.status}</StateChip></td>
                            <td className="py-2 pr-3 text-xs text-gray-700">{it.messages.map((m) => m.text).join(' ') || reviewText(it)}</td>
                            <td className="whitespace-nowrap py-2 text-xs text-gray-500">{it.pushed_at ? ago(it.pushed_at) : 'Not yet'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className="divide-y md:hidden">
                    {itemsQ.data.rows.map((it) => (
                      <li key={it.retailer_id} className="flex gap-3 py-2.5">
                        <ItemThumb src={it.image} />
                        <div className="min-w-0 flex-1">
                          <Link to={editLink(it)} className={`${titleLink} line-clamp-2 text-sm`}>{it.title}</Link>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                            <StateChip tone={STATUS[it.status]?.tone ?? 'neutral'}>{STATUS[it.status]?.label ?? it.status}</StateChip>
                            <span className="tabular-nums text-gray-800">{moneyMajor(it.price, it.currency)}</span>
                            <span className="font-mono">{it.retailer_id}</span>
                          </div>
                          {(it.messages.length > 0 || reviewText(it)) && <p className="mt-1 text-xs text-gray-700">{it.messages.map((m) => m.text).join(' ') || reviewText(it)}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {itemsQ.data.pages > 1 && (
                    <Pagination className="mt-3" page={page} total={itemsQ.data.total} pageSize={Math.ceil(itemsQ.data.total / itemsQ.data.pages)} onPage={setPage} />
                  )}
                </>
              )}
      </Section>

      <CatalogHealthCard ctx={ctx} channelId={channelId} />
      <SettingsSection ctx={ctx} summary={summary} />
      <CatalogAdvanced ctx={ctx} summary={summary} />
      <CatalogFactsCard canEdit={ctx.can.setup} />
      <ProductSetsSection ctx={ctx} channelId={channelId} />
      <WhatsAppSection ctx={ctx} summary={summary} />
    </div>
  );
};

const SummarySection: React.FC<{ summary: CatalogSummary; status: string; onStatus: (s: string) => void; syncing: boolean; onSync: () => void; canSync: boolean }> = ({ summary, status, onStatus, syncing, onSync, canSync }) => {
  const c = summary.counts;
  return (
    <Section
      title={summary.catalog ? `Catalog: ${summary.catalog.name}` : 'Catalog'}
      hint={`${summary.mode === 'feed' ? 'Meta reads a feed file' : 'Sent through the API'}${summary.mode !== 'feed' ? (summary.realtime ? ', changes within seconds' : ', changes with each scheduled sync') : ''}. Last change sent ${ago(summary.last_push_at)}; last full pass ${summary.last_full_at ? formatDateTime(summary.last_full_at) : 'never'}.`}
      actions={canSync && <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now</Button>}
    >
      {summary.last_error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Last sync failed: {summary.last_error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="All products" value={num(c.total)} onClick={() => onStatus('')} active={status === ''} />
        <Figure label="On Meta" value={num(c.synced)} tone="good" onClick={() => onStatus('synced')} active={status === 'synced'} />
        <Figure label="Waiting" value={num(c.pending)} tone={c.pending ? 'info' : 'neutral'} onClick={() => onStatus('pending')} active={status === 'pending'} />
        <Figure label="Warnings" value={num(c.warnings)} tone={c.warnings ? 'warn' : 'neutral'} onClick={() => onStatus('warning')} active={status === 'warning'} />
        <Figure label="Rejected" value={num(c.errors)} tone={c.errors ? 'bad' : 'neutral'} onClick={() => onStatus('error')} active={status === 'error'} />
        <Figure label="Not sent (your rules)" value={num(c.excluded)} onClick={() => onStatus('excluded')} active={status === 'excluded'} />
      </div>
    </Section>
  );
};

interface SettingsForm { connect_method: string; realtime: boolean; out_of_stock: string; excluded_category_ids: string[]; custom_labels: Record<string, string> }
const LABEL_SLOTS = ['0', '1', '2', '3', '4'];
const NONE = '__none__';

const SettingsSection: React.FC<{ ctx: MetaCtx; summary: CatalogSummary | null }> = ({ ctx, summary }) => {
  const { toast } = useToast();
  const fb = ctx.fbChannel!;
  const catsQ = useLoad(() => metaApi.categories(), []);
  const initial = useMemo<SettingsForm>(() => {
    const cfg = fb.config ?? {};
    return {
      connect_method: cfg.connect_method || summary?.mode || 'api',
      realtime: cfg.realtime ?? summary?.realtime ?? true,
      out_of_stock: cfg.out_of_stock || 'send',
      excluded_category_ids: Array.isArray(cfg.excluded_category_ids) ? cfg.excluded_category_ids.map(String) : [],
      custom_labels: Object.fromEntries(LABEL_SLOTS.map((k) => [k, String(cfg.custom_labels?.[k] ?? '')])),
    };
  }, [fb.config, summary?.mode, summary?.realtime]);
  const [form, setForm] = useState<SettingsForm>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const sources = summary?.label_sources?.length ? summary.label_sources : LABEL_SOURCES_FALLBACK;
  const cats: StoreCategory[] = catsQ.data ?? [];
  const disabled = !ctx.can.catalog;

  const save = async () => {
    setSaving(true);
    try {
      const custom = Object.fromEntries(Object.entries(form.custom_labels).map(([k, v]) => [k, v || null]));
      await metaApi.saveChannelConfig(fb.id, { ...(fb.config ?? {}), ...form, custom_labels: custom });
      toast({ title: 'Catalog settings saved', description: 'They apply from the next change; use Sync now to resend everything.' });
      await Promise.all([ctx.reloadChannels(), ctx.reloadSummary()]);
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The settings were not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Section title="Sync settings" hint="Saved on the Facebook catalog channel. Change what is sent here, not on each product."
      actions={!disabled && <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label>How products reach Meta</Label>
            <Select value={form.connect_method} onValueChange={(v) => setForm({ ...form, connect_method: v })} disabled={disabled}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="api">Sent through the API (recommended)</SelectItem>
                <SelectItem value="feed">A feed file Meta reads</SelectItem>
              </SelectContent>
            </Select>
            {form.connect_method === 'feed' && <p className="mt-1 text-xs text-gray-500">The feed address is on <Link className={linkCls} to="/channels">Multi-Channel Sync</Link>. Meta reads it on its own schedule, so changes are slower.</p>}
          </div>
          <label className="flex items-start gap-3">
            <Switch checked={form.realtime && form.connect_method === 'api'} disabled={disabled || form.connect_method !== 'api'} onCheckedChange={(v) => setForm({ ...form, realtime: v })} className="mt-0.5" />
            <span className="text-sm"><span className="font-medium">Send changes within seconds</span><span className="block text-gray-600">Price, stock, image and visibility changes go to Meta as they happen. Off: with each scheduled sync.</span></span>
          </label>
          <div>
            <Label>Out of stock products</Label>
            <Select value={form.out_of_stock} onValueChange={(v) => setForm({ ...form, out_of_stock: v })} disabled={disabled}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="send">Send them, marked out of stock</SelectItem>
                <SelectItem value="exclude">Do not send them</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Custom labels</Label>
            <p className="text-xs text-gray-500">Meta can group products by these in ads and product sets.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LABEL_SLOTS.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-600">Label {k}</span>
                  <Select value={form.custom_labels[k] || NONE} onValueChange={(v) => setForm({ ...form, custom_labels: { ...form.custom_labels, [k]: v === NONE ? '' : v } })} disabled={disabled}>
                    <SelectTrigger className="h-8 min-w-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not used</SelectItem>
                      {sources.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <Label>Categories never sent to Meta</Label>
          <p className="text-xs text-gray-500">{form.excluded_category_ids.length ? `${plural(form.excluded_category_ids.length, 'category', 'categories')} left out.` : 'Every category is sent.'}</p>
          {catsQ.error && !catsQ.data ? <p className="mt-2 text-sm text-red-700">Could not load your categories.</p> : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cats.map((cat) => {
                const on = form.excluded_category_ids.includes(cat.id);
                return (
                  <button key={cat.id} type="button" disabled={disabled} aria-pressed={on}
                    onClick={() => setForm({ ...form, excluded_category_ids: on ? form.excluded_category_ids.filter((x) => x !== cat.id) : [...form.excluded_category_ids, cat.id] })}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-red-300 bg-red-50 text-red-800 line-through' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>
                    {cat.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">Tap a category to leave it out; tap again to send it.</p>
        </div>
      </div>
    </Section>
  );
};

const ProductSetsSection: React.FC<{ ctx: MetaCtx; channelId: string }> = ({ ctx, channelId }) => {
  const { toast } = useToast();
  const setsQ = useLoad(() => metaApi.productSets(channelId), [channelId]);
  const catsQ = useLoad(() => metaApi.categories(), []);
  const [adding, setAdding] = useState(false);
  const sets: ProductSet[] = setsQ.data ?? [];
  return (
    <Section title="Product sets" hint="Groups of products for ads and shop sections."
      actions={ctx.can.catalog && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus /> New set</Button>}>
      {adding && (
        <div className="mb-4">
          <ProductSetForm channelId={channelId} categories={catsQ.data ?? []} onCancel={() => setAdding(false)}
            onCreated={(s) => { toast({ title: `Set "${s.name}" created` }); setAdding(false); setsQ.reload(); }} />
        </div>
      )}
      {setsQ.error && !setsQ.data ? <LoadFailure failure={setsQ.error} what="Product sets (GET /api/v2/commerce/channels/{id}/product-sets) are not served yet." onRetry={setsQ.reload} />
        : !setsQ.data ? <p className="text-sm text-gray-500">Loading...</p>
          : sets.length === 0 ? <p className="text-sm text-gray-600">No sets yet. Remarketing ads need one.</p>
            : (
              <ul className="-my-2 divide-y">
                {sets.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                    <span className="font-medium text-gray-900">{s.name}</span>
                    <span className="text-sm text-gray-600">{filterText(s.filter, catsQ.data ?? [])}{s.product_count != null ? `, ${plural(s.product_count, 'product')}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
    </Section>
  );
};

const WhatsAppSection: React.FC<{ ctx: MetaCtx; summary: CatalogSummary | null }> = ({ ctx, summary }) => {
  const { toast } = useToast();
  const waRow = ctx.setup?.items.find((i) => i.key === 'whatsapp') ?? null;
  const number = waRow?.picked ?? null;
  const catalogId = summary?.catalog?.id ?? ctx.setup?.items.find((i) => i.key === 'catalog')?.picked?.id ?? null;
  const stQ = useLoad(() => (number ? metaApi.waCatalogStatus(number.id) : Promise.resolve(null)), [number?.id]);
  const [form, setForm] = useState<{ visible: boolean; cart: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const st: WaCatalogStatus | null = stQ.data;
  useEffect(() => { if (st) setForm({ visible: st.catalog_visible, cart: st.cart_enabled }); }, [st]);
  const wa = ctx.waChannel;

  const save = async () => {
    if (!number || !catalogId || !form) return;
    setSaving(true);
    try {
      const r = await metaApi.waCatalogConnect({ number_id: number.id, catalog_id: catalogId, catalog_visible: form.visible, cart_enabled: form.cart });
      stQ.setData(r);
      toast({ title: 'WhatsApp catalog saved' });
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'Meta refused the change.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const dirty = !!(st && form && (form.visible !== st.catalog_visible || form.cart !== st.cart_enabled));
  return (
    <Section title="WhatsApp" hint="The same catalog shows in WhatsApp chats, with the same SKUs."
      actions={ctx.can.catalog && st && form && (st.linked
        ? <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>
        : <Button size="sm" onClick={save} disabled={saving || !catalogId}>{saving ? 'Connecting...' : 'Connect catalog'}</Button>)}>
      {!number ? (
        <p className="text-sm text-gray-600">
          {waRow?.note ?? 'No WhatsApp number is set up for this store yet.'}{' '}
          See the WhatsApp row in <button type="button" className={linkCls} onClick={() => ctx.goTab('setup')}>Setup</button>.
        </p>
      ) : stQ.error && !st ? <LoadFailure failure={stQ.error} what="The WhatsApp catalog status (GET /api/v2/whatsapp/products/catalog/status) is not served yet." onRetry={stQ.reload} />
        : !st || !form ? <p className="text-sm text-gray-500">Loading...</p> : (
          <div className="space-y-3">
            <p className="text-sm text-gray-800">
              {number.name}: {st.linked ? <StateChip tone="good">Catalog linked</StateChip> : <StateChip tone="warn">Catalog not linked</StateChip>}
              {!catalogId && <span className="ml-2 text-amber-800">Pick the catalog on <Link className={linkCls} to={connectionsHref('meta')}>the Meta connection</Link> first.</span>}
            </p>
            <label className="flex items-start gap-3">
              <Switch checked={form.visible} onCheckedChange={(v) => setForm({ ...form, visible: v })} disabled={!ctx.can.catalog} className="mt-0.5" />
              <span className="text-sm"><span className="font-medium">Show the catalog in chats</span><span className="block text-gray-600">Shoppers see your catalog on your WhatsApp profile and in chats.</span></span>
            </label>
            <label className="flex items-start gap-3">
              <Switch checked={form.cart} onCheckedChange={(v) => setForm({ ...form, cart: v })} disabled={!ctx.can.catalog} className="mt-0.5" />
              <span className="text-sm"><span className="font-medium">Let shoppers add to a cart</span><span className="block text-gray-600">Shoppers put products in a cart and send it to you in the chat.</span></span>
            </label>
            {wa && <p className="text-xs text-gray-500">WhatsApp catalog channel: {wa.is_active ? 'on' : 'paused'}, last change sent {ago(wa.last_push_at)}. Managed on <Link className={linkCls} to="/channels">Multi-Channel Sync</Link>.</p>}
          </div>
        )}
    </Section>
  );
};

/** Route-ready: this tab as a page of its own (for a Marketing menu item). */
export const CatalogPage: React.FC = () => {
  const ctx = useMetaCtx();
  return (
    <div className="space-y-5">
      <MetaHeader title="Catalog on Meta" setup={ctx.setup} description="Your products on Facebook, Instagram and WhatsApp: what Meta accepted, what it refused, and why." />
      <CatalogTab ctx={ctx} />
    </div>
  );
};

export default CatalogTab;
