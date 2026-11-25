/**
 * Product services, the products (PSVC-1): the store's active products a page at a time through the
 * admin's own product list (search and paging; the catalogue is never loaded whole), each with a
 * chip per kind of work it has (asked, in progress, delivered), read for the products on this page
 * only. A store admin (billing.manage) ticks products and asks Growcord for one kind of work; the bar
 * shows the rate times the ticked count before sending, and what the server did after.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { Btn, Field, Pagination, SearchInput, SectionCard, SelectInput, StatusChip, TextInput } from '@/components/erp';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInView } from '@/components/panelAnalytics/useInView';
import { billingAPI, errorText, productsAPI } from '@/services/api';
import { fmtCurrencyMinor, fmtNumber } from '@/lib/money';
import {
  KINDS, MAX_ASK_PRODUCTS, SERVICE_STATUS, asItems, kindLabel, kindShort,
  type ProductServicesSummary, type ServiceAskResult, type ServiceItem,
} from '@/lib/productServices';

const PAGE_SIZE = 25;
const money = (minor: number | null | undefined, currency?: string | null) => fmtCurrencyMinor(minor ?? 0, currency || 'INR', 'en-IN');

interface ProductRow { id: string; name: string; sku: string | null; image: string | null }

function toRow(p: any): ProductRow | null {
  const id = String(p?.id ?? p?.product_id ?? p?._id ?? '');
  if (!id) return null;
  const images = Array.isArray(p?.images) ? p.images : [];
  return { id, name: String(p?.name ?? p?.title ?? ''), sku: p?.sku ?? null, image: typeof images[0] === 'string' ? images[0] : null };
}

export default function ServiceProducts({ summary, canManage, version, onAsked }: {
  summary: ProductServicesSummary | null;
  canManage: boolean;
  /** Bumped after any change on the page; the chips are read again. */
  version: number;
  onAsked: () => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [work, setWork] = useState<Map<string, ServiceItem[]>>(new Map());
  const ask = useRef(0);

  // Ticks stay across pages and searches: id to name.
  const [ticked, setTicked] = useState<Map<string, string>>(new Map());
  const [kind, setKind] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  // The search box waits for the typing to stop.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!inView) return;
    const n = (ask.current += 1);
    setLoading(true);
    productsAPI.getAll({ search: q || undefined, page, limit: PAGE_SIZE, active: true })
      .then((d: any) => {
        if (n !== ask.current) return;
        const list: any[] = Array.isArray(d) ? d : (d?.data?.data || d?.data || []);
        setRows(list.map(toRow).filter((r): r is ProductRow => !!r));
        setTotal(typeof d?.total === 'number' ? d.total : list.length);
        setError(null);
      })
      .catch((e) => { if (n === ask.current) setError(errorText(e, 'Your products could not be loaded.')); })
      .finally(() => { if (n === ask.current) setLoading(false); });
  }, [inView, q, page]);

  // The work on the products of this page only.
  const ids = useMemo(() => (rows ?? []).map((r) => r.id), [rows]);
  const idKey = ids.join(',');
  useEffect(() => {
    if (!idKey) { setWork(new Map()); return; }
    let live = true;
    billingAPI.getProductServiceItems({ product_ids: idKey, limit: 500 })
      .then((d) => {
        if (!live) return;
        const by = new Map<string, ServiceItem[]>();
        // Newest first: the first row of a kind that is not cancelled is the product's live work of that kind.
        for (const it of asItems(d)) {
          if (it.status === 'cancelled') continue;
          const cur = by.get(it.product_id) ?? [];
          if (!cur.some((x) => x.kind === it.kind)) by.set(it.product_id, [...cur, it]);
        }
        setWork(by);
      })
      .catch(() => { if (live) setWork(new Map()); });
    return () => { live = false; };
  }, [idKey, version]);

  const pageAllTicked = ids.length > 0 && ids.every((id) => ticked.has(id));
  const tickPage = (on: boolean) => setTicked((cur) => {
    const next = new Map(cur);
    for (const r of rows ?? []) { if (on) next.set(r.id, r.name); else next.delete(r.id); }
    return next;
  });
  const tickOne = (r: ProductRow, on: boolean) => setTicked((cur) => {
    const next = new Map(cur);
    if (on) next.set(r.id, r.name); else next.delete(r.id);
    return next;
  });

  const count = ticked.size;
  const rate = kind ? summary?.rates.find((r) => r.kind === kind) : undefined;
  const tooMany = count > MAX_ASK_PRODUCTS;

  const send = async () => {
    if (!kind || !count || tooMany || sending) return;
    setSending(true);
    setAskError(null);
    setResult(null);
    try {
      const r = (await billingAPI.askProductService({ kind, product_ids: Array.from(ticked.keys()), note: note.trim() || undefined })) as ServiceAskResult;
      const created = Number(r?.created ?? 0);
      const skipped = Number(r?.skipped ?? 0);
      const notFound = Number(r?.not_found ?? 0);
      const parts = [`Asked Growcord for ${kindLabel(kind)} on ${fmtNumber(created)} ${created === 1 ? 'product' : 'products'}.`];
      if (skipped) parts.push(`${fmtNumber(skipped)} already had this work, so ${skipped === 1 ? 'it was' : 'they were'} left out.`);
      if (notFound) parts.push(`${fmtNumber(notFound)} ${notFound === 1 ? 'was' : 'were'} not found among your active products.`);
      setResult(parts.join(' '));
      setTicked(new Map());
      setNote('');
      onAsked();
    } catch (e) {
      setAskError(errorText(e, 'Growcord could not be asked just now. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={ref}>
      <SectionCard
        flush
        title="Your products"
        description="Active products, with the work each one has. Tick products to ask Growcord for work on them."
        action={<SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product by name or SKU" className="w-56" aria-label="Find a product" />}
      >
        {canManage && (
          <div className="space-y-3 border-b border-gray-100 bg-gray-50/70 px-5 py-4" data-ask-bar>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Work to ask for">
                <SelectInput value={kind} onChange={(e) => { setKind(e.target.value); setResult(null); }} className="w-60">
                  <option value="">Choose the work</option>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </SelectInput>
              </Field>
              <Field label="Note for Growcord (if any)" className="min-w-[200px] flex-1">
                <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="For example: white background, Hindi and English" />
              </Field>
              <Btn onClick={send} disabled={!kind || !count || tooMany || sending}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />} Ask Growcord
              </Btn>
            </div>
            <p className="text-sm text-gray-700" data-ask-estimate>
              {count === 0 ? 'Tick the products you want this work on.' : (
                <>
                  <strong>{fmtNumber(count)}</strong> {count === 1 ? 'product' : 'products'} ticked.{' '}
                  {!kind ? 'Choose the work.'
                    : rate?.rate_minor != null
                      ? <>At {money(rate.rate_minor, rate.currency)} a product, that is <strong>{money(rate.rate_minor * count, rate.currency)}</strong> before GST. Products that already have this work are left out and not charged.</>
                      : 'Price to be agreed with Growcord.'}
                  {' '}
                  <button type="button" className="text-gray-500 underline" onClick={() => setTicked(new Map())}>Clear ticks</button>
                </>
              )}
            </p>
            {tooMany && <p className="text-sm text-red-700">At most {fmtNumber(MAX_ASK_PRODUCTS)} products at a time. Untick some and ask again for the rest.</p>}
            {result && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                <span>{result}</span>
                <button type="button" onClick={() => setResult(null)} aria-label="Dismiss"><X className="size-4" /></button>
              </div>
            )}
            {askError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{askError}</p>}
          </div>
        )}

        {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm text-gray-500"><Loader2 className="size-4 animate-spin" /> Loading your products</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">{q ? `No active product matches "${q}".` : 'No active products yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canManage && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pageAllTicked}
                        onCheckedChange={(c: boolean | 'indeterminate') => tickPage(c === true)}
                        aria-label="Tick every product on this page"
                      />
                    </TableHead>
                  )}
                  <TableHead>Product</TableHead>
                  <TableHead>Work on it</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={loading ? 'opacity-60' : undefined}>
                {rows.map((r) => {
                  const items = work.get(r.id) ?? [];
                  return (
                    <TableRow key={r.id} data-service-product={r.id}>
                      {canManage && (
                        <TableCell>
                          <Checkbox
                            checked={ticked.has(r.id)}
                            onCheckedChange={(c: boolean | 'indeterminate') => tickOne(r, c === true)}
                            aria-label={`Tick ${r.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="min-w-[240px]">
                        <div className="flex items-center gap-3">
                          {r.image
                            ? <img src={r.image} alt="" loading="lazy" className="size-10 shrink-0 rounded border border-gray-200 object-cover" />
                            : <span className="size-10 shrink-0 rounded border border-dashed border-gray-200 bg-gray-50" aria-hidden />}
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm text-gray-900">{r.name}</div>
                            {r.sku && <div className="text-xs text-gray-500">{r.sku}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {items.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((it) => {
                              const s = SERVICE_STATUS[it.status];
                              return <StatusChip key={it.id} status={it.status} tone={s?.tone ?? 'neutral'} label={`${kindShort(it.kind)}: ${s?.label ?? it.status}`} />;
                            })}
                          </div>
                        ) : <span className="text-xs text-gray-400">None yet</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} className="border-t border-gray-100 px-5" />
      </SectionCard>
    </div>
  );
}
