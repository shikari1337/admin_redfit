import React, { useEffect, useRef, useState } from 'react';
import { Store, Plus, ArrowLeftRight, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, FilterBar, Field, TextInput, SearchInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState,
} from '../../components/erp';

/**
 * Outlets & Transfers (multi-outlet — migration 048). Plain-language screen for
 * a shop owner: each OUTLET is a physical counter with its own shelf stock. Buy
 * into the warehouse, then SEND stock to a shop; the shop's POS sells from its
 * own shelf. Everything the pharmacy-chain owner needs in one page.
 */

const inr = (minor: number | string | null | undefined) => {
  const n = Number(minor);
  return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
};
const num = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

interface OutletRow { outlet_id: string; name: string; code: string; city?: string; is_active: boolean; sku_count: number; units: number; value_minor: string }
interface StockRow { variation_id: string; sku: string; product_id: string; product_name: string; on_hand: number; available: number; avg_cost_minor: string }

const Outlets: React.FC = () => {
  const [outlets, setOutlets] = useState<OutletRow[] | null>(null);
  const [selected, setSelected] = useState<OutletRow | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  // Add-outlet form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', city: '', state: '', pincode: '' });

  // Transfer form
  const [results, setResults] = useState<any[]>([]);
  const [pick, setPick] = useState<{ variationId: string; sku: string; name: string } | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => api.get('/outlets').then((r) => setOutlets(payload<OutletRow[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  useEffect(() => { load(); }, []);

  const openOutlet = async (o: OutletRow) => {
    setSelected(o); setStock(null); setPick(null); setResults([]); setQty(''); setMsg(''); setOk('');
    try { setStock(payload<StockRow[]>(await api.get(`/outlets/${o.outlet_id}/stock`)) ?? []); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); setStock([]); }
  };

  const addOutlet = async () => {
    if (!form.name.trim() || !form.code.trim()) { setMsg('An outlet needs a name and a short code.'); return; }
    setMsg(''); setOk('');
    try {
      await api.post('/warehouses', {
        name: form.name.trim(), code: form.code.trim(), kind: 'outlet',
        address: { city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim() },
      });
      setOk(`Outlet "${form.name.trim()}" added.`);
      setForm({ name: '', code: '', city: '', state: '', pincode: '' }); setAdding(false);
      load();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const search = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep last */ }
    }, 250);
  };

  const doTransfer = async (back = false) => {
    if (!selected || !pick || busy) return;
    const n = Math.round(Number(qty) || 0);
    if (n <= 0) { setMsg('Enter how many units to send.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      await api.post(`/outlets/${selected.outlet_id}/${back ? 'transfer-back' : 'transfer'}`, { variationId: pick.variationId, qty: n });
      setOk(back
        ? `Sent ${n} × ${pick.sku} back to the warehouse.`
        : `Sent ${n} × ${pick.sku} to ${selected.name}.`);
      setPick(null); setQty(''); setResults([]);
      openOutlet(selected); load();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader
        title="Outlets & Transfers"
        icon={Store}
        description="Each outlet is a physical shop counter with its own shelf stock and cash drawer. Buy stock into the warehouse, then send it to a shop — the shop's POS sells from its own shelf."
        actions={<Btn variant={adding ? 'outline' : 'primary'} onClick={() => { setAdding((v) => !v); setMsg(''); }}><Plus className="h-4 w-4" />{adding ? 'Cancel' : 'Add outlet'}</Btn>}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {adding && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">New shop outlet</h3>
          <FilterBar>
            <Field label="Shop name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MG Road Counter" /></Field>
            <Field label="Short code"><TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MGR" /></Field>
            <Field label="City"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><TextInput value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="PIN"><TextInput value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>
            <Field label="&nbsp;"><Btn variant="success" onClick={addOutlet}>Create outlet</Btn></Field>
          </FilterBar>
        </div>
      )}

      {/* Outlet overview */}
      {outlets == null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading outlets…</div>
      ) : outlets.length === 0 ? (
        <EmptyState
          title="No outlets yet"
          description="Add your first shop counter above. Warehouse-only stores keep working exactly as before — outlets are optional."
        />
      ) : (
        <StatGrid cols={4}>
          {outlets.map((o) => (
            <button key={o.outlet_id} onClick={() => openOutlet(o)} className="text-left focus:outline-none">
              <StatCard
                label={<span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />{o.name}</span>}
                value={num(o.units)}
                sub={<>{o.sku_count} SKU(s) on the shelf · {inr(o.value_minor)}{o.code ? ` · ${o.code}` : ''}</>}
                tone={selected?.outlet_id === o.outlet_id ? 'info' : 'default'}
              />
            </button>
          ))}
        </StatGrid>
      )}

      {/* Selected outlet: transfer + shelf */}
      {selected && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
              <ArrowLeftRight className="h-4 w-4" /> Send stock — {selected.name}
            </h3>
            <p className="mb-3 text-xs text-gray-500">Search a product, choose how many, then send it from the warehouse to this shop (or back).</p>
            {!pick ? (
              <div className="space-y-2">
                <SearchInput placeholder="Search product name, brand or SKU…" onChange={(e) => search(e.target.value)} />
                {results.length > 0 && (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                    {results.map((r: any) => {
                      const vid = r.variation_id ?? r.id;
                      return (
                        <button key={vid} onClick={() => { setPick({ variationId: vid, sku: r.sku ?? '', name: r.name }); setResults([]); }}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                          <span className="min-w-0 truncate">{r.name}</span>
                          <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name].filter(Boolean).join(' · ')} · stock {r.stock ?? '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <FilterBar>
                <Field label="Product">
                  <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm">
                    <span className="truncate">{pick.name}</span><span className="ml-2 font-mono text-xs text-gray-500">{pick.sku}</span>
                  </div>
                </Field>
                <Field label="Units"><TextInput type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-28" autoFocus /></Field>
                <Field label="&nbsp;"><Btn variant="success" disabled={busy} onClick={() => doTransfer(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}Send to shop</Btn></Field>
                <Field label="&nbsp;"><Btn variant="outline" disabled={busy} onClick={() => doTransfer(true)}>Send back to warehouse</Btn></Field>
                <Field label="&nbsp;"><Btn variant="ghost" onClick={() => { setPick(null); setQty(''); }}>Change</Btn></Field>
              </FilterBar>
            )}
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>On shelf</Th><Th num>Available</Th><Th num>Avg cost</Th>
              </THead>
              <TBody>
                {stock == null ? (
                  <EmptyRow colSpan={5}>Loading shelf…</EmptyRow>
                ) : stock.length === 0 ? (
                  <EmptyRow colSpan={5}>Nothing on this shop's shelf yet — send some stock above.</EmptyRow>
                ) : stock.map((s) => (
                  <Tr key={s.variation_id}>
                    <Td>{s.product_name}</Td>
                    <Td muted className="font-mono text-xs">{s.sku}</Td>
                    <Td num>{num(s.on_hand)}</Td>
                    <Td num>{num(s.available)}</Td>
                    <Td num>{Number(s.avg_cost_minor) > 0 ? inr(s.avg_cost_minor) : '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}
    </Page>
  );
};

export default Outlets;
