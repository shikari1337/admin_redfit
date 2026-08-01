import React, { useEffect, useState } from 'react';
import { Store, Plus, Loader2, CheckCircle2, X, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { payload } from '@/lib/unwrap';
import { useAuth } from '../../contexts/AuthContext';
import {
  Page, PageHeader, Btn, FilterBar, Field, TextInput, SelectInput,
  TableShell, THead, Th, TBody, Tr, Td, EmptyRow, EmptyState, Chip,
  ExportMenu, Pagination, DrillLink, useListControls, type CsvColumn,
} from '../../components/erp';

/**
 * Marketplace settlement reconciliation (migration 069). Plain-language screen:
 * "A marketplace sold my stock and paid me a lump sum after keeping its cut. Did
 * they pay the right amount for every order?" Enter the payout (one row per
 * order: the order number, and how much commission / fees / TCS they kept and the
 * net they paid) — we match each to your order and flag anything short, over, or
 * with no matching order. Reconcile only when every order ties out.
 */

const inr = (minor: any) => { const n = Number(minor); return Number.isFinite(n) ? `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'; };

interface Line {
  id: string; order_ref: string | null; our_order_id: string | null;
  order_gross_minor: string; commission_minor: string; fees_minor: string; tcs_minor: string;
  net_minor: string; expected_net_minor: string | null; matched: boolean; match_status: string;
  matched_order_number?: string | null;
}
interface Settlement {
  id: string; channel: string | null; settlement_ref: string | null;
  period_from: string | null; period_to: string | null;
  gross_minor: string; commission_minor: string; fees_minor: string; tcs_minor: string; net_minor: string;
  matched_amount_minor: string; status: string; created_at: string;
  line_count?: number; matched_count?: number; unmatched_count?: number; lines?: Line[];
}

const STATUS_TONE: Record<string, any> = { open: 'amber', reconciled: 'green', cancelled: 'red' };
const LINE_TONE: Record<string, any> = { matched: 'green', short: 'red', excess: 'amber', missing_order: 'red' };
const LINE_LABEL: Record<string, string> = { matched: 'Matched', short: 'Paid short', excess: 'Paid over', missing_order: 'No order found' };

type Draft = { orderRef: string; gross: string; commission: string; fees: string; tcs: string; net: string };
const blankLine = (): Draft => ({ orderRef: '', gross: '', commission: '', fees: '', tcs: '', net: '' });
const toMinor = (v: string) => Math.round((Number(v) || 0) * 100);

// Client CSV of the payouts list. Money cells are minor units (→ inrMinor).
const settlementCsvCols: CsvColumn<Settlement>[] = [
  { key: 'channel', label: 'Marketplace', format: (r) => r.channel ?? '' },
  { key: 'settlement_ref', label: 'Reference', format: (r) => r.settlement_ref ?? '' },
  { key: 'net_minor', label: 'Net paid', money: true },
  { key: 'matched_amount_minor', label: 'Matched', money: true },
  { key: 'line_count', label: 'Orders', format: (r) => r.line_count ?? 0 },
  { key: 'unmatched_count', label: 'Unmatched', format: (r) => r.unmatched_count ?? 0 },
  { key: 'status', label: 'Status' },
];

const MarketplaceSettlements: React.FC = () => {
  const { hasPerm } = useAuth();
  const canPost = hasPerm('accounting.post');
  const canRead = hasPerm('accounting.read');

  const [list, setList] = useState<Settlement[] | null>(null);
  const [detail, setDetail] = useState<Settlement | null>(null);
  const [tcs, setTcs] = useState<any | null>(null);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);

  const [creating, setCreating] = useState(false);
  const [channel, setChannel] = useState(''); const [ref, setRef] = useState('');
  const [periodFrom, setPeriodFrom] = useState(''); const [periodTo, setPeriodTo] = useState(''); const [tds, setTds] = useState('');
  const [lines, setLines] = useState<Draft[]>([blankLine()]);

  // Server filters (status/channel) + server pagination (limit/offset) — all
  // supported by listSettlements, which returns { rows, total }.
  const lc = useListControls({ pageSize: 25 });
  const [channelFilter, setChannelFilter] = useState('');

  const loadList = () => {
    const params: Record<string, any> = { limit: lc.pageSize, offset: (lc.page - 1) * lc.pageSize };
    if (lc.status) params.status = lc.status;
    if (channelFilter) params.channel = channelFilter;
    return api.get('/marketplace-settlements', { params })
      .then((r) => { const rows = payload<Settlement[]>(r) ?? []; setList(rows); setTotal(Number((rows as any).total ?? rows.length)); })
      .catch((e) => setMsg(e?.response?.data?.message ?? e.message));
  };
  const loadTcs = () => api.get('/marketplace-settlements/tcs-summary').then((r) => setTcs(payload<any>(r))).catch(() => {});
  useEffect(() => { loadList(); loadTcs(); /* eslint-disable-next-line */ }, [lc.status, channelFilter, lc.page, lc.pageSize]);

  const openDetail = async (id: string) => {
    setMsg(''); setOk('');
    try { setDetail(payload<Settlement>(await api.get(`/marketplace-settlements/${id}`))); setCreating(false); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
  };

  const setLine = (i: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const create = async () => {
    const payoutLines = lines
      .map((l) => ({
        orderRef: l.orderRef.trim(),
        grossMinor: toMinor(l.gross), commissionMinor: toMinor(l.commission),
        feesMinor: toMinor(l.fees), tcsMinor: toMinor(l.tcs), netMinor: toMinor(l.net),
      }))
      .filter((l) => l.orderRef && l.netMinor >= 0 && (l.grossMinor > 0 || l.netMinor > 0));
    if (payoutLines.length === 0) { setMsg('Add at least one order: its number and the net the marketplace paid.'); return; }
    setBusy(true); setMsg(''); setOk('');
    try {
      const r = payload<Settlement>(await api.post('/marketplace-settlements', {
        channel: channel.trim() || null, settlementRef: ref.trim() || null,
        periodFrom: periodFrom || null, periodTo: periodTo || null,
        tdsMinor: tds ? toMinor(tds) : null,
        lines: payoutLines,
      }));
      setOk('Payout entered and matched. Open it to see which orders tie out.');
      setCreating(false); setChannel(''); setRef(''); setPeriodFrom(''); setPeriodTo(''); setTds(''); setLines([blankLine()]);
      loadList(); loadTcs(); if (r?.id) openDetail(r.id);
    } catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const doAct = async (path: string, done: string) => {
    if (!detail) return;
    setBusy(true); setMsg(''); setOk('');
    try { await api.post(`/marketplace-settlements/${detail.id}/${path}`); setOk(done); await openDetail(detail.id); loadList(); loadTcs(); }
    catch (e: any) { setMsg(e?.response?.data?.message ?? e.message); }
    finally { setBusy(false); }
  };

  const ties = detail && detail.status === 'open'
    && (detail.lines ?? []).length > 0
    && (detail.lines ?? []).every((l) => l.match_status === 'matched')
    && detail.matched_amount_minor === detail.net_minor;

  return (
    <Page>
      <PageHeader
        title="Marketplace payouts — did they pay us right?"
        icon={Store}
        description="A marketplace sells your stock and pays you a lump sum after keeping its commission, fees and the GST TCS. Enter the payout and we match every order — flagging anything paid short, over, or with no matching order."
        actions={
          <div className="flex items-end gap-2">
            <ExportMenu filename="marketplace-payouts" columns={settlementCsvCols} rows={list ?? []} canExport={canRead} />
            {canPost && <Btn variant={creating ? 'outline' : 'primary'} onClick={() => { setCreating((v) => !v); setDetail(null); setMsg(''); setOk(''); }}><Plus className="h-4 w-4" />{creating ? 'Cancel' : 'New payout'}</Btn>}
          </div>
        }
      />

      {msg && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

      {tcs && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          <div>
            <span className="text-gray-500">GST TCS (s.52) collected by marketplaces on your behalf: </span>
            <strong>{inr(tcs.tcsMinor)}</strong>
            <span className="text-gray-400"> across {tcs.settlementCount} payout(s) — claimable in your GST return.</span>
          </div>
          {Array.isArray(tcs.byChannel) && tcs.byChannel.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tcs.byChannel.map((b: any, i: number) => (
                <Chip key={b.channel ?? i} tone="neutral">{b.channel || 'unattributed'}: {inr(b.tcsMinor)}</Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE */}
      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">Enter a marketplace payout</h3>
          <p className="text-xs text-gray-500">One row per order. Put your order number, then what the marketplace kept (commission, fees, TCS) and the net it paid you.</p>
          <FilterBar>
            <Field label="Marketplace"><TextInput value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. amazon_in, tata_1mg" /></Field>
            <Field label="Statement / UTR reference (optional)"><TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="reference on the payout" /></Field>
            <Field label="Period from (optional)"><TextInput type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} /></Field>
            <Field label="Period to (optional)"><TextInput type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} /></Field>
            <Field label="TDS held (₹, optional)"><TextInput type="number" min={0} step="0.01" className="w-28 text-right" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="0.00" /></Field>
          </FilterBar>

          <TableShell>
            <table className="w-full text-sm">
              <THead>
                <Th>Order number</Th><Th num>Gross (₹)</Th><Th num>Commission</Th><Th num>Fees</Th><Th num>TCS</Th><Th num>Net paid (₹)</Th><Th> </Th>
              </THead>
              <TBody>
                {lines.map((l, i) => (
                  <Tr key={i}>
                    <Td><TextInput value={l.orderRef} onChange={(e) => setLine(i, { orderRef: e.target.value })} placeholder="e.g. ORD-00007" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-24 text-right" value={l.gross} onChange={(e) => setLine(i, { gross: e.target.value })} placeholder="0.00" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-24 text-right" value={l.commission} onChange={(e) => setLine(i, { commission: e.target.value })} placeholder="0.00" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-20 text-right" value={l.fees} onChange={(e) => setLine(i, { fees: e.target.value })} placeholder="0.00" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-20 text-right" value={l.tcs} onChange={(e) => setLine(i, { tcs: e.target.value })} placeholder="0.00" /></Td>
                    <Td num><TextInput type="number" min={0} step="0.01" className="w-24 text-right" value={l.net} onChange={(e) => setLine(i, { net: e.target.value })} placeholder="0.00" /></Td>
                    <Td>{lines.length > 1 && <Btn variant="ghost" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Btn>}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>

          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus className="h-4 w-4" />Add order</Btn>
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
                {detail.channel || 'Marketplace'} payout {detail.settlement_ref ? `· ${detail.settlement_ref}` : ''}
                <Chip tone={STATUS_TONE[detail.status] ?? 'default'}>{detail.status}</Chip>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">{detail.line_count ?? detail.lines?.length ?? 0} order(s)</div>
            </div>
            <Btn variant="ghost" onClick={() => setDetail(null)}><X className="h-4 w-4" />Close</Btn>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div><span className="text-gray-500">Net they paid: </span><strong>{inr(detail.net_minor)}</strong></div>
            <div><span className="text-gray-500">Matched to orders: </span><strong className={detail.matched_amount_minor === detail.net_minor ? 'text-emerald-700' : 'text-amber-700'}>{inr(detail.matched_amount_minor)}</strong></div>
            <div><span className="text-gray-500">Commission+fees kept: </span>{inr((Number(detail.commission_minor) + Number(detail.fees_minor)).toString())}</div>
            <div><span className="text-gray-500">TCS: </span>{inr(detail.tcs_minor)}</div>
          </div>

          {detail.status === 'open' && canPost && (
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" disabled={busy} onClick={() => doAct('match', 'Re-checked against your latest orders.')}><RefreshCw className="h-4 w-4" />Re-check matches</Btn>
              <Btn variant="success" disabled={busy || !ties} onClick={() => doAct('reconcile', 'Reconciled — this payout ties out.')}><CheckCircle2 className="h-4 w-4" />Mark reconciled</Btn>
              <Btn variant="danger" disabled={busy} onClick={() => doAct('cancel', 'Payout cancelled.')}><Trash2 className="h-4 w-4" />Cancel</Btn>
              {!ties && <span className="self-center text-xs text-amber-700">Can't reconcile yet — every order must match its expected net.</span>}
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <THead><Th>Order</Th><Th num>Net paid</Th><Th num>Expected net</Th><Th num>Commission</Th><Th num>TCS</Th><Th>Result</Th></THead>
              <TBody>
                {(detail.lines ?? []).length === 0 ? (
                  <EmptyRow colSpan={6}>No lines.</EmptyRow>
                ) : (detail.lines ?? []).map((l) => (
                  <Tr key={l.id}>
                    <Td className="font-mono text-xs">
                      {(l.our_order_id || l.matched_order_number)
                        ? <DrillLink to={`/orders/${l.our_order_id || l.matched_order_number}`} title="Open this order">{l.matched_order_number || l.order_ref || '—'}</DrillLink>
                        : (l.matched_order_number || l.order_ref || '—')}
                    </Td>
                    <Td num>{inr(l.net_minor)}</Td>
                    <Td num muted>{l.expected_net_minor != null ? inr(l.expected_net_minor) : '—'}</Td>
                    <Td num muted>{inr(l.commission_minor)}</Td>
                    <Td num muted>{inr(l.tcs_minor)}</Td>
                    <Td><Chip tone={LINE_TONE[l.match_status] ?? 'default'}>{LINE_LABEL[l.match_status] ?? l.match_status}</Chip></Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableShell>
        </div>
      )}

      {/* LIST */}
      <FilterBar>
        <Field label="Marketplace">
          <TextInput value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); lc.setPage(1); }} placeholder="e.g. amazon_in" />
        </Field>
        <Field label="Status">
          <SelectInput value={lc.status} onChange={(e) => lc.setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="reconciled">Reconciled</option>
            <option value="cancelled">Cancelled</option>
          </SelectInput>
        </Field>
      </FilterBar>

      <TableShell>
        <table className="w-full text-sm">
          <THead><Th>Marketplace / ref</Th><Th num>Net paid</Th><Th num>Matched</Th><Th num>Orders</Th><Th num>Unmatched</Th><Th>Status</Th></THead>
          <TBody>
            {list == null ? (
              <EmptyRow colSpan={6}>Loading payouts…</EmptyRow>
            ) : list.length === 0 ? (
              <EmptyRow colSpan={6}><EmptyState title="No marketplace payouts yet" description="When a marketplace pays out your sales, enter it here to check it against your orders." /></EmptyRow>
            ) : list.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r.id)}>
                <Td>{r.channel || '—'}<span className="block font-mono text-xs text-gray-400">{r.settlement_ref || ''}</span></Td>
                <Td num>{inr(r.net_minor)}</Td>
                <Td num className={r.matched_amount_minor === r.net_minor ? 'text-emerald-700' : ''}>{inr(r.matched_amount_minor)}</Td>
                <Td num>{r.line_count ?? '—'}</Td>
                <Td num className={(r.unmatched_count ?? 0) > 0 ? 'text-red-600 font-semibold' : ''}>{r.unmatched_count ?? 0}</Td>
                <Td><Chip tone={STATUS_TONE[r.status] ?? 'default'}>{r.status}</Chip></Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableShell>

      <Pagination page={lc.page} pageSize={lc.pageSize} total={total} onPage={lc.setPage} onPageSize={lc.setPageSize} />
    </Page>
  );
};

export default MarketplaceSettlements;
