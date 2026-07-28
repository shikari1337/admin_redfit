import React, { useEffect, useState } from 'react';
import { Banknote, Plus, Loader2, CheckCircle2, X, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
} from '../../components/erp';

/**
 * COD remittance reconciliation (migration 064). Plain-language screen:
 * "The courier collected cash at the customer's door and later paid us a lump
 * sum. Did they pay us the right amount for every parcel?"
 * Enter the payout (each parcel = tracking/order number + the cash collected) →
 * we match each one to the delivered COD order and flag anything short, over, or
 * that matches no order. Mark it reconciled only when every line ties out.
 */

const inr = (minor: any) => { const n = Number(minor); return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'; };

interface Line {
  id: string; order_id: string | null; awb: string | null; order_number: string | null;
  cod_amount_minor: string; expected_amount_minor: string | null;
  matched: boolean; match_status: string; matched_order_number?: string | null;
}
interface Remittance {
  id: string; courier: string | null; reference: string | null;
  remitted_amount_minor: string; matched_amount_minor: string;
  remitted_on: string | null; status: string; note: string | null; created_at: string;
  line_count?: number; matched_count?: number; unmatched_count?: number; lines?: Line[];
}

const STATUS_TONE: Record<string, any> = { open: 'amber', reconciled: 'green', cancelled: 'red' };
const LINE_TONE: Record<string, any> = { matched: 'green', short: 'red', excess: 'amber', missing_order: 'red' };
const LINE_LABEL: Record<string, string> = {
  matched: 'Matched', short: 'Paid short', excess: 'Paid over', missing_order: 'No order found',
};

// A blank payout line in the create form (amounts are entered in rupees).
type Draft = { awb: string; orderNumber: string; amount: string };
const blankLine = (): Draft => ({ awb: '', orderNumber: '', amount: '' });

const CodReconciliation: React.FC = () => {
  const [list, setList] = useState<Remittance[] | null>(null);
  const [detail, setDetail] = useState<Remittance | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // create form
  const [creating, setCreating] = useState(false);
  const [courier, setCourier] = useState(''); const [reference, setReference] = useState('');
  const [remittedOn, setRemittedOn] = useState('');
  const [lines, setLines] = useState<Draft[]>([blankLine()]);

  const loadList = () => api.get('/logistics/cod-remittances')
    .then((r) => setList(payload<Remittance[]>(r) ?? []))
    .catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  useEffect(() => { loadList(); }, []);

  const openDetail = async (id: string) => {
    setMsg(''); setOk('');
    try { setDetail(payload<Remittance>(await api.get(`/logistics/cod-remittances/${id}`))); setCreating(false); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const setLine = (i: number, patch: Partial<Draft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const create = async () => {
    const payoutLines = lines
      .map((l) => ({
        awb: l.awb.trim() || null,
        orderNumber: l.orderNumber.trim() || null,
        codAmountMinor: Math.round((Number(l.amount) || 0) * 100),
      }))
      .filter((l) => (l.awb || l.orderNumber) && l.codAmountMinor > 0);
    if (payoutLines.length === 0) { setMsg('Add at least one parcel: a tracking or order number and the cash collected.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = payload<Remittance>(await api.post('/logistics/cod-remittances', {
        courier: courier.trim() || null, reference: reference.trim() || null,
        remittedOn: remittedOn || null, lines: payoutLines,
      }));
      setOk('Payout entered and matched. Open it to see which parcels tie out.');
      setCreating(false); setCourier(''); setReference(''); setRemittedOn(''); setLines([blankLine()]);
      loadList(); if (r?.id) openDetail(r.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const rematch = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/match`); setOk('Re-checked against the latest delivered orders.'); await openDetail(detail.id); loadList(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const reconcile = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/reconcile`); setOk('Reconciled — this payout ties out to the paisa.'); await openDetail(detail.id); loadList(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/logistics/cod-remittances/${detail.id}/cancel`); setOk('Payout cancelled.'); await openDetail(detail.id); loadList(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const ties = detail && detail.status === 'open'
    && (detail.lines ?? []).length > 0
    && (detail.lines ?? []).every((l) => l.match_status === 'matched')
    && detail.matched_amount_minor === detail.remitted_amount_minor;

  return (
    <Page>
      <PageHeader
        title="COD payouts — did the courier pay us right?"
        icon={Banknote}
        description="The courier collects cash at the door and later pays you a lump sum. Enter the payout, and we match every parcel to its delivered order — flagging anything paid short, over, or with no matching order."
        actions={<Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Cancel' : 'New payout'}</Btn>}
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {/* CREATE */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Enter a courier COD payout</h3>
          <p className="text-xs text-gray-500">One row per parcel. Put the tracking number (AWB) if you have it — it's the most accurate — otherwise the order number, then the cash the courier says they collected.</p>
          <FilterBar>
            <Field label="Courier"><TextInput value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. Delhivery" /></Field>
            <Field label="Bank reference / UTR (optional)"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR on the bank credit" /></Field>
            <Field label="Paid on (optional)"><TextInput type="date" value={remittedOn} onChange={(e) => setRemittedOn(e.target.value)} /></Field>
          </FilterBar>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Tracking / AWB</Th><Th>or Order number</Th><Th num>Cash collected (₹)</Th><Th> </Th>
              </THead>
              <TBody>
                {lines.map((l, i) => (
                  <Tr key={i}>
                    <Td><TextInput value={l.awb} onChange={(e) => setLine(i, { awb: e.target.value })} placeholder="courier AWB" /></Td>
                    <Td><TextInput value={l.orderNumber} onChange={(e) => setLine(i, { orderNumber: e.target.value })} placeholder="e.g. ORD-00003" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-32 text-right" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="0.00" /></Td>
                    <Td>{lines.length > 1 && <Btn variant="ghost" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Btn>}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Add parcel</Btn>
            <Btn variant="success" disabled={busy} onClick={create}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Enter payout & match</Btn>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                Payout {detail.reference ? `· ${detail.reference}` : ''}
                <Chip tone={STATUS_TONE[detail.status] ?? 'default'}>{detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {detail.courier ? `${detail.courier} · ` : ''}{detail.remitted_on ? `paid ${detail.remitted_on} · ` : ''}
                {detail.line_count ?? detail.lines?.length ?? 0} parcel(s)
              </div>
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div><span className="text-gray-500">Courier paid: </span><strong>{inr(detail.remitted_amount_minor)}</strong></div>
            <div><span className="text-gray-500">Matched to orders: </span><strong className={detail.matched_amount_minor === detail.remitted_amount_minor ? 'text-emerald-700' : 'text-amber-700'}>{inr(detail.matched_amount_minor)}</strong></div>
          </div>

          {detail.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" disabled={busy} onClick={rematch}><RefreshCw className="h-4 w-4" />Re-check matches</Btn>
              <Btn variant="success" disabled={busy || !ties} onClick={reconcile}><CheckCircle2 className="h-4 w-4" />Mark reconciled</Btn>
              <Btn variant="danger" disabled={busy} onClick={cancel}><Trash2 className="h-4 w-4" />Cancel payout</Btn>
              {!ties && <span className="self-center text-xs text-amber-700">Can't reconcile yet — every parcel must match its order to the paisa.</span>}
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Tracking / Order</Th><Th num>Courier paid</Th><Th num>Order total</Th><Th>Result</Th>
              </THead>
              <TBody>
                {(detail.lines ?? []).length === 0 ? (
                  <EmptyRow colSpan={4}>No lines.</EmptyRow>
                ) : (detail.lines ?? []).map((l) => (
                  <Tr key={l.id}>
                    <Td className="font-mono text-xs">{l.awb || l.matched_order_number || l.order_number || '—'}</Td>
                    <Td num>{inr(l.cod_amount_minor)}</Td>
                    <Td num muted>{l.expected_amount_minor != null ? inr(l.expected_amount_minor) : '—'}</Td>
                    <Td><Chip tone={LINE_TONE[l.match_status] ?? 'default'}>{LINE_LABEL[l.match_status] ?? l.match_status}</Chip></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}

      {/* LIST */}
      <TableShell>
        <table className="w-full text-sm">
          <THead>
            <Th>Courier / reference</Th><Th num>Paid</Th><Th num>Matched</Th><Th num>Parcels</Th><Th num>Unmatched</Th><Th>Status</Th>
          </THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={6}>Loading payouts…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={6}><EmptyState title="No COD payouts yet" description="When a courier pays out the cash they collected, enter it here to check it against your delivered COD orders." /></EmptyRow>
            ) : list.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                <Td>{r.courier || '—'}<span className="block font-mono text-xs text-gray-400">{r.reference || ''}</span></Td>
                <Td num>{inr(r.remitted_amount_minor)}</Td>
                <Td num className={r.matched_amount_minor === r.remitted_amount_minor ? 'text-emerald-700' : ''}>{inr(r.matched_amount_minor)}</Td>
                <Td num>{r.line_count ?? '—'}</Td>
                <Td num className={(r.unmatched_count ?? 0) > 0 ? 'text-red-600 font-semibold' : ''}>{r.unmatched_count ?? 0}</Td>
                <Td><Chip tone={STATUS_TONE[r.status] ?? 'default'}>{r.status}</Chip></Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>
    </Page>
  );
};

export default CodReconciliation;
