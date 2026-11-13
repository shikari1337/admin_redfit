import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Plus, ArrowLeftRight, Loader2, History, Truck, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { majorToMinor } from '@/lib/v2/money';
import { useAuth } from '../../contexts/AuthContext';
import { usePincodeLookup } from '../../hooks/usePincodeLookup';
import { formatDateTime } from '../../utils/date';
import { movementLabel, refDocLabel } from '../../components/inventory/ledgerLabels';
import {
  Page, PageHeader, StatCard, StatGrid, Btn, FilterBar, Field, TextInput, SearchInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip, inrMinor, num,
} from '../../components/erp';

/**
 * Outlets & Transfers (multi-outlet, migration 048). Plain-language screen for a shop owner: each OUTLET is a
 * physical counter with its own shelf stock. Buy into the warehouse, then SEND stock to a shop; the shop's POS
 * sells from its own shelf. Transfers between buildings with a challan and an e-way bill live on the Transfers
 * page, linked from the header.
 *
 * v2 (wms api/outlets.rs): the manager's figures come as Money `value` and `avg_cost` (rupees after the
 * normaliser); the old API sent paise `value_minor` and `avg_cost_minor`. Both are read, v2 first.
 */

interface OutletRow {
  outlet_id: string; name: string; code: string; city?: string | null; is_active: boolean;
  sku_count: number; units: number;
  value?: number | null; value_minor?: string | number | null;
}
interface StockRow {
  variation_id: string; sku: string; product_id: string; product_name: string;
  on_hand: number; reserved?: number; available: number;
  avg_cost?: number | null; avg_cost_minor?: string | number | null;
}
interface MoveRow {
  id: string; variation_id: string; sku?: string | null; product_name?: string | null;
  qty_delta: number; movement_type: string; ref_doc_type?: string | null; occurred_at?: string | null;
}

/** Paise from a v2 rupee figure, else the old paise field; null when neither is there (the floor's view has no cost). */
const minorOf = (rupees: unknown, minor: unknown): number | null => {
  if (typeof rupees === 'number' && Number.isFinite(rupees)) return majorToMinor(rupees);
  if (minor === null || minor === undefined || minor === '') return null;
  const n = Number(minor);
  return Number.isFinite(n) ? n : null;
};

const errText = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong.';

const blankForm = () => ({ name: '', code: '', line1: '', city: '', state: '', pincode: '' });

const Outlets: React.FC = () => {
  const { hasPerm } = useAuth();
  // The same gates the routes hold: moving stock is `inventory.adjust` (outlets.rs), adding a shop is a facility
  // create (`inventory.manage` or `warehouse.manage`, wms resources.rs), the Transfers page is `inventory.adjust`.
  const canMove = hasPerm('inventory.adjust');
  const canAdd = hasPerm('inventory.manage') || hasPerm('warehouse.manage');

  const [outlets, setOutlets] = useState<OutletRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<OutletRow | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [moves, setMoves] = useState<MoveRow[] | null>(null);
  const [movesNote, setMovesNote] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  // Add-outlet form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);

  // Transfer form
  const [results, setResults] = useState<any[]>([]);
  const [pick, setPick] = useState<{ variationId: string; sku: string; name: string } | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => api.get('/outlets')
    .then((r) => { setOutlets(payload<OutletRow[]>(r) ?? []); setLoadError(''); })
    .catch((e) => { setLoadError(errText(e)); setOutlets((prev) => prev ?? []); });
  useEffect(() => { load(); }, []);

  /**
   * PIN to district and state, the same India Post lookup through the backend the Warehouses form uses. It fills
   * only a box that is empty or still holds what the lookup itself put there, so a correction by hand stays.
   */
  const pin = usePincodeLookup(form.pincode, adding);
  const autofilled = useRef<{ city: string; state: string }>({ city: '', state: '' });
  useEffect(() => {
    if (!pin.result) return;
    const r = pin.result;
    setForm((prev) => ({
      ...prev,
      city: !prev.city || prev.city === autofilled.current.city ? r.district : prev.city,
      state: !prev.state || prev.state === autofilled.current.state ? r.state : prev.state,
    }));
    autofilled.current = { city: r.district, state: r.state };
  }, [pin.result]);

  const loadMoves = async (o: OutletRow) => {
    setMoves(null); setMovesNote('');
    try {
      setMoves(payload<MoveRow[]>(await api.get(`/outlets/${o.outlet_id}/movements`, { params: { limit: 20 } })) ?? []);
    } catch (e: any) {
      setMoves([]);
      setMovesNote([404, 501].includes(Number(e?.response?.status)) ? 'The history of this shop is not available on this server yet.' : errText(e));
    }
  };

  const openOutlet = async (o: OutletRow) => {
    setSelected(o); setStock(null); setPick(null); setResults([]); setQty(''); setMsg(''); setOk('');
    loadMoves(o);
    try { setStock(payload<StockRow[]>(await api.get(`/outlets/${o.outlet_id}/stock`)) ?? []); }
    catch (e: any) { setMsg(errText(e)); setStock([]); }
  };

  const addOutlet = async () => {
    if (!form.name.trim() || !form.code.trim()) { setMsg('An outlet needs a name and a short code.'); return; }
    // Only the boxes that were filled: a blank one is left for the register's own default (wms resources.rs).
    const address: Record<string, string> = {};
    for (const [k, v] of Object.entries({ line1: form.line1, city: form.city, state: form.state, pincode: form.pincode })) {
      if (v.trim()) address[k] = v.trim();
    }
    setSaving(true); setMsg(''); setOk('');
    try {
      await api.post('/warehouses', { name: form.name.trim(), code: form.code.trim().toUpperCase(), kind: 'outlet', address });
      setOk(`Outlet "${form.name.trim()}" added. Send it some stock to start selling there.`);
      setForm(blankForm()); setAdding(false);
      load();
    } catch (e: any) { setMsg(errText(e)); }
    finally { setSaving(false); }
  };

  const search = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: q, expand: 'variations', limit: 8 } });
        setResults(Array.isArray(res.data) ? res.data : (res.data?.products ?? []));
      } catch { /* keep the last results */ }
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
        ? `Sent ${n} of ${pick.sku || pick.name} back to the warehouse.`
        : `Sent ${n} of ${pick.sku || pick.name} to ${selected.name}.`);
      setPick(null); setQty(''); setResults([]);
      openOutlet(selected); load();
    } catch (e: any) { setMsg(errText(e)); }
    finally { setBusy(false); }
  };

  const list = outlets ?? [];
  const active = list.filter((o) => o.is_active);
  const empty = active.filter((o) => Number(o.units) <= 0);
  const units = list.reduce((s, o) => s + (Number(o.units) || 0), 0);
  const values = list.map((o) => minorOf(o.value, o.value_minor));
  const showValue = values.some((v) => v !== null);
  const totalValue = values.reduce<number>((s, v) => s + (v ?? 0), 0);
  const shelfHasCost = (stock ?? []).some((s) => minorOf(s.avg_cost, s.avg_cost_minor) !== null);

  return (
    <Page>
      <PageHeader
        title="Outlets & Transfers"
        icon={Store}
        description="Each outlet is a shop counter with its own shelf stock. Buy stock into the warehouse, then send it to a shop: the shop's POS sells from its own shelf."
        actions={
          <>
            {canMove && (
              <Link to="/panel/inventory/transfers" className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
                <Truck className="h-4 w-4" />Transfers
              </Link>
            )}
            {canAdd && (
              <Btn variant={adding ? 'outline' : 'primary'} onClick={() => { setAdding((v) => !v); setMsg(''); }}>
                <Plus className="h-4 w-4" />{adding ? 'Cancel' : 'Add outlet'}
              </Btn>
            )}
          </>
        }
      />

      {msg && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* What to act on first: a shop with nothing on its shelf cannot sell. */}
      {empty.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {empty.length === 1 ? `${empty[0].name} has nothing on its shelf.` : `${empty.length} shops have nothing on their shelf: ${empty.map((o) => o.name).join(', ')}.`}
            {canMove ? ' Open a shop below and send it stock.' : ''}
          </span>
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">New shop outlet</h3>
          <FilterBar>
            <Field label="Shop name" className="w-full sm:w-56"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MG Road Counter" /></Field>
            <Field label="Short code" className="w-32"><TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MGR" /></Field>
            <Field label="Address" className="w-full sm:w-64"><TextInput value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Shop number and street" /></Field>
            <Field label={pin.loading ? 'PIN (looking up)' : 'PIN'} className="w-32">
              <TextInput inputMode="numeric" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
            </Field>
            <Field label="City" className="w-40"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State" className="w-40"><TextInput value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Btn variant="success" onClick={addOutlet} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create outlet</Btn>
          </FilterBar>
          {pin.error && <p className="mt-2 text-xs text-gray-500">{pin.error} Type the city and state yourself.</p>}
          <p className="mt-2 text-xs text-gray-500">Edit a shop's address, contact or courier pickup later on the Warehouses page.</p>
        </div>
      )}

      {/* Outlet overview: the numbers, then one card per shop */}
      {outlets == null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading outlets...</div>
      ) : loadError && list.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the outlets"
          description={loadError}
          action={<Btn variant="outline" onClick={load}>Try again</Btn>}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No outlets yet"
          description="Add your first shop counter. Stores that only ship from a warehouse keep working exactly as before: outlets are optional."
          action={canAdd && !adding ? <Btn onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add outlet</Btn> : undefined}
        />
      ) : (
        <>
          <StatGrid cols={showValue ? 4 : 3}>
            <StatCard label="Shops" value={num(active.length)} sub={list.length > active.length ? `${list.length - active.length} switched off` : 'All in use'} icon={Store} />
            <StatCard label="Units on shelves" value={num(units)} sub="Across every shop" />
            <StatCard label="Empty shelves" value={num(empty.length)} tone={empty.length ? 'warn' : 'default'} sub={empty.length ? 'Send them stock' : 'Every shop has stock'} />
            {showValue && <StatCard label="Shelf value at cost" value={inrMinor(totalValue)} sub="What the stock on the shelves cost" />}
          </StatGrid>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((o) => {
              const v = minorOf(o.value, o.value_minor);
              const isOn = selected?.outlet_id === o.outlet_id;
              return (
                <button
                  key={o.outlet_id}
                  type="button"
                  onClick={() => openOutlet(o)}
                  aria-pressed={isOn}
                  className={`rounded-xl border p-4 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${isOn ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'} ${o.is_active ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <Store className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{o.name}</span>
                    </span>
                    {!o.is_active ? <Chip tone="neutral">Off</Chip> : Number(o.units) <= 0 ? <Chip tone="amber">Empty</Chip> : null}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{num(o.units)}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {[`${num(o.sku_count)} SKUs on the shelf`, v !== null ? inrMinor(v) : null, o.code, o.city].filter(Boolean).join(', ')}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Selected outlet: transfer, shelf and history */}
      {selected && (
        <div className="space-y-4">
          {canMove && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <ArrowLeftRight className="h-4 w-4" /> Send stock: {selected.name}
              </h3>
              <p className="mb-3 text-xs text-gray-500">Search a product, choose how many, then send it from the warehouse to this shop, or back.</p>
              {!pick ? (
                <div className="space-y-2">
                  <SearchInput placeholder="Search product name, brand or SKU" onChange={(e) => search(e.target.value)} />
                  {results.length > 0 && (
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1">
                      {results.map((r: any) => {
                        const vid = r.variation_id ?? r.id;
                        return (
                          <button key={vid} type="button" onClick={() => { setPick({ variationId: vid, sku: r.sku ?? '', name: r.name }); setResults([]); }}
                            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50">
                            <span className="min-w-0 truncate">{r.name}</span>
                            <span className="shrink-0 font-mono text-xs text-gray-500">{[r.sku, r.brand_name, r.stock != null ? `stock ${r.stock}` : null].filter(Boolean).join(', ')}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <FilterBar>
                  <Field label="Product" className="w-full sm:w-auto">
                    <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm">
                      <span className="truncate">{pick.name}</span><span className="ml-2 font-mono text-xs text-gray-500">{pick.sku}</span>
                    </div>
                  </Field>
                  <Field label="Units"><TextInput type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-28" autoFocus /></Field>
                  <Btn variant="success" disabled={busy} onClick={() => doTransfer(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}Send to shop</Btn>
                  <Btn variant="outline" disabled={busy} onClick={() => doTransfer(true)}>Send back to warehouse</Btn>
                  <Btn variant="ghost" onClick={() => { setPick(null); setQty(''); }}>Change</Btn>
                </FilterBar>
              )}
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>On shelf</Th><Th num>Available</Th>{shelfHasCost && <Th num>Avg cost</Th>}
              </THead>
              <TBody>
                {stock == null ? (
                  <EmptyRow colSpan={shelfHasCost ? 5 : 4}>Loading shelf...</EmptyRow>
                ) : stock.length === 0 ? (
                  <EmptyRow colSpan={shelfHasCost ? 5 : 4}>Nothing on this shop's shelf yet.{canMove ? ' Send some stock above.' : ''}</EmptyRow>
                ) : stock.map((s) => {
                  const cost = minorOf(s.avg_cost, s.avg_cost_minor);
                  return (
                    <Tr key={s.variation_id}>
                      <Td>{s.product_name}</Td>
                      <Td muted className="font-mono text-xs">{s.sku}</Td>
                      <Td num>{num(s.on_hand)}</Td>
                      <Td num>{num(s.available)}</Td>
                      {shelfHasCost && <Td num>{cost !== null && cost > 0 ? inrMinor(cost) : '-'}</Td>}
                    </Tr>
                  );
                })}
              </TBody>
            </table>
          </TableShell>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><History className="h-4 w-4" />Latest moves at {selected.name}</h3>
            <TableShell>
              <table className="w-full text-sm">
                <THead>
                  <Th>When</Th><Th>Product</Th><Th>What</Th><Th num>Units</Th><Th>From</Th>
                </THead>
                <TBody>
                  {moves == null ? (
                    <EmptyRow colSpan={5}>Loading history...</EmptyRow>
                  ) : moves.length === 0 ? (
                    <EmptyRow colSpan={5}>{movesNote || 'Nothing has moved at this shop yet.'}</EmptyRow>
                  ) : moves.map((m) => (
                    <Tr key={m.id}>
                      <Td muted className="whitespace-nowrap text-xs">{formatDateTime(m.occurred_at, '-')}</Td>
                      <Td>{m.product_name ?? '-'}<span className="ml-2 font-mono text-xs text-gray-400">{m.sku ?? ''}</span></Td>
                      <Td className="text-xs">{movementLabel(m.movement_type)}</Td>
                      <Td num className={Number(m.qty_delta) < 0 ? 'text-red-700' : 'text-emerald-700'}>{Number(m.qty_delta) > 0 ? '+' : ''}{num(m.qty_delta)}</Td>
                      <Td muted className="text-xs">{refDocLabel(m.ref_doc_type)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableShell>
          </div>
        </div>
      )}
    </Page>
  );
};

export default Outlets;
