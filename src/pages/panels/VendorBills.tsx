import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { payload } from '../../lib/unwrap';
import { formatDate } from '../../utils/date';
import {
  Page, PageHeader, Btn, StatusChip, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, inrMinor,
  FilterBar, Field, SearchInput, ExportMenu, Pagination, AttachmentPanel,
  useListControls, type CsvColumn,
} from '../../components/erp';

/** Accounts Payable — vendor bills with 3-way match status. */

// Client CSV of the vendor-bill rows the page already holds.
const BILL_CSV_COLUMNS: CsvColumn<any>[] = [
  { key: 'voucher_number', label: 'Voucher' },
  { key: 'bill_number', label: 'Vendor bill #' },
  { key: 'vendor_name', label: 'Vendor' },
  { key: 'po_number', label: 'PO' },
  { key: 'bill_date', label: 'Bill date' },
  { key: 'total_minor', label: 'Total', money: true },
  { key: 'match_status', label: 'Match' },
  { key: 'status', label: 'Status' },
];

const VendorBills: React.FC = () => {
  const { hasPerm } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const canPost = hasPerm('accounting.post');
  const canRecord = hasPerm('purchasing.manage');
  const canRead = hasPerm('purchasing.read');

  // Server pagination (limit/offset); the /purchasing/bills route exposes no
  // server-side filters, so search/status/match narrow the loaded page below.
  const lc = useListControls({ pageSize: 25 });
  const [matchFilter, setMatchFilter] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [pos, setPos] = useState<any[]>([]);
  const [poDetail, setPoDetail] = useState<any>(null);
  const [form, setForm] = useState({ billNumber: '', billDate: new Date().toISOString().slice(0, 10), cgst: 0, sgst: 0, igst: 0 });
  const [billLines, setBillLines] = useState<any[]>([]);
  // Which bill's attachments (supplier invoice scans) are open below the table.
  const [attachFor, setAttachFor] = useState<{ id: string; number: string } | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/purchasing/bills', {
        params: { limit: lc.pageSize, offset: (lc.page - 1) * lc.pageSize },
      });
      setRows(res.data?.rows ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lc.page, lc.pageSize]);
  useEffect(() => {
    api.get('/purchasing/pos').then((r) =>
      setPos((r.data.rows ?? []).filter((p: any) => ['received', 'partially_received'].includes(p.status)))
    ).catch(() => {});
  }, []);

  // Within-page filter (server has no filters yet — see report/deferred).
  const filtered = useMemo(() => {
    const q = lc.search.trim().toLowerCase();
    return rows.filter((b) => {
      const matchesQ = !q || [b.bill_number, b.vendor_name, b.po_number, b.voucher_number]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
      const matchesStatus = !lc.status || b.status === lc.status;
      const matchesMatch = !matchFilter || b.match_status === matchFilter;
      return matchesQ && matchesStatus && matchesMatch;
    });
  }, [rows, lc.search, lc.status, matchFilter]);

  const pickPo = async (poId: string) => {
    if (!poId) { setPoDetail(null); setBillLines([]); return; }
    const res = await api.get(`/purchasing/pos/${poId}`);
    const d = payload<any>(res);
    setPoDetail(d);
    // Prefill from what was RECEIVED at the PO's cost — the 3-way match baseline.
    setBillLines(d.items.filter((i: any) => i.qty_received > 0).map((i: any) => ({
      poItemId: i.id, variationId: i.variation_id, label: `${i.product_name} (${i.sku})`,
      qty: i.qty_received, unitCostRupees: Number(i.unit_cost_minor) / 100,
    })));
  };

  const record = async () => {
    setError('');
    try {
      await api.post('/purchasing/bills', {
        vendorId: pos.find((p) => p.id === poDetail.id)?.vendor_id ?? poDetail.vendor_id,
        poId: poDetail.id,
        billNumber: form.billNumber, billDate: form.billDate,
        cgstRupees: form.cgst, sgstRupees: form.sgst, igstRupees: form.igst,
        lines: billLines.map((l) => ({ poItemId: l.poItemId, variationId: l.variationId, qty: l.qty, unitCostRupees: l.unitCostRupees })),
      });
      setShowNew(false); setPoDetail(null); setBillLines([]);
      setForm({ billNumber: '', billDate: new Date().toISOString().slice(0, 10), cgst: 0, sgst: 0, igst: 0 });
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  const approve = async (id: string) => {
    setError('');
    try { await api.post(`/purchasing/bills/${id}/approve`); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };
  const pay = async (id: string, paymentAccountCode: '1000' | '1010') => {
    setError('');
    try {
      await api.post(`/purchasing/bills/${id}/pay`, {
        paymentDate: new Date().toISOString().slice(0, 10), paymentAccountCode,
      });
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? e.message); }
  };

  return (
    <Page>
      <PageHeader
        title="Vendor Bills (Accounts Payable)"
        description="Approval clears GRIR into AP and assigns a PB voucher. Mismatched bills need a human decision — nothing is auto-accepted."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu filename="vendor-bills" columns={BILL_CSV_COLUMNS} rows={filtered} canExport={canRead} />
            {canRecord && (
              <Btn onClick={() => setShowNew((s) => !s)}>{showNew ? 'Close' : '+ Record bill'}</Btn>
            )}
          </div>
        }
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showNew && canRecord && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3 text-sm">
          <div className="flex flex-wrap gap-3">
            <SelectInput className="min-w-[260px]" onChange={(e) => pickPo(e.target.value)}>
              <option value="">— received PO —</option>
              {pos.map((p: any) => <option key={p.id} value={p.id}>{p.po_number} · {p.vendor_name}</option>)}
            </SelectInput>
            <TextInput placeholder="Vendor's bill number *" value={form.billNumber}
              onChange={(e) => setForm((f) => ({ ...f, billNumber: e.target.value }))} />
            <TextInput type="date" value={form.billDate}
              onChange={(e) => setForm((f) => ({ ...f, billDate: e.target.value }))} />
          </div>
          {billLines.map((l, i) => (
            <div key={l.poItemId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[220px] flex-1 truncate">{l.label}</span>
              <label className="flex items-center gap-1">Qty <TextInput type="number" min={1} value={l.qty} className="w-20 text-right tabular-nums"
                onChange={(e) => setBillLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))} /></label>
              <label className="flex items-center gap-1">Unit ₹ <TextInput type="number" min={0} step="0.01" value={l.unitCostRupees} className="w-28 text-right tabular-nums"
                onChange={(e) => setBillLines((ls) => ls.map((x, j) => j === i ? { ...x, unitCostRupees: Number(e.target.value) || 0 } : x))} /></label>
            </div>
          ))}
          {poDetail && (
            <div className="flex flex-wrap items-end gap-3">
              {(['cgst', 'sgst', 'igst'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1 uppercase">{k} ₹
                  <TextInput type="number" min={0} step="0.01" value={form[k]} className="w-24 text-right tabular-nums"
                    onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }))} />
                </label>
              ))}
              <Btn variant="success" disabled={!form.billNumber || !billLines.length} onClick={record}>
                Record bill (3-way match runs now)
              </Btn>
            </div>
          )}
        </div>
      )}

      <FilterBar>
        <Field label="Search">
          <SearchInput placeholder="Bill #, vendor, PO, voucher…" value={lc.search} onChange={(e) => lc.setSearch(e.target.value)} />
        </Field>
        <Field label="Status">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="recorded">Recorded</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </SelectInput>
        </Field>
        <Field label="Match">
          <SelectInput value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
            <option value="">All</option>
            <option value="matched">Matched</option>
            <option value="mismatch">Mismatch</option>
          </SelectInput>
        </Field>
      </FilterBar>

      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Voucher</Th><Th>Vendor bill #</Th><Th>Vendor</Th><Th>PO</Th>
            <Th>Date</Th><Th num>Total</Th><Th>Match</Th><Th>Status</Th>
            {canPost && <Th num>Actions</Th>}
          </THead>
          <TBody>
            {filtered.length === 0 && <tr><td colSpan={canPost ? 9 : 8} className="px-4 py-6 text-center text-gray-500">No vendor bills yet — record them from the Purchasing page.</td></tr>}
            {filtered.map((b: any) => (
              <Tr key={b.id} title={b.match_notes ?? ''}>
                <Td className="font-mono">
                  <button
                    onClick={() => setAttachFor((cur) => cur?.id === b.id ? null : { id: b.id, number: b.voucher_number ?? b.bill_number })}
                    className={`hover:underline ${attachFor?.id === b.id ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                    title="View / add supplier-invoice attachments"
                  >{b.voucher_number ?? '—'}</button>
                </Td>
                <Td className="font-mono">{b.bill_number}</Td>
                <Td>{b.vendor_name}</Td>
                <Td className="font-mono">{b.po_number ?? '—'}</Td>
                <Td>{formatDate(b.bill_date, 'dd MMM yyyy', b.bill_date ?? '—')}</Td>
                <Td num>{inrMinor(b.total_minor)}</Td>
                <Td><StatusChip status={b.match_status} /></Td>
                <Td><StatusChip status={b.status} /></Td>
                {canPost && (
                  <Td num>
                    {b.status === 'recorded' && (
                      <button onClick={() => approve(b.id)} className="font-medium text-gray-900 hover:underline">Approve</button>
                    )}
                    {b.status === 'approved' && (
                      <span className="whitespace-nowrap">
                        <button onClick={() => pay(b.id, '1010')} className="font-medium text-gray-900 hover:underline">Pay (Bank)</button>
                        <span className="text-gray-300"> · </span>
                        <button onClick={() => pay(b.id, '1000')} className="font-medium text-gray-900 hover:underline">Cash</button>
                      </span>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={total} onPage={lc.setPage} onPageSize={lc.setPageSize} />

      {attachFor && (
        <AttachmentPanel
          entityType="vendor_bill"
          entityId={attachFor.id}
          title={`Attachments · ${attachFor.number}`}
          description="Supplier invoice scans and supporting files for this bill."
        />
      )}
    </Page>
  );
};

export default VendorBills;
