import React, { useEffect, useState } from 'react';
import { PackageX, Plus, Loader2, PackageCheck, X, AlertTriangle, IndianRupee } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * RTO → inventory (migration 064). Plain-language screen:
 * "A parcel came back undelivered — put the good stock back on the shelf."
 * Enter the order it was for → count what actually arrived (good vs damaged) →
 * the good units go back on sale, damaged units are set aside, and if the
 * customer had already paid you'll see a reminder that you owe them a refund.
 */

const inr = (minor: any) => { const n = Number(minor); return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'; };
const num = (n: any) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

interface Item { id: string; variation_id: string; name?: string; sku?: string; qty_expected: number; qty_received: number; qty_good: number; qty_damaged: number }
interface Rto {
  id: string; order_id: string | null; order_number?: string | null; payment_method?: string | null;
  awb: string | null; courier: string | null; reason: string | null; status: string;
  is_prepaid: boolean; refund_due: boolean; refund_amount_minor: string;
  total_good: number; total_damaged: number; created_at: string; item_count?: number; items?: Item[];
}

const STATUS_TONE: Record<string, any> = { pending: 'amber', received: 'green', reconciled: 'blue', cancelled: 'red' };
const STATUS_LABEL: Record<string, string> = { pending: 'Awaiting parcel', received: 'Received', reconciled: 'Reconciled', cancelled: 'Cancelled' };

const ReturnsRto: React.FC = () => {
  const [list, setList] = useState<Rto[] | null>(null);
  const [detail, setDetail] = useState<Rto | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // create form
  const [creating, setCreating] = useState(false);
  const [orderNumber, setOrderNumber] = useState(''); const [reason, setReason] = useState(''); const [awb, setAwb] = useState('');

  // receive form
  const [receiveMode, setReceiveMode] = useState(false);
  const [good, setGood] = useState<Record<string, string>>({});
  const [dmg, setDmg] = useState<Record<string, string>>({});

  const loadList = () => api.get('/logistics/rto').then((r) => setList(payload<Rto[]>(r) ?? [])).catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  useEffect(() => { loadList(); }, []);

  const openDetail = async (id: string) => {
    setMsg(''); setOk(''); setReceiveMode(false); setGood({}); setDmg({});
    try { setDetail(payload<Rto>(await api.get(`/logistics/rto/${id}`))); setCreating(false); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const create = async () => {
    if (!orderNumber.trim()) { setMsg('Enter the order number the parcel was for.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = payload<Rto>(await api.post('/logistics/rto', { orderNumber: orderNumber.trim(), reason: reason.trim() || null, awb: awb.trim() || null }));
      setOk('RTO opened. When the parcel arrives, receive it and count good vs damaged.');
      setCreating(false); setOrderNumber(''); setReason(''); setAwb('');
      loadList(); if (r?.id) openDetail(r.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const confirmReceive = async () => {
    if (!detail) return;
    const lines = (detail.items ?? []).map((it) => ({
      itemId: it.id,
      qtyGood: Math.round(Number(good[it.id] ?? '0') || 0),
      qtyDamaged: Math.round(Number(dmg[it.id] ?? '0') || 0),
    }));
    setBusy(true); setMsg(''); setOk('');
    try {
      const res: any = await api.post(`/logistics/rto/${detail.id}/receive`, { lines });
      const result = res?.data?.result ?? res?.result;
      setReceiveMode(false);
      setOk(result?.refundDue
        ? `Received. Good stock is back on sale. This was a prepaid order — you owe the customer a refund of ${inr(result.refundAmountMinor)}.`
        : 'Received. Good stock is back on sale; any damaged units were set aside.');
      await openDetail(detail.id); loadList();
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/rto/${detail.id}/cancel`); setOk('RTO cancelled.'); await openDetail(detail.id); loadList(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader
        title="Returns (RTO) → stock"
        icon={PackageX}
        description="A parcel came back undelivered? Put the good stock back on the shelf. Damaged units are set aside, and prepaid orders show a refund reminder."
        actions={<Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Cancel' : 'New RTO'}</Btn>}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* CREATE */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Open a return-to-origin</h3>
          <p className="text-xs text-gray-500">Enter the order number — we'll load its items as the expected list, and remember if it was prepaid.</p>
          <FilterBar>
            <Field label="Order number"><TextInput value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. ORD-00003" /></Field>
            <Field label="Tracking / AWB (optional)"><TextInput value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="courier AWB" /></Field>
            <Field label="Reason (optional)"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer refused delivery" /></Field>
          </FilterBar>
          <Btn variant="success" disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Open RTO</Btn>
        </div>
      )}

      {/* DETAIL */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                RTO for {detail.order_number || '(no order)'}
                <Chip tone={STATUS_TONE[detail.status] ?? 'default'}>{STATUS_LABEL[detail.status] ?? detail.status}</Chip>
                {detail.is_prepaid && <Chip tone="blue">Prepaid</Chip>}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.courier ? `${detail.courier} · ` : ''}{detail.awb ? `AWB ${detail.awb} · ` : ''}
                {detail.item_count ?? detail.items?.length ?? 0} line(s){detail.reason ? ` · ${detail.reason}` : ''}
              </div>
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          {/* Refund-due reminder (prepaid, after receipt) */}
          {detail.refund_due && detail.status !== 'cancelled' && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <IndianRupee className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This was a prepaid order — the customer already paid <strong>{inr(detail.refund_amount_minor)}</strong>. You owe them a refund. (Issue it from the order / payments screen — it is not done automatically.)</span>
            </div>
          )}

          {/* Actions */}
          {detail.status === 'pending' && (
            <div className="flex flex-wrap gap-2">
              {!receiveMode && <Btn variant="success" disabled={busy} onClick={() => setReceiveMode(true)}><PackageCheck className="h-4 w-4" />Receive parcel</Btn>}
              <Btn variant="danger" disabled={busy} onClick={cancel}><X className="h-4 w-4" />Cancel RTO</Btn>
            </div>
          )}

          {/* Items / receive */}
          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Product</Th><Th>SKU</Th><Th num>Expected</Th>
                {receiveMode ? <><Th num>Good (sellable)</Th><Th num>Damaged</Th></> : <><Th num>Good</Th><Th num>Damaged</Th></>}
              </THead>
              <TBody>
                {(detail.items ?? []).length === 0 ? (
                  <EmptyRow colSpan={5}>No lines.</EmptyRow>
                ) : (detail.items ?? []).map((it) => (
                  <Tr key={it.id}>
                    <Td>{it.name}</Td>
                    <Td muted className="font-mono text-xs">{it.sku}</Td>
                    <Td num>{num(it.qty_expected)}</Td>
                    {receiveMode ? (
                      <>
                        <Td num><TextInput type="number" min={0} className="w-20 text-right" value={good[it.id] ?? ''} placeholder="0" onChange={(e) => setGood({ ...good, [it.id]: e.target.value })} /></Td>
                        <Td num><TextInput type="number" min={0} className="w-20 text-right" value={dmg[it.id] ?? ''} placeholder="0" onChange={(e) => setDmg({ ...dmg, [it.id]: e.target.value })} /></Td>
                      </>
                    ) : (
                      <>
                        <Td num className="text-emerald-700">{detail.status === 'received' ? num(it.qty_good) : '—'}</Td>
                        <Td num className={it.qty_damaged > 0 ? 'text-red-600 font-semibold' : ''}>{detail.status === 'received' ? num(it.qty_damaged) : '—'}</Td>
                      </>
                    )}
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
          {receiveMode && (
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="success" disabled={busy} onClick={confirmReceive}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Confirm — put good stock back</Btn>
              <Btn variant="ghost" onClick={() => setReceiveMode(false)}>Cancel</Btn>
              <span className="flex items-center gap-1 text-xs text-gray-500"><AlertTriangle className="h-3.5 w-3.5" />Good units go back on sale; damaged units are set aside (not sellable).</span>
            </div>
          )}
        </div>
      )}

      {/* LIST */}
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Order</Th><Th>Courier / AWB</Th><Th num>Lines</Th><Th num>Good</Th><Th num>Damaged</Th><Th>Status</Th><Th>Refund</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={7}>Loading returns…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={7}><EmptyState title="No returns yet" description="When a parcel comes back undelivered, open an RTO here to restock it." /></EmptyRow>
            ) : list.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                <Td className="font-mono text-xs">{r.order_number || '—'}</Td>
                <Td muted className="text-xs">{[r.courier, r.awb].filter(Boolean).join(' · ') || '—'}</Td>
                <Td num>{num(r.item_count)}</Td>
                <Td num className="text-emerald-700">{r.status === 'received' ? num(r.total_good) : '—'}</Td>
                <Td num className={r.total_damaged > 0 ? 'text-red-600' : ''}>{r.status === 'received' ? num(r.total_damaged) : '—'}</Td>
                <Td><Chip tone={STATUS_TONE[r.status] ?? 'default'}>{STATUS_LABEL[r.status] ?? r.status}</Chip></Td>
                <Td className="text-xs">{r.refund_due ? <span className="text-amber-700">Owe {inr(r.refund_amount_minor)}</span> : '—'}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default ReturnsRto;
