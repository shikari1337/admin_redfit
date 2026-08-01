import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMinor } from '../../lib/money';
import { payload } from '../../lib/unwrap';
import {
  Page, PageHeader, Btn, StatusChip, TabBar, TextInput, SelectInput,
  THead, Th, TBody, Tr, Td,
  FilterBar, Field, SearchInput, ExportMenu, Pagination, useListControls, type CsvColumn,
} from '../../components/erp';

// Client CSV of the loaded PO / return rows.
const PO_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'po_number', label: 'PO number' },
  { key: 'vendor_name', label: 'Vendor' },
  { key: 'status', label: 'Status' },
  { key: 'subtotal_minor', label: 'Subtotal', money: true },
  { key: 'qty_ordered', label: 'Qty ordered' },
  { key: 'qty_received', label: 'Qty received' },
];
const RETURN_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'return_number', label: 'Return number' },
  { key: 'vendor_name', label: 'Vendor' },
  { key: 'reason', label: 'Reason' },
  { key: 'total_minor', label: 'Total', money: true },
  { key: 'qty', label: 'Units' },
  { key: 'status', label: 'Status' },
];

/**
 * Purchasing (Phase 6): PO list, draft creation, issue, and goods receipt.
 * purchasing.manage → create/issue (store manager/admin);
 * purchasing.receive → GRN (warehouse manager/admin).
 */
const Purchasing: React.FC = () => {
  const { hasPerm } = useAuth();
  const [pos, setPos] = useState<any[]>([]);
  const [poTotal, setPoTotal] = useState(0);
  const [retTotal, setRetTotal] = useState(0);
  const [vendors, setVendors] = useState<any[]>([]);
  // Server pagination for the PO + returns lists; search/status narrow the
  // loaded page (the /purchasing routes take limit/offset only — see report).
  const poLc = useListControls({ pageSize: 25 });
  const retLc = useListControls({ pageSize: 25 });
  const [detail, setDetail] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [lines, setLines] = useState<Array<{ variationId: string; label: string; qtyOrdered: number; unitCostRupees: number }>>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [receiveBatch, setReceiveBatch] = useState<Record<string, { batchNumber?: string; expiryDate?: string; mrp?: string }>>({});
  const [receiveSerials, setReceiveSerials] = useState<Record<string, string>>({});
  const [receiveQc, setReceiveQc] = useState<Record<string, { passed?: string; failed?: string; note?: string }>>({});
  const [lastReceivedVariationIds, setLastReceivedVariationIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  // ── Top-level tab: purchase orders vs returns/debit notes ──────────────────
  const [tab, setTab] = useState<'orders' | 'returns'>('orders');

  // ── Landed cost (per received GRN) ─────────────────────────────────────────
  const [lcForm, setLcForm] = useState<Record<string, { costType: string; amount: string; basis: string }>>({});
  const [lcMsg, setLcMsg] = useState('');

  // ── Purchase returns tab state ─────────────────────────────────────────────
  const [returns, setReturns] = useState<any[]>([]);
  const [retNew, setRetNew] = useState(false);
  const [retVendor, setRetVendor] = useState('');
  const [retReason, setRetReason] = useState('');
  const [retSkuSearch, setRetSkuSearch] = useState('');
  const [retSkuResults, setRetSkuResults] = useState<any[]>([]);
  const [retLines, setRetLines] = useState<Array<{ variationId: string; label: string; qty: number; unitCostRupees?: string }>>([]);
  const [retDetail, setRetDetail] = useState<any>(null);
  const [retError, setRetError] = useState('');

  // ── Serials section state ──────────────────────────────────────────────────
  const [serialQuery, setSerialQuery] = useState('');
  const [serialRows, setSerialRows] = useState<any[]>([]);
  const [serialUnit, setSerialUnit] = useState<any | null>(null);
  const [trackSkuSearch, setTrackSkuSearch] = useState('');
  const [trackResults, setTrackResults] = useState<any[]>([]);
  const [trackMap, setTrackMap] = useState<Record<string, boolean>>({});
  const [serialMsg, setSerialMsg] = useState('');

  const parseSerials = (text: string) =>
    (text || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  const load = async () => {
    const res = await api.get('/purchasing/pos', {
      params: { limit: poLc.pageSize, offset: (poLc.page - 1) * poLc.pageSize },
    });
    setPos(res.data.rows ?? []);
    setPoTotal(res.data.total ?? 0);
  };
  useEffect(() => {
    api.get('/vendors', { params: { limit: 100 } })
      .then((r) => {
        const v = payload<any>(r);
        setVendors(Array.isArray(v) ? v : v?.vendors ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [poLc.page, poLc.pageSize]);

  // Within-page filters (server exposes no PO/return filters yet).
  const filteredPos = useMemo(() => {
    const q = poLc.search.trim().toLowerCase();
    return pos.filter((p) => {
      const okQ = !q || [p.po_number, p.vendor_name].some((v) => String(v ?? '').toLowerCase().includes(q));
      const okS = !poLc.status || p.status === poLc.status;
      return okQ && okS;
    });
  }, [pos, poLc.search, poLc.status]);

  const searchSkus = async (q: string) => {
    setSkuSearch(q);
    if (q.length < 2) { setSkuResults([]); return; }
    try {
      const res = await api.get('/inventory', { params: { search: q, limit: 8 } });
      const list = payload<any>(res);
      setSkuResults(Array.isArray(list) ? list : []);
    } catch { setSkuResults([]); }
  };

  const createAndIssue = async (issue: boolean) => {
    setError('');
    try {
      const res = await api.post('/purchasing/pos', { vendorId, lines });
      if (issue) await api.post(`/purchasing/pos/${payload<any>(res).id}/issue`);
      setShowNew(false); setLines([]); setVendorId('');
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const openDetail = async (id: string) => {
    const res = await api.get(`/purchasing/pos/${id}`);
    setDetail(payload(res));
    setReceiveQty({});
  };

  const receive = async () => {
    setError('');
    const lines = Object.entries(receiveQty)
      .filter(([, q]) => q > 0)
      .map(([poItemId, qty]) => ({
        poItemId, qty,
        batchNumber: receiveBatch[poItemId]?.batchNumber || undefined,
        expiryDate: receiveBatch[poItemId]?.expiryDate || undefined,
        mrp: receiveBatch[poItemId]?.mrp ? Number(receiveBatch[poItemId]!.mrp) : undefined,
        serials: receiveSerials[poItemId] ? parseSerials(receiveSerials[poItemId]) : undefined,
        // QC split — only sent when the receiver typed a rejected count.
        qcQtyFailed: receiveQc[poItemId]?.failed != null && receiveQc[poItemId]?.failed !== ''
          ? Math.max(0, parseInt(receiveQc[poItemId]!.failed!) || 0) : undefined,
        qcQtyPassed: receiveQc[poItemId]?.failed != null && receiveQc[poItemId]?.failed !== ''
          ? Math.max(0, (receiveQc[poItemId]?.passed != null && receiveQc[poItemId]?.passed !== ''
              ? parseInt(receiveQc[poItemId]!.passed!) || 0
              : qty - (parseInt(receiveQc[poItemId]!.failed!) || 0)))
          : undefined,
        qcNote: receiveQc[poItemId]?.note || undefined,
      }));
    if (!lines.length) return;
    try {
      await api.post(`/purchasing/pos/${detail.id}/receive`, { lines });
      // WMS slice 4: remember what was just received so labels can be printed
      const receivedIds = detail.items
        .filter((it: any) => lines.some((l) => l.poItemId === it.id))
        .map((it: any) => it.variation_id);
      setLastReceivedVariationIds([...new Set(receivedIds)] as string[]);
      setReceiveSerials({});
      setReceiveQc({});
      await openDetail(detail.id);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  // ── Landed cost ────────────────────────────────────────────────────────────
  const addLandedCost = async (grnId: string) => {
    setLcMsg('');
    const f = lcForm[grnId];
    if (!f?.amount || Number(f.amount) <= 0) { setLcMsg('Enter an amount to add.'); return; }
    try {
      await api.post(`/purchasing/grn/${grnId}/landed-cost`, {
        costType: f.costType || 'freight', amountRupees: Number(f.amount), basis: f.basis || 'value',
      });
      setLcForm((m) => ({ ...m, [grnId]: { costType: 'freight', amount: '', basis: f.basis || 'value' } }));
      await openDetail(detail.id);
    } catch (e: any) { setLcMsg(e?.response?.data?.message ?? e.message); }
  };
  const applyLandedCost = async (grnId: string) => {
    setLcMsg('');
    try {
      const res = await api.post(`/purchasing/grn/${grnId}/allocate-landed`);
      const data = payload<any>(res);
      setLcMsg(`Applied ${fmtMinor(data?.totalMinor)} across the received items — product cost updated.`);
      await openDetail(detail.id);
    } catch (e: any) { setLcMsg(e?.response?.data?.message ?? e.message); }
  };

  // ── Purchase returns / debit notes ─────────────────────────────────────────
  const loadReturns = async () => {
    try {
      const res = await api.get('/purchasing/returns', {
        params: { limit: retLc.pageSize, offset: (retLc.page - 1) * retLc.pageSize },
      });
      setReturns(res.data.rows ?? []);
      setRetTotal(res.data.total ?? 0);
    } catch { setReturns([]); }
  };
  useEffect(() => { if (tab === 'returns') loadReturns(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, retLc.page, retLc.pageSize]);

  const filteredReturns = useMemo(() => {
    const q = retLc.search.trim().toLowerCase();
    return returns.filter((r) => {
      const okQ = !q || [r.return_number, r.vendor_name, r.reason].some((v) => String(v ?? '').toLowerCase().includes(q));
      const okS = !retLc.status || r.status === retLc.status;
      return okQ && okS;
    });
  }, [returns, retLc.search, retLc.status]);

  const searchRetSkus = async (q: string) => {
    setRetSkuSearch(q);
    if (q.length < 2) { setRetSkuResults([]); return; }
    try {
      const res = await api.get('/inventory', { params: { search: q, limit: 8 } });
      const list = payload<any>(res);
      setRetSkuResults(Array.isArray(list) ? list : []);
    } catch { setRetSkuResults([]); }
  };

  const createReturn = async (andPost: boolean) => {
    setRetError('');
    try {
      const res = await api.post('/purchasing/returns', {
        vendorId: retVendor, reason: retReason || undefined,
        lines: retLines.map((l) => ({
          variationId: l.variationId, qty: l.qty,
          unitCostRupees: l.unitCostRupees ? Number(l.unitCostRupees) : undefined,
        })),
      });
      const id = payload<any>(res).id;
      if (andPost) await api.post(`/purchasing/returns/${id}/post`);
      setRetNew(false); setRetLines([]); setRetVendor(''); setRetReason('');
      await loadReturns();
    } catch (e: any) { setRetError(e?.response?.data?.message ?? e.message); }
  };

  const postReturn = async (id: string) => {
    setRetError('');
    try {
      await api.post(`/purchasing/returns/${id}/post`);
      await loadReturns();
      if (retDetail?.id === id) openRetDetail(id);
    } catch (e: any) { setRetError(e?.response?.data?.message ?? e.message); }
  };

  const openRetDetail = async (id: string) => {
    try { setRetDetail(payload(await api.get(`/purchasing/returns/${id}`))); } catch { /* noop */ }
  };

  // ── Serials section ──────────────────────────────────────────────────────
  const searchSerials = async (q: string) => {
    setSerialQuery(q);
    if (!q.trim()) { setSerialRows([]); return; }
    try {
      const res = await api.get('/purchasing/serials', { params: { q, limit: 20 } });
      setSerialRows(res.data.rows ?? []);
    } catch { setSerialRows([]); }
  };

  const openSerial = async (serialNo: string) => {
    setSerialMsg('');
    try {
      const res = await api.get(`/purchasing/serials/${encodeURIComponent(serialNo)}`);
      setSerialUnit(payload(res));
    } catch (e: any) { setSerialMsg(e?.response?.data?.message ?? e.message); }
  };

  const markSerial = async (serialNo: string, action: 'returned' | 'write_off') => {
    setSerialMsg('');
    try {
      await api.post(`/purchasing/serials/${encodeURIComponent(serialNo)}/mark`, { action });
      await openSerial(serialNo);
      if (serialQuery) await searchSerials(serialQuery);
    } catch (e: any) { setSerialMsg(e?.response?.data?.message ?? e.message); }
  };

  const searchTrackSkus = async (q: string) => {
    setTrackSkuSearch(q);
    if (q.length < 2) { setTrackResults([]); return; }
    try {
      const res = await api.get('/inventory', { params: { search: q, limit: 8 } });
      const list = payload<any>(res);
      const arr = Array.isArray(list) ? list : [];
      setTrackResults(arr);
      setTrackMap((m) => {
        const next = { ...m };
        for (const r of arr) if (r.is_serial_tracked !== undefined && !(r.id in next)) next[r.id] = !!r.is_serial_tracked;
        return next;
      });
    } catch { setTrackResults([]); }
  };

  const toggleTracking = async (variationId: string, enabled: boolean) => {
    setSerialMsg('');
    try {
      const res = await api.patch('/purchasing/serial-tracking', { variationId, enabled });
      const data = payload<any>(res);
      setTrackMap((m) => ({ ...m, [variationId]: !!data.isSerialTracked }));
    } catch (e: any) { setSerialMsg(e?.response?.data?.message ?? e.message); }
  };

  const printLabels = async (format: 'zpl' | 'pdf') => {
    if (!lastReceivedVariationIds.length) return;
    try {
      const res = await api.post('/wms/labels',
        { type: 'product', ids: lastReceivedVariationIds, format, size: '50x25mm' },
        { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `grn-labels.${format === 'zpl' ? 'zpl' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <Page>
      <PageHeader
        title="Purchasing"
        description="Purchase orders, goods receipts (with quality checks), landed cost, and vendor returns."
        actions={
          <div className="flex items-center gap-2">
            {tab === 'orders'
              ? <ExportMenu filename="purchase-orders" columns={PO_CSV_COLUMNS} rows={filteredPos} canExport={hasPerm('purchasing.read')} />
              : <ExportMenu filename="purchase-returns" columns={RETURN_CSV_COLUMNS} rows={filteredReturns} canExport={hasPerm('purchasing.read')} />}
            {tab === 'orders' && hasPerm('purchasing.manage') && (
              <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Purchase order'}</Btn>
            )}
          </div>
        }
      />
      <TabBar
        tabs={[{ key: 'orders', label: 'Purchase orders' }, { key: 'returns', label: 'Returns / debit notes' }]}
        active={tab} onChange={(k) => setTab(k as 'orders' | 'returns')} />

      {tab === 'orders' && (<>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showNew && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <SelectInput className="min-w-[260px]" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">— vendor —</option>
            {vendors.map((v: any) => <option key={v.id ?? v._id} value={v.id ?? v._id}>{v.business_name ?? v.businessName}</option>)}
          </SelectInput>
          <div>
            <TextInput className="w-full" placeholder="Search SKU / product to add…" value={skuSearch}
              onChange={(e) => searchSkus(e.target.value)} />
            {skuResults.length > 0 && (
              <div className="mt-1 rounded border bg-white shadow divide-y">
                {skuResults.map((r: any) => (
                  <button key={r.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      setLines((ls) => [...ls, { variationId: r.id, label: `${r.name} (${r.sku})`, qtyOrdered: 1, unitCostRupees: 0 }]);
                      setSkuResults([]); setSkuSearch('');
                    }}>
                    {r.name} <span className="font-mono text-xs text-gray-400">{r.sku}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[220px] flex-1 truncate">{l.label}</span>
              <label className="flex items-center gap-1">Qty <TextInput type="number" min={1} value={l.qtyOrdered} className="w-20 text-right tabular-nums"
                onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qtyOrdered: parseInt(e.target.value) || 1 } : x))} /></label>
              <label className="flex items-center gap-1">Unit cost ₹ <TextInput type="number" min={0} step="0.01" value={l.unitCostRupees} className="w-28 text-right tabular-nums"
                onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitCostRupees: Number(e.target.value) || 0 } : x))} /></label>
              <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</Btn>
            </div>
          ))}
          <div className="flex gap-2">
            <Btn variant="outline" disabled={!vendorId || !lines.length} onClick={() => createAndIssue(false)}>Save draft</Btn>
            <Btn disabled={!vendorId || !lines.length} onClick={() => createAndIssue(true)}>
              Save & issue (assigns PO number)
            </Btn>
          </div>
        </div>
      )}

      <FilterBar>
        <Field label="Search">
          <SearchInput placeholder="PO number or vendor…" value={poLc.search} onChange={(e) => poLc.setSearch(e.target.value)} />
        </Field>
        <Field label="Status">
          <SelectInput value={poLc.status} onChange={(e) => poLc.setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="partially_received">Partially received</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </SelectInput>
        </Field>
      </FilterBar>

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
        {filteredPos.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No purchase orders yet.</div>}
        {filteredPos.map((po: any) => (
          <button key={po.id} onClick={() => openDetail(po.id)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50/70">
            <div>
              <span className="font-mono font-medium">{po.po_number ?? '(draft)'}</span>
              <span className="ml-2 text-gray-500">{po.vendor_name}</span>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="tabular-nums">{fmtMinor(po.subtotal_minor)}</span>
              <StatusChip status={po.status} />
              <span className="text-xs text-gray-400">{po.qty_received}/{po.qty_ordered} recd</span>
            </div>
          </button>
        ))}
      </div>

      <Pagination page={poLc.page} pageSize={poLc.pageSize} total={poTotal} onPage={poLc.setPage} onPageSize={poLc.setPageSize} />

      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">
              <span className="font-mono">{detail.po_number ?? '(draft)'}</span>
              <span className="ml-2 text-sm font-normal text-gray-500">{detail.vendor_name} · {detail.status.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-2">
              {detail.status === 'draft' && hasPerm('purchasing.manage') && (
                <Btn size="sm" onClick={async () => { await api.post(`/purchasing/pos/${detail.id}/issue`); await openDetail(detail.id); await load(); }}>Issue</Btn>
              )}
              <Btn variant="ghost" size="sm" onClick={() => setDetail(null)}>Close</Btn>
            </div>
          </div>
          <table className="w-full text-sm">
            <THead sticky={false}>
              <Th>Item</Th><Th num>Ordered</Th><Th num>Received</Th><Th num>Unit cost</Th>
              {['issued', 'partially_received'].includes(detail.status) && hasPerm('purchasing.receive') && <Th num>Receive now</Th>}
            </THead>
            <TBody>
              {detail.items.map((it: any) => (
                <Tr key={it.id}>
                  <Td>{it.product_name} <span className="font-mono text-xs text-gray-400">{it.sku}</span></Td>
                  <Td num>{it.qty_ordered}</Td>
                  <Td num>{it.qty_received}</Td>
                  <Td num className="font-mono">{fmtMinor(it.unit_cost_minor)}</Td>
                  {['issued', 'partially_received'].includes(detail.status) && hasPerm('purchasing.receive') && (
                    <Td num>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <input type="number" min={0} max={it.qty_ordered - it.qty_received}
                          value={receiveQty[it.id] ?? 0} title="Quantity to receive"
                          onChange={(e) => setReceiveQty((q) => ({ ...q, [it.id]: Math.min(parseInt(e.target.value) || 0, it.qty_ordered - it.qty_received) }))}
                          className="w-16 rounded border px-2 py-0.5 text-right" />
                        <input placeholder="Batch #" value={receiveBatch[it.id]?.batchNumber ?? ''}
                          onChange={(e) => setReceiveBatch((b) => ({ ...b, [it.id]: { ...b[it.id], batchNumber: e.target.value } }))}
                          className="w-24 rounded border px-2 py-0.5" />
                        <input type="date" title="Expiry date" value={receiveBatch[it.id]?.expiryDate ?? ''}
                          onChange={(e) => setReceiveBatch((b) => ({ ...b, [it.id]: { ...b[it.id], expiryDate: e.target.value } }))}
                          className="w-32 rounded border px-2 py-0.5" />
                        <input type="number" min={0} step="0.01" placeholder="MRP ₹" value={receiveBatch[it.id]?.mrp ?? ''}
                          onChange={(e) => setReceiveBatch((b) => ({ ...b, [it.id]: { ...b[it.id], mrp: e.target.value } }))}
                          className="w-20 rounded border px-2 py-0.5 text-right" />
                      </div>
                      {(receiveQty[it.id] ?? 0) > 0 && (
                        <div className="mt-1 flex flex-wrap items-center justify-end gap-1 text-left">
                          <span className="text-[11px] text-gray-500">Quality check:</span>
                          <label className="text-[11px] text-gray-600" title="How many units passed inspection?">
                            Passed <input type="number" min={0} max={receiveQty[it.id] ?? 0}
                              placeholder={String(receiveQty[it.id] ?? 0)}
                              value={receiveQc[it.id]?.passed ?? ''}
                              onChange={(e) => setReceiveQc((q) => ({ ...q, [it.id]: { ...q[it.id], passed: e.target.value } }))}
                              className="w-14 rounded border px-2 py-0.5 text-right" />
                          </label>
                          <label className="text-[11px] text-gray-600" title="How many are damaged / rejected? These are quarantined, not sold.">
                            Damaged/rejected <input type="number" min={0} max={receiveQty[it.id] ?? 0}
                              placeholder="0" value={receiveQc[it.id]?.failed ?? ''}
                              onChange={(e) => setReceiveQc((q) => ({ ...q, [it.id]: { ...q[it.id], failed: e.target.value } }))}
                              className="w-14 rounded border px-2 py-0.5 text-right" />
                          </label>
                          {(receiveQc[it.id]?.failed && receiveQc[it.id]?.failed !== '' && Number(receiveQc[it.id]?.failed) > 0) ? (
                            <input placeholder="Reason (e.g. broken seal)" value={receiveQc[it.id]?.note ?? ''}
                              onChange={(e) => setReceiveQc((q) => ({ ...q, [it.id]: { ...q[it.id], note: e.target.value } }))}
                              className="w-40 rounded border px-2 py-0.5 text-xs" />
                          ) : null}
                        </div>
                      )}
                      {it.is_serial_tracked && (() => {
                        const qty = receiveQty[it.id] ?? 0;
                        const typed = parseSerials(receiveSerials[it.id] ?? '').length;
                        const match = typed === qty;
                        return (
                          <div className="mt-1 text-left">
                            <textarea rows={Math.min(Math.max(qty, 2), 6)} placeholder="Serial numbers — one per line"
                              value={receiveSerials[it.id] ?? ''}
                              onChange={(e) => setReceiveSerials((s) => ({ ...s, [it.id]: e.target.value }))}
                              className="w-full min-w-[220px] rounded border px-2 py-1 font-mono text-xs" />
                            <div className={`text-[11px] ${qty === 0 ? 'text-gray-400' : match ? 'text-emerald-600' : 'text-amber-600'}`}>
                              🔖 {typed} of {qty} serial{qty === 1 ? '' : 's'} typed{qty > 0 && !match ? ' — must match qty to receive' : ''}
                            </div>
                          </div>
                        );
                      })()}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </table>
          {['issued', 'partially_received'].includes(detail.status) && hasPerm('purchasing.receive') && (
            <Btn variant="success" onClick={receive}>
              Receive goods (posts to stock ledger)
            </Btn>
          )}
          {lastReceivedVariationIds.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-2 text-sm">
              <span className="text-gray-500">Labels for the received items:</span>
              <Btn variant="outline" size="sm" onClick={() => printLabels('zpl')}>ZPL</Btn>
              <Btn variant="outline" size="sm" onClick={() => printLabels('pdf')}>PDF</Btn>
            </span>
          )}

          {/* Landed cost — spread freight/customs onto item cost so margins are right */}
          {Array.isArray(detail.grns) && detail.grns.length > 0 && hasPerm('purchasing.receive') && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="text-sm font-semibold text-gray-800">Landed cost</div>
              <p className="text-xs text-gray-500">Add freight / customs / insurance so your product cost is accurate. It is spread across the received items and folded into their average cost.</p>
              {lcMsg && <div className="mt-1 text-xs text-emerald-700">{lcMsg}</div>}
              <div className="mt-2 space-y-2">
                {detail.grns.map((g: any) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-2 rounded border bg-white px-2 py-1.5 text-sm">
                    <span className="font-mono text-xs">{g.grn_number}</span>
                    {Number(g.landed_total_minor) > 0 && (
                      <span className="text-xs text-gray-500">so far {fmtMinor(g.landed_total_minor)}{g.landed_pending > 0 ? ' (not applied)' : ' ✓ applied'}</span>
                    )}
                    <select value={lcForm[g.id]?.costType ?? 'freight'}
                      onChange={(e) => setLcForm((m) => ({ ...m, [g.id]: { ...m[g.id], costType: e.target.value, amount: m[g.id]?.amount ?? '', basis: m[g.id]?.basis ?? 'value' } }))}
                      className="rounded border px-1.5 py-0.5 text-xs">
                      <option value="freight">Freight</option>
                      <option value="customs_duty">Customs duty</option>
                      <option value="insurance">Insurance</option>
                      <option value="clearing">Clearing</option>
                      <option value="other">Other</option>
                    </select>
                    <input type="number" min={0} step="0.01" placeholder="Amount ₹" value={lcForm[g.id]?.amount ?? ''}
                      onChange={(e) => setLcForm((m) => ({ ...m, [g.id]: { costType: m[g.id]?.costType ?? 'freight', amount: e.target.value, basis: m[g.id]?.basis ?? 'value' } }))}
                      className="w-24 rounded border px-2 py-0.5 text-right" />
                    <label className="text-xs text-gray-500">split by
                      <select value={lcForm[g.id]?.basis ?? 'value'}
                        onChange={(e) => setLcForm((m) => ({ ...m, [g.id]: { costType: m[g.id]?.costType ?? 'freight', amount: m[g.id]?.amount ?? '', basis: e.target.value } }))}
                        className="ml-1 rounded border px-1.5 py-0.5 text-xs">
                        <option value="value">value</option>
                        <option value="quantity">quantity</option>
                        <option value="weight">weight</option>
                      </select>
                    </label>
                    <Btn variant="outline" size="sm" onClick={() => addLandedCost(g.id)}>Add</Btn>
                    {g.landed_pending > 0 && (
                      <Btn size="sm" onClick={() => applyLandedCost(g.id)}>Apply to product cost</Btn>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Serials ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Serial numbers</h2>
          <p className="text-sm text-gray-500">Trace any unit from vendor → receipt → customer → RMA. Scan or type a serial to see its whole life.</p>
        </div>
        {serialMsg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{serialMsg}</div>}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Look up a serial's history */}
          <div className="space-y-2">
            <input placeholder="Search a serial number…" value={serialQuery}
              onChange={(e) => searchSerials(e.target.value)}
              className="w-full rounded border px-2 py-1.5 text-sm font-mono" />
            {serialRows.length > 0 && (
              <div className="rounded border bg-white shadow-sm divide-y max-h-48 overflow-auto">
                {serialRows.map((s: any) => (
                  <button key={s.id} onClick={() => openSerial(s.serial_no)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                    <span className="font-mono">{s.serial_no}</span>
                    <StatusChip status={s.status} />
                  </button>
                ))}
              </div>
            )}
            {serialQuery.trim() && serialRows.length === 0 && (
              <div className="text-sm text-gray-400">No serials match “{serialQuery}”.</div>
            )}
            {serialUnit && (
              <div className="rounded-xl border bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{serialUnit.serial_no}</span>
                  <StatusChip status={serialUnit.status} />
                </div>
                <div className="mt-0.5 text-xs text-gray-500">{serialUnit.product_name} · {serialUnit.sku}</div>
                <div className="mt-2 text-gray-700">{serialUnit.summary}</div>
                {hasPerm('inventory.adjust') && (
                  <div className="mt-2 flex gap-2">
                    {serialUnit.status === 'sold' && (
                      <button onClick={() => markSerial(serialUnit.serial_no, 'returned')}
                        className="rounded border px-2 py-1 text-xs">Mark returned (RMA)</button>
                    )}
                    {(serialUnit.status === 'in_stock' || serialUnit.status === 'returned') && (
                      <button onClick={() => markSerial(serialUnit.serial_no, 'write_off')}
                        className="rounded border px-2 py-1 text-xs text-red-600">Write off</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enable / disable serial tracking per product */}
          {hasPerm('inventory.adjust') && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">Serial tracking</div>
              <input placeholder="Search SKU / product to toggle…" value={trackSkuSearch}
                onChange={(e) => searchTrackSkus(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-sm" />
              {trackResults.length > 0 && (
                <div className="rounded border bg-white shadow-sm divide-y">
                  {trackResults.map((r: any) => {
                    const on = trackMap[r.id] ?? !!r.is_serial_tracked;
                    return (
                      <div key={r.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <span className="truncate">{r.name ?? r.product_name} <span className="font-mono text-xs text-gray-400">{r.sku}</span></span>
                        <button onClick={() => toggleTracking(r.id, !on)}
                          className={`ml-2 shrink-0 rounded px-2 py-1 text-xs font-medium ${on ? 'bg-emerald-600 text-white' : 'border text-gray-600'}`}>
                          {on ? 'Tracked ✓' : 'Track serials'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400">When on, the goods-receipt screen asks for one serial per unit received.</p>
            </div>
          )}
        </div>
      </div>
      </>)}

      {tab === 'returns' && (
        <div className="space-y-3">
          {retError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{retError}</div>}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Send stock back to a vendor (wrong, damaged or QC-rejected items). Posting cuts a debit note and reduces your stock.</p>
            {hasPerm('purchasing.manage') && (
              <Btn onClick={() => setRetNew((s) => !s)}>{retNew ? 'Close' : '+ Purchase return'}</Btn>
            )}
          </div>

          {retNew && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <SelectInput className="min-w-[260px]" value={retVendor} onChange={(e) => setRetVendor(e.target.value)}>
                <option value="">— vendor —</option>
                {vendors.map((v: any) => <option key={v.id ?? v._id} value={v.id ?? v._id}>{v.business_name ?? v.businessName}</option>)}
              </SelectInput>
              <div>
                <TextInput className="w-full" placeholder="Search SKU / product to return…" value={retSkuSearch}
                  onChange={(e) => searchRetSkus(e.target.value)} />
                {retSkuResults.length > 0 && (
                  <div className="mt-1 rounded border bg-white shadow divide-y">
                    {retSkuResults.map((r: any) => (
                      <button key={r.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setRetLines((ls) => [...ls, { variationId: r.id, label: `${r.name} (${r.sku})`, qty: 1 }]);
                          setRetSkuResults([]); setRetSkuSearch('');
                        }}>
                        {r.name} <span className="font-mono text-xs text-gray-400">{r.sku}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {retLines.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-[220px] flex-1 truncate">{l.label}</span>
                  <label className="flex items-center gap-1">Qty <TextInput type="number" min={1} value={l.qty} className="w-20 text-right tabular-nums"
                    onChange={(e) => setRetLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))} /></label>
                  <label className="flex items-center gap-1">Unit cost ₹ <TextInput type="number" min={0} step="0.01" placeholder="(WAC)" value={l.unitCostRupees ?? ''} className="w-28 text-right tabular-nums"
                    onChange={(e) => setRetLines((ls) => ls.map((x, j) => j === i ? { ...x, unitCostRupees: e.target.value } : x))} /></label>
                  <Btn variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setRetLines((ls) => ls.filter((_, j) => j !== i))}>✕</Btn>
                </div>
              ))}
              <TextInput className="w-full" placeholder="Reason for the return (optional)" value={retReason}
                onChange={(e) => setRetReason(e.target.value)} />
              <div className="flex gap-2">
                <Btn variant="outline" disabled={!retVendor || !retLines.length} onClick={() => createReturn(false)}>Save draft</Btn>
                <Btn disabled={!retVendor || !retLines.length} onClick={() => createReturn(true)}>
                  Save &amp; post (cuts debit note)
                </Btn>
              </div>
            </div>
          )}

          <FilterBar>
            <Field label="Search">
              <SearchInput placeholder="Return number, vendor, reason…" value={retLc.search} onChange={(e) => retLc.setSearch(e.target.value)} />
            </Field>
            <Field label="Status">
              <SelectInput value={retLc.status} onChange={(e) => retLc.setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="posted">Posted</option>
              </SelectInput>
            </Field>
          </FilterBar>

          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
            {filteredReturns.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No purchase returns yet.</div>}
            {filteredReturns.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <button onClick={() => openRetDetail(r.id)} className="flex-1 text-left hover:opacity-70">
                  <span className="font-mono font-medium">{r.return_number ?? '(draft)'}</span>
                  <span className="ml-2 text-gray-500">{r.vendor_name}</span>
                  {r.reason && <span className="ml-2 text-xs text-gray-400">· {r.reason}</span>}
                </button>
                <div className="flex items-center gap-3 text-right">
                  <span className="tabular-nums">{fmtMinor(r.total_minor)}</span>
                  <span className="text-xs text-gray-400">{r.qty} unit{r.qty === 1 ? '' : 's'}</span>
                  <StatusChip status={r.status} />
                  {r.status === 'draft' && hasPerm('purchasing.manage') && (
                    <Btn size="sm" onClick={() => postReturn(r.id)}>Post</Btn>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Pagination page={retLc.page} pageSize={retLc.pageSize} total={retTotal} onPage={retLc.setPage} onPageSize={retLc.setPageSize} />

          {retDetail && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  <span className="font-mono">{retDetail.return_number ?? '(draft)'}</span>
                  <span className="ml-2 text-sm font-normal text-gray-500">{retDetail.vendor_name} · {retDetail.status}</span>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => setRetDetail(null)}>Close</Btn>
              </div>
              <table className="w-full text-sm">
                <THead sticky={false}><Th>Item</Th><Th num>Qty</Th><Th num>Unit cost</Th><Th num>Line total</Th></THead>
                <TBody>
                  {(retDetail.items ?? []).map((it: any) => (
                    <Tr key={it.id}>
                      <Td>{it.product_name} <span className="font-mono text-xs text-gray-400">{it.sku}</span></Td>
                      <Td num>{it.qty}</Td>
                      <Td num className="font-mono">{fmtMinor(it.unit_cost_minor)}</Td>
                      <Td num className="font-mono">{fmtMinor(it.line_total_minor)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
              {retDetail.status === 'draft' && hasPerm('purchasing.manage') && (
                <Btn variant="success" onClick={() => postReturn(retDetail.id)}>Post debit note</Btn>
              )}
            </div>
          )}
        </div>
      )}
    </Page>
  );
};

export default Purchasing;
