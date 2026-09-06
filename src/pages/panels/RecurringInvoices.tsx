import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  FilterBar, Field, TextInput, SelectInput, SearchInput, inr,
  ExportMenu, Pagination, DrillLink, useListControls, type CsvColumn,
} from '../../components/erp';
import type { Tone } from '../../components/erp';
import { Repeat, Plus, ArrowLeft, Trash2, PlayCircle, Pause, Play, Ban } from 'lucide-react';
import { localeDate, localeDateTime } from '../../utils/date';

/**
 * Customer Recurring Invoices / Subscriptions (migration 098). Bill the same
 * customer on a schedule — a clinic reordering monthly, a wholesale standing
 * order, a quarterly AMC. Each profile is a template (customer + products +
 * cadence); a daily scheduler materialises a REAL sales order per due period
 * through the same order engine a manual order uses, so pricing + GST are
 * authoritative. Manual "Generate now" is available too. Uses the shared ERP kit.
 */

type View = 'list' | 'create' | 'detail';
interface Line { productId: string; variationId: string | null; sku: string; name: string; qty: number; price: number | null }

const STATUS_TONE: Record<string, Tone> = {
  active: 'green', paused: 'amber', expired: 'neutral', cancelled: 'red',
};
const StatusPill: React.FC<{ status: string }> = ({ status }) =>
  <StatusChip status={status} tone={STATUS_TONE[status] ?? 'neutral'} />;

const todayStr = () => new Date().toISOString().slice(0, 10);
const niceDate = (d?: string | null) => {
  if (!d) return '—';
  try { return localeDate(d + 'T00:00:00', { day: 'numeric', month: 'short', year: 'numeric' }, 'en-IN'); }
  catch { return d; }
};
const rupees = (minor?: string | number | null) => inr(Number(minor ?? 0) / 100);

// Client CSV of the profiles list.
const profileCsvCols: CsvColumn<any>[] = [
  { key: 'profile_number', label: 'Profile #' },
  { key: 'customer_name', label: 'Customer', format: (r) => r.customer_name || r.title || '' },
  { key: 'cadence', label: 'Cadence', format: (r) => r.cadence_label ?? r.frequency_label ?? r.frequency ?? '' },
  { key: 'next_run_date', label: 'Next run', format: (r) => (r.status === 'active' ? (r.next_run_date ?? '') : '') },
  { key: 'generated_count', label: 'Generated', format: (r) => r.generated_count ?? 0 },
  { key: 'status', label: 'Status' },
];
// Client CSV of a profile's generated invoices (runs). Total is minor units.
const runCsvCols: CsvColumn<any>[] = [
  { key: 'period_key', label: 'Period' },
  { key: 'order_number', label: 'Order', format: (r) => r.order_number ?? '' },
  { key: 'total_minor', label: 'Total', money: true },
  { key: 'status', label: 'Status' },
  { key: 'email_status', label: 'Email', format: (r) => r.email_status ?? '' },
  { key: 'created_at', label: 'Created', format: (r) => r.created_at ?? '' },
];

const RecurringInvoices: React.FC = () => {
  const { hasPerm } = useAuth();
  const canManage = hasPerm('orders.manage');
  const canRead = hasPerm('orders.read');

  const [view, setView] = useState<View>('list');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ── List ──
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // Status is a real backend filter; search + pagination are client-side
  // (listProfiles returns every profile for the chosen status at once).
  const lc = useListControls({ pageSize: 25 });

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/recurring-invoices', { params: lc.status ? { status: lc.status } : {} });
      const data = payload<any>(res);
      setRows(Array.isArray(data) ? data : (data?.rows ?? []));
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (view === 'list') loadList(); /* eslint-disable-next-line */ }, [view, lc.status]);

  const filteredProfiles = useMemo(() => {
    const q = lc.debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.profile_number, r.customer_name, r.title].some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [rows, lc.debouncedSearch]);
  const pageProfiles = filteredProfiles.slice((lc.page - 1) * lc.pageSize, lc.page * lc.pageSize);

  // ── Detail ──
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const openDetail = async (id: string) => {
    setErr(''); setMsg('');
    try { setDetail(payload<any>(await api.get(`/recurring-invoices/${id}`))); setView('detail'); }
    catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
  };
  const refreshDetail = async () => {
    if (!detail) return;
    try { setDetail(payload<any>(await api.get(`/recurring-invoices/${detail.id}`))); } catch { /* ignore */ }
  };
  const act = async (path: string, okMsg: string, method: 'post' | 'delete' = 'post') => {
    if (!detail) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      if (method === 'delete') { await api.delete(`/recurring-invoices/${detail.id}`); setView('list'); setMsg(okMsg); return; }
      const res = await api.post(`/recurring-invoices/${detail.id}/${path}`, {});
      const data = payload<any>(res);
      setMsg(okMsg + (data?.count ? ` — ${data.count} invoice(s) created` : ''));
      await refreshDetail();
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  // ── Create form ──
  const [cust, setCust] = useState({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '' });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [intervalCount, setIntervalCount] = useState(1);
  const [startDate, setStartDate] = useState(todayStr());
  const [endMode, setEndMode] = useState<'never' | 'date' | 'count'>('never');
  const [endDate, setEndDate] = useState('');
  const [maxOccurrences, setMaxOccurrences] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'prepaid' | 'cod'>('prepaid');
  const [autosend, setAutosend] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCust({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '', pincode: '' });
    setCustomerId(null); setTitle(''); setFrequency('monthly'); setIntervalCount(1);
    setStartDate(todayStr()); setEndMode('never'); setEndDate(''); setMaxOccurrences('');
    setPaymentMethod('prepaid'); setAutosend(false); setNotes(''); setLines([]);
    setResults([]); setSearchQ('');
  };

  /** Known customer? Phone lookup attaches their id so B2B pricing applies. */
  const lookupCustomer = async () => {
    const phone = cust.phone.trim();
    setCustomerId(null);
    if (phone.length < 10) return;
    try {
      const res = await api.get('/customers', { params: { search: phone, limit: 1 } });
      const list = res.data?.customers ?? res.data?.rows ?? (Array.isArray(res.data) ? res.data : payload<any>(res));
      const hit = Array.isArray(list) ? list[0] : null;
      if (hit && String(hit.phone ?? hit.phone_number ?? '').includes(phone.slice(-10))) {
        setCustomerId(hit.id ?? hit._id ?? null);
        if (!cust.name.trim() && (hit.name || hit.full_name)) setCust((c) => ({ ...c, name: hit.name ?? hit.full_name }));
        if (!cust.gstin.trim() && (hit.gstin || hit.b2b_gstin)) setCust((c) => ({ ...c, gstin: hit.gstin ?? hit.b2b_gstin }));
      }
    } catch { /* anonymous is fine */ }
  };

  // POS-style live product search.
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearch = (q: string) => {
    setSearchQ(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const res = await api.get('/products', { params: { search: term, expand: 'variations', limit: 8 } });
        const list = Array.isArray(res.data) ? res.data : (res.data?.products ?? payload<any>(res) ?? []);
        if (seq === searchSeq.current) setResults(Array.isArray(list) ? list : []);
      } catch { /* keep last results */ }
    }, 300);
  };

  const addLine = (r: any) => {
    const vid = r.variation_id ?? r.id;
    const pid = r.product_id ?? r.id;
    const price = r.final_price ?? r.sale_price ?? r.selling_price ?? r.price ?? null;
    setLines((ls) => {
      const found = ls.find((l) => l.variationId === vid);
      if (found) return ls.map((l) => (l.variationId === vid ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: pid, variationId: vid, sku: r.sku ?? '', name: r.name ?? r.product_name ?? 'Item', qty: 1, price: price != null ? Number(price) : null }];
    });
    setResults([]); setSearchQ('');
  };
  const setQty = (vid: string | null, qty: number) => {
    if (qty <= 0) setLines((ls) => ls.filter((l) => l.variationId !== vid));
    else setLines((ls) => ls.map((l) => (l.variationId === vid ? { ...l, qty } : l)));
  };
  const setPrice = (vid: string | null, v: string) => {
    const n = v === '' ? null : Number(v);
    setLines((ls) => ls.map((l) => (l.variationId === vid ? { ...l, price: n } : l)));
  };
  const estSubtotal = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);

  const saveProfile = async () => {
    if (!lines.length) { setErr('Add at least one product.'); return; }
    if (!cust.name.trim() || !cust.phone.trim()) { setErr('A customer name and phone are required for the shipping address.'); return; }
    setSaving(true); setErr(''); setMsg('');
    try {
      const shippingAddress = {
        fullName: cust.name, mobileNumber: cust.phone, email: cust.email || undefined,
        address: cust.address || undefined, city: cust.city || undefined,
        state: cust.state || undefined, pincode: cust.pincode || undefined,
      };
      const res = await api.post('/recurring-invoices', {
        title: title || undefined,
        customerId: customerId || undefined,
        customerName: cust.name || undefined,
        customerGstin: cust.gstin || undefined,
        shippingAddress,
        frequency, intervalCount,
        startDate,
        endDate: endMode === 'date' && endDate ? endDate : undefined,
        maxOccurrences: endMode === 'count' && maxOccurrences ? Number(maxOccurrences) : undefined,
        paymentMethod, autosend,
        notes: notes || undefined,
        items: lines.map((l) => ({
          productId: l.productId, variationId: l.variationId || undefined, quantity: l.qty,
          description: l.name,
          unitPriceMinor: l.price != null ? Math.round(l.price * 100) : undefined,
        })),
      });
      const created = payload<any>(res);
      resetForm();
      setMsg(`Recurring profile ${created?.profileNumber ?? ''} created.`);
      if (created?.id) await openDetail(created.id);
      else setView('list');
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  // ═══════════════════════════════════════════════════════════════════ CREATE
  if (view === 'create') {
    return (
      <Page width="narrow">
        <PageHeader icon={Repeat} title="New recurring invoice"
          description="Bill a customer automatically on a schedule. Each due date, we create a real order with the customer's authoritative pricing and GST."
          actions={<Btn variant="ghost" onClick={() => { resetForm(); setView('list'); }}><ArrowLeft className="h-4 w-4" /> Back</Btn>} />
        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        <SectionCard title="Customer & delivery" description="Enter a phone to attach a known (B2B) customer so their pricing applies. Name + phone are required.">
          <FilterBar>
            <Field label="Name *"><TextInput className="w-56" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
            <Field label="Phone *">
              <TextInput className={`w-40 ${customerId ? 'border-emerald-500' : ''}`} value={cust.phone}
                onChange={(e) => setCust({ ...cust, phone: e.target.value })} onBlur={lookupCustomer} />
            </Field>
            <Field label="Email"><TextInput className="w-56" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} /></Field>
            <Field label="GSTIN"><TextInput className="w-44" value={cust.gstin} onChange={(e) => setCust({ ...cust, gstin: e.target.value })} /></Field>
          </FilterBar>
          <FilterBar>
            <Field label="Address" className="flex-1 min-w-[16rem]"><TextInput value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></Field>
            <Field label="City"><TextInput className="w-40" value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} /></Field>
            <Field label="State (for GST)"><TextInput className="w-44" placeholder="e.g. Karnataka" value={cust.state} onChange={(e) => setCust({ ...cust, state: e.target.value })} /></Field>
            <Field label="Pincode"><TextInput className="w-28" value={cust.pincode} onChange={(e) => setCust({ ...cust, pincode: e.target.value })} /></Field>
          </FilterBar>
          {customerId && <div className="mt-2 text-xs text-emerald-700">Known customer attached — their B2B pricing will be applied automatically.</div>}
        </SectionCard>

        <SectionCard title="Products" description="Search by name, brand or SKU. Leave the price blank to use the customer's live catalogue price, or override it.">
          <div className="max-w-xl">
            <SearchInput placeholder="Search products to add…" value={searchQ} onChange={(e) => liveSearch(e.target.value)} />
            {results.length > 0 && (
              <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {results.map((r: any) => {
                  const vid = r.variation_id ?? r.id;
                  const price = r.final_price ?? r.sale_price ?? r.selling_price ?? r.price;
                  return (
                    <button key={vid} onClick={() => addLine(r)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{r.name ?? r.product_name}</span>
                        <span className="block truncate font-mono text-xs text-gray-400">{[r.sku, r.brand_name].filter(Boolean).join('  ·  ')}</span>
                      </span>
                      {price != null && <span className="shrink-0 font-semibold">{inr(Number(price))}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4">
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>Product</Th><Th>SKU</Th><Th num>Qty</Th><Th num>Unit price (₹)</Th><Th num>Line total</Th><Th></Th>
                </THead>
                <TBody>
                  {lines.length === 0 && <EmptyRow colSpan={6}>No products yet — search above to add them.</EmptyRow>}
                  {lines.map((l) => (
                    <Tr key={l.variationId ?? l.productId}>
                      <Td>{l.name}</Td>
                      <Td className="font-mono text-xs text-gray-500">{l.sku}</Td>
                      <Td num>
                        <span className="inline-flex items-center gap-1">
                          <button className="h-7 w-7 rounded border text-base font-bold" onClick={() => setQty(l.variationId, l.qty - 1)}>−</button>
                          <span className="w-7 text-center">{l.qty}</span>
                          <button className="h-7 w-7 rounded border text-base font-bold" onClick={() => setQty(l.variationId, l.qty + 1)}>+</button>
                        </span>
                      </Td>
                      <Td num>
                        <input type="number" min={0} step="0.01" value={l.price ?? ''} placeholder="auto"
                          onChange={(e) => setPrice(l.variationId, e.target.value)}
                          className="w-24 rounded border px-2 py-1 text-right" />
                      </Td>
                      <Td num>{l.price != null ? inr(l.price * l.qty) : <span className="text-gray-400">auto</span>}</Td>
                      <Td><Btn variant="ghost" size="sm" onClick={() => setQty(l.variationId, 0)}><Trash2 className="h-4 w-4" /></Btn></Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
            {lines.length > 0 && (
              <div className="mt-2 text-right text-sm text-gray-600">Estimated subtotal (before GST): <span className="font-semibold text-gray-900">{inr(estSubtotal)}</span></div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Schedule">
          <FilterBar>
            <Field label="Name (optional)"><TextInput className="w-56" placeholder="Dr Rao — monthly refill" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Repeats">
              <SelectInput value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </SelectInput>
            </Field>
            <Field label="Every N">
              <TextInput type="number" min={1} max={60} className="w-20" value={String(intervalCount)}
                onChange={(e) => setIntervalCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="First run (start)"><TextInput type="date" className="w-44" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          </FilterBar>
          <FilterBar>
            <Field label="Ends">
              <SelectInput value={endMode} onChange={(e) => setEndMode(e.target.value as any)}>
                <option value="never">Never (open-ended)</option>
                <option value="date">On a date</option>
                <option value="count">After N invoices</option>
              </SelectInput>
            </Field>
            {endMode === 'date' && <Field label="End date"><TextInput type="date" className="w-44" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>}
            {endMode === 'count' && <Field label="Number of invoices"><TextInput type="number" min={1} className="w-28" value={maxOccurrences} onChange={(e) => setMaxOccurrences(e.target.value)} /></Field>}
            <Field label="Payment">
              <SelectInput value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                <option value="prepaid">Prepaid</option>
                <option value="cod">Cash on delivery</option>
              </SelectInput>
            </Field>
          </FilterBar>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autosend} onChange={(e) => setAutosend(e.target.checked)} />
            <span>Email the invoice to the customer automatically when it's generated</span>
          </label>
          <FilterBar>
            <Field label="Notes" className="flex-1 min-w-[16rem]"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to record on each generated order" /></Field>
          </FilterBar>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="outline" onClick={() => { resetForm(); setView('list'); }}>Cancel</Btn>
            <Btn variant="success" onClick={saveProfile} disabled={saving || !lines.length}>{saving ? 'Saving…' : 'Save recurring invoice'}</Btn>
          </div>
        </SectionCard>
      </Page>
    );
  }

  // ═══════════════════════════════════════════════════════════════════ DETAIL
  if (view === 'detail' && detail) {
    const p = detail;
    const canToggle = p.status === 'active' || p.status === 'paused';
    return (
      <Page>
        <PageHeader icon={Repeat} title={p.profile_number || 'Recurring invoice'}
          description={p.title || (p.customer_name ? `For ${p.customer_name}` : 'Recurring invoice profile')}
          actions={<Btn variant="ghost" onClick={() => setView('list')}><ArrowLeft className="h-4 w-4" /> All recurring invoices</Btn>} />
        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

        <SectionCard
          title={<span className="flex items-center gap-2">Status <StatusPill status={p.status} /></span>}
          action={canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {p.status === 'active' && <Btn variant="success" onClick={() => act('generate', 'Generation run complete')} disabled={busy}><PlayCircle className="h-4 w-4" /> Generate now</Btn>}
              {p.status === 'active' && <Btn variant="outline" onClick={() => act('pause', 'Profile paused')} disabled={busy}><Pause className="h-4 w-4" /> Pause</Btn>}
              {p.status === 'paused' && <Btn variant="outline" onClick={() => act('resume', 'Profile resumed')} disabled={busy}><Play className="h-4 w-4" /> Resume</Btn>}
              {canToggle && <Btn variant="dangerOutline" onClick={() => act('cancel', 'Profile cancelled')} disabled={busy}><Ban className="h-4 w-4" /> Cancel</Btn>}
              <Btn variant="ghost" size="sm" onClick={() => { if (window.confirm('Delete this profile? Already-generated orders are kept.')) act('', 'Profile deleted', 'delete'); }} disabled={busy}><Trash2 className="h-4 w-4" /></Btn>
            </div>
          ) : undefined}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><div className="text-xs text-gray-500">Customer</div><div className="font-medium">{p.customer_name || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Cadence</div><div className="font-medium">{p.cadence_label ?? p.frequency_label ?? p.frequency}</div></div>
            <div><div className="text-xs text-gray-500">Next run</div><div className="font-medium">{p.status === 'active' ? niceDate(p.next_run_date) : '—'}</div></div>
            <div><div className="text-xs text-gray-500">Generated so far</div><div className="font-medium">{p.occurrences_generated ?? 0}{p.max_occurrences ? ` / ${p.max_occurrences}` : ''}</div></div>
            <div><div className="text-xs text-gray-500">GSTIN</div><div className="font-mono text-xs">{p.customer_gstin || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Payment</div><div className="font-medium">{p.payment_method === 'cod' ? 'Cash on delivery' : 'Prepaid'}</div></div>
            <div><div className="text-xs text-gray-500">Auto-email</div><div className="font-medium">{p.autosend ? 'On' : 'Off'}</div></div>
            <div><div className="text-xs text-gray-500">Ends</div><div className="font-medium">{p.end_date ? niceDate(p.end_date) : (p.max_occurrences ? `After ${p.max_occurrences}` : 'Open-ended')}</div></div>
          </div>
        </SectionCard>

        <SectionCard title="Line items">
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>Qty</Th><Th num>Unit price</Th>
              </THead>
              <TBody>
                {(p.items ?? []).length === 0 && <EmptyRow colSpan={4}>No items.</EmptyRow>}
                {(p.items ?? []).map((it: any) => (
                  <Tr key={it.id}>
                    <Td>{it.description || it.product_id}</Td>
                    <Td className="font-mono text-xs text-gray-500">{it.sku || '—'}</Td>
                    <Td num>{it.quantity}</Td>
                    <Td num>{it.unit_price_minor != null ? rupees(it.unit_price_minor) : <span className="text-gray-400">catalogue</span>}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          {p.notes && <div className="mt-3 text-sm text-gray-600"><span className="font-medium">Notes: </span>{p.notes}</div>}
        </SectionCard>

        <SectionCard title="Generated invoices" description="Orders created by this profile. One row per billing period — a period is never billed twice."
          action={<ExportMenu filename={`recurring-${p.profile_number || 'invoices'}`} columns={runCsvCols} rows={p.runs ?? []} canExport={canRead} />}>
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Period</Th><Th>Order</Th><Th num>Total</Th><Th>Status</Th><Th>Email</Th><Th>Created</Th>
              </THead>
              <TBody>
                {(p.runs ?? []).length === 0 && <EmptyRow colSpan={6}>No invoices generated yet. Click "Generate now" or wait for the next scheduled run.</EmptyRow>}
                {(p.runs ?? []).map((r: any) => (
                  <Tr key={r.id}>
                    <Td>{niceDate(r.period_key)}</Td>
                    <Td className="font-mono text-xs">
                      {r.order_number
                        ? <DrillLink to={`/orders/${r.order_id || r.order_number}`} title="Open this order">{r.order_number}</DrillLink>
                        : '—'}
                    </Td>
                    <Td num>{rupees(r.total_minor)}</Td>
                    <Td><StatusChip status={r.status} tone={r.status === 'failed' ? 'red' : (r.status === 'pending' ? 'amber' : 'green')} /></Td>
                    <Td>{r.email_status || '—'}</Td>
                    <Td className="text-xs text-gray-500">{r.created_at ? localeDateTime(r.created_at, undefined, 'en-IN') : '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </SectionCard>
      </Page>
    );
  }

  // ═══════════════════════════════════════════════════════════════════ LIST
  return (
    <Page>
      <PageHeader icon={Repeat} title="Recurring Invoices"
        description="Bill customers automatically on a schedule — weekly, monthly, quarterly or yearly. Each due date creates a real order with authoritative pricing and GST."
        actions={
          <div className="flex items-end gap-2">
            <ExportMenu filename="recurring-invoices" columns={profileCsvCols} rows={filteredProfiles} canExport={canRead} />
            {canManage && <Btn variant="primary" onClick={() => { resetForm(); setErr(''); setMsg(''); setView('create'); }}><Plus className="h-4 w-4" /> New recurring invoice</Btn>}
          </div>
        } />
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

      <SectionCard title="All profiles" action={
        <FilterBar>
          <Field label="Search">
            <SearchInput placeholder="Profile #, customer or title…" value={lc.search} onChange={(e) => lc.setSearch(e.target.value)} />
          </Field>
          <Field label="Status">
            <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
              <option value="">All</option>
              {['active', 'paused', 'expired', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </SelectInput>
          </Field>
        </FilterBar>
      }>
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Profile #</Th><Th>Customer</Th><Th>Cadence</Th><Th>Next run</Th><Th num>Generated</Th><Th>Status</Th><Th></Th>
            </THead>
            <TBody>
              {loading && <EmptyRow colSpan={7}>Loading…</EmptyRow>}
              {!loading && filteredProfiles.length === 0 && (
                <EmptyRow colSpan={7}>{rows.length === 0 ? 'No recurring invoices yet. Click "New recurring invoice" to set one up.' : 'No profiles match your search.'}</EmptyRow>
              )}
              {!loading && pageProfiles.map((r: any) => (
                <Tr key={r.id}>
                  <Td className="font-mono text-xs">{r.profile_number}</Td>
                  <Td>{r.customer_name || r.title || <span className="text-gray-400">—</span>}</Td>
                  <Td>{r.cadence_label ?? r.frequency_label ?? r.frequency}</Td>
                  <Td>{r.status === 'active' ? niceDate(r.next_run_date) : '—'}</Td>
                  <Td num>{r.generated_count ?? 0}</Td>
                  <Td><StatusPill status={r.status} /></Td>
                  <Td><Btn variant="ghost" size="sm" onClick={() => openDetail(r.id)}>View</Btn></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
        <Pagination page={lc.page} pageSize={lc.pageSize} total={filteredProfiles.length} onPage={lc.setPage} onPageSize={lc.setPageSize} />
      </SectionCard>
    </Page>
  );
};

export default RecurringInvoices;
