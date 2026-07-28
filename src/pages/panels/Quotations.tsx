import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, SectionCard, Btn, StatusChip,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow,
  FilterBar, Field, TextInput, SelectInput, SearchInput, inr,
} from '../../components/erp';
import type { Tone } from '../../components/erp';
import { FileText, Plus, ArrowLeft, Download, Trash2, ShoppingCart } from 'lucide-react';

/**
 * Quotations / Estimates (Part I §8). A B2B sales-clerk flow, in plain language:
 * build a price quote for a customer with THEIR real pricing (server-side B2B
 * waterfall), send a clean PDF, and one-click convert an accepted quote into an
 * order. Uses the shared ERP primitive kit + the POS-style live product search.
 */

type View = 'list' | 'create' | 'detail';
interface Line { productId: string; variationId: string | null; sku: string; name: string; qty: number; price: number | null }

const STATUS_TONE: Record<string, Tone> = {
  draft: 'amber', sent: 'blue', accepted: 'green', converted: 'green', expired: 'red', cancelled: 'red',
};
const StatusPill: React.FC<{ status: string }> = ({ status }) =>
  <StatusChip status={status} tone={STATUS_TONE[status] ?? 'neutral'} />;

const Quotations: React.FC = () => {
  const [view, setView] = useState<View>('list');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ── List ──
  const [rows, setRows] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/quotations', { params: statusFilter ? { status: statusFilter } : {} });
      const data = payload<any>(res);
      setRows(Array.isArray(data) ? data : (data?.rows ?? []));
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (view === 'list') loadList(); /* eslint-disable-next-line */ }, [view, statusFilter]);

  // ── Detail ──
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const openDetail = async (id: string) => {
    setErr(''); setMsg('');
    try { setDetail(payload<any>(await api.get(`/quotations/${id}`))); setView('detail'); }
    catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
  };
  const refreshDetail = async () => {
    if (!detail) return;
    setDetail(payload<any>(await api.get(`/quotations/${detail.id}`)));
  };
  const act = async (path: string, okMsg: string) => {
    if (!detail) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await api.post(`/quotations/${detail.id}/${path}`, {});
      const data = payload<any>(res);
      // convert returns { order, quotation }
      setDetail(data?.quotation ?? data);
      setMsg(okMsg + (data?.order ? ` (${data.order.order_id ?? data.order.order_number})` : ''));
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); await refreshDetail(); }
  };
  const downloadPdf = async (q: any) => {
    try {
      const res = await api.get(`/quotations/${q.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
  };

  // ── Create form ──
  const [cust, setCust] = useState({ name: '', phone: '', email: '', gstin: '', state: '' });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCust({ name: '', phone: '', email: '', gstin: '', state: '' });
    setCustomerId(null); setValidUntil(''); setNotes(''); setLines([]);
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
    } catch { /* anonymous quote is fine */ }
  };

  // POS-style live product search: /products?search&expand=variations → per-variation cards with the canonical price.
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
  const estSubtotal = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);

  const saveQuote = async () => {
    if (!lines.length) { setErr('Add at least one product to the quote.'); return; }
    setSaving(true); setErr(''); setMsg('');
    try {
      const res = await api.post('/quotations', {
        customerId: customerId || undefined,
        customerName: cust.name || undefined,
        customerPhone: cust.phone || undefined,
        customerEmail: cust.email || undefined,
        gstin: cust.gstin || undefined,
        placeOfSupply: cust.state || undefined,
        shippingAddress: cust.state ? { fullName: cust.name, phone: cust.phone, state: cust.state } : undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.productId, variationId: l.variationId || undefined, quantity: l.qty })),
      });
      const q = payload<any>(res);
      resetForm();
      setDetail(q); setView('detail');
      setMsg(`Quotation ${q.quote_number} created.`);
    } catch (e: any) { setErr(e?.response?.data?.message ?? e.message); }
    finally { setSaving(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <Page width="narrow">
        <PageHeader icon={FileText} title="New quotation"
          description="Build a price quote with the customer's real pricing. Prices are calculated on the server (B2B pricing applies when you attach a known customer)."
          actions={<Btn variant="ghost" onClick={() => { resetForm(); setView('list'); }}><ArrowLeft className="h-4 w-4" /> Back</Btn>} />
        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

        <SectionCard title="Customer" description="Optional — leave blank for a walk-in quote. Enter a phone to look up a known (B2B) customer.">
          <FilterBar>
            <Field label="Name"><TextInput className="w-56" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
            <Field label="Phone">
              <TextInput className={`w-40 ${customerId ? 'border-emerald-500' : ''}`} value={cust.phone}
                onChange={(e) => setCust({ ...cust, phone: e.target.value })} onBlur={lookupCustomer} />
            </Field>
            <Field label="Email"><TextInput className="w-56" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} /></Field>
            <Field label="GSTIN"><TextInput className="w-44" value={cust.gstin} onChange={(e) => setCust({ ...cust, gstin: e.target.value })} /></Field>
            <Field label="State (for GST)"><TextInput className="w-44" placeholder="e.g. Karnataka" value={cust.state} onChange={(e) => setCust({ ...cust, state: e.target.value })} /></Field>
          </FilterBar>
          {customerId && <div className="mt-2 text-xs text-emerald-700">Known customer attached — their B2B pricing will be applied automatically.</div>}
        </SectionCard>

        <SectionCard title="Products" description="Search by name, brand or SKU. Prices shown are the store's current prices; the quote is priced authoritatively when you save.">
          <div className="max-w-xl">
            <SearchInput placeholder="Search products to add…" value={searchQ} onChange={(e) => liveSearch(e.target.value)} />
            {results.length > 0 && (
              <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {results.map((r: any) => {
                  const vid = r.variation_id ?? r.id;
                  const price = r.final_price ?? r.sale_price ?? r.selling_price ?? r.price;
                  const oos = r.in_stock === false || Number(r.stock ?? 1) <= 0;
                  return (
                    <button key={vid} onClick={() => addLine(r)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{r.name ?? r.product_name}</span>
                        <span className="block truncate font-mono text-xs text-gray-400">{[r.sku, r.brand_name].filter(Boolean).join('  ·  ')}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {price != null && <span className="block font-semibold">{inr(Number(price))}</span>}
                        <span className={`text-[11px] ${oos ? 'text-red-600' : 'text-gray-400'}`}>{oos ? 'out of stock' : `stock ${r.stock ?? '—'}`}</span>
                      </span>
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
                  <Th>Product</Th><Th>SKU</Th><Th num>Qty</Th><Th num>Price (est.)</Th><Th num>Line total</Th><Th></Th>
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
                      <Td num>{l.price != null ? inr(l.price) : '—'}</Td>
                      <Td num>{l.price != null ? inr(l.price * l.qty) : '—'}</Td>
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

        <SectionCard title="Quote details">
          <FilterBar>
            <Field label="Valid until"><TextInput type="date" className="w-44" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
            <Field label="Notes" className="flex-1 min-w-[16rem]"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the customer should see on the quote" /></Field>
          </FilterBar>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="outline" onClick={() => { resetForm(); setView('list'); }}>Cancel</Btn>
            <Btn variant="success" onClick={saveQuote} disabled={saving || !lines.length}>{saving ? 'Saving…' : 'Save quotation'}</Btn>
          </div>
        </SectionCard>
      </Page>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const q = detail;
    const canSend = ['draft', 'sent'].includes(q.status);
    const canAccept = ['draft', 'sent'].includes(q.status) && !q.is_expired;
    const canCancel = !['converted', 'cancelled'].includes(q.status);
    const canConvert = q.status === 'accepted' && !q.is_expired;
    return (
      <Page>
        <PageHeader icon={FileText} title={q.quote_number || 'Quotation'}
          description={q.customer_name ? `For ${q.customer_name}` : 'Walk-in quotation'}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="ghost" onClick={() => setView('list')}><ArrowLeft className="h-4 w-4" /> All quotations</Btn>
              <Btn variant="outline" onClick={() => downloadPdf(q)}><Download className="h-4 w-4" /> Download PDF</Btn>
            </div>
          } />
        {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        {msg && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

        <SectionCard
          title={<span className="flex items-center gap-2">Status <StatusPill status={q.status} /></span>}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {canSend && <Btn variant="outline" onClick={() => act('send', 'Marked as sent.')} disabled={busy}>Mark sent</Btn>}
              {canAccept && <Btn variant="outline" onClick={() => act('accept', 'Marked as accepted.')} disabled={busy}>Mark accepted</Btn>}
              {canCancel && <Btn variant="dangerOutline" onClick={() => act('cancel', 'Quotation cancelled.')} disabled={busy}>Cancel</Btn>}
            </div>
          }>
          {q.is_expired && q.status !== 'converted' && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This quotation expired on {q.valid_until}. Issue a fresh quote before accepting or converting.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><div className="text-xs text-gray-500">Customer</div><div className="font-medium">{q.customer_name || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Phone</div><div className="font-medium">{q.customer_phone || '—'}</div></div>
            <div><div className="text-xs text-gray-500">GSTIN</div><div className="font-mono text-xs">{q.customer_gstin || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Valid until</div><div className="font-medium">{q.valid_until || 'No expiry'}</div></div>
          </div>
          {q.converted_order_id && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Converted to an order. {q.b2b_tier ? `B2B (${q.b2b_tier}).` : ''}
            </div>
          )}
        </SectionCard>

        {canConvert && (
          <SectionCard title="Ready to order?" description="The customer accepted this quote. Turn it into a real order with the quoted prices — one click.">
            <Btn variant="success" size="lg" onClick={() => act('convert', 'Order created from quotation')} disabled={busy}>
              <ShoppingCart className="h-5 w-5" /> {busy ? 'Converting…' : 'Convert to order'}
            </Btn>
          </SectionCard>
        )}

        <SectionCard title="Items">
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>Qty</Th><Th num>Unit price</Th><Th num>Line total</Th>
              </THead>
              <TBody>
                {(q.items ?? []).length === 0 && <EmptyRow colSpan={5}>No items.</EmptyRow>}
                {(q.items ?? []).map((it: any) => (
                  <Tr key={it.id}>
                    <Td>{it.product_name}</Td>
                    <Td className="font-mono text-xs text-gray-500">{it.sku}</Td>
                    <Td num>{it.quantity}</Td>
                    <Td num>{inr(it.unit_price)}</Td>
                    <Td num className="font-semibold">{inr(it.line_total)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          <div className="mt-3 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums">{inr(q.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">GST</span><span className="tabular-nums">{inr(q.tax)}</span></div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{inr(q.total)}</span></div>
            </div>
          </div>
          {q.notes && <div className="mt-3 text-sm text-gray-600"><span className="font-medium">Notes: </span>{q.notes}</div>}
        </SectionCard>
      </Page>
    );
  }

  // ── List view (default) ──
  return (
    <Page>
      <PageHeader icon={FileText} title="Quotations"
        description="Price quotes for customers. Build one, send the PDF, and turn an accepted quote into an order in one click."
        actions={<Btn variant="primary" onClick={() => { resetForm(); setErr(''); setMsg(''); setView('create'); }}><Plus className="h-4 w-4" /> New quotation</Btn>} />
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      <SectionCard title="All quotations" action={
        <FilterBar>
          <Field label="Status">
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {['draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </SelectInput>
          </Field>
        </FilterBar>
      }>
        <TableShell>
          <table className="w-full text-sm">
            <THead>
              <Th>Quotation #</Th><Th>Customer</Th><Th>Status</Th><Th>Valid until</Th><Th num>Total</Th><Th></Th>
            </THead>
            <TBody>
              {loading && <EmptyRow colSpan={6}>Loading…</EmptyRow>}
              {!loading && rows.length === 0 && (
                <EmptyRow colSpan={6}>No quotations yet. Click "New quotation" to build one.</EmptyRow>
              )}
              {!loading && rows.map((r: any) => (
                <Tr key={r.id}>
                  <Td className="font-mono text-xs">{r.quote_number}</Td>
                  <Td>{r.customer_name || <span className="text-gray-400">Walk-in</span>}</Td>
                  <Td><StatusPill status={r.is_expired && r.status !== 'converted' && r.status !== 'cancelled' ? 'expired' : r.status} /></Td>
                  <Td>{r.valid_until || '—'}</Td>
                  <Td num>{inr(r.total)}</Td>
                  <Td><Btn variant="ghost" size="sm" onClick={() => openDetail(r.id)}>View</Btn></Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableShell>
      </SectionCard>
    </Page>
  );
};

export default Quotations;
