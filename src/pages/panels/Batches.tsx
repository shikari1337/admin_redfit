import React, { useEffect, useRef, useState } from 'react';
import { api, productsAPI } from '../../services/api';
import { Page, PageHeader, TableShell, THead, Th, TBody, Td, EmptyRow, StatusChip, TextInput, Btn, SectionCard } from '../../components/erp';

/**
 * Batches & expiry (pharma): FEFO order, near-expiry highlighting.
 * Batches are captured on GRN receipt in Purchasing — or created here directly
 * (POST /purchasing/batches): opening balances, batch-labelling legacy stock,
 * or units arriving outside a PO. Stock-affecting creates are ledgered.
 */
const Batches: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [nearOnly, setNearOnly] = useState(false);
  const [days, setDays] = useState(90);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  // create form
  const [createOpen, setCreateOpen] = useState(false);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [batchNumber, setBatchNumber] = useState('');
  const [qty, setQty] = useState('');
  const [mode, setMode] = useState<'receive' | 'assign'>('receive');
  const [expiry, setExpiry] = useState('');
  const [mrp, setMrp] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const searchTimer = useRef<any>(null);

  const load = async () => {
    setError('');
    try {
      const res = await api.get('/purchasing/batches', {
        params: nearOnly ? { nearExpiryDays: days } : {},
      });
      setRows(res.data.rows ?? []);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); }, [nearOnly, days]);

  // Variation search for the create form (unified search service, SKU-level).
  useEffect(() => {
    if (skuSearch.trim().length < 3) { setSkuResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try { setSkuResults(await productsAPI.searchVariations(skuSearch.trim(), 10)); }
      catch { setSkuResults([]); }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [skuSearch]);

  const submitCreate = async () => {
    setCreateError('');
    const variationId = picked?.variationId ?? picked?.variation_id ?? picked?.id;
    const q = parseInt(qty, 10);
    if (!variationId) { setCreateError('Pick a SKU first.'); return; }
    if (picked?.isVariation === false || picked?.is_variation === false) {
      setCreateError('This product has no variations — batches attach to a variation (SKU).'); return;
    }
    if (!batchNumber.trim() || !q || q <= 0) { setCreateError('Batch number and a quantity above 0 are required.'); return; }
    setBusy(true);
    try {
      await api.post('/purchasing/batches', {
        variationId, batchNumber: batchNumber.trim(), qty: q, mode,
        expiryDate: expiry || undefined,
        mrp: mrp || undefined,
        unitCostRupees: mode === 'receive' && cost ? cost : undefined,
      });
      setCreateOpen(false);
      setPicked(null); setSkuSearch(''); setBatchNumber(''); setQty(''); setExpiry(''); setMrp(''); setCost('');
      await load();
    } catch (e: any) {
      setCreateError(e?.response?.data?.message ?? e?.response?.data?.error?.message ?? e.message);
    } finally { setBusy(false); }
  };

  const expiryClass = (d: number | null) =>
    d === null ? '' : d < 0 ? 'bg-red-100 text-red-800'
    : d <= 30 ? 'bg-red-50 text-red-700'
    : d <= 90 ? 'bg-amber-50 text-amber-800' : '';

  const q = filter.trim().toLowerCase();
  const visible = q
    ? rows.filter((b: any) =>
        String(b.sku || '').toLowerCase().includes(q) ||
        String(b.product_name || '').toLowerCase().includes(q) ||
        String(b.batch_number || '').toLowerCase().includes(q))
    : rows;

  return (
    <Page>
      <PageHeader
        title="Batches & Expiry"
        description="Batches are consumed FEFO (first-expiry-first-out); expired batches are never allocated. Capture them while receiving goods in Purchasing, or add one directly here."
        actions={
          <div className="flex items-end gap-2 text-sm">
            <TextInput value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter SKU / product / batch" className="w-52" />
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="checkbox" checked={nearOnly} onChange={(e) => setNearOnly(e.target.checked)} />
              Near expiry within
            </label>
            <TextInput type="number" min={0} value={days} onChange={(e) => setDays(parseInt(e.target.value) || 0)}
              disabled={!nearOnly} className="w-20 text-right" />
            <span className="text-gray-700">days</span>
            <Btn onClick={() => setCreateOpen(o => !o)}>{createOpen ? 'Cancel' : '+ Add batch'}</Btn>
          </div>
        }
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {createOpen && (
        <SectionCard title="Add a batch">
          <div className="space-y-3">
            <div className="relative">
              <label className="text-xs font-medium text-gray-600 block mb-1">SKU / product</label>
              {picked ? (
                <div className="flex items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
                  <span>{picked.name} <span className="font-mono text-xs text-gray-500 ml-1">{picked.sku}</span></span>
                  <button type="button" className="text-xs text-blue-600" onClick={() => setPicked(null)}>change</button>
                </div>
              ) : (
                <>
                  <TextInput value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)}
                    placeholder="Type at least 3 characters — name or SKU" className="w-full" />
                  {skuResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
                      {skuResults.map((r: any, i: number) => (
                        <li key={i}>
                          <button type="button" onClick={() => { setPicked(r); setSkuResults([]); }}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50">
                            {r.name} <span className="font-mono text-xs text-gray-500 ml-1">{r.sku}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <TextInput value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Batch number *" />
              <TextInput type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty *" />
              <TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} title="Expiry date" />
              <TextInput type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="MRP ₹" />
              {mode === 'receive' && (
                <TextInput type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Unit cost ₹" title="Optional — folds into average cost" />
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={mode === 'receive'} onChange={() => setMode('receive')} />
                New stock — adds the quantity to hand (ledgered movement)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={mode === 'assign'} onChange={() => setMode('assign')} />
                Label existing stock — batch bookkeeping only, no quantity change
              </label>
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <Btn onClick={submitCreate} disabled={busy}>{busy ? 'Saving…' : 'Save batch'}</Btn>
          </div>
        </SectionCard>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Product</Th><Th>SKU</Th><Th>Batch</Th><Th num>Qty</Th>
            <Th>Expiry</Th><Th num>Days left</Th><Th num>MRP</Th><Th>Status</Th>
          </THead>
          <TBody>
            {visible.length === 0 && (
              <EmptyRow colSpan={8}>
                {q ? 'No batches match the filter.'
                  : nearOnly ? `No batches expiring within ${days} days.`
                  : 'No batches yet — capture them when receiving goods, or add one above.'}
              </EmptyRow>
            )}
            {visible.map((b: any) => (
              <tr key={b.id} className={expiryClass(b.days_to_expiry)}>
                <Td>{b.product_name}</Td>
                <Td className="font-mono text-xs">{b.sku}</Td>
                <Td className="font-mono">{b.batch_number}</Td>
                <Td num>{b.qty_on_hand}</Td>
                <Td>{b.expiry_date ?? '—'}</Td>
                <Td num>{b.days_to_expiry ?? '—'}</Td>
                <Td num>{b.mrp != null ? `₹${Number(b.mrp).toFixed(2)}` : '—'}</Td>
                <Td><StatusChip status={b.status} /></Td>
              </tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default Batches;
